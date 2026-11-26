import { loadEnv } from '../src/env';
import { createPrismaClient } from '../src/prismaClient';
import { createStorageService } from '../src/services/storage';
import { seedDatabase } from '../src/seed/seedDatabase';

async function main(): Promise<void> {
  const env = loadEnv();
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@darb-books.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('SEED_ADMIN_PASSWORD must be set in environment variables to run seed.');
  }

  const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });
  const storage = createStorageService(env);

  try {
    const summary = await seedDatabase(prisma, {
      adminEmail,
      adminPassword,
      adminName: process.env.SEED_ADMIN_NAME || 'مدير منصة درب الأعلى',
      storage,
      syncMediaToStorage: process.env.SEED_SYNC_MEDIA === 'true',
    });
    console.log('Seed completed successfully:', summary);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
