import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { loadEnv } from '../../src/env';
import { createPrismaClient } from '../../src/prismaClient';
import { createStorageService, type StorageService } from '../../src/services/storage';
import { buildServer } from '../../src/server';
import { seedDatabase } from '../../src/seed/seedDatabase';

export const TEST_ADMIN_EMAIL = 'superadmin@darb-test.local';
export const TEST_ADMIN_PASSWORD = 'TestSuperAdmin!Password2026';

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  storage: StorageService;
  pglite: PGlite;
  cleanup: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ accessToken: string; refreshToken: string }>;
}

const MIGRATION_SQL_PATH = path.resolve(
  __dirname,
  '../../prisma/migrations/0001_init/migration.sql'
);

const PUBLIC_DIR = path.resolve(__dirname, '../../../../public');

export async function createTestContext(): Promise<TestContext> {
  const storageTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darb-api-storage-'));
  const env = loadEnv({
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long',
    JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: storageTempDir,
    PUBLIC_ASSETS_FALLBACK_DIR: PUBLIC_DIR,
  });

  const pglite = new PGlite();
  const migrationSql = fs.readFileSync(MIGRATION_SQL_PATH, 'utf8');
  await pglite.exec(migrationSql);

  const adapter = new PrismaPGlite(pglite);
  const prisma = createPrismaClient({ adapter });
  const storage = createStorageService(env);

  await seedDatabase(prisma, {
    publicDir: PUBLIC_DIR,
    adminEmail: TEST_ADMIN_EMAIL,
    adminPassword: TEST_ADMIN_PASSWORD,
    storage,
    syncMediaToStorage: false,
  });

  const { app } = await buildServer({ env, prisma, storage, logger: false });
  await app.ready();

  const login = async (email: string, password: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    if (res.statusCode !== 200) {
      throw new Error(`Login failed (${res.statusCode}): ${res.body}`);
    }
    const body = res.json() as { accessToken: string; refreshToken: string };
    return body;
  };

  const cleanup = async () => {
    await app.close();
    await prisma.$disconnect();
    await pglite.close();
    fs.rmSync(storageTempDir, { recursive: true, force: true });
  };

  return { app, prisma, storage, pglite, cleanup, login };
}
