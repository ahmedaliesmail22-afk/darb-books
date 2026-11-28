import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { parseJson } from '../lib/jsonCodec';

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

export const UploadsPolicySchema = z.object({
  allowedFormats: z.array(z.string().min(1)).default(['zip', 'json', 'md', 'docx', 'epub']),
  maxFileSizeMb: z.number().positive().max(500).default(100),
});

export type UploadsPolicy = z.infer<typeof UploadsPolicySchema>;

export const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  labelAr: z.string().min(1),
  required: z.boolean().default(true),
});

export const ModerationChecklistConfigSchema = z.object({
  items: z.array(ChecklistItemSchema).default([
    {
      id: 'ip_ownership',
      labelAr: 'التحقق من ملكية المؤلف للحقوق وخلو العمل من الانتحال أو التعدي على حقوق الغير',
      required: true,
    },
    {
      id: 'content_accuracy',
      labelAr: 'سلامة المادة العلمية والأدبية واللغوية وملاءمتها للمنهج المستهدف',
      required: true,
    },
    {
      id: 'age_appropriateness',
      labelAr: 'مطابقة الفئة العمرية والمستوى التعليمي المحددين للمحتوى الفعلي',
      required: true,
    },
  ]),
});

export type ModerationChecklistConfig = z.infer<typeof ModerationChecklistConfigSchema>;

export const OfficialTemplateConfigSchema = z.object({
  version: z.string().min(1).default('1.0.0'),
  title: z.string().min(1).default('قالب كتاب درب التفاعلي القياسي'),
  guideMarkdown: z
    .string()
    .default(
      'التزم ببنية القالب القياسي (book.manifest.json + chapters/*.md) وعاين كتابك قبل الإرسال للمراجعة.'
    ),
});

export type OfficialTemplateConfig = z.infer<typeof OfficialTemplateConfigSchema>;

export async function getSystemConfigValue<T>(
  prisma: PrismaClient,
  key: string,
  fallback: T
): Promise<T> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  if (!row) return fallback;
  return parseJson<T>(row.valueJson, fallback);
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

export async function getUploadsPolicy(prisma: PrismaClient): Promise<UploadsPolicy> {
  const raw = await getSystemConfigValue<unknown>(prisma, 'uploads.policy', {});
  const parsed = UploadsPolicySchema.safeParse(raw);
  return parsed.success ? parsed.data : UploadsPolicySchema.parse({});
}

export async function getModerationChecklistConfig(
  prisma: PrismaClient
): Promise<ModerationChecklistConfig> {
  const raw = await getSystemConfigValue<unknown>(prisma, 'moderation.review_checklist', {});
  const parsed = ModerationChecklistConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : ModerationChecklistConfigSchema.parse({});
}

export async function getOfficialTemplateConfig(
  prisma: PrismaClient
): Promise<OfficialTemplateConfig> {
  const raw = await getSystemConfigValue<unknown>(prisma, 'templates.official_package', {});
  const parsed = OfficialTemplateConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : OfficialTemplateConfigSchema.parse({});
}

export async function getPublicConfigsMap(prisma: PrismaClient): Promise<Record<string, unknown>> {
  const rows = await prisma.systemConfig.findMany({
    where: { isPublic: true },
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  });
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = parseJson(row.valueJson, null);
  }
  return result;
}
