import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { recordAuditLog } from '../plugins/audit';
import { requirePermission } from '../plugins/rbac';

const UpsertSectionSchema = z.object({
  titleAr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().max(200).nullable().optional(),
  contentJson: z.record(z.string(), z.unknown()).default({}),
  sortOrder: z.number().int().default(0),
  isVisible: z.boolean().default(true),
});

const CreateNewsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(2).max(200),
  summary: z.string().trim().max(500).nullable().optional(),
  bodyMd: z.string().min(1),
  coverUrl: z.string().trim().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
});

const UpdateNewsSchema = CreateNewsSchema.partial();

export function registerCmsRoutes(
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

  app.get(
    '/api/v1/cms/pages',
    { preHandler: [authenticate, requirePermission('cms.manage')] },
    async (_request, reply) => {
      const pages = await prisma.cmsPage.findMany({
        include: {
          sections: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { slug: 'asc' },
      });
      return reply.send({ pages });
    }
  );

  app.get('/api/v1/cms/pages/:slug', { preHandler: [optionalAuthenticate] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const canManage = request.authUser?.permissions.has('cms.manage') ?? false;

    const page = await prisma.cmsPage.findUnique({
      where: { slug },
      include: {
        sections: {
          where: canManage ? undefined : { isVisible: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!page || (!page.isPublished && !canManage)) {
      return reply.code(404).send({ error: 'CMS_PAGE_NOT_FOUND' });
    }

    return reply.send({ page });
  });

  app.put(
    '/api/v1/cms/pages/:slug/sections/:sectionKey',
    { preHandler: [authenticate, requirePermission('cms.manage')] },
    async (request, reply) => {
      const { slug, sectionKey } = request.params as { slug: string; sectionKey: string };
      const parsed = UpsertSectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const page = await prisma.cmsPage.upsert({
        where: { slug },
        create: {
          slug,
          titleAr: slug,
          isPublished: true,
        },
        update: {},
      });

      const existing = await prisma.cmsSection.findUnique({
        where: { pageId_sectionKey: { pageId: page.id, sectionKey } },
      });

      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.cmsSection.upsert({
          where: { pageId_sectionKey: { pageId: page.id, sectionKey } },
          create: {
            pageId: page.id,
            sectionKey,
            titleAr: parsed.data.titleAr,
            titleEn: parsed.data.titleEn ?? null,
            contentJson: parsed.data.contentJson as Prisma.InputJsonValue,
            sortOrder: parsed.data.sortOrder,
            isVisible: parsed.data.isVisible,
            updatedById: request.authUser!.userId,
          },
          update: {
            titleAr: parsed.data.titleAr,
            ...(parsed.data.titleEn !== undefined ? { titleEn: parsed.data.titleEn } : {}),
            contentJson: parsed.data.contentJson as Prisma.InputJsonValue,
            sortOrder: parsed.data.sortOrder,
            isVisible: parsed.data.isVisible,
            updatedById: request.authUser!.userId,
          },
        });

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: existing ? 'cms.section.update' : 'cms.section.create',
          targetType: 'cms_section',
          targetId: row.id,
          metadata: {
            pageSlug: slug,
            sectionKey,
            before: existing ?? null,
            after: row,
          },
          request,
        });

        return row;
      });

      return reply.send({ section: updated });
    }
  );

  app.get('/api/v1/news', { preHandler: [optionalAuthenticate] }, async (request, reply) => {
    const canManage = request.authUser?.permissions.has('news.manage') ?? false;
    const posts = await prisma.newsPost.findMany({
      where: canManage ? undefined : { status: 'PUBLISHED' },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return reply.send({ posts });
  });

  app.post(
    '/api/v1/news',
    { preHandler: [authenticate, requirePermission('news.manage')] },
    async (request, reply) => {
      const parsed = CreateNewsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const dup = await prisma.newsPost.findUnique({ where: { slug: parsed.data.slug } });
      if (dup) {
        return reply.code(409).send({ error: 'NEWS_SLUG_EXISTS' });
      }

      const post = await prisma.$transaction(async (tx) => {
        const created = await tx.newsPost.create({
          data: {
            slug: parsed.data.slug,
            title: parsed.data.title,
            summary: parsed.data.summary ?? null,
            bodyMd: parsed.data.bodyMd,
            coverUrl: parsed.data.coverUrl ?? null,
            status: parsed.data.status,
            publishedAt: parsed.data.status === 'PUBLISHED' ? new Date() : null,
            authorId: request.authUser!.userId,
          },
        });
        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'news.create',
          targetType: 'news_post',
          targetId: created.id,
          metadata: { slug: created.slug, status: created.status },
          request,
        });
        return created;
      });

      return reply.code(201).send({ post });
    }
  );

  app.patch(
    '/api/v1/news/:id',
    { preHandler: [authenticate, requirePermission('news.manage')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateNewsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const existing = await prisma.newsPost.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: 'NEWS_NOT_FOUND' });
      }

      const post = await prisma.$transaction(async (tx) => {
        const updated = await tx.newsPost.update({
          where: { id },
          data: {
            ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
            ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
            ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
            ...(parsed.data.bodyMd !== undefined ? { bodyMd: parsed.data.bodyMd } : {}),
            ...(parsed.data.coverUrl !== undefined ? { coverUrl: parsed.data.coverUrl } : {}),
            ...(parsed.data.status !== undefined
              ? {
                  status: parsed.data.status,
                  publishedAt:
                    parsed.data.status === 'PUBLISHED' && !existing.publishedAt
                      ? new Date()
                      : existing.publishedAt,
                }
              : {}),
          },
        });
        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'news.update',
          targetType: 'news_post',
          targetId: id,
          metadata: { before: existing.status, after: updated.status },
          request,
        });
        return updated;
      });

      return reply.send({ post });
    }
  );

  app.delete(
    '/api/v1/news/:id',
    { preHandler: [authenticate, requirePermission('news.manage')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.newsPost.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: 'NEWS_NOT_FOUND' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.newsPost.delete({ where: { id } });
        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'news.delete',
          targetType: 'news_post',
          targetId: id,
          metadata: { slug: existing.slug, title: existing.title },
          request,
        });
      });

      return reply.send({ ok: true });
    }
  );
}
