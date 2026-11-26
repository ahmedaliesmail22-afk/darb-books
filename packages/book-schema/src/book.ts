import { z } from 'zod';
import { BookBlockSchema } from './block';
import { BookDirectionSchema, ExtensibleMetadataSchema } from './common';

export const BookPageSideSchema = z
  .object({
    isCover: z.boolean().optional(),
    isBlank: z.boolean().optional(),
    header: z.string().optional(),
    title: z.string().optional(),
    html: z.string().default(''),
    blocks: z.array(BookBlockSchema).optional(),
    audioTrackUrl: z.string().optional(),
    metadata: ExtensibleMetadataSchema.optional(),
  })
  .passthrough();

export type BookPageSide = z.infer<typeof BookPageSideSchema>;

export const BookSpreadSchema = z
  .object({
    id: z.string().optional(),
    isFrontCover: z.boolean().optional(),
    isBackCover: z.boolean().optional(),
    pageRightNum: z.number().int().nonnegative().optional(),
    pageLeftNum: z.number().int().nonnegative().optional(),
    chapterId: z.union([z.number(), z.string()]).optional(),
    right: BookPageSideSchema.nullable().optional(),
    left: BookPageSideSchema.nullable().optional(),
    audioUrl: z.string().optional(),
    metadata: ExtensibleMetadataSchema.optional(),
  })
  .passthrough();

export type BookSpread = z.infer<typeof BookSpreadSchema>;

export const BookChapterMetaSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    title: z.string(),
    subtitle: z.string().optional(),
    startSpread: z.number().int().nonnegative().optional(),
    videoUrl: z.string().optional(),
    summary: z.string().optional(),
    metadata: ExtensibleMetadataSchema.optional(),
  })
  .passthrough();

export type BookChapterMeta = z.infer<typeof BookChapterMetaSchema>;

export const EditionDataSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    version: z.string().optional(),
    direction: BookDirectionSchema.optional(),
    chapters: z.array(BookChapterMetaSchema).optional(),
    spreads: z.array(BookSpreadSchema).min(1),
    metadata: ExtensibleMetadataSchema.optional(),
  })
  .passthrough();

export type EditionData = z.infer<typeof EditionDataSchema>;

export interface MobilePage {
  spreadIdx: number;
  isCover?: boolean;
  side: 'right' | 'left';
  data: BookPageSide;
  pageNum?: number;
  indicator: string;
}
