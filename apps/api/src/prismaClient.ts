import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { SqlMigrationAwareDriverAdapterFactory } from '@prisma/driver-adapter-utils';

export function createPrismaClient(options: {
  databaseUrl?: string;
  adapter?: SqlMigrationAwareDriverAdapterFactory;
}): PrismaClient {
  if (options.adapter) {
    return new PrismaClient({ adapter: options.adapter });
  }
  const connectionString =
    options.databaseUrl ??
    process.env.DATABASE_URL ??
    'postgresql://darb:darb_dev_password@127.0.0.1:5432/darb_books?schema=public';
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
