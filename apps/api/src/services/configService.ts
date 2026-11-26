import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const RegistrationPolicySchema = z.object({
  mode: z.enum(['instant', 'email_verification', 'admin_approval']).default('instant'),
  allowSelfRegistration: z.boolean().default(true),
  requireOnboarding: z.boolean().default(true),
  minPasswordLength: z.number().int().min(6).max(128).default(8),
  defaultRoleCode: z.string().min(1).default('LEARNER'),
});

export type RegistrationPolicy = z.infer<typeof RegistrationPolicySchema>;

export const AgePolicySchema = z.object({
  strictAgeGating: z.boolean().default(true),
  unratedBookMinAge: z.number().nonnegative().default(0),
  enforceForGuests: z.boolean().default(false),
});

export type AgePolicy = z.infer<typeof AgePolicySchema>;

export async function getSystemConfigValue<T>(
  prisma: PrismaClient,
  key: string,
  fallback: T
): Promise<T> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  if (!row) return fallback;
  return row.valueJson as T;
}

export async function getRegistrationPolicy(prisma: PrismaClient): Promise<RegistrationPolicy> {
  const raw = await getSystemConfigValue<unknown>(prisma, 'auth.registration_policy', {});
  const parsed = RegistrationPolicySchema.safeParse(raw);
  return parsed.success ? parsed.data : RegistrationPolicySchema.parse({});
}

export async function getAgePolicy(prisma: PrismaClient): Promise<AgePolicy> {
  const raw = await getSystemConfigValue<unknown>(prisma, 'catalog.age_policy', {});
  const parsed = AgePolicySchema.safeParse(raw);
  return parsed.success ? parsed.data : AgePolicySchema.parse({});
}

export async function getPublicConfigsMap(prisma: PrismaClient): Promise<Record<string, unknown>> {
  const rows = await prisma.systemConfig.findMany({
    where: { isPublic: true },
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  });
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = row.valueJson;
  }
  return result;
}
