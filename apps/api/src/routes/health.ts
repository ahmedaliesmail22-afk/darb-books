import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { StorageService } from '../services/storage';

export function registerHealthRoutes(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; storage: StorageService }
): void {
  app.get('/api/v1/health', async (_request, reply) => {
    try {
      await deps.prisma.$queryRawUnsafe('SELECT 1');
      return reply.send({
        ok: true,
        service: '@darb/api',
        database: 'connected',
        storageDriver: deps.storage.driver,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return reply.code(503).send({
        ok: false,
        service: '@darb/api',
        database: 'unavailable',
        error: err instanceof Error ? err.message : 'Database check failed',
      });
    }
  });
}
