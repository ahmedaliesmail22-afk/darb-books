import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { stripHtmlText, type BookDirection } from '@darb/book-schema';
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

function extractHtmlBody(xhtml: string): { title?: string; bodyHtml: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(xhtml);
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(xhtml);
  const h1Match = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(bodyMatch?.[1] ?? xhtml);
  const rawBody = bodyMatch ? bodyMatch[1] : xhtml;
  return {
    title: h1Match ? stripHtmlText(h1Match[1]) : titleMatch ? stripHtmlText(titleMatch[1]) : undefined,
    bodyHtml: sanitizeBookHtml(rawBody),
  };
}

export class EpubBookParser implements BookParserAdapter {
  public readonly formatId = 'epub';
  public readonly labelAr = 'كتاب إلكتروني (.epub)';
  public readonly labelEn = 'EPUB E-Book';
  public readonly extensions = ['.epub'];
  public readonly mimeTypes = ['application/epub+zip'];
  public readonly descriptionAr = 'استيراد الكتب الإلكترونية القياسية بصيغة EPUB وفق ترتيب الفصول';

  public canHandle(input: ParserInput): boolean {
    const lower = input.filename.toLowerCase();
    return lower.endsWith('.epub') || input.mimeType === 'application/epub+zip';
  }

  public async parse(input: ParserInput): Promise<ParsedBookPackage> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(input.buffer);
    } catch {
      throw new BookParserError('INVALID_EPUB', 'ملف EPUB غير صالح أو تالف');
    }

    const containerXmlFile = zip.file('META-INF/container.xml');
    if (!containerXmlFile) {
      throw new BookParserError('INVALID_EPUB', 'ملف EPUB يفتقد إلى META-INF/container.xml');
    }

    const xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const containerObj = xmlParser.parse(await containerXmlFile.async('string')) as Record<
      string,
      unknown
    >;
    const container = containerObj.container as Record<string, unknown> | undefined;
    const rootfiles = container?.rootfiles as Record<string, unknown> | undefined;
    const rootfileRaw = rootfiles?.rootfile;
    const rootfile = Array.isArray(rootfileRaw) ? rootfileRaw[0] : rootfileRaw;
    const opfPath = (rootfile as Record<string, string> | undefined)?.['@_full-path'];

    if (!opfPath || !zip.file(opfPath)) {
      throw new BookParserError('INVALID_EPUB', 'تعذر العثور على ملف الحزمة OPF داخل EPUB');
    }

    const opfDir = path.posix.dirname(opfPath);
    const opfObj = xmlParser.parse(await zip.file(opfPath)!.async('string')) as Record<
      string,
      unknown
    >;
    const pkg = opfObj.package as Record<string, unknown> | undefined;
    const meta = pkg?.metadata as Record<string, unknown> | undefined;
    const manifestObj = pkg?.manifest as Record<string, unknown> | undefined;
    const spineObj = pkg?.spine as Record<string, unknown> | undefined;

    const rawTitle = meta?.['dc:title'];
    const dcTitle =
      typeof rawTitle === 'string'
        ? rawTitle
        : typeof (rawTitle as Record<string, unknown> | undefined)?.['#text'] === 'string'
          ? String((rawTitle as Record<string, unknown>)['#text'])
          : undefined;

    const langRaw = meta?.['dc:language'];
    const langStr = typeof langRaw === 'string' ? langRaw.toLowerCase() : 'ar';
    const pageDirAttr = (spineObj?.['@_page-progression-direction'] as string | undefined) ?? '';
    const direction: BookDirection =
      input.defaultDirection ??
      (pageDirAttr === 'ltr'
        ? 'ltr'
        : pageDirAttr === 'rtl' || langStr.startsWith('ar')
          ? 'rtl'
          : 'rtl');

    const manifestItemsRaw = manifestObj?.item;
    const manifestItems = Array.isArray(manifestItemsRaw)
      ? manifestItemsRaw
      : manifestItemsRaw
        ? [manifestItemsRaw]
        : [];
    const itemById = new Map<string, { href: string; mediaType: string }>();
    for (const it of manifestItems as Array<Record<string, string>>) {
      if (it['@_id'] && it['@_href']) {
        itemById.set(it['@_id'], {
          href: it['@_href'],
          mediaType: it['@_media-type'] ?? 'application/octet-stream',
        });
      }
    }

    const spineRefsRaw = spineObj?.itemref;
    const spineRefs = Array.isArray(spineRefsRaw)
      ? spineRefsRaw
      : spineRefsRaw
        ? [spineRefsRaw]
        : [];

    const chapters: ChapterSource[] = [];
    const extractedAssets: ExtractedAsset[] = [];

    for (const ref of spineRefs as Array<Record<string, string>>) {
      const item = itemById.get(ref['@_idref']);
      if (!item) continue;
      const fullPath = opfDir === '.' ? item.href : path.posix.normalize(`${opfDir}/${item.href}`);
      const zipEntry = zip.file(fullPath);
      if (!zipEntry) continue;

      const xhtml = await zipEntry.async('string');
      const { title, bodyHtml } = extractHtmlBody(xhtml);
      if (stripHtmlText(bodyHtml).length === 0) continue;

      chapters.push({
        id: chapters.length + 1,
        title: title || `الفصل ${chapters.length + 1}`,
        html: bodyHtml,
      });
    }

    // Extract non-document media assets (images, audio)
    for (const [, item] of itemById) {
      if (item.mediaType.startsWith('image/') || item.mediaType.startsWith('audio/')) {
        const fullPath = opfDir === '.' ? item.href : path.posix.normalize(`${opfDir}/${item.href}`);
        const zipEntry = zip.file(fullPath);
        if (!zipEntry) continue;
        const buffer = await zipEntry.async('nodebuffer');
        extractedAssets.push({
          relativePath: `assets/${item.href.replace(/^\/+/, '')}`,
          buffer,
          mimeType: item.mediaType,
          assetType: item.mediaType.startsWith('audio/') ? 'AUDIO' : 'IMAGE',
        });
      }
    }

    if (chapters.length === 0) {
      throw new BookParserError('EMPTY_EPUB', 'لم يتم العثور على محتوى مقروء داخل ملف EPUB');
    }

    const title = input.titleOverride || dcTitle || input.filename.replace(/\.epub$/i, '');
    const editionData = buildCanonicalEditionFromChapters({
      id: input.bookSlug ?? title,
      title,
      subtitle: input.subtitleOverride,
      direction,
      badge: 'EPUB',
      chapters,
    });

    return {
      formatId: this.formatId,
      editionData,
      extractedAssets,
      chaptersCount: chapters.length,
      spreadsCount: editionData.spreads.length,
      audioTracksCount: extractedAssets.filter((a) => a.assetType === 'AUDIO').length,
      videosCount: 0,
      warnings: [],
    };
  }
}
