import { marked } from 'marked';
import type { BookDirection } from '@darb/book-schema';
import { BookParserError } from '../registry';
import {
  buildCanonicalEditionFromChapters,
  parseMarkdownFrontmatter,
} from '../shared/spreadBuilder';
import type { BookParserAdapter, ChapterSource, ParsedBookPackage, ParserInput } from '../types';

export function splitMarkdownSections(
  mdBody: string,
  fallbackTitle: string
): Array<{ title: string; markdown: string }> {
  const lines = mdBody.split(/\r?\n/);
  const sections: Array<{ title: string; markdown: string }> = [];
  let currentTitle = '';
  let buffer: string[] = [];

  for (const line of lines) {
    const hMatch = /^(#{1,2})\s+(.+)$/.exec(line.trim());
    if (hMatch) {
      if (buffer.join('\n').trim().length > 0 || currentTitle) {
        sections.push({
          title: currentTitle || fallbackTitle,
          markdown: buffer.join('\n').trim(),
        });
      }
      currentTitle = hMatch[2].trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }

  if (buffer.join('\n').trim().length > 0 || sections.length === 0) {
    sections.push({
      title: currentTitle || fallbackTitle,
      markdown: buffer.join('\n').trim(),
    });
  }

  return sections.filter((s) => s.markdown.length > 0 || sections.length === 1);
}

export class MarkdownBookParser implements BookParserAdapter {
  public readonly formatId = 'markdown';
  public readonly labelAr = 'ملف Markdown (.md)';
  public readonly labelEn = 'Markdown Manuscript';
  public readonly extensions = ['.md', '.markdown'];
  public readonly mimeTypes = ['text/markdown', 'text/x-markdown'];
  public readonly descriptionAr = 'ملف نصي منسّق بـ Markdown مع تقسيم تلقائي للفصول والنشرات';

  public canHandle(input: ParserInput): boolean {
    const lower = input.filename.toLowerCase();
    return (
      lower.endsWith('.md') ||
      lower.endsWith('.markdown') ||
      input.mimeType === 'text/markdown' ||
      input.mimeType === 'text/x-markdown'
    );
  }

  public async parse(input: ParserInput): Promise<ParsedBookPackage> {
    const raw = input.buffer.toString('utf8');
    if (!raw.trim()) {
      throw new BookParserError('EMPTY_MARKDOWN', 'ملف Markdown فارغ');
    }

    const { metadata, body } = parseMarkdownFrontmatter(raw);
    const title =
      input.titleOverride ||
      metadata.title ||
      input.filename.replace(/\.(md|markdown)$/i, '');
    const subtitle = input.subtitleOverride || metadata.subtitle;
    const direction = (
      metadata.direction === 'ltr' || metadata.direction === 'rtl'
        ? metadata.direction
        : input.defaultDirection ?? 'rtl'
    ) as BookDirection;

    const rawSections = splitMarkdownSections(body, title);
    const chapters: ChapterSource[] = rawSections.map((sec, idx) => {
      const rendered = marked.parse(sec.markdown || sec.title, {
        async: false,
        gfm: true,
        breaks: false,
      });
      return {
        id: idx + 1,
        title: sec.title,
        html: typeof rendered === 'string' ? rendered : '',
      };
    });

    const editionData = buildCanonicalEditionFromChapters({
      id: input.bookSlug ?? metadata.slug ?? title,
      title,
      subtitle,
      direction,
      badge: metadata.badge,
      chapters,
      metadata: Object.keys(metadata).length > 0 ? { frontmatter: metadata } : undefined,
    });

    return {
      formatId: this.formatId,
      editionData,
      extractedAssets: [],
      chaptersCount: chapters.length,
      spreadsCount: editionData.spreads.length,
      audioTracksCount: 0,
      videosCount: 0,
      warnings: [],
    };
  }
}
