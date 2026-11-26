import { z } from 'zod';
import { ExtensibleMetadataSchema } from './common';

export const EditionMetaSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().default(''),
    badge: z.string().default(''),
    badgeColor: z.string().default('#f59e0b'),
    theme: z.string().default('royal-gold'),
    description: z.string().default(''),
    dataFile: z.string().min(1),
    audioDir: z.string().default(''),
    videoDir: z.string().default(''),
    chaptersCount: z.number().int().nonnegative().default(7),
    spreadsCount: z.number().int().positive().default(27),
    audioTracksCount: z.number().int().nonnegative().default(0),
    videosCount: z.number().int().nonnegative().default(0),
    releaseDate: z.string().default(''),
    status: z.string().default(''),
    // حقول قابلة للتمديد للمراحل القادمة (التصنيفات، الإصدارات، والأعلام)
    versionId: z.string().optional(),
    coverUrl: z.string().optional(),
    taxonomySlugs: z.array(z.string()).optional(),
    ageGroupSlug: z.string().optional(),
    educationLevelSlug: z.string().optional(),
    chapterTitles: z.record(z.string(), z.string()).optional(),
    featureOverrides: z.record(z.string(), z.boolean()).optional(),
    metadata: ExtensibleMetadataSchema.optional(),
  })
  .passthrough();

export type EditionMeta = z.infer<typeof EditionMetaSchema>;

export const CatalogDataSchema = z
  .object({
    defaultEdition: z.string().min(1),
    editions: z.array(EditionMetaSchema).min(1),
    metadata: ExtensibleMetadataSchema.optional(),
  })
  .passthrough();

export type CatalogData = z.infer<typeof CatalogDataSchema>;
