import path from 'node:path';
import JSZip from 'jszip';
import { marked } from 'marked';
import { z } from 'zod';
import { parseEditionData, type BookDirection } from '@darb/book-schema';
import { BookParserError } from '../registry';
import {
  buildCanonicalEditionFromChapters,
  parseMarkdownFrontmatter,
  sanitizeBookHtml,
  slugifyBookId,
} from '../shared/spreadBuilder';
import type {
  BookParserAdapter,
  ChapterSource,
  ExtractedAsset,
  ParsedBookPackage,
  ParserInput,
} from '../types';

const TemplateManifestSchema = z
  .object({
    schemaVersion: z.string().default('1.0'),
    id: z.string().optional(),
    slug: z.string().optional(),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    badge: z.string().optional(),
    badgeColor: z.string().optional(),
    theme: z.string().optional(),
    direction: z.enum(['rtl', 'ltr']).optional(),
    taxonomySlugs: z.array(z.string()).optional(),
    chapters: z
      .array(
        z.object({
          id: z.number().int().positive().optional(),
          title: z.string().min(1),
          subtitle: z.string().optional(),
          file: z.string().min(1),
        })
      )
      .optional(),
  })
  .passthrough();

function detectZipAsset(relPath: string): {
  assetType: ExtractedAsset['assetType'];
  mimeType: string;
} {
  const ext = path.posix.extname(relPath).toLowerCase();
  if (ext === '.mp3') return { assetType: 'AUDIO', mimeType: 'audio/mpeg' };
  if (ext === '.mp4') return { assetType: 'VIDEO', mimeType: 'video/mp4' };
  if (ext === '.webm') return { assetType: 'VIDEO', mimeType: 'video/webm' };
  if (ext === '.png') return { assetType: 'IMAGE', mimeType: 'image/png' };
  if (ext === '.jpg' || ext === '.jpeg') return { assetType: 'IMAGE', mimeType: 'image/jpeg' };
  if (ext === '.svg') return { assetType: 'IMAGE', mimeType: 'image/svg+xml' };
  if (ext === '.glb') return { assetType: 'MODEL_3D', mimeType: 'model/gltf-binary' };
  if (ext === '.gltf') return { assetType: 'MODEL_3D', mimeType: 'model/gltf+json' };
  return { assetType: 'OTHER', mimeType: 'application/octet-stream' };
}

export class TemplateZipParser implements BookParserAdapter {
  public readonly formatId = 'template-zip';
  public readonly labelAr = 'قالب درب القياسي (Template ZIP)';
  public readonly labelEn = 'Darb Official Template Package (.zip)';
  public readonly extensions = ['.zip'];
  public readonly mimeTypes = ['application/zip', 'application/x-zip-compressed'];
  public readonly descriptionAr =
    'حزمة القالب القياسي المعتمدة (book.manifest.json + فصول Markdown/HTML + صوتيات وفيديوهات)';

  public canHandle(input: ParserInput): boolean {
    const lower = input.filename.toLowerCase();
    return (
      lower.endsWith('.zip') ||
      input.mimeType === 'application/zip' ||
      input.mimeType === 'application/x-zip-compressed'
    );
  }

  public async parse(input: ParserInput): Promise<ParsedBookPackage> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(input.buffer);
    } catch {
      throw new BookParserError('INVALID_ZIP', 'تعذر فك ضغط حزمة القالب ZIP');
    }

    const manifestFile = zip.file('book.manifest.json');
    if (!manifestFile) {
      throw new BookParserError(
        'MISSING_MANIFEST',
        'حزمة القالب القياسي يجب أن تحتوي على ملف book.manifest.json في الجذر'
      );
    }

    let manifestRaw: unknown;
    try {
      manifestRaw = JSON.parse(await manifestFile.async('string'));
    } catch {
      throw new BookParserError('INVALID_MANIFEST', 'ملف book.manifest.json غير صالح');
    }

    const parsedManifest = TemplateManifestSchema.safeParse(manifestRaw);
    if (!parsedManifest.success) {
      throw new BookParserError(
        'INVALID_MANIFEST',
        `بيانات book.manifest.json ناقصة: ${parsedManifest.error.issues[0]?.message ?? ''}`
      );
    }
    const manifest = parsedManifest.data;

    // Collect media assets inside audio/, videos/, assets/
    const extractedAssets: ExtractedAsset[] = [];
    for (const [entryPath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      if (entryPath.endsWith('.gitkeep')) continue;
      if (
        entryPath.startsWith('audio/') ||
        entryPath.startsWith('videos/') ||
        entryPath.startsWith('assets/')
      ) {
        const buffer = await entry.async('nodebuffer');
        const info = detectZipAsset(entryPath);
        extractedAssets.push({
          relativePath: entryPath,
          buffer,
          mimeType: info.mimeType,
          assetType: info.assetType,
        });
      }
    }

    const audioTracksCount = extractedAssets.filter((a) => a.assetType === 'AUDIO').length;
    const videosCount = extractedAssets.filter((a) => a.assetType === 'VIDEO').length;

    // Case A: Canonical book.json provided inside template ZIP
    const canonicalEntry = zip.file('book.json');
    if (canonicalEntry) {
      const rawBookJson = JSON.parse(await canonicalEntry.async('string')) as Record<string, unknown>;
      const editionData = parseEditionData({
        ...rawBookJson,
        id: slugifyBookId(input.bookSlug ?? manifest.slug ?? manifest.id ?? manifest.title),
        title: input.titleOverride ?? manifest.title,
        subtitle: input.subtitleOverride ?? manifest.subtitle,
      });

      return {
        formatId: this.formatId,
        editionData,
        extractedAssets,
        chaptersCount: editionData.chapters?.length ?? 7,
        spreadsCount: editionData.spreads.length,
        audioTracksCount,
        videosCount,
        warnings: [],
        manifestMetadata: manifest,
      };
    }

    // Case B: Ordered chapter files (declared in manifest.chapters or auto-discovered in chapters/)
    const chapterSpecs =
      manifest.chapters && manifest.chapters.length > 0
        ? manifest.chapters
        : Object.keys(zip.files)
            .filter(
              (p) =>
                !zip.files[p]!.dir &&
                p.startsWith('chapters/') &&
                /\.(md|markdown|html|htm)$/i.test(p)
            )
            .sort()
            .map((filePath, idx) => ({
              id: idx + 1,
              title: path.posix
                .basename(filePath)
                .replace(/\.(md|markdown|html|htm)$/i, '')
                .replace(/^\d+[-_]?/, ''),
              subtitle: undefined,
              file: filePath,
            }));

    if (chapterSpecs.length === 0) {
      throw new BookParserError(
        'EMPTY_TEMPLATE_CHAPTERS',
        'حزمة القالب لا تحتوي على book.json ولا ملفات فصول داخل chapters/'
      );
    }

    const chapters: ChapterSource[] = [];
    for (let i = 0; i < chapterSpecs.length; i++) {
      const spec = chapterSpecs[i]!;
      const fileEntry = zip.file(spec.file.replace(/^\.\//, ''));
      if (!fileEntry) {
        throw new BookParserError('MISSING_CHAPTER_FILE', `ملف الفصل مفقود: ${spec.file}`);
      }

      const rawText = await fileEntry.async('string');
      let html: string;
      let chapterTitle = spec.title;
      let chapterSubtitle = spec.subtitle;

      if (/\.html?$/i.test(spec.file)) {
        html = sanitizeBookHtml(rawText);
      } else {
        const { metadata, body } = parseMarkdownFrontmatter(rawText);
        if (metadata.title) chapterTitle = metadata.title;
        if (metadata.subtitle) chapterSubtitle = metadata.subtitle;
        const rendered = marked.parse(body, { async: false, gfm: true, breaks: false });
        html = typeof rendered === 'string' ? rendered : '';
      }

      const chNum = spec.id ?? i + 1;
      const hasVideo = extractedAssets.some(
        (a) => a.relativePath === `videos/ch${chNum}.mp4`
      );

      chapters.push({
        id: chNum,
        title: chapterTitle,
        subtitle: chapterSubtitle,
        html,
        hasVideo,
      });
    }

    const editionData = buildCanonicalEditionFromChapters({
      id: input.bookSlug ?? manifest.slug ?? manifest.id ?? manifest.title,
      title: input.titleOverride ?? manifest.title,
      subtitle: input.subtitleOverride ?? manifest.subtitle,
      direction: (manifest.direction ?? input.defaultDirection ?? 'rtl') as BookDirection,
      badge: manifest.badge ?? 'قالب درب الرسمي',
      chapters,
      metadata: {
        manifest,
      },
    });

    return {
      formatId: this.formatId,
      editionData,
      extractedAssets,
      chaptersCount: chapters.length,
      spreadsCount: editionData.spreads.length,
      audioTracksCount,
      videosCount,
      warnings: [],
      manifestMetadata: manifest,
    };
  }
}
