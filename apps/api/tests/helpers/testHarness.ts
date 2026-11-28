import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import sql from 'mssql';
import { loadEnv } from '../../src/env';
import { parseSqlServerConfig } from '../../src/lib/sqlServerConfig';
import {
  ensureSqlServerDatabaseAndMigrations,
  isSqlServerReachable,
} from '../../src/local';
import { createPrismaClient } from '../../src/prismaClient';
import { createStorageService, type StorageService } from '../../src/services/storage';
import { buildServer } from '../../src/server';
import { seedDatabase } from '../../src/seed/seedDatabase';

export const TEST_ADMIN_EMAIL = 'superadmin@darb-test.local';
export const TEST_ADMIN_PASSWORD = 'TestSuperAdmin!Password2026';

const BASE_TEST_SQLSERVER_URL =
  process.env.TEST_SQLSERVER_URL ??
  process.env.DATABASE_URL ??
  'sqlserver://127.0.0.1:1433;database=darb_books_test;user=darb;password=darb_dev_password;encrypt=false;trustServerCertificate=true';

export const sqlServerAvailable = await isSqlServerReachable(BASE_TEST_SQLSERVER_URL, 1500);

export function buildIsolatedSqlServerUrl(suffix?: string): { url: string; dbName: string } {
  const token = suffix ?? crypto.randomBytes(4).toString('hex');
  const dbName = `darb_test_${token}`;
  const cfg = parseSqlServerConfig(BASE_TEST_SQLSERVER_URL, dbName);
  const hostPort = cfg.port ? `${cfg.server}:${cfg.port}` : cfg.server;
  const url = `sqlserver://${hostPort};database=${dbName};user=${cfg.user};password=${cfg.password};encrypt=${Boolean(
    cfg.options?.encrypt
  )};trustServerCertificate=${cfg.options?.trustServerCertificate ?? true}`;
  return { url, dbName };
}

export async function dropTestDatabase(databaseUrl: string, dbName: string): Promise<void> {
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) return;
  const masterPool = new sql.ConnectionPool(parseSqlServerConfig(databaseUrl, 'master'));
  try {
    await masterPool.connect();
    await masterPool
      .request()
      .batch(
        `IF DB_ID(N'${dbName}') IS NOT NULL BEGIN ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${dbName}]; END;`
      );
  } catch {
    // ignore cleanup errors on teardown
  } finally {
    await masterPool.close().catch(() => {});
  }
}

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  storage: StorageService;
  databaseUrl: string;
  dbName: string;
  cleanup: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ accessToken: string; refreshToken: string }>;
}

const PUBLIC_DIR = path.resolve(__dirname, '../../../../public');

export async function createTestContext(): Promise<TestContext> {
  const { url: databaseUrl, dbName } = buildIsolatedSqlServerUrl();
  const storageTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darb-api-storage-'));
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long',
    JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: storageTempDir,
    PUBLIC_ASSETS_FALLBACK_DIR: PUBLIC_DIR,
  });

  await ensureSqlServerDatabaseAndMigrations(databaseUrl, { resetSchema: true });

  const prisma = createPrismaClient({ databaseUrl });
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
    await dropTestDatabase(databaseUrl, dbName);
    fs.rmSync(storageTempDir, { recursive: true, force: true });
  };

  return { app, prisma, storage, databaseUrl, dbName, cleanup, login };
}
