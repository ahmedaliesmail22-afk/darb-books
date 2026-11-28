import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { stringifyJson } from '../lib/jsonCodec';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function recordAuditLog(
  db: PrismaLike,
  input: {
    actorId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
    request?: FastifyRequest;
  }
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadataJson: stringifyJson(input.metadata ?? {}, '{}'),
      ipAddress: input.request?.ip ?? null,
      userAgent:
        typeof input.request?.headers['user-agent'] === 'string'
          ? input.request.headers['user-agent']
          : null,
    },
  });
}
