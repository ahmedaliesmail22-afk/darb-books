import crypto from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { BookParserError, createDefaultParserRegistry, type ParsedBookPackage } from '@darb/parsers';
import { parseJson, stringifyJson } from '../lib/jsonCodec';
import { recordAuditLog } from '../plugins/audit';
import { requirePermission } from '../plugins/rbac';
import { getUploadsPolicy } from '../services/configService';
import { sanitizeStorageKey, type StorageService } from '../services/storage';

type MediaAssetType = 'SOURCE_DOC' | 'AUDIO' | 'VIDEO' | 'IMAGE' | 'MODEL_3D' | 'OTHER';

const SubmitVersionBodySchema = z.object({
  ipDeclarationSigned: z.boolean(),
  authorNotes: z.string().trim().max(1000).optional(),
});

function sanitizeBookSlug(rawSlug?: string, titleFallback?: string, filenameFallback?: string): string {
  const candidates = [rawSlug, titleFallback, filenameFallback?.replace(/\.[^.]+$/, '')];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const cleaned = candidate
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    if (/^[a-z0-9][a-z0-9-]*$/.test(cleaned)) {
      return cleaned;
    }
  }
  return `book-${crypto.randomBytes(4).toString('hex')}`;
}

function parseListField(raw?: string): string[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // fall back to comma split
    }
  }
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedUpload(
  filename: string,
  requestedFormat: string | undefined,
  allowedFormats: string[]
): boolean {
  const normalizedAllowed = new Set(allowedFormats.map((f) => f.toLowerCase()));
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  const fmt = requestedFormat?.toLowerCase();

  const aliases: Record<string, string[]> = {
    zip: ['zip', 'template-zip'],
    'template-zip': ['zip', 'template-zip'],
    json: ['json'],
    md: ['md', 'markdown'],
    markdown: ['md', 'markdown'],
    docx: ['docx'],
    epub: ['epub'],
    pdf: ['pdf'],
  };

  if (fmt && aliases[fmt]) {
    return aliases[fmt].some((a) => normalizedAllowed.has(a));
  }
  if (ext && aliases[ext]) {
    return aliases[ext].some((a) => normalizedAllowed.has(a));
  }
  return false;
}

async function readMultipartUpload(request: FastifyRequest): Promise<{
  fields: Record<string, string>;
  file: { filename: string; mimetype: string; buffer: Buffer } | null;
}> {
  const fields: Record<string, string> = {};
  let file: { filename: string; mimetype: string; buffer: Buffer } | null = null;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const buf = await part.toBuffer();
      if (part.fieldname === 'file' || !file) {
        file = {
          filename: part.filename || 'book-upload.bin',
          mimetype: part.mimetype || 'application/octet-stream',
          buffer: buf,
        };
      }
    } else {
      fields[part.fieldname] =
        typeof part.value === 'string' ? part.value : String(part.value ?? '');
    }
  }

  return { fields, file };
}

function mapAssetType(assetType: ParsedBookPackage['extractedAssets'][number]['assetType']): MediaAssetType {
  switch (assetType) {
    case 'AUDIO':
      return 'AUDIO';
    case 'VIDEO':
      return 'VIDEO';
    case 'IMAGE':
      return 'IMAGE';
    case 'MODEL_3D':
      return 'MODEL_3D';
    default:
      return 'OTHER';
  }
}

async function persistParsedArtifacts(input: {
  storage: StorageService;
  slug: string;
  versionNumber: number;
  parsed: ParsedBookPackage;
  sourceFile: { filename: string; mimetype: string; buffer: Buffer };
}) {
  const prefix = `books/${input.slug}/v${input.versionNumber}`;
  const safeName = path
    .basename(input.sourceFile.filename)
    .replace(/[^a-zA-Z0-9._-]+/g, '_') || 'source.bin';
  const sourceKey = sanitizeStorageKey(`${prefix}/source/${safeName}`);
  const canonicalKey = sanitizeStorageKey(`${prefix}/book.json`);

  await input.storage.putObject({
    key: sourceKey,
    body: input.sourceFile.buffer,
    contentType: input.sourceFile.mimetype,
  });

  const canonicalBuffer = Buffer.from(JSON.stringify(input.parsed.editionData, null, 2), 'utf8');
  await input.storage.putObject({
    key: canonicalKey,
    body: canonicalBuffer,
    contentType: 'application/json; charset=utf-8',
  });

  const mediaRows: Array<{
    assetType: MediaAssetType;
    r2Key: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
    metadataJson: string;
  }> = [
    {
      assetType: 'SOURCE_DOC',
      r2Key: sourceKey,
      mimeType: input.sourceFile.mimetype,
      sizeBytes: input.sourceFile.buffer.length,
      checksumSha256: crypto.createHash('sha256').update(input.sourceFile.buffer).digest('hex'),
      metadataJson: stringifyJson({
        originalFilename: input.sourceFile.filename,
        formatId: input.parsed.formatId,
      }),
    },
  ];

  let firstAudioDir: string | null = null;
  let firstVideoDir: string | null = null;

  for (const asset of input.parsed.extractedAssets) {
    const cleanRel = asset.relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const r2Key = sanitizeStorageKey(`${prefix}/${cleanRel}`);
    await input.storage.putObject({
      key: r2Key,
      body: asset.buffer,
      contentType: asset.mimeType,
    });

    if (asset.assetType === 'AUDIO' && !firstAudioDir) {
      const dir = path.posix.dirname(cleanRel);
      firstAudioDir = dir === '.' ? prefix : `${prefix}/${dir}`;
    }
    if (asset.assetType === 'VIDEO' && !firstVideoDir) {
      const dir = path.posix.dirname(cleanRel);
      firstVideoDir = dir === '.' ? prefix : `${prefix}/${dir}`;
    }

    mediaRows.push({
      assetType: mapAssetType(asset.assetType),
      r2Key,
      mimeType: asset.mimeType,
      sizeBytes: asset.buffer.length,
      checksumSha256: crypto.createHash('sha256').update(asset.buffer).digest('hex'),
      metadataJson: stringifyJson({ relativePath: cleanRel }),
    });
  }

  return {
    sourceKey,
    canonicalKey,
    audioDir: firstAudioDir,
    videoDir: firstVideoDir,
    mediaRows,
  };
}

export function registerAuthorRoutes(
  app: FastifyInstance,
  deps: {
    prisma: PrismaClient;
    storage: StorageService;
    authenticate: ReturnType<typeof import('../plugins/auth').createAuthHooks>['authenticate'];
  }
): void {
  const { prisma, storage, authenticate } = deps;
  const parserRegistry = createDefaultParserRegistry();

  app.get(
    '/api/v1/author/books',
    { preHandler: [authenticate, requirePermission('books.create')] },
    async (request, reply) => {
      const q = request.query as { scope?: string };
      const canSeeAll =
        q.scope === 'all' &&
        (request.authUser!.permissions.has('books.review') ||
          request.authUser!.permissions.has('books.publish'));

      const books = await prisma.book.findMany({
        where: canSeeAll ? undefined : { authorId: request.authUser!.userId },
        include: {
          taxonomies: { include: { taxonomy: true } },
          activeVersion: {
            select: {
              id: true,
              versionNumber: true,
              versionLabel: true,
              status: true,
              publishedAt: true,
            },
          },
          versions: {
            orderBy: { versionNumber: 'desc' },
            include: {
              reviewTickets: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: {
                  reviewer: { select: { id: true, fullName: true } },
                },
              },
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
      });

      return reply.send({
        books: books.map((book) => ({
          id: book.id,
          slug: book.slug,
          title: book.title,
          subtitle: book.subtitle,
          description: book.description,
          badge: book.badge,
          badgeColor: book.badgeColor,
          theme: book.theme,
          direction: book.direction,
          status: book.status,
          activeVersionId: book.activeVersionId,
          activeVersion: book.activeVersion,
          updatedAt: book.updatedAt,
          taxonomies: book.taxonomies.map((t) => ({
            ...t.taxonomy,
            rulesJson: parseJson(t.taxonomy.rulesJson, {}),
          })),
          versions: book.versions.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            versionLabel: v.versionLabel,
            sourceFormat: v.sourceFormat,
            chaptersCount: v.chaptersCount,
            spreadsCount: v.spreadsCount,
            audioTracksCount: v.audioTracksCount,
            videosCount: v.videosCount,
            ipDeclarationSigned: v.ipDeclarationSigned,
            status: v.status,
            submittedAt: v.submittedAt,
            publishedAt: v.publishedAt,
            createdAt: v.createdAt,
            latestTicket: v.reviewTickets[0]
              ? {
                  ...v.reviewTickets[0],
                  checklistJson: parseJson(v.reviewTickets[0].checklistJson, {}),
                }
              : null,
          })),
        })),
      });
    }
  );

  app.get(
    '/api/v1/author/versions/:versionId/preview',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { versionId } = request.params as { versionId: string };
      const version = await prisma.bookVersion.findUnique({
        where: { id: versionId },
        include: {
          book: {
            include: {
              taxonomies: { include: { taxonomy: true } },
            },
          },
        },
      });

      if (!version) {
        return reply.code(404).send({ error: 'VERSION_NOT_FOUND' });
      }

      const authUser = request.authUser!;
      const isOwner = version.book.authorId === authUser.userId;
      const isReviewerOrPublisher =
        authUser.permissions.has('books.review') || authUser.permissions.has('books.publish');
      const isPublishedActive =
        version.book.status === 'PUBLISHED' && version.book.activeVersionId === version.id;

      if (!isOwner && !isReviewerOrPublisher && !isPublishedActive) {
        return reply.code(403).send({
          error: 'FORBIDDEN',
          message: 'ليس لديك صلاحية معاينة هذا الإصدار غير المنشور',
        });
      }

      if (!version.canonicalDataJson) {
        return reply.code(404).send({ error: 'CANONICAL_DATA_MISSING' });
      }

      return reply.send({
        book: {
          id: version.book.id,
          slug: version.book.slug,
          title: version.book.title,
          subtitle: version.book.subtitle,
          description: version.book.description,
          badge: version.book.badge,
          badgeColor: version.book.badgeColor,
          theme: version.book.theme,
          direction: version.book.direction,
          coverUrl: version.book.coverUrl,
          status: version.book.status,
          activeVersionId: version.book.activeVersionId,
        },
        version: {
          id: version.id,
          versionNumber: version.versionNumber,
          versionLabel: version.versionLabel,
          sourceFormat: version.sourceFormat,
          audioDir: version.audioDir,
          videoDir: version.videoDir,
          chaptersCount: version.chaptersCount,
          spreadsCount: version.spreadsCount,
          status: version.status,
        },
        editionData: parseJson(version.canonicalDataJson, {}),
      });
    }
  );

  app.post(
    '/api/v1/author/books',
    { preHandler: [authenticate, requirePermission('books.create')] },
    async (request, reply) => {
      if (!request.isMultipart()) {
        return reply.code(400).send({
          error: 'MULTIPART_REQUIRED',
          message: 'يجب إرسال ملف الكتاب عبر نموذج multipart/form-data',
        });
      }

      const { fields, file } = await readMultipartUpload(request);
      if (!file || file.buffer.length === 0) {
        return reply.code(400).send({
          error: 'FILE_REQUIRED',
          message: 'يرجى اختيار ملف الكتاب للرفع والتحويل',
        });
      }

      const policy = await getUploadsPolicy(prisma);
      if (file.buffer.length > policy.maxFileSizeMb * 1024 * 1024) {
        return reply.code(413).send({
          error: 'FILE_TOO_LARGE',
          message: `يتجاوز حجم الملف الحد الأقصى المسموح (${policy.maxFileSizeMb} MB)`,
        });
      }

      if (!isAllowedUpload(file.filename, fields.format, policy.allowedFormats)) {
        return reply.code(400).send({
          error: 'UNSUPPORTED_OR_DISALLOWED_FORMAT',
          message: `الصيغة غير مسموحة ضمن سياسة المنصة (${policy.allowedFormats.join(', ')})`,
        });
      }

      const bookSlug = sanitizeBookSlug(fields.slug, fields.title, file.filename);
      const existing = await prisma.book.findUnique({ where: { slug: bookSlug } });
      if (existing) {
        return reply.code(409).send({
          error: 'BOOK_SLUG_EXISTS',
          message: `المعرف "${bookSlug}" مستخدم مسبقاً، لرفع تحديث اختر إنشاء إصدار جديد على نفس الكتاب`,
        });
      }

      let parsedPkg: ParsedBookPackage;
      try {
        parsedPkg = await parserRegistry.parse({
          buffer: file.buffer,
          filename: file.filename,
          mimeType: file.mimetype,
          format: fields.format || undefined,
          bookSlug,
          titleOverride: fields.title?.trim() || undefined,
          subtitleOverride: fields.subtitle?.trim() || undefined,
          defaultDirection: fields.direction === 'ltr' ? 'ltr' : 'rtl',
        });
      } catch (err) {
        if (err instanceof BookParserError) {
          return reply.code(400).send({ error: err.code, message: err.message });
        }
        throw err;
      }

      const explicitTaxIds = parseListField(fields.taxonomyIds);
      const manifestTaxSlugs = Array.isArray(parsedPkg.manifestMetadata?.taxonomySlugs)
        ? parsedPkg.manifestMetadata!.taxonomySlugs.map((s) => String(s))
        : [];
      const extraTaxSlugs = parseListField(fields.taxonomySlugs);
      const combinedSlugs = Array.from(new Set([...manifestTaxSlugs, ...extraTaxSlugs]));

      let resolvedTaxIds = explicitTaxIds;
      if (resolvedTaxIds.length === 0 && combinedSlugs.length > 0) {
        const matchedTax = await prisma.taxonomy.findMany({
          where: { slug: { in: combinedSlugs }, isActive: true },
          select: { id: true },
        });
        resolvedTaxIds = matchedTax.map((t) => t.id);
      }

      if (resolvedTaxIds.length > 0) {
        const validTax = await prisma.taxonomy.findMany({
          where: { id: { in: resolvedTaxIds }, isActive: true },
          select: { id: true },
        });
        resolvedTaxIds = validTax.map((t) => t.id);
      }

      const persisted = await persistParsedArtifacts({
        storage,
        slug: bookSlug,
        versionNumber: 1,
        parsed: parsedPkg,
        sourceFile: file,
      });

      const created = await prisma.$transaction(async (tx) => {
        const manifest = (parsedPkg.manifestMetadata ?? {}) as Record<string, unknown>;
        const book = await tx.book.create({
          data: {
            slug: bookSlug,
            title: parsedPkg.editionData.title,
            subtitle: fields.subtitle?.trim() || parsedPkg.editionData.subtitle || null,
            description:
              fields.description?.trim() ||
              (typeof manifest.description === 'string' ? manifest.description : null),
            badge:
              fields.badge?.trim() ||
              (typeof parsedPkg.editionData.badge === 'string'
                ? parsedPkg.editionData.badge
                : null) ||
              (typeof manifest.badge === 'string' ? manifest.badge : 'مسودة مؤلف'),
            badgeColor:
              fields.badgeColor?.trim() ||
              (typeof manifest.badgeColor === 'string' ? manifest.badgeColor : '#d4af37'),
            theme:
              fields.theme?.trim() ||
              (typeof manifest.theme === 'string' ? manifest.theme : 'royal-gold'),
            direction: parsedPkg.editionData.direction ?? 'rtl',
            status: 'DRAFT',
            activeVersionId: null,
            authorId: request.authUser!.userId,
          },
        });

        const version = await tx.bookVersion.create({
          data: {
            bookId: book.id,
            versionNumber: 1,
            versionLabel: 'v1',
            sourceFormat: parsedPkg.formatId,
            sourceFileUrl: persisted.sourceKey,
            canonicalJsonUrl: persisted.canonicalKey,
            canonicalDataJson: stringifyJson(parsedPkg.editionData, '{}'),
            audioDir: persisted.audioDir,
            videoDir: persisted.videoDir,
            chaptersCount: parsedPkg.chaptersCount,
            spreadsCount: parsedPkg.spreadsCount,
            audioTracksCount: parsedPkg.audioTracksCount,
            videosCount: parsedPkg.videosCount,
            ipDeclarationSigned: false,
            status: 'DRAFT',
          },
        });

        if (resolvedTaxIds.length > 0) {
          await tx.bookTaxonomy.createMany({
            data: Array.from(new Set(resolvedTaxIds)).map((taxonomyId) => ({
              bookId: book.id,
              taxonomyId,
            })),
          });
        }

        await tx.mediaAsset.createMany({
          data: persisted.mediaRows.map((row) => ({
            ...row,
            bookVersionId: version.id,
          })),
        });

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'author.book_upload',
          targetType: 'book_version',
          targetId: version.id,
          metadata: {
            bookId: book.id,
            slug: book.slug,
            versionNumber: 1,
            sourceFormat: parsedPkg.formatId,
            spreadsCount: parsedPkg.spreadsCount,
          },
          request,
        });

        return { book, version };
      });

      return reply.code(201).send({
        book: created.book,
        version: created.version,
        warnings: parsedPkg.warnings,
      });
    }
  );

  app.post(
    '/api/v1/author/books/:slug/versions',
    { preHandler: [authenticate, requirePermission('books.create')] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const book = await prisma.book.findUnique({
        where: { slug },
        include: {
          versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        },
      });

      if (!book) {
        return reply.code(404).send({ error: 'BOOK_NOT_FOUND' });
      }

      const isOwner = book.authorId === request.authUser!.userId;
      const isPublisher = request.authUser!.permissions.has('books.publish');
      if (!isOwner && !isPublisher) {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }

      if (!request.isMultipart()) {
        return reply.code(400).send({
          error: 'MULTIPART_REQUIRED',
          message: 'يجب إرسال ملف الإصدار الجديد عبر multipart/form-data',
        });
      }

      const { fields, file } = await readMultipartUpload(request);
      if (!file || file.buffer.length === 0) {
        return reply.code(400).send({ error: 'FILE_REQUIRED' });
      }

      const policy = await getUploadsPolicy(prisma);
      if (file.buffer.length > policy.maxFileSizeMb * 1024 * 1024) {
        return reply.code(413).send({
          error: 'FILE_TOO_LARGE',
          message: `يتجاوز حجم الملف الحد الأقصى المسموح (${policy.maxFileSizeMb} MB)`,
        });
      }

      if (!isAllowedUpload(file.filename, fields.format, policy.allowedFormats)) {
        return reply.code(400).send({
          error: 'UNSUPPORTED_OR_DISALLOWED_FORMAT',
          message: `الصيغة غير مسموحة ضمن سياسة المنصة (${policy.allowedFormats.join(', ')})`,
        });
      }

      let parsedPkg: ParsedBookPackage;
      try {
        parsedPkg = await parserRegistry.parse({
          buffer: file.buffer,
          filename: file.filename,
          mimeType: file.mimetype,
          format: fields.format || undefined,
          bookSlug: book.slug,
          titleOverride: fields.title?.trim() || undefined,
          subtitleOverride: fields.subtitle?.trim() || undefined,
          defaultDirection: (book.direction as 'rtl' | 'ltr') || 'rtl',
        });
      } catch (err) {
        if (err instanceof BookParserError) {
          return reply.code(400).send({ error: err.code, message: err.message });
        }
        throw err;
      }

      const nextVersionNumber = (book.versions[0]?.versionNumber ?? 0) + 1;
      const versionLabel = `v${nextVersionNumber}`;

      const persisted = await persistParsedArtifacts({
        storage,
        slug: book.slug,
        versionNumber: nextVersionNumber,
        parsed: parsedPkg,
        sourceFile: file,
      });

      const version = await prisma.$transaction(async (tx) => {
        const createdVersion = await tx.bookVersion.create({
          data: {
            bookId: book.id,
            versionNumber: nextVersionNumber,
            versionLabel,
            sourceFormat: parsedPkg.formatId,
            sourceFileUrl: persisted.sourceKey,
            canonicalJsonUrl: persisted.canonicalKey,
            canonicalDataJson: stringifyJson(parsedPkg.editionData, '{}'),
            audioDir: persisted.audioDir,
            videoDir: persisted.videoDir,
            chaptersCount: parsedPkg.chaptersCount,
            spreadsCount: parsedPkg.spreadsCount,
            audioTracksCount: parsedPkg.audioTracksCount,
            videosCount: parsedPkg.videosCount,
            ipDeclarationSigned: false,
            status: 'DRAFT',
          },
        });

        await tx.mediaAsset.createMany({
          data: persisted.mediaRows.map((row) => ({
            ...row,
            bookVersionId: createdVersion.id,
          })),
        });

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'author.version_upload',
          targetType: 'book_version',
          targetId: createdVersion.id,
          metadata: {
            bookId: book.id,
            slug: book.slug,
            versionNumber: nextVersionNumber,
            nonDestructiveActiveVersionId: book.activeVersionId,
            sourceFormat: parsedPkg.formatId,
          },
          request,
        });

        return createdVersion;
      });

      return reply.code(201).send({
        book,
        version,
        warnings: parsedPkg.warnings,
      });
    }
  );

  app.post(
    '/api/v1/author/versions/:versionId/submit',
    { preHandler: [authenticate, requirePermission('books.create')] },
    async (request, reply) => {
      const { versionId } = request.params as { versionId: string };
      const parsedBody = SubmitVersionBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsedBody.error.issues });
      }

      if (!parsedBody.data.ipDeclarationSigned) {
        return reply.code(400).send({
          error: 'IP_DECLARATION_REQUIRED',
          message: 'يجب توقيع إقرار الملكية الفكرية وحقوق النشر قبل إرسال الإصدار للمراجعة',
        });
      }

      const version = await prisma.bookVersion.findUnique({
        where: { id: versionId },
        include: { book: true },
      });
      if (!version) {
        return reply.code(404).send({ error: 'VERSION_NOT_FOUND' });
      }

      const isOwner = version.book.authorId === request.authUser!.userId;
      const isPublisher = request.authUser!.permissions.has('books.publish');
      if (!isOwner && !isPublisher) {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }

      if (!['DRAFT', 'CHANGES_REQUESTED'].includes(version.status)) {
        return reply.code(409).send({
          error: 'INVALID_VERSION_STATE',
          message: `لا يمكن إرسال هذا الإصدار لأنه في حالة ${version.status}`,
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const updatedVersion = await tx.bookVersion.update({
          where: { id: version.id },
          data: {
            ipDeclarationSigned: true,
            status: 'SUBMITTED',
            submittedAt: new Date(),
          },
        });

        if (version.book.status !== 'PUBLISHED') {
          await tx.book.update({
            where: { id: version.book.id },
            data: { status: 'SUBMITTED' },
          });
        }

        const ticket = await tx.reviewTicket.create({
          data: {
            bookVersionId: version.id,
            checklistJson: '{}',
            contentVerified: false,
            ipVerified: false,
            notes: parsedBody.data.authorNotes ?? null,
          },
        });

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'author.version_submit',
          targetType: 'book_version',
          targetId: version.id,
          metadata: {
            bookId: version.book.id,
            slug: version.book.slug,
            versionNumber: version.versionNumber,
            ipDeclarationSigned: true,
            ticketId: ticket.id,
          },
          request,
        });

        return { version: updatedVersion, ticket };
      });

      return reply.send(result);
    }
  );
}
