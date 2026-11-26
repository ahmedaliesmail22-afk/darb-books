import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { normalizeArabic } from '@darb/book-schema';
import { recordAuditLog } from '../plugins/audit';
import { requirePermission } from '../plugins/rbac';
import {
  computePersonalizationScore,
  isBookAllowedForAgeGroup,
  resolveBookMinAge,
} from '../services/ageGating';
import { getAgePolicy } from '../services/configService';

const CreateBookSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1).max(240),
  subtitle: z.string().trim().max(300).optional(),
  description: z.string().trim().max(1000).optional(),
  badge: z.string().trim().max(80).optional(),
  badgeColor: z.string().trim().max(40).optional(),
  theme: z.string().trim().default('royal-gold'),
  direction: z.enum(['rtl', 'ltr']).default('rtl'),
  taxonomyIds: z.array(z.string().uuid()).default([]),
  publishNow: z.boolean().default(false),
  canonicalDataJson: z.record(z.string(), z.unknown()),
  audioDir: z.string().optional(),
  videoDir: z.string().optional(),
  chaptersCount: z.number().int().nonnegative().default(0),
  spreadsCount: z.number().int().positive().default(1),
});

const ProgressBodySchema = z.object({
  currentSpread: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100).default(0),
  bookmarksJson: z.array(z.unknown()).default([]),
});

export function registerBookRoutes(
  app: FastifyInstance,
  deps: {
    prisma: PrismaClient;
    authenticate: ReturnType<typeof import('../plugins/auth').createAuthHooks>['authenticate'];
    optionalAuthenticate: ReturnType<
      typeof import('../plugins/auth').createAuthHooks
    >['optionalAuthenticate'];
  }
): void {
  const { prisma, authenticate, optionalAuthenticate } = deps;

  async function resolveUserContext(userId: string | undefined) {
    if (!userId) return null;
    return prisma.userProfile.findUnique({
      where: { userId },
      include: {
        ageGroup: true,
        educationLevel: true,
        preferredTaxonomies: true,
      },
    });
  }

  app.get('/api/v1/books', { preHandler: [optionalAuthenticate] }, async (request, reply) => {
    const q = request.query as { q?: string; taxonomy?: string; recommendedOnly?: string };
    const [policy, profile, books] = await Promise.all([
      getAgePolicy(prisma),
      resolveUserContext(request.authUser?.userId),
      prisma.book.findMany({
        where: {
          status: 'PUBLISHED',
          activeVersionId: { not: null },
        },
        include: {
          activeVersion: true,
          taxonomies: { include: { taxonomy: true } },
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
    ]);

    const preferredIds = profile?.preferredTaxonomies.map((p) => p.taxonomyId) ?? [];
    const normQuery = q.q ? normalizeArabic(q.q) : '';

    const filtered = [];
    for (const book of books) {
      const taxList = book.taxonomies.map((bt) => bt.taxonomy).filter((t) => t.isActive);

      // قيد الأمان العمري الإلزامي: عدم إظهار كتب تتجاوز الفئة العمرية للمستخدم
      if (!isBookAllowedForAgeGroup(taxList, profile?.ageGroup, policy)) {
        continue;
      }

      if (q.taxonomy && !taxList.some((t) => t.slug === q.taxonomy || t.id === q.taxonomy)) {
        continue;
      }

      if (normQuery) {
        const haystack = normalizeArabic(
          `${book.title} ${book.subtitle ?? ''} ${book.description ?? ''}`
        );
        if (!haystack.includes(normQuery)) {
          continue;
        }
      }

      const personal = computePersonalizationScore({
        bookTaxonomyIds: taxList.map((t) => t.id),
        educationLevelId: profile?.educationLevelId,
        preferredTaxonomyIds: preferredIds,
      });

      if (q.recommendedOnly === 'true' && !personal.isRecommended) {
        continue;
      }

      filtered.push({
        id: book.id,
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle,
        description: book.description,
        badge: book.badge,
        badgeColor: book.badgeColor,
        theme: book.theme,
        direction: book.direction,
        coverUrl: book.coverUrl,
        minAge: resolveBookMinAge(taxList, policy),
        isRecommended: personal.isRecommended,
        matchScore: personal.matchScore,
        taxonomies: taxList,
        activeVersion: book.activeVersion
          ? {
              id: book.activeVersion.id,
              versionNumber: book.activeVersion.versionNumber,
              versionLabel: book.activeVersion.versionLabel,
              audioDir: book.activeVersion.audioDir,
              videoDir: book.activeVersion.videoDir,
              chaptersCount: book.activeVersion.chaptersCount,
              spreadsCount: book.activeVersion.spreadsCount,
              audioTracksCount: book.activeVersion.audioTracksCount,
              videosCount: book.activeVersion.videosCount,
              publishedAt: book.activeVersion.publishedAt,
            }
          : null,
      });
    }

    // إبراز الكتب المطابقة للمستوى والتفضيلات أولاً دون إخفاء الباقي
    filtered.sort((a, b) => b.matchScore - a.matchScore);

    return reply.send({ books: filtered, total: filtered.length });
  });

  app.get('/api/v1/books/:slug', { preHandler: [optionalAuthenticate] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const [policy, profile, book] = await Promise.all([
      getAgePolicy(prisma),
      resolveUserContext(request.authUser?.userId),
      prisma.book.findUnique({
        where: { slug },
        include: {
          activeVersion: true,
          taxonomies: { include: { taxonomy: true } },
          versions: {
            orderBy: { versionNumber: 'desc' },
            select: {
              id: true,
              versionNumber: true,
              versionLabel: true,
              status: true,
              spreadsCount: true,
              chaptersCount: true,
              publishedAt: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const canManage = request.authUser?.permissions.has('books.publish') ?? false;
    if (!book || (book.status !== 'PUBLISHED' && !canManage)) {
      return reply.code(404).send({ error: 'BOOK_NOT_FOUND' });
    }

    const taxList = book.taxonomies.map((bt) => bt.taxonomy);
    if (!canManage && !isBookAllowedForAgeGroup(taxList, profile?.ageGroup, policy)) {
      return reply.code(403).send({
        error: 'AGE_RESTRICTED',
        message: 'هذا المحتوى مخصص لفئة عمرية أعلى من الفئة المحددة في ملفك',
      });
    }

    return reply.send({
      book: {
        id: book.id,
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle,
        description: book.description,
        badge: book.badge,
        badgeColor: book.badgeColor,
        theme: book.theme,
        direction: book.direction,
        coverUrl: book.coverUrl,
        status: book.status,
        taxonomies: taxList,
        activeVersion: book.activeVersion,
        versions: canManage
          ? book.versions
          : book.versions.filter((v) => v.id === book.activeVersionId),
      },
    });
  });

  app.get(
    '/api/v1/books/:slug/editions-data',
    { preHandler: [optionalAuthenticate] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const [policy, profile, book] = await Promise.all([
        getAgePolicy(prisma),
        resolveUserContext(request.authUser?.userId),
        prisma.book.findUnique({
          where: { slug },
          include: {
            activeVersion: true,
            taxonomies: { include: { taxonomy: true } },
          },
        }),
      ]);

      if (!book || book.status !== 'PUBLISHED' || !book.activeVersion?.canonicalDataJson) {
        return reply.code(404).send({ error: 'EDITION_DATA_NOT_FOUND' });
      }

      const taxList = book.taxonomies.map((bt) => bt.taxonomy);
      if (!isBookAllowedForAgeGroup(taxList, profile?.ageGroup, policy)) {
        return reply.code(403).send({
          error: 'AGE_RESTRICTED',
          message: 'هذا الكتاب يتجاوز الفئة العمرية المسموح بها لحسابك',
        });
      }

      return reply.send(book.activeVersion.canonicalDataJson);
    }
  );

  app.post(
    '/api/v1/books',
    { preHandler: [authenticate, requirePermission('books.create')] },
    async (request, reply) => {
      const parsed = CreateBookSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      if (parsed.data.publishNow && !request.authUser!.permissions.has('books.publish')) {
        return reply.code(403).send({
          error: 'FORBIDDEN',
          message: 'يتطلب النشر المباشر صلاحية books.publish',
        });
      }

      const dup = await prisma.book.findUnique({ where: { slug: parsed.data.slug } });
      if (dup) {
        return reply.code(409).send({ error: 'BOOK_SLUG_EXISTS' });
      }

      const created = await prisma.$transaction(async (tx) => {
        const book = await tx.book.create({
          data: {
            slug: parsed.data.slug,
            title: parsed.data.title,
            subtitle: parsed.data.subtitle ?? null,
            description: parsed.data.description ?? null,
            badge: parsed.data.badge ?? null,
            badgeColor: parsed.data.badgeColor ?? null,
            theme: parsed.data.theme,
            direction: parsed.data.direction,
            status: parsed.data.publishNow ? 'PUBLISHED' : 'DRAFT',
            authorId: request.authUser!.userId,
          },
        });

        const version = await tx.bookVersion.create({
          data: {
            bookId: book.id,
            versionNumber: 1,
            versionLabel: 'v1',
            sourceFormat: 'json',
            canonicalDataJson: parsed.data.canonicalDataJson as Prisma.InputJsonValue,
            audioDir: parsed.data.audioDir ?? null,
            videoDir: parsed.data.videoDir ?? null,
            chaptersCount: parsed.data.chaptersCount,
            spreadsCount: parsed.data.spreadsCount,
            status: parsed.data.publishNow ? 'PUBLISHED' : 'DRAFT',
            publishedAt: parsed.data.publishNow ? new Date() : null,
          },
        });

        if (parsed.data.publishNow) {
          await tx.book.update({
            where: { id: book.id },
            data: { activeVersionId: version.id },
          });
        }

        if (parsed.data.taxonomyIds.length > 0) {
          await tx.bookTaxonomy.createMany({
            data: Array.from(new Set(parsed.data.taxonomyIds)).map((taxonomyId) => ({
              bookId: book.id,
              taxonomyId,
            })),
          });
        }

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'book.create',
          targetType: 'book',
          targetId: book.id,
          metadata: {
            slug: book.slug,
            versionId: version.id,
            publishNow: parsed.data.publishNow,
          },
          request,
        });

        return { book, version };
      });

      return reply.code(201).send(created);
    }
  );

  app.put(
    '/api/v1/books/:slug/progress',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const parsed = ProgressBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const book = await prisma.book.findUnique({ where: { slug }, select: { id: true } });
      if (!book) {
        return reply.code(404).send({ error: 'BOOK_NOT_FOUND' });
      }

      const progress = await prisma.readingProgress.upsert({
        where: { userId_bookId: { userId: request.authUser!.userId, bookId: book.id } },
        create: {
          userId: request.authUser!.userId,
          bookId: book.id,
          currentSpread: parsed.data.currentSpread,
          percent: parsed.data.percent,
          bookmarksJson: parsed.data.bookmarksJson as Prisma.InputJsonValue,
        },
        update: {
          currentSpread: parsed.data.currentSpread,
          percent: parsed.data.percent,
          bookmarksJson: parsed.data.bookmarksJson as Prisma.InputJsonValue,
        },
      });

      return reply.send({ progress });
    }
  );
}
