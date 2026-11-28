import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { requirePermission } from '../plugins/rbac';

export function registerAuditRoutes(
  app: FastifyInstance,
  deps: {
    prisma: PrismaClient;
    authenticate: ReturnType<typeof import('../plugins/auth').createAuthHooks>['authenticate'];
  }
): void {
  const { prisma, authenticate } = deps;

  app.get(
    '/api/v1/audit-logs',
    { preHandler: [authenticate, requirePermission('audit.read')] },
    async (request, reply) => {
      const q = request.query as {
        action?: string;
        targetType?: string;
        targetId?: string;
        actorId?: string;
        limit?: string;
      };
      const limit = Math.min(500, Math.max(1, parseInt(q.limit || '50', 10) || 50));

      const logs = await prisma.auditLog.findMany({
        where: {
          ...(q.action ? { action: q.action } : {}),
          ...(q.targetType ? { targetType: q.targetType } : {}),
          ...(q.targetId ? { targetId: q.targetId } : {}),
          ...(q.actorId ? { actorId: q.actorId } : {}),
        },
        include: {
          actor: { select: { id: true, email: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return reply.send({ logs, total: logs.length });
    }
  );
}
