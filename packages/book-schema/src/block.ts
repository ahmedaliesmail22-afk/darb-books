import { z } from 'zod';
import { ExtensibleMetadataSchema } from './common';

/**
 * مخطط الكتلة التفاعلية القابل للتمديد (Extensible Block Schema):
 * يسمح مستقبلاً بتسجيل أنواع جديدة (model3d, simulation, geo_timeline, literacy_quran, code_sandbox, ...)
 * عبر سجل الإضافات دون تعديل المخطط الأساسي.
 */
export const BookBlockSchema = z
  .object({
    id: z.string().optional(),
    type: z.string().min(1),
    title: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    fullscreenCapable: z.boolean().optional(),
    metadata: ExtensibleMetadataSchema.optional(),
  })
  .passthrough();

export type BookBlock = z.infer<typeof BookBlockSchema>;
