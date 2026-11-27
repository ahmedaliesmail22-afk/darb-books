import { BookBlockSchema, parseEditionData, type BookDirection } from '@darb/book-schema';
import { z } from 'zod';
import { BookParserError } from '../registry';
import {
  buildCanonicalEditionFromChapters,
  sanitizeBookHtml,
  slugifyBookId,
} from '../shared/spreadBuilder';
import type { BookParserAdapter, ParsedBookPackage, ParserInput } from '../types';

const SimplifiedJsonBookSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    direction: z.enum(['rtl', 'ltr']).optional(),
    badge: z.string().optional(),
    chapters: z
      .array(
        z.object({
          id: z.union([z.number(), z.string()]).optional(),
          title: z.string().min(1),
          subtitle: z.string().optional(),
          html: z.string().optional(),
          content: z.string().optional(),
          blocks: z.array(BookBlockSchema).optional(),
        })
      )
      .min(1),
  })
  .passthrough();

export class JsonBookParser implements BookParserAdapter {
  public readonly formatId = 'json';
  public readonly labelAr = 'JSON القياسي أو المبسط';
  public readonly labelEn = 'Canonical / Chapter JSON';
  public readonly extensions = ['.json'];
  public readonly mimeTypes = ['application/json', 'text/json'];
  public readonly descriptionAr = 'ملف JSON يحتوي على نشرات الكتاب الكاملة أو مصفوفة فصول';

  public canHandle(input: ParserInput): boolean {
    const lower = input.filename.toLowerCase();
    return (
      lower.endsWith('.json') ||
      input.mimeType === 'application/json' ||
      input.mimeType === 'text/json'
    );
  }

  public async parse(input: ParserInput): Promise<ParsedBookPackage> {
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(input.buffer.toString('utf8'));
    } catch {
      throw new BookParserError('INVALID_JSON', 'تعذر قراءة ملف JSON؛ تأكد من صحة الصياغة');
    }

    if (rawJson && typeof rawJson === 'object' && 'spreads' in rawJson) {
      let editionData;
      try {
        editionData = parseEditionData(rawJson);
      } catch (err) {
        throw new BookParserError(
          'SCHEMA_VALIDATION_FAILED',
          err instanceof Error ? err.message : 'بيانات JSON لا تطابق مخطط الكتاب الموحد'
        );
      }

      const sanitizedSpreads = editionData.spreads.map((sp) => ({
        ...sp,
        right: sp.right
          ? { ...sp.right, html: sanitizeBookHtml(sp.right.html ?? '') }
          : sp.right,
        left: sp.left
          ? { ...sp.left, html: sanitizeBookHtml(sp.left.html ?? '') }
          : sp.left,
      }));

      const finalEdition = parseEditionData({
        ...editionData,
        ...(input.bookSlug ? { id: slugifyBookId(input.bookSlug) } : {}),
        ...(input.titleOverride ? { title: input.titleOverride } : {}),
        ...(input.subtitleOverride ? { subtitle: input.subtitleOverride } : {}),
        spreads: sanitizedSpreads,
      });

      return {
        formatId: this.formatId,
        editionData: finalEdition,
        extractedAssets: [],
        chaptersCount: finalEdition.chapters?.length ?? 7,
        spreadsCount: finalEdition.spreads.length,
        audioTracksCount: 0,
        videosCount: 0,
        warnings: [],
      };
    }

    const simple = SimplifiedJsonBookSchema.safeParse(rawJson);
    if (!simple.success) {
      throw new BookParserError(
        'SCHEMA_VALIDATION_FAILED',
        'ملف JSON لا يحتوي على spreads ولا مصفوفة chapters صالحة'
      );
    }

    const data = simple.data;
    const editionData = buildCanonicalEditionFromChapters({
      id: input.bookSlug ?? data.id ?? input.filename.replace(/\.json$/i, ''),
      title: input.titleOverride ?? data.title,
      subtitle: input.subtitleOverride ?? data.subtitle,
      direction: (data.direction ?? input.defaultDirection ?? 'rtl') as BookDirection,
      badge: data.badge,
      chapters: data.chapters.map((ch, idx) => ({
        id: typeof ch.id === 'number' ? ch.id : idx + 1,
        title: ch.title,
        subtitle: ch.subtitle,
        html: ch.html ?? `<p>${ch.content ?? ''}</p>`,
        blocks: ch.blocks,
      })),
    });

    return {
      formatId: this.formatId,
      editionData,
      extractedAssets: [],
      chaptersCount: data.chapters.length,
      spreadsCount: editionData.spreads.length,
      audioTracksCount: 0,
      videosCount: 0,
      warnings: [],
    };
  }
}
