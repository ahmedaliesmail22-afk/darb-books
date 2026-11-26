import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AppEnv } from '../env';
import { verifyAccessToken } from '../services/security';

export interface AuthUserContext {
  userId: string;
  email: string;
  fullName: string;
  roleCodes: string[];
  permissions: Set<string>;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUserContext | null;
  }
}

export const ACCESS_COOKIE_NAME = 'darb_access_token';
export const REFRESH_COOKIE_NAME = 'darb_refresh_token';

export async function resolveAuthUser(
  prisma: PrismaClient,
  userId: string
): Promise<AuthUserContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
      userRoles: {
        where: { role: { isActive: true } },
        select: {
          role: {
            select: {
              code: true,
              rolePermissions: {
                select: {
                  permission: { select: { code: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user || user.status !== 'ACTIVE') return null;

  const roleCodes: string[] = [];
  const permissions = new Set<string>();

  for (const ur of user.userRoles) {
    roleCodes.push(ur.role.code);
    for (const rp of ur.role.rolePermissions) {
      permissions.add(rp.permission.code);
    }
  }

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    roleCodes,
    permissions,
  };
}

function extractAccessToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) return token;
  }
  const cookieToken = request.cookies?.[ACCESS_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

export function createAuthHooks(prisma: PrismaClient, env: AppEnv) {
  const optionalAuthenticate = async (request: FastifyRequest): Promise<void> => {
    request.authUser = null;
    const token = extractAccessToken(request);
    if (!token) return;

    const claims = await verifyAccessToken(token, env);
    if (!claims) return;

    const ctx = await resolveAuthUser(prisma, claims.sub);
    request.authUser = ctx;
  };

  const authenticate = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    await optionalAuthenticate(request);
    if (!request.authUser) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'يلزم تسجيل الدخول للوصول إلى هذا المورد',
      });
    }
  };

  return { optionalAuthenticate, authenticate };
}
