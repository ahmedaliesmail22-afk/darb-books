import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),
  CORS_ORIGIN: z.string().default('http://127.0.0.1:4173,http://localhost:4173'),
  DATABASE_URL: z
    .string()
    .default('postgresql://darb:darb_dev_password@127.0.0.1:5432/darb_books?schema=public'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./.storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('darb-books-media'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),
  PUBLIC_ASSETS_FALLBACK_DIR: z.string().optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(overrides: Partial<Record<keyof AppEnv, unknown>> = {}): AppEnv {
  return EnvSchema.parse({
    ...process.env,
    ...overrides,
  });
}
