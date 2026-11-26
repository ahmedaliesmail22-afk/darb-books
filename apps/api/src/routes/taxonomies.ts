import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { recordAuditLog } from '../plugins/audit';
import { requirePermission } from '../plugins/rbac';

const CreateTaxonomySchema = z.object({
  group: z.string().trim().min(2).max(64),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  labelAr: z.string().trim().min(1).max(160),
  labelEn: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  rulesJson: z.record(z.string(), z.unknown()).default({}),
});

const UpdateTaxonomySchema = CreateTaxonomySchema.partial();

const ReorderTaxonomiesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int(),
      })
    )
    .min(1),
});

export function registerTaxonomyRoutes(
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

  app.get('/api/v1/taxonomies', { preHandler: [optionalAuthenticate] }, async (request, reply) => {
    const q = request.query as { group?: string; includeInactive?: string };
    const canManage = request.authUser?.permissions.has('taxonomies.manage') ?? false;
    const includeInactive = canManage && q.includeInactive === 'true';

    const items = await prisma.taxonomy.findMany({
      where: {
        ...(q.group ? { group: q.group } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const grouped: Record<string, typeof items> = {};
    for (const item of items) {
      if (!grouped[item.group]) grouped[item.group] = [];
      grouped[item.group].push(item);
    }

    return reply.send({ items, grouped });
  });

  app.post(
    '/api/v1/taxonomies',
    { preHandler: [authenticate, requirePermission('taxonomies.manage')] },
    async (request, reply) => {
      const parsed = CreateTaxonomySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const duplicate = await prisma.taxonomy.findUnique({
        where: { group_slug: { group: parsed.data.group, slug: parsed.data.slug } },
      });
      if (duplicate) {
        return reply.code(409).send({
          error: 'TAXONOMY_EXISTS',
          message: 'يوجد تصنيف بنفس المجموعة والمعرّف بالفعل',
        });
      }

      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.taxonomy.create({
          data: {
            group: parsed.data.group,
            slug: parsed.data.slug,
            labelAr: parsed.data.labelAr,
            labelEn: parsed.data.labelEn ?? null,
            description: parsed.data.description ?? null,
            parentId: parsed.data.parentId ?? null,
            sortOrder: parsed.data.sortOrder,
            isActive: parsed.data.isActive,
            rulesJson: parsed.data.rulesJson as Prisma.InputJsonValue,
          },
        });

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'taxonomy.create',
          targetType: 'taxonomy',
          targetId: row.id,
          metadata: { after: row },
          request,
        });

        return row;
      });

      return reply.code(201).send({ item: created });
    }
  );

  app.patch(
    '/api/v1/taxonomies/:id',
    { preHandler: [authenticate, requirePermission('taxonomies.manage')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateTaxonomySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const existing = await prisma.taxonomy.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: 'TAXONOMY_NOT_FOUND' });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.taxonomy.update({
          where: { id },
          data: {
            ...(parsed.data.group !== undefined ? { group: parsed.data.group } : {}),
            ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
            ...(parsed.data.labelAr !== undefined ? { labelAr: parsed.data.labelAr } : {}),
            ...(parsed.data.labelEn !== undefined ? { labelEn: parsed.data.labelEn } : {}),
            ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
            ...(parsed.data.parentId !== undefined ? { parentId: parsed.data.parentId } : {}),
            ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
            ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
            ...(parsed.data.rulesJson !== undefined
              ? { rulesJson: parsed.data.rulesJson as Prisma.InputJsonValue }
              : {}),
          },
        });

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'taxonomy.update',
          targetType: 'taxonomy',
          targetId: row.id,
          metadata: { before: existing, after: row },
          request,
        });

        return row;
      });

      return reply.send({ item: updated });
    }
  );

  app.post(
    '/api/v1/taxonomies/reorder',
    { preHandler: [authenticate, requirePermission('taxonomies.manage')] },
    async (request, reply) => {
      const parsed = ReorderTaxonomiesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      await prisma.$transaction(async (tx) => {
        for (const item of parsed.data.items) {
          await tx.taxonomy.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          });
        }
        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'taxonomy.reorder',
          targetType: 'taxonomy',
          targetId: 'batch',
          metadata: { items: parsed.data.items },
          request,
        });
      });

      return reply.send({ ok: true, count: parsed.data.items.length });
    }
  );

  app.delete(
    '/api/v1/taxonomies/:id',
    { preHandler: [authenticate, requirePermission('taxonomies.manage')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.taxonomy.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: 'TAXONOMY_NOT_FOUND' });
      }

      const deactivated = await prisma.$transaction(async (tx) => {
        const row = await tx.taxonomy.update({
          where: { id },
          data: { isActive: false },
        });
        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'taxonomy.deactivate',
          targetType: 'taxonomy',
          targetId: id,
          metadata: { before: existing, after: row },
          request,
        });
        return row;
      });

      return reply.send({ item: deactivated });
    }
  );
}
