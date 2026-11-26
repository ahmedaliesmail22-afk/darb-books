import mammoth from 'mammoth';
import { stripHtmlText } from '@darb/book-schema';
import { BookParserError } from '../registry';
import {
  buildCanonicalEditionFromChapters,
  sanitizeBookHtml,
} from '../shared/spreadBuilder';
import type {
  BookParserAdapter,
  ChapterSource,
  ExtractedAsset,
  ParsedBookPackage,
  ParserInput,
} from '../types';

export function splitHtmlChaptersByHeading(
  html: string,
  fallbackTitle: string
): ChapterSource[] {
  const clean = sanitizeBookHtml(html);
  const parts = clean.split(/(?=<h[12]\b[^>]*>)/i).filter((p) => stripHtmlText(p).length > 0);
  if (parts.length === 0) {
    return [{ id: 1, title: fallbackTitle, html: clean || '<p>...</p>' }];
  }

  return parts.map((part, idx) => {
    const headingMatch = /^<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i.exec(part);
    const chTitle = headingMatch ? stripHtmlText(headingMatch[1]) : `${fallbackTitle} (${idx + 1})`;
    const bodyWithoutHeading = headingMatch ? part.slice(headingMatch[0].length).trim() : part;
    return {
      id: idx + 1,
      title: chTitle || `الفصل ${idx + 1}`,
      html: bodyWithoutHeading || part,
    };
  });
}

export class DocxBookParser implements BookParserAdapter {
  public readonly formatId = 'docx';
  public readonly labelAr = 'مستند Word (.docx)';
  public readonly labelEn = 'Microsoft Word (DOCX)';
  public readonly extensions = ['.docx'];
  public readonly mimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  public readonly descriptionAr = 'تحويل مستندات Word إلى فصول وصفحات تفاعلية ثلاثية الأبعاد';

  public canHandle(input: ParserInput): boolean {
    const lower = input.filename.toLowerCase();
    return (
      lower.endsWith('.docx') ||
      input.mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  }

  public async parse(input: ParserInput): Promise<ParsedBookPackage> {
    const extractedAssets: ExtractedAsset[] = [];
    let imgIndex = 0;

    let result;
    try {
      result = await mammoth.convertToHtml(
        { buffer: input.buffer },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            imgIndex += 1;
            const buf = await image.readAsBuffer();
            const ext = image.contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
            const relPath = `assets/docx-image-${imgIndex}.${ext}`;
            extractedAssets.push({
              relativePath: relPath,
              buffer: buf,
              mimeType: image.contentType,
              assetType: 'IMAGE',
            });
            return { src: relPath };
          }),
        }
      );
    } catch (err) {
      throw new BookParserError(
        'INVALID_DOCX',
        `تعذر قراءة ملف DOCX: ${err instanceof Error ? err.message : 'ملف غير صالح'}`
      );
    }

    const baseTitle =
      input.titleOverride || input.filename.replace(/\.docx$/i, '') || 'كتاب مستورد';
    const chapters = splitHtmlChaptersByHeading(result.value, baseTitle);

    const editionData = buildCanonicalEditionFromChapters({
      id: input.bookSlug ?? baseTitle,
      title: baseTitle,
      subtitle: input.subtitleOverride,
      direction: input.defaultDirection ?? 'rtl',
      badge: 'مستند Word',
      chapters,
    });

    return {
      formatId: this.formatId,
      editionData,
      extractedAssets,
      chaptersCount: chapters.length,
      spreadsCount: editionData.spreads.length,
      audioTracksCount: 0,
      videosCount: 0,
      warnings: result.messages.map((m) => m.message),
    };
  }
}
