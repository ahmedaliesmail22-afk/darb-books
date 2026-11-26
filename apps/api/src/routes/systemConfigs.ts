import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { recordAuditLog } from '../plugins/audit';
import { requirePermission } from '../plugins/rbac';
import { getPublicConfigsMap } from '../services/configService';

const UpsertSystemConfigSchema = z.object({
  category: z.string().trim().min(1).max(64),
  valueJson: z.unknown(),
  description: z.string().trim().max(400).nullable().optional(),
  isPublic: z.boolean().default(false),
});

export function registerSystemConfigRoutes(
  app: FastifyInstance,
  deps: {
    prisma: PrismaClient;
    authenticate: ReturnType<typeof import('../plugins/auth').createAuthHooks>['authenticate'];
  }
): void {
  const { prisma, authenticate } = deps;

  app.get('/api/v1/public/bootstrap', async (_request, reply) => {
    const [configs, taxonomies, homePage, latestNews] = await Promise.all([
      getPublicConfigsMap(prisma),
      prisma.taxonomy.findMany({
        where: { isActive: true },
        orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
      }),
      prisma.cmsPage.findUnique({
        where: { slug: 'home' },
        include: {
          sections: {
            where: { isVisible: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      prisma.newsPost.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        take: 5,
      }),
    ]);

    const groupedTaxonomies: Record<string, typeof taxonomies> = {};
    for (const t of taxonomies) {
      if (!groupedTaxonomies[t.group]) groupedTaxonomies[t.group] = [];
      groupedTaxonomies[t.group].push(t);
    }

    return reply.send({
      configs,
      taxonomies: groupedTaxonomies,
      homePage: homePage
        ? {
            slug: homePage.slug,
            titleAr: homePage.titleAr,
            titleEn: homePage.titleEn,
            seoJson: homePage.seoJson,
            sections: homePage.sections,
          }
        : null,
      latestNews,
    });
  });

  app.get(
    '/api/v1/configs',
    { preHandler: [authenticate, requirePermission('configs.manage')] },
    async (request, reply) => {
      const q = request.query as { category?: string };
      const items = await prisma.systemConfig.findMany({
        where: q.category ? { category: q.category } : undefined,
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
      });
      return reply.send({ items });
    }
  );

  app.put(
    '/api/v1/configs/:key',
    { preHandler: [authenticate, requirePermission('configs.manage')] },
    async (request, reply) => {
      const { key } = request.params as { key: string };
      const parsed = UpsertSystemConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const existing = await prisma.systemConfig.findUnique({ where: { key } });

      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.systemConfig.upsert({
          where: { key },
          create: {
            key,
            category: parsed.data.category,
            valueJson: parsed.data.valueJson as Prisma.InputJsonValue,
            description: parsed.data.description ?? null,
            isPublic: parsed.data.isPublic,
            updatedById: request.authUser!.userId,
          },
          update: {
            category: parsed.data.category,
            valueJson: parsed.data.valueJson as Prisma.InputJsonValue,
            ...(parsed.data.description !== undefined
              ? { description: parsed.data.description }
              : {}),
            isPublic: parsed.data.isPublic,
            updatedById: request.authUser!.userId,
          },
        });

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: existing ? 'system_config.update' : 'system_config.create',
          targetType: 'system_config',
          targetId: row.key,
          metadata: {
            before: existing?.valueJson ?? null,
            after: row.valueJson,
            isPublic: row.isPublic,
          },
          request,
        });

        return row;
      });

      return reply.send({ item: updated });
    }
  );
}
