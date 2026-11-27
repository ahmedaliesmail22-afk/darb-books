import {
  BookBlockSchema,
  parseEditionData,
  stripHtmlText,
  type BookBlock,
  type BookChapterMeta,
  type BookDirection,
  type BookSpread,
  type EditionData,
} from '@darb/book-schema';
import type { ChapterPageEntry, ChapterSource } from '../types';

export function sanitizeBookHtml(rawHtml: string): string {
  return rawHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<(iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|meta|link)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'href="#"')
    .replace(/src\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'src=""')
    .trim();
}

export function parseMarkdownFrontmatter(raw: string): {
  metadata: Record<string, string>;
  body: string;
} {
  const clean = raw.replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(clean);
  if (!match) {
    return { metadata: {}, body: clean };
  }

  const metadata: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line
      .slice(colonIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key) metadata[key] = val;
  }

  return { metadata, body: match[2] };
}

export function splitHtmlIntoPageChunks(rawHtml: string, targetChars = 1100): string[] {
  const sanitized = sanitizeBookHtml(rawHtml);
  if (!sanitized) return ['<p>...</p>'];

  // Explicit manual page breaks take precedence
  const explicitParts = sanitized
    .split(/<!--\s*pagebreak\s*-->|<hr\s*class=["']?pagebreak["']?\s*\/?>/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const part of explicitParts) {
    if (stripHtmlText(part).length <= targetChars) {
      chunks.push(part);
      continue;
    }

    // Split along block element boundaries safely
    const blockRegex = /<(p|div|ul|ol|blockquote|pre|table|h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi;
    const blocks = part.match(blockRegex);
    if (!blocks || blocks.length <= 1) {
      chunks.push(part);
      continue;
    }

    let current = '';
    let currentLen = 0;
    for (const blk of blocks) {
      const blkLen = stripHtmlText(blk).length;
      if (current && currentLen + blkLen > targetChars) {
        chunks.push(current);
        current = blk;
        currentLen = blkLen;
      } else {
        current += (current ? '\n' : '') + blk;
        currentLen += blkLen;
      }
    }
    if (current) chunks.push(current);
  }

  return chunks.length > 0 ? chunks : ['<p>...</p>'];
}

export function slugifyBookId(raw: string): string {
  const ascii = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii.length >= 2 ? ascii.slice(0, 80) : `book-${Date.now()}`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DARB_BLOCK_FENCE_RE = /```darb-block[ \t]*\r?\n([\s\S]*?)```/g;
const DARB_BLOCK_TOKEN_RE = /<!--DARB_BLOCK:(\d+)-->/g;

/**
 * استخراج كتل ```darb-block ... ``` من نص Markdown وتقسيم الفصل إلى صفحات
 * متوازنة تحافظ على عدم وجود تمرير رأسي داخل صفحات الكتاب.
 */
export function buildChapterPagesFromMarkdown(
  rawMarkdown: string,
  renderMarkdownFn: (md: string) => string
): { html: string; pages: ChapterPageEntry[] } {
  const blocks: BookBlock[] = [];
  const markdownWithTokens = rawMarkdown.replace(DARB_BLOCK_FENCE_RE, (_full, jsonBody: string) => {
    try {
      const parsedJson = JSON.parse(jsonBody.trim());
      const checked = BookBlockSchema.safeParse(parsedJson);
      if (checked.success) {
        const idx = blocks.length;
        blocks.push(checked.data);
        return `\n\n<!--DARB_BLOCK:${idx}-->\n\n`;
      }
    } catch {
      // keep raw text fallback if malformed JSON
    }
    return '';
  });

  const fullHtml = sanitizeBookHtml(renderMarkdownFn(markdownWithTokens));
  if (blocks.length === 0) {
    const chunks = splitHtmlIntoPageChunks(fullHtml);
    return {
      html: fullHtml,
      pages: chunks.map((html) => ({ html })),
    };
  }

  const pages: ChapterPageEntry[] = [];
  const parts = fullHtml.split(DARB_BLOCK_TOKEN_RE);

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const proseHtml = parts[i]?.trim();
      if (proseHtml) {
        for (const chunk of splitHtmlIntoPageChunks(proseHtml)) {
          pages.push({ html: chunk });
        }
      }
    } else {
      const blockIndex = Number(parts[i]);
      const block = blocks[blockIndex];
      if (!block) continue;

      // إذا سبقت الكتلة فقرة قصيرة جداً في آخر صفحة ندمجها فوق الكتلة لجمال الصفحة
      const prev = pages[pages.length - 1];
      if (prev && !prev.blocks && stripHtmlText(prev.html).length <= 200) {
        prev.blocks = [block];
      } else {
        pages.push({
          html: `<p class="chapter-hero-desc">تفاعل مباشر مع المكون التالي أو افتحه في المختبر الكامل.</p>`,
          blocks: [block],
        });
      }
    }
  }

  if (pages.length === 0) {
    pages.push({ html: '<p>...</p>' });
  }

  return { html: fullHtml.replace(DARB_BLOCK_TOKEN_RE, ''), pages };
}

export function buildCanonicalEditionFromChapters(input: {
  id: string;
  title: string;
  subtitle?: string;
  direction?: BookDirection;
  badge?: string;
  chapters: ChapterSource[];
  metadata?: Record<string, unknown>;
}): EditionData {
  const spreads: BookSpread[] = [];
  let pageCounter = 1;

  // 1. Front Cover Spread
  spreads.push({
    isFrontCover: true,
    right: {
      isCover: true,
      html: `
        <div class="cover-frame">
          <div class="cover-badge">${escapeHtml(input.badge || 'منصة درب التفاعلية')}</div>
          <h1 class="cover-title">${escapeHtml(input.title)}</h1>
          ${input.subtitle ? `<p class="cover-subtitle">${escapeHtml(input.subtitle)}</p>` : ''}
        </div>
      `.trim(),
    },
    left: null,
  });

  // 2. Placeholder TOC Spread (filled once chapter start spreads are computed)
  const tocSpreadIndex = spreads.length;
  const tocPageRight = pageCounter++;
  const tocPageLeft = pageCounter++;
  spreads.push({
    pageRightNum: tocPageRight,
    pageLeftNum: tocPageLeft,
    right: {
      header: 'الفهرس التفاعلي',
      title: 'محتويات الكتاب',
      html: '',
    },
    left: {
      header: input.title,
      html: '<p class="chapter-hero-desc">تصفّح الفصول مباشرة عبر النقر، أو استخدم القارئ الصوتي وملخصات الفصول.</p>',
    },
  });

  // 3. Chapter Spreads
  const chapterMeta: BookChapterMeta[] = [];

  for (const ch of input.chapters) {
    const startSpreadIdx = spreads.length;
    const pageEntries: ChapterPageEntry[] =
      ch.pages && ch.pages.length > 0
        ? ch.pages
        : [
            ...splitHtmlIntoPageChunks(ch.html).map((html) => ({ html })),
            ...(ch.blocks && ch.blocks.length > 0
              ? ch.blocks.map((block) => ({
                  html: `<p class="chapter-hero-desc">نشاط تفاعلي: ${escapeHtml(block.title || block.type)}</p>`,
                  blocks: [block],
                }))
              : []),
          ];

    chapterMeta.push({
      id: ch.id,
      title: ch.title,
      subtitle: ch.subtitle,
      startSpread: startSpreadIdx,
    });

    // Pair entries two-by-two onto right/left pages
    for (let i = 0; i < pageEntries.length; i += 2) {
      const rightEntry = pageEntries[i]!;
      const leftEntry = pageEntries[i + 1];
      const pRight = pageCounter++;
      const pLeft = pageCounter++;
      const isFirstSpreadOfChapter = i === 0;

      spreads.push({
        chapterId: ch.id,
        pageRightNum: pRight,
        pageLeftNum: pLeft,
        right: {
          header: ch.title,
          title: isFirstSpreadOfChapter ? ch.title : undefined,
          html:
            isFirstSpreadOfChapter && ch.subtitle
              ? `<p class="chapter-hero-desc">${escapeHtml(ch.subtitle)}</p>${rightEntry.html}`
              : rightEntry.html,
          ...(rightEntry.blocks && rightEntry.blocks.length > 0
            ? { blocks: rightEntry.blocks }
            : {}),
        },
        left: leftEntry
          ? {
              header: ch.title,
              html: leftEntry.html,
              ...(leftEntry.blocks && leftEntry.blocks.length > 0
                ? { blocks: leftEntry.blocks }
                : {}),
            }
          : {
              isBlank: true,
              html: '',
            },
      });
    }
  }

  // Fill TOC HTML now that chapter startSpread indices are exact
  const tocRowsHtml = chapterMeta
    .map((ch, idx) => {
      const hasVideo = Boolean(input.chapters[idx]?.hasVideo);
      return `
        <div class="toc-item" data-spread="${ch.startSpread}" data-chapter="${ch.id}">
          ${hasVideo ? '<svg class="hold-ring-svg" viewBox="0 0 36 36"><circle class="hold-ring-track" cx="18" cy="18" r="15"></circle><circle class="hold-ring-fill" cx="18" cy="18" r="15"></circle></svg>' : ''}
          <div class="toc-item-main">
            <div class="toc-item-title">${escapeHtml(ch.title)}</div>
            ${ch.subtitle ? `<div class="toc-item-sub">${escapeHtml(ch.subtitle)}</div>` : ''}
          </div>
          <span class="toc-page-tag">نشرة ${ch.startSpread}</span>
        </div>
      `.trim();
    })
    .join('\n');

  spreads[tocSpreadIndex]!.right!.html = `<div class="toc-list">${tocRowsHtml}</div>`;

  // 4. Back Cover Spread
  spreads.push({
    isBackCover: true,
    right: {
      isCover: true,
      html: `
        <div class="cover-frame">
          <h2 class="cover-title">نهاية الكتاب</h2>
          <p class="cover-subtitle">${escapeHtml(input.title)}</p>
        </div>
      `.trim(),
    },
    left: null,
  });

  return parseEditionData({
    id: slugifyBookId(input.id),
    title: input.title,
    subtitle: input.subtitle,
    direction: input.direction ?? 'rtl',
    chapters: chapterMeta,
    spreads,
    metadata: input.metadata,
  });
}
