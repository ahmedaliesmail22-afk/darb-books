import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import sql from 'mssql';
import { loadEnv, type AppEnv } from './env';
import { parseSqlServerConfig } from './lib/sqlServerConfig';
import { createPrismaClient } from './prismaClient';
import { seedDatabase } from './seed/seedDatabase';
import { buildServer } from './server';
import { createStorageService, type StorageService } from './services/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(API_ROOT, '../..');

const DEFAULT_LOCAL_SQLSERVER_URL =
  'sqlserver://127.0.0.1:1433;database=darb_books;user=darb;password=darb_dev_password;encrypt=false;trustServerCertificate=true';

export interface LocalApiBootOptions {
  dataDir?: string;
  storageDir?: string;
  publicDir?: string;
  envFilePath?: string;
  databaseUrl?: string;
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
  storage: StorageService;
  env: AppEnv;
  databaseUrl: string;
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

function assertSafeIdentifier(name: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsafe SQL Server database name: "${name}". Use alphanumeric/underscore only.`);
  }
  return name;
}

export async function isSqlServerReachable(
  databaseUrl: string,
  timeoutMs = 2000
): Promise<boolean> {
  const masterConfig = parseSqlServerConfig(databaseUrl, 'master');
  masterConfig.connectionTimeout = timeoutMs;
  masterConfig.requestTimeout = timeoutMs;
  const pool = new sql.ConnectionPool(masterConfig);
  try {
    await pool.connect();
    await pool.request().query('SELECT 1 AS ok');
    return true;
  } catch {
    return false;
  } finally {
    await pool.close().catch(() => {});
  }
}

export async function ensureSqlServerDatabaseAndMigrations(
  databaseUrl: string,
  options: { resetSchema?: boolean } = {}
): Promise<boolean> {
  const targetConfig = parseSqlServerConfig(databaseUrl);
  const dbName = assertSafeIdentifier(targetConfig.database || 'darb_books');

  const masterConfig = parseSqlServerConfig(databaseUrl, 'master');
  masterConfig.connectionTimeout = 8000;
  masterConfig.requestTimeout = 15000;

  const masterPool = new sql.ConnectionPool(masterConfig);
  try {
    await masterPool.connect();
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[darb-local] تعذّر الاتصال بخادم Microsoft SQL Server (${masterConfig.server}:${masterConfig.port ?? 'dynamic'}).\n` +
        `تفاصيل الخطأ: ${details}\n` +
        `للتشغيل المحلي على ويندوز عبر SQLEXPRESS: شغّل PowerShell كمسؤول ونفّذ:\n` +
        `  powershell -ExecutionPolicy Bypass -File infra/setup-sqlexpress.ps1\n` +
        `أو شغّل حاوية Docker لـ SQL Server:\n` +
        `  docker compose -f infra/docker-compose.yml up -d mssql`
    );
  }

  try {
    if (options.resetSchema) {
      await masterPool
        .request()
        .batch(
          `IF DB_ID(N'${dbName}') IS NOT NULL BEGIN ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${dbName}]; END; CREATE DATABASE [${dbName}];`
        );
    } else {
      const checkRes = await masterPool
        .request()
        .input('dbName', sql.NVarChar(128), dbName)
        .query<{ dbId: number | null }>('SELECT DB_ID(@dbName) AS dbId');
      if (!checkRes.recordset[0]?.dbId) {
        await masterPool.request().batch(`CREATE DATABASE [${dbName}];`);
      }
    }
  } finally {
    await masterPool.close().catch(() => {});
  }

  const migrationsRoot = path.join(API_ROOT, 'prisma', 'migrations');
  if (!fs.existsSync(migrationsRoot)) {
    return false;
  }

  targetConfig.connectionTimeout = 8000;
  targetConfig.requestTimeout = 30000;
  const appPool = new sql.ConnectionPool(targetConfig);
  await appPool.connect();

  try {
    const tableCheck = await appPool
      .request()
      .query<{ tbl: number | null }>("SELECT OBJECT_ID(N'[dbo].[users]', N'U') AS tbl");
    const schemaAlreadyExists = Boolean(tableCheck.recordset[0]?.tbl);

    await appPool.request().batch(`
      IF OBJECT_ID(N'[dbo].[_darb_local_migrations]', N'U') IS NULL
      CREATE TABLE [dbo].[_darb_local_migrations] (
        [name] NVARCHAR(191) NOT NULL PRIMARY KEY,
        [applied_at] DATETIME2 NOT NULL CONSTRAINT [DF_darb_local_migrations_applied_at] DEFAULT SYSDATETIME()
      );
    `);

    const appliedRes = await appPool
      .request()
      .query<{ name: string }>('SELECT [name] FROM [dbo].[_darb_local_migrations]');
    const applied = new Set(appliedRes.recordset.map((r) => r.name));

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

      if (schemaAlreadyExists && dirName === '0001_init_sqlserver') {
        await appPool
          .request()
          .input('name', sql.NVarChar(191), dirName)
          .query('INSERT INTO [dbo].[_darb_local_migrations] ([name]) VALUES (@name)');
        continue;
      }

      let rawSql = fs.readFileSync(sqlPath, 'utf8');
      if (rawSql.charCodeAt(0) === 0xfeff) {
        rawSql = rawSql.slice(1);
      }

      const batches = rawSql
        .split(/^\s*GO\s*$/gim)
        .map((chunk) => chunk.trim())
        .filter(Boolean);

      for (const batch of batches) {
        await appPool.request().batch(batch);
      }

      await appPool
        .request()
        .input('name', sql.NVarChar(191), dirName)
        .query('INSERT INTO [dbo].[_darb_local_migrations] ([name]) VALUES (@name)');
      ranMigration = true;
    }

    return ranMigration;
  } finally {
    await appPool.close().catch(() => {});
  }
}

/**
 * تهيئة وتشغيل الخادم الخلفي بقاعدة Microsoft SQL Server المحلية/التطويرية
 */
export async function startLocalApiServer(
  options: LocalApiBootOptions = {}
): Promise<LocalApiRuntime> {
  const envFilePath = options.envFilePath ?? path.join(API_ROOT, '.env');
  loadEnvFileIntoProcess(envFilePath);

  const dataDir = path.resolve(
    options.dataDir ?? process.env.DARB_LOCAL_STATE_DIR ?? path.join(API_ROOT, '.local-state')
  );
  const storageDir = path.resolve(
    options.storageDir ?? process.env.STORAGE_LOCAL_DIR ?? path.join(API_ROOT, '.storage')
  );
  const publicDir = path.resolve(
    options.publicDir ?? process.env.PUBLIC_ASSETS_FALLBACK_DIR ?? path.join(REPO_ROOT, 'public')
  );
  const databaseUrl =
    options.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_LOCAL_SQLSERVER_URL;

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
    DATABASE_URL: databaseUrl,
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

  await ensureSqlServerDatabaseAndMigrations(databaseUrl);

  const prisma = createPrismaClient({ databaseUrl });
  const storage = createStorageService(env);

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
    await prisma.$disconnect().catch(() => {});
  };

  return {
    app,
    prisma,
    storage,
    env,
    databaseUrl,
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
  const runtime = await startLocalApiServer({ logger: false });
  await runtime.app.listen({ port: runtime.env.PORT, host: runtime.env.HOST });

  const sqlCfg = parseSqlServerConfig(runtime.databaseUrl);
  const baseUrl = `http://${runtime.env.HOST}:${runtime.env.PORT}`;
  console.log('');
  console.log('==============================================================');
  console.log('  🚀 منصة درب — الوضع الحي المحلي المتكامل (Microsoft SQL Server)');
  console.log('==============================================================');
  console.log(`  • الخادم الخلفي (API):    ${baseUrl}`);
  console.log(`  • فحص الصحة (Health):    ${baseUrl}/api/v1/health`);
  console.log(
    `  • خادم SQL Server:        ${sqlCfg.server}:${sqlCfg.port ?? 'dynamic'} / DB: ${sqlCfg.database}`
  );
  console.log(`  • تخزين الملفات المحلي:   ${runtime.storageDir}`);
  console.log(
    `  • حالة التهيئة الأولية:   ${
      runtime.seededOnBoot
        ? 'تم إنشاء الجداول وبذر البيانات الأولية بنجاح'
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
    console.log(`\n[darb-local] تم استلام ${signal} — جاري إغلاق الخادم واتصالات SQL Server...`);
    await runtime.close();
    console.log('[darb-local] تم الإغلاق بنجاح.');
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
    console.error('[darb-local] تعذر تشغيل الخادم المحلي:\n', err);
    process.exit(1);
  });
}
