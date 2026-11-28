import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'sqlserver://127.0.0.1:1433;database=darb_books;user=darb;password=darb_dev_password;encrypt=false;trustServerCertificate=true',
  },
});
