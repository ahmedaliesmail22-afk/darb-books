import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import type { PrismaClient } from '@prisma/client';
import { loadEnv, type AppEnv } from './env';
import { createPrismaClient } from './prismaClient';
import { createStorageService, type StorageService } from './services/storage';
import { createAuthHooks } from './plugins/auth';
import { registerHealthRoutes } from './routes/health';
import { registerAuthRoutes } from './routes/auth';
import { registerTaxonomyRoutes } from './routes/taxonomies';
import { registerRbacRoutes } from './routes/rbac';
import { registerSystemConfigRoutes } from './routes/systemConfigs';
import { registerCmsRoutes } from './routes/cms';
import { registerBookRoutes } from './routes/books';
import { registerMediaRoutes } from './routes/media';
import { registerAuditRoutes } from './routes/audit';

export interface BuildServerOptions {
  env?: AppEnv;
  prisma?: PrismaClient;
  storage?: StorageService;
  logger?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<{
  app: FastifyInstance;
  prisma: PrismaClient;
  storage: StorageService;
  env: AppEnv;
}> {
  const env = options.env ?? loadEnv();
  const prisma =
    options.prisma ?? createPrismaClient({ databaseUrl: env.DATABASE_URL });
  const storage = options.storage ?? createStorageService(env);
  const ownsPrisma = !options.prisma;

  const app = Fastify({
    logger: options.logger ?? false,
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  });

  app.decorateRequest('authUser', null);

  const { optionalAuthenticate, authenticate } = createAuthHooks(prisma, env);

  registerHealthRoutes(app, { prisma, storage });
  registerAuthRoutes(app, { prisma, env, authenticate });
  registerTaxonomyRoutes(app, { prisma, authenticate, optionalAuthenticate });
  registerRbacRoutes(app, { prisma, authenticate });
  registerSystemConfigRoutes(app, { prisma, authenticate });
  registerCmsRoutes(app, { prisma, authenticate, optionalAuthenticate });
  registerBookRoutes(app, { prisma, authenticate, optionalAuthenticate });
  registerMediaRoutes(app, { prisma, storage, authenticate });
  registerAuditRoutes(app, { prisma, authenticate });

  app.addHook('onClose', async () => {
    if (ownsPrisma) {
      await prisma.$disconnect();
    }
  });

  return { app, prisma, storage, env };
}
