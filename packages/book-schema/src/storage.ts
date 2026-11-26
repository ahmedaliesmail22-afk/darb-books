import { z } from 'zod';

export const ReadingProgressRecordSchema = z.object({
  spreadIdx: z.number().int().nonnegative(),
  pageLabel: z.string(),
  updatedAt: z.number(),
});

export type ReadingProgressRecord = z.infer<typeof ReadingProgressRecordSchema>;

export const BookmarkRecordSchema = z.object({
  id: z.string(),
  editionId: z.string(),
  spreadIdx: z.number().int().nonnegative(),
  title: z.string(),
  subtitle: z.string(),
  createdAt: z.number(),
});

export type BookmarkRecord = z.infer<typeof BookmarkRecordSchema>;

export interface SearchHit {
  spreadIdx: number;
  title: string;
  snippetHtml: string;
  pageLabel: string;
}
