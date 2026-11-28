import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { parseJson, stringifyJson } from '../lib/jsonCodec';
import { recordAuditLog } from '../plugins/audit';
import { requirePermission } from '../plugins/rbac';
import { getModerationChecklistConfig } from '../services/configService';

const ModerationDecisionSchema = z.object({
  decision: z.enum(['APPROVE_AND_PUBLISH', 'REQUEST_CHANGES', 'REJECT']),
  checklist: z.record(z.string(), z.boolean()).default({}),
  contentVerified: z.boolean().default(false),
  ipVerified: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
});

export function registerModerationRoutes(
  app: FastifyInstance,
  deps: {
    prisma: PrismaClient;
    authenticate: ReturnType<typeof import('../plugins/auth').createAuthHooks>['authenticate'];
  }
): void {
  const { prisma, authenticate } = deps;

  app.get(
    '/api/v1/moderation/checklist',
    { preHandler: [authenticate, requirePermission('books.review')] },
    async (_request, reply) => {
      const checklistConfig = await getModerationChecklistConfig(prisma);
      return reply.send(checklistConfig);
    }
  );

  app.get(
    '/api/v1/moderation/queue',
    { preHandler: [authenticate, requirePermission('books.review')] },
    async (request, reply) => {
      const q = request.query as { status?: string };
      const statusFilter =
        q.status && q.status !== 'ACTIVE' && q.status !== 'ALL'
          ? [q.status as 'SUBMITTED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'PUBLISHED' | 'REJECTED']
          : q.status === 'ALL'
            ? undefined
            : (['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'] as const);

      const versions = await prisma.bookVersion.findMany({
        where: statusFilter ? { status: { in: [...statusFilter] } } : undefined,
        include: {
          book: {
            include: {
              author: { select: { id: true, fullName: true, email: true } },
              taxonomies: { include: { taxonomy: true } },
              activeVersion: {
                select: {
                  id: true,
                  versionNumber: true,
                  versionLabel: true,
                },
              },
            },
          },
          reviewTickets: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              reviewer: { select: { id: true, fullName: true, email: true } },
            },
          },
        },
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      });

      return reply.send({
        items: versions.map((v) => ({
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
          book: {
            id: v.book.id,
            slug: v.book.slug,
            title: v.book.title,
            subtitle: v.book.subtitle,
            description: v.book.description,
            status: v.book.status,
            activeVersionId: v.book.activeVersionId,
            activeVersion: v.book.activeVersion,
            author: v.book.author,
            taxonomies: v.book.taxonomies.map((t) => ({
              ...t.taxonomy,
              rulesJson: parseJson(t.taxonomy.rulesJson, {}),
            })),
          },
          latestTicket: v.reviewTickets[0]
            ? {
                ...v.reviewTickets[0],
                checklistJson: parseJson(v.reviewTickets[0].checklistJson, {}),
              }
            : null,
        })),
      });
    }
  );

  app.post(
    '/api/v1/moderation/versions/:versionId/claim',
    { preHandler: [authenticate, requirePermission('books.review')] },
    async (request, reply) => {
      const { versionId } = request.params as { versionId: string };
      const version = await prisma.bookVersion.findUnique({
        where: { id: versionId },
        include: {
          book: true,
          reviewTickets: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      if (!version) {
        return reply.code(404).send({ error: 'VERSION_NOT_FOUND' });
      }

      if (!['SUBMITTED', 'UNDER_REVIEW'].includes(version.status)) {
        return reply.code(409).send({
          error: 'INVALID_VERSION_STATE',
          message: `لا يمكن استلام إصدار حالته ${version.status}`,
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const updatedVersion = await tx.bookVersion.update({
          where: { id: version.id },
          data: { status: 'UNDER_REVIEW' },
        });

        if (version.book.status !== 'PUBLISHED') {
          await tx.book.update({
            where: { id: version.book.id },
            data: { status: 'UNDER_REVIEW' },
          });
        }

        const existingTicket = version.reviewTickets[0];
        const ticket = existingTicket && !existingTicket.decision
          ? await tx.reviewTicket.update({
              where: { id: existingTicket.id },
              data: { reviewerId: request.authUser!.userId },
            })
          : await tx.reviewTicket.create({
              data: {
                bookVersionId: version.id,
                reviewerId: request.authUser!.userId,
                checklistJson: '{}',
                contentVerified: false,
                ipVerified: false,
              },
            });

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'moderation.claim',
          targetType: 'book_version',
          targetId: version.id,
          metadata: {
            bookId: version.book.id,
            slug: version.book.slug,
            versionNumber: version.versionNumber,
            ticketId: ticket.id,
          },
          request,
        });

        return {
          version: updatedVersion,
          ticket: {
            ...ticket,
            checklistJson: parseJson(ticket.checklistJson, {}),
          },
        };
      });

      return reply.send(result);
    }
  );

  app.post(
    '/api/v1/moderation/versions/:versionId/decision',
    { preHandler: [authenticate, requirePermission('books.review')] },
    async (request, reply) => {
      const { versionId } = request.params as { versionId: string };
      const parsedBody = ModerationDecisionSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsedBody.error.issues });
      }

      const { decision, checklist, contentVerified, ipVerified, notes } = parsedBody.data;
      const version = await prisma.bookVersion.findUnique({
        where: { id: versionId },
        include: {
          book: true,
          reviewTickets: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      if (!version) {
        return reply.code(404).send({ error: 'VERSION_NOT_FOUND' });
      }

      if (!['SUBMITTED', 'UNDER_REVIEW'].includes(version.status)) {
        return reply.code(409).send({
          error: 'INVALID_VERSION_STATE',
          message: `لا يمكن اتخاذ قرار على إصدار حالته ${version.status}`,
        });
      }

      if (decision === 'APPROVE_AND_PUBLISH') {
        if (!request.authUser!.permissions.has('books.publish')) {
          return reply.code(403).send({
            error: 'FORBIDDEN',
            message: 'الاعتماد النهائي والنشر يتطلب صلاحية books.publish',
            requiredPermission: 'books.publish',
          });
        }

        if (!version.ipDeclarationSigned) {
          return reply.code(400).send({
            error: 'IP_DECLARATION_MISSING',
            message: 'لا يمكن اعتماد إصدار بدون توقيع إقرار الملكية الفكرية من المؤلف',
          });
        }

        const checklistCfg = await getModerationChecklistConfig(prisma);
        const missingRequired = checklistCfg.items.filter(
          (item) => item.required && checklist[item.id] !== true
        );
        if (missingRequired.length > 0 || !contentVerified || !ipVerified) {
          return reply.code(400).send({
            error: 'CHECKLIST_INCOMPLETE',
            message:
              'يجب استيفاء جميع بنود قائمة التحقق الإلزامية وتأكيد سلامة المحتوى والملكية الفكرية قبل الاعتماد',
            missingItems: missingRequired.map((i) => i.id),
          });
        }

        const result = await prisma.$transaction(async (tx) => {
          const previousActiveId = version.book.activeVersionId;
          if (previousActiveId && previousActiveId !== version.id) {
            await tx.bookVersion.update({
              where: { id: previousActiveId },
              data: { status: 'ARCHIVED' },
            });
          }

          const updatedVersion = await tx.bookVersion.update({
            where: { id: version.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
            },
          });

          const canonical = parseJson<Record<string, unknown>>(version.canonicalDataJson, {});
          const updatedBook = await tx.book.update({
            where: { id: version.book.id },
            data: {
              status: 'PUBLISHED',
              activeVersionId: version.id,
              title: typeof canonical.title === 'string' && canonical.title ? canonical.title : version.book.title,
              subtitle:
                typeof canonical.subtitle === 'string'
                  ? canonical.subtitle
                  : version.book.subtitle,
              badge:
                version.book.badge === 'مسودة مؤلف' ? 'إصدار تفاعلي' : version.book.badge,
            },
          });

          const existingTicket = version.reviewTickets[0];
          const ticket = existingTicket && !existingTicket.decision
            ? await tx.reviewTicket.update({
                where: { id: existingTicket.id },
                data: {
                  reviewerId: request.authUser!.userId,
                  checklistJson: stringifyJson(checklist, '{}'),
                  contentVerified: true,
                  ipVerified: true,
                  decision,
                  notes: notes ?? null,
                },
              })
            : await tx.reviewTicket.create({
                data: {
                  bookVersionId: version.id,
                  reviewerId: request.authUser!.userId,
                  checklistJson: stringifyJson(checklist, '{}'),
                  contentVerified: true,
                  ipVerified: true,
                  decision,
                  notes: notes ?? null,
                },
              });

          await recordAuditLog(tx, {
            actorId: request.authUser!.userId,
            action: 'moderation.approve_and_publish',
            targetType: 'book_version',
            targetId: version.id,
            metadata: {
              bookId: version.book.id,
              slug: version.book.slug,
              versionNumber: version.versionNumber,
              previousActiveVersionId: previousActiveId,
              ticketId: ticket.id,
            },
            request,
          });

          return {
            book: updatedBook,
            version: updatedVersion,
            ticket: {
              ...ticket,
              checklistJson: parseJson(ticket.checklistJson, {}),
            },
          };
        });

        return reply.send(result);
      }

      if (!notes || notes.trim().length < 3) {
        return reply.code(400).send({
          error: 'REVIEW_NOTES_REQUIRED',
          message: 'يرجى كتابة ملاحظات واضحة للمؤلف عند طلب التعديلات أو الرفض',
        });
      }

      const nextStatus = decision === 'REQUEST_CHANGES' ? 'CHANGES_REQUESTED' : 'REJECTED';
      const auditAction =
        decision === 'REQUEST_CHANGES' ? 'moderation.request_changes' : 'moderation.reject';

      const result = await prisma.$transaction(async (tx) => {
        const updatedVersion = await tx.bookVersion.update({
          where: { id: version.id },
          data: { status: nextStatus },
        });

        const updatedBook =
          version.book.status !== 'PUBLISHED' && !version.book.activeVersionId
            ? await tx.book.update({
                where: { id: version.book.id },
                data: { status: nextStatus },
              })
            : version.book;

        const existingTicket = version.reviewTickets[0];
        const ticket = existingTicket && !existingTicket.decision
          ? await tx.reviewTicket.update({
              where: { id: existingTicket.id },
              data: {
                reviewerId: request.authUser!.userId,
                checklistJson: stringifyJson(checklist, '{}'),
                contentVerified,
                ipVerified,
                decision,
                notes: notes.trim(),
              },
            })
          : await tx.reviewTicket.create({
              data: {
                bookVersionId: version.id,
                reviewerId: request.authUser!.userId,
                checklistJson: stringifyJson(checklist, '{}'),
                contentVerified,
                ipVerified,
                decision,
                notes: notes.trim(),
              },
            });

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: auditAction,
          targetType: 'book_version',
          targetId: version.id,
          metadata: {
            bookId: version.book.id,
            slug: version.book.slug,
            versionNumber: version.versionNumber,
            decision,
            ticketId: ticket.id,
          },
          request,
        });

        return {
          book: updatedBook,
          version: updatedVersion,
          ticket: {
            ...ticket,
            checklistJson: parseJson(ticket.checklistJson, {}),
          },
        };
      });

      return reply.send(result);
    }
  );
}
