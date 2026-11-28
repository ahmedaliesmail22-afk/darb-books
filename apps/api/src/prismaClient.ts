import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import type { SqlMigrationAwareDriverAdapterFactory } from '@prisma/driver-adapter-utils';
import { parseSqlServerConfig } from './lib/sqlServerConfig';

const DEFAULT_SQLSERVER_URL =
  'sqlserver://127.0.0.1:1433;database=darb_books;user=darb;password=darb_dev_password;encrypt=false;trustServerCertificate=true';

export function createPrismaClient(options: {
  databaseUrl?: string;
  adapter?: SqlMigrationAwareDriverAdapterFactory;
}): PrismaClient {
  if (options.adapter) {
    return new PrismaClient({ adapter: options.adapter });
  }
  const connectionString =
    options.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_SQLSERVER_URL;
  const sqlConfig = parseSqlServerConfig(connectionString);
  const adapter = new PrismaMssql(sqlConfig);
  return new PrismaClient({ adapter });
}
