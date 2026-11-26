import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { recordAuditLog } from '../plugins/audit';
import { requirePermission } from '../plugins/rbac';
import {
  inferMimeType,
  sanitizeStorageKey,
  type StorageService,
} from '../services/storage';

const PresignBodySchema = z.object({
  key: z.string().min(1).max(300),
  contentType: z.string().min(3).max(120).optional(),
  expiresInSeconds: z.number().int().min(60).max(3600).default(900),
});

export function registerMediaRoutes(
  app: FastifyInstance,
  deps: {
    prisma: PrismaClient;
    storage: StorageService;
    authenticate: ReturnType<typeof import('../plugins/auth').createAuthHooks>['authenticate'];
  }
): void {
  const { prisma, storage, authenticate } = deps;

  app.get('/api/v1/media/stream/*', async (request, reply) => {
    const params = request.params as { '*': string };
    let key: string;
    try {
      key = sanitizeStorageKey(params['*'] ?? '');
    } catch {
      return reply.code(400).send({ error: 'INVALID_STORAGE_KEY' });
    }

    const rangeHeader =
      typeof request.headers.range === 'string' ? request.headers.range : undefined;
    const result = await storage.getObjectStream(key, rangeHeader);

    if (!result) {
      return reply.code(404).send({ error: 'MEDIA_NOT_FOUND', key });
    }

    if (result.status === 416) {
      return reply
        .code(416)
        .header('Content-Range', result.contentRange ?? `bytes */${result.totalLength}`)
        .header('Accept-Ranges', 'bytes')
        .send();
    }

    reply.code(result.status);
    reply.header('Content-Type', result.contentType);
    reply.header('Content-Length', String(result.contentLength));
    reply.header('Accept-Ranges', 'bytes');
    if (result.contentRange) {
      reply.header('Content-Range', result.contentRange);
    }
    return reply.send(result.stream);
  });

  app.post(
    '/api/v1/media/presign',
    { preHandler: [authenticate, requirePermission('media.upload')] },
    async (request, reply) => {
      const parsed = PresignBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      let safeKey: string;
      try {
        safeKey = sanitizeStorageKey(parsed.data.key);
      } catch {
        return reply.code(400).send({ error: 'INVALID_STORAGE_KEY' });
      }

      const contentType = parsed.data.contentType || inferMimeType(safeKey);
      const signed = await storage.createUploadPresignedUrl({
        key: safeKey,
        contentType,
        expiresInSeconds: parsed.data.expiresInSeconds,
      });

      await recordAuditLog(prisma, {
        actorId: request.authUser!.userId,
        action: 'media.presign',
        targetType: 'media_asset',
        targetId: safeKey,
        metadata: { driver: signed.driver, contentType },
        request,
      });

      return reply.send(signed);
    }
  );
}
