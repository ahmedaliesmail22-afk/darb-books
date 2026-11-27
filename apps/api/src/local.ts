import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { loadEnv, type AppEnv } from './env';
import { createPrismaClient } from './prismaClient';
import { seedDatabase } from './seed/seedDatabase';
import { buildServer } from './server';
import { createStorageService, type StorageService } from './services/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(API_ROOT, '../..');

export interface LocalApiBootOptions {
  dataDir?: string;
  storageDir?: string;
  publicDir?: string;
  envFilePath?: string;
  port?: number;
  host?: string;
  corsOrigin?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminName?: string;
  logger?: boolean;
}

export interface LocalApiRuntime {
  app: FastifyInstance;
  prisma: PrismaClient;
  pglite: PGlite;
  storage: StorageService;
  env: AppEnv;
  dataDir: string;
  storageDir: string;
  seededOnBoot: boolean;
  adminCredentials: { email: string; password: string; name: string };
  close: () => Promise<void>;
}

interface LocalSecretsRecord {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
}

function loadEnvFileIntoProcess(envFilePath: string): void {
  if (!fs.existsSync(envFilePath)) return;
  const content = fs.readFileSync(envFilePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line
      .slice(eqIdx + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function ensureLocalSecrets(
  dataDir: string,
  overrides: { adminEmail?: string; adminPassword?: string; adminName?: string }
): LocalSecretsRecord {
  const secretsPath = path.join(dataDir, '.local-secrets.json');
  let stored: Partial<LocalSecretsRecord> = {};
  if (fs.existsSync(secretsPath)) {
    try {
      stored = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as Partial<LocalSecretsRecord>;
    } catch {
      stored = {};
    }
  }

  const next: LocalSecretsRecord = {
    jwtAccessSecret:
      process.env.JWT_ACCESS_SECRET && process.env.JWT_ACCESS_SECRET.length >= 16
        ? process.env.JWT_ACCESS_SECRET
        : stored.jwtAccessSecret || crypto.randomBytes(32).toString('hex'),
    jwtRefreshSecret:
      process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length >= 16
        ? process.env.JWT_REFRESH_SECRET
        : stored.jwtRefreshSecret || crypto.randomBytes(32).toString('hex'),
    adminEmail:
      overrides.adminEmail ||
      process.env.SEED_ADMIN_EMAIL ||
      stored.adminEmail ||
      'admin@darb-books.local',
    adminPassword:
      overrides.adminPassword ||
      process.env.SEED_ADMIN_PASSWORD ||
      stored.adminPassword ||
      'DarbLocal!2026',
    adminName:
      overrides.adminName ||
      process.env.SEED_ADMIN_NAME ||
      stored.adminName ||
      'مدير منصة درب المحلي',
  };

  if (!fs.existsSync(secretsPath)) {
    fs.writeFileSync(secretsPath, JSON.stringify(next, null, 2), 'utf8');
  }

  return next;
}

async function applyLocalMigrations(pglite: PGlite): Promise<boolean> {
  const migrationsRoot = path.join(API_ROOT, 'prisma', 'migrations');
  if (!fs.existsSync(migrationsRoot)) {
    return false;
  }

  const tableCheck = await pglite.query<{ tbl: string | null }>(
    "SELECT to_regclass('public.users') AS tbl"
  );
  const schemaAlreadyExists = Boolean(tableCheck.rows[0]?.tbl);

  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS "_darb_local_migrations" (
      "name" TEXT PRIMARY KEY,
      "applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const appliedRes = await pglite.query<{ name: string }>(
    'SELECT "name" FROM "_darb_local_migrations"'
  );
  const applied = new Set(appliedRes.rows.map((r) => r.name));

  const migrationDirs = fs
    .readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let ranMigration = false;
  for (const dirName of migrationDirs) {
    if (applied.has(dirName)) continue;
    const sqlPath = path.join(migrationsRoot, dirName, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;

    // إذا كانت القاعدة تحتوي مسبقاً على الجداول من تشغيل سابق دون جدول التتبع، نسجل الهجرة الأولى فقط
    if (schemaAlreadyExists && dirName === '0001_init') {
      await pglite.query(
        'INSERT INTO "_darb_local_migrations" ("name") VALUES ($1) ON CONFLICT DO NOTHING',
        [dirName]
      );
      continue;
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pglite.exec(sql);
    await pglite.query(
      'INSERT INTO "_darb_local_migrations" ("name") VALUES ($1) ON CONFLICT DO NOTHING',
      [dirName]
    );
    ranMigration = true;
  }

  return ranMigration;
}

/**
 * تهيئة وتشغيل الخادم الخلفي بقاعدة PGlite مستمرة على القرص
 * دون الحاجة إلى Docker أو خادم PostgreSQL خارجي.
 */
export async function startLocalApiServer(
  options: LocalApiBootOptions = {}
): Promise<LocalApiRuntime> {
  const envFilePath = options.envFilePath ?? path.join(API_ROOT, '.env');
  loadEnvFileIntoProcess(envFilePath);

  const dataDir = path.resolve(
    options.dataDir ?? process.env.PGLITE_DATA_DIR ?? path.join(API_ROOT, '.pglite-data')
  );
  const storageDir = path.resolve(
    options.storageDir ?? process.env.STORAGE_LOCAL_DIR ?? path.join(API_ROOT, '.storage')
  );
  const publicDir = path.resolve(
    options.publicDir ?? process.env.PUBLIC_ASSETS_FALLBACK_DIR ?? path.join(REPO_ROOT, 'public')
  );

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(storageDir, { recursive: true });

  const secrets = ensureLocalSecrets(dataDir, {
    adminEmail: options.adminEmail,
    adminPassword: options.adminPassword,
    adminName: options.adminName,
  });

  const env = loadEnv({
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: String(options.port ?? (process.env.PORT || 3000)),
    HOST: options.host ?? (process.env.HOST || '127.0.0.1'),
    CORS_ORIGIN:
      options.corsOrigin ??
      process.env.CORS_ORIGIN ??
      'http://127.0.0.1:4173,http://localhost:4173',
    JWT_ACCESS_SECRET: secrets.jwtAccessSecret,
    JWT_REFRESH_SECRET: secrets.jwtRefreshSecret,
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: storageDir,
    PUBLIC_ASSETS_FALLBACK_DIR: publicDir,
  });

  const pglite = new PGlite(dataDir, { relaxedDurability: true });
  await pglite.waitReady;
  const prisma = createPrismaClient({ adapter: new PrismaPGlite(pglite) });
  const storage = createStorageService(env);

  await applyLocalMigrations(pglite);

  let seededOnBoot = false;
  const usersCount = await prisma.user.count();
  if (usersCount === 0) {
    await seedDatabase(prisma, {
      publicDir,
      adminEmail: secrets.adminEmail,
      adminPassword: secrets.adminPassword,
      adminName: secrets.adminName,
      storage,
      syncMediaToStorage: process.env.SEED_SYNC_MEDIA === 'true',
    });
    seededOnBoot = true;
  }

  const { app } = await buildServer({
    env,
    prisma,
    storage,
    logger: options.logger ?? false,
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await app.close().catch(() => {});
    await pglite.exec('CHECKPOINT;').catch(() => {});
    await prisma.$disconnect().catch(() => {});
    await pglite.close().catch(() => {});
  };

  return {
    app,
    prisma,
    pglite,
    storage,
    env,
    dataDir,
    storageDir,
    seededOnBoot,
    adminCredentials: {
      email: secrets.adminEmail,
      password: secrets.adminPassword,
      name: secrets.adminName,
    },
    close,
  };
}

async function runLocalCli(): Promise<void> {
  const configuredDataDir = path.resolve(
    process.env.PGLITE_DATA_DIR ?? path.join(API_ROOT, '.pglite-data')
  );
  if (!fs.existsSync(path.join(configuredDataDir, 'PG_VERSION'))) {
    console.log(
      '[darb-local] التشغيل الأول: جاري إنشاء قاعدة PGlite المحلية وتطبيق الترحيل والبذر الأولي (يستغرق عادةً ~20-30 ثانية في المرة الأولى فقط)...'
    );
  }
  const runtime = await startLocalApiServer({ logger: false });
  await runtime.app.listen({ port: runtime.env.PORT, host: runtime.env.HOST });

  const baseUrl = `http://${runtime.env.HOST}:${runtime.env.PORT}`;
  console.log('');
  console.log('==============================================================');
  console.log('  🚀 منصة درب — الوضع الحي المحلي المتكامل (PGlite Persistent)');
  console.log('==============================================================');
  console.log(`  • الخادم الخلفي (API):   ${baseUrl}`);
  console.log(`  • فحص الصحة (Health):   ${baseUrl}/api/v1/health`);
  console.log(`  • قاعدة البيانات الحية:  ${runtime.dataDir}`);
  console.log(`  • تخزين الملفات المحلي:  ${runtime.storageDir}`);
  console.log(
    `  • حالة التهيئة الأولية:  ${
      runtime.seededOnBoot
        ? 'تم ترحيل القاعدة وبذر البيانات الأولية بنجاح'
        : 'تم استئناف قاعدة البيانات المحفوظة من الجلسة السابقة'
    }`
  );
  console.log('--------------------------------------------------------------');
  console.log(`  • بريد المدير (SUPER_ADMIN):  ${runtime.adminCredentials.email}`);
  console.log(`  • كلمة المرور المحلية:        ${runtime.adminCredentials.password}`);
  console.log('==============================================================');
  console.log('');

  if (typeof process.send === 'function') {
    process.send({ type: 'darb:api-ready', url: baseUrl });
  }

  let exiting = false;
  const handleShutdown = async (signal: string) => {
    if (exiting) return;
    exiting = true;
    console.log(`\n[darb-local] تم استلام ${signal} — جاري حفظ قاعدة البيانات وإغلاق الخادم بأمان...`);
    await runtime.close();
    console.log('[darb-local] تم إغلاق PGlite والخادم الخلفي بنجاح.');
    process.exit(0);
  };

  process.on('SIGINT', () => void handleShutdown('SIGINT'));
  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.on('message', (msg: unknown) => {
    if (
      msg &&
      typeof msg === 'object' &&
      'type' in msg &&
      (msg as { type: string }).type === 'darb:shutdown'
    ) {
      void handleShutdown('IPC shutdown');
    }
  });
}

const isDirectEntry =
  !process.env.VITEST &&
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]!) === path.resolve(__filename);

if (isDirectEntry) {
  runLocalCli().catch((err) => {
    console.error('[darb-local] تعذر تشغيل الخادم المحلي:', err);
    process.exit(1);
  });
}
