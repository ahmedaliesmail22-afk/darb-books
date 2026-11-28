import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { parseJson, stringifyJson } from '../lib/jsonCodec';

type UserStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'PENDING_APPROVAL' | 'SUSPENDED';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  resolveAuthUser,
} from '../plugins/auth';
import { recordAuditLog } from '../plugins/audit';
import { requireAnyPermission, requirePermission } from '../plugins/rbac';
import { getRegistrationPolicy } from '../services/configService';
import {
  generateOpaqueToken,
  hashPassword,
  sha256Hex,
  signAccessToken,
  verifyPassword,
} from '../services/security';

const RegisterBodySchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1),
  fullName: z.string().trim().min(2).max(120),
});

const LoginBodySchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1),
});

const VerifyEmailBodySchema = z.object({
  token: z.string().min(10),
});

const RefreshBodySchema = z
  .object({
    refreshToken: z.string().min(10).optional(),
  })
  .optional();

const OnboardingBodySchema = z.object({
  ageGroupId: z.string().uuid().nullable().optional(),
  educationLevelId: z.string().uuid().nullable().optional(),
  preferredTaxonomyIds: z.array(z.string().uuid()).optional(),
  uiPrefsJson: z.record(z.string(), z.unknown()).optional(),
});

const UpdateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'SUSPENDED']),
  reason: z.string().trim().max(300).optional(),
});

function setAuthCookies(
  reply: FastifyReply,
  env: AppEnv,
  tokens: { accessToken: string; refreshToken: string }
): void {
  const baseOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.COOKIE_SECURE,
    path: '/',
  };
  reply.setCookie(ACCESS_COOKIE_NAME, tokens.accessToken, {
    ...baseOpts,
    maxAge: env.JWT_ACCESS_TTL_SEC,
  });
  reply.setCookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...baseOpts,
    maxAge: env.JWT_REFRESH_TTL_DAYS * 86400,
  });
}

function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE_NAME, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: {
    prisma: PrismaClient;
    env: AppEnv;
    authenticate: ReturnType<typeof import('../plugins/auth').createAuthHooks>['authenticate'];
  }
): void {
  const { prisma, env, authenticate } = deps;

  async function issueSessionTokens(
    user: { id: string; email: string },
    meta: { ipAddress?: string; userAgent?: string }
  ) {
    const accessToken = await signAccessToken(
      { userId: user.id, email: user.email },
      env
    );
    const refreshToken = generateOpaqueToken(40);
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86400 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(refreshToken),
        expiresAt,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    return { accessToken, refreshToken, expiresAt };
  }

  app.post('/api/v1/auth/register', async (request, reply) => {
    const parsed = RegisterBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }

    const policy = await getRegistrationPolicy(prisma);
    if (!policy.allowSelfRegistration) {
      return reply.code(403).send({
        error: 'REGISTRATION_DISABLED',
        message: 'التسجيل الذاتي معطّل حالياً وفق سياسة المنصة',
      });
    }

    if (parsed.data.password.length < policy.minPasswordLength) {
      return reply.code(400).send({
        error: 'WEAK_PASSWORD',
        message: `يجب ألا تقل كلمة المرور عن ${policy.minPasswordLength} أحرف`,
      });
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (existing) {
      return reply.code(409).send({
        error: 'EMAIL_EXISTS',
        message: 'البريد الإلكتروني مسجّل مسبقاً',
      });
    }

    const defaultRole = await prisma.role.findUnique({
      where: { code: policy.defaultRoleCode },
    });
    if (!defaultRole || !defaultRole.isActive) {
      return reply.code(500).send({
        error: 'DEFAULT_ROLE_MISSING',
        message: `الدور الافتراضي (${policy.defaultRoleCode}) غير مهيأ في قاعدة البيانات`,
      });
    }

    const initialStatus: UserStatus =
      policy.mode === 'email_verification'
        ? 'PENDING_VERIFICATION'
        : policy.mode === 'admin_approval'
          ? 'PENDING_APPROVAL'
          : 'ACTIVE';

    const passwordHash = await hashPassword(parsed.data.password);
    const rawVerifyToken =
      initialStatus === 'PENDING_VERIFICATION' ? generateOpaqueToken(32) : null;

    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: parsed.data.email,
          passwordHash,
          fullName: parsed.data.fullName,
          status: initialStatus,
          emailVerifiedAt: initialStatus === 'ACTIVE' ? new Date() : null,
        },
      });

      await tx.userProfile.create({
        data: {
          userId: user.id,
          onboardingCompleted: false,
        },
      });

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: defaultRole.id,
        },
      });

      if (rawVerifyToken) {
        await tx.verificationToken.create({
          data: {
            userId: user.id,
            purpose: 'EMAIL_VERIFY',
            tokenHash: sha256Hex(rawVerifyToken),
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          },
        });
      }

      await recordAuditLog(tx, {
        actorId: user.id,
        action: 'user.register',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          mode: policy.mode,
          status: initialStatus,
          assignedRole: defaultRole.code,
        },
        request,
      });

      return user;
    });

    if (initialStatus !== 'ACTIVE') {
      return reply.code(201).send({
        user: {
          id: createdUser.id,
          email: createdUser.email,
          fullName: createdUser.fullName,
          status: createdUser.status,
        },
        verificationRequired: initialStatus === 'PENDING_VERIFICATION',
        approvalRequired: initialStatus === 'PENDING_APPROVAL',
        ...(rawVerifyToken && env.NODE_ENV !== 'production'
          ? { devVerificationToken: rawVerifyToken }
          : {}),
      });
    }

    const session = await issueSessionTokens(createdUser, {
      ipAddress: request.ip,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    });
    setAuthCookies(reply, env, session);

    return reply.code(201).send({
      user: {
        id: createdUser.id,
        email: createdUser.email,
        fullName: createdUser.fullName,
        status: createdUser.status,
      },
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      requiresOnboarding: policy.requireOnboarding,
    });
  });

  app.post('/api/v1/auth/verify-email', async (request, reply) => {
    const parsed = VerifyEmailBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
    }

    const tokenRow = await prisma.verificationToken.findUnique({
      where: { tokenHash: sha256Hex(parsed.data.token) },
      include: { user: true },
    });

    if (
      !tokenRow ||
      tokenRow.purpose !== 'EMAIL_VERIFY' ||
      tokenRow.usedAt ||
      tokenRow.expiresAt < new Date()
    ) {
      return reply.code(400).send({
        error: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'رمز التحقق غير صالح أو منتهي الصلاحية',
      });
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({
        where: { id: tokenRow.id },
        data: { usedAt: new Date() },
      });

      const u = await tx.user.update({
        where: { id: tokenRow.userId },
        data: {
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });

      await recordAuditLog(tx, {
        actorId: u.id,
        action: 'user.verify_email',
        targetType: 'user',
        targetId: u.id,
        request,
      });

      return u;
    });

    const session = await issueSessionTokens(updatedUser, {
      ipAddress: request.ip,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    });
    setAuthCookies(reply, env, session);

    return reply.send({
      verified: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        status: updatedUser.status,
      },
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = LoginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      include: { profile: true },
    });

    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({
        error: 'INVALID_CREDENTIALS',
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      });
    }

    if (user.status === 'PENDING_VERIFICATION') {
      return reply.code(403).send({
        error: 'EMAIL_NOT_VERIFIED',
        message: 'يرجى تأكيد البريد الإلكتروني أولاً قبل تسجيل الدخول',
      });
    }

    if (user.status === 'PENDING_APPROVAL') {
      return reply.code(403).send({
        error: 'ACCOUNT_PENDING_APPROVAL',
        message: 'حسابك بانتظار اعتماد إدارة المنصة',
      });
    }

    if (user.status !== 'ACTIVE') {
      return reply.code(403).send({
        error: 'ACCOUNT_SUSPENDED',
        message: 'الحساب موقوف حالياً',
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const session = await issueSessionTokens(user, {
      ipAddress: request.ip,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    });
    setAuthCookies(reply, env, session);

    await recordAuditLog(prisma, {
      actorId: user.id,
      action: 'user.login',
      targetType: 'user',
      targetId: user.id,
      request,
    });

    const ctx = await resolveAuthUser(prisma, user.id);

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
        onboardingCompleted: user.profile?.onboardingCompleted ?? false,
        roles: ctx?.roleCodes ?? [],
        permissions: ctx ? Array.from(ctx.permissions) : [],
      },
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const parsed = RefreshBodySchema.safeParse(request.body);
    const cookieToken = request.cookies?.[REFRESH_COOKIE_NAME];
    const rawRefresh = parsed.success ? parsed.data?.refreshToken ?? cookieToken : cookieToken;

    if (!rawRefresh) {
      return reply.code(401).send({ error: 'REFRESH_TOKEN_MISSING' });
    }

    const tokenRow = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(rawRefresh) },
      include: { user: true },
    });

    if (!tokenRow) {
      clearAuthCookies(reply);
      return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN' });
    }

    if (tokenRow.revokedAt) {
      // حماية من إعادة استخدام رمز مجدّد سابقاً
      await prisma.refreshToken.updateMany({
        where: { userId: tokenRow.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      clearAuthCookies(reply);
      return reply.code(401).send({ error: 'REFRESH_TOKEN_REUSED' });
    }

    if (tokenRow.expiresAt < new Date() || tokenRow.user.status !== 'ACTIVE') {
      clearAuthCookies(reply);
      return reply.code(401).send({ error: 'REFRESH_TOKEN_EXPIRED' });
    }

    const newRefreshRaw = generateOpaqueToken(40);
    const newAccessToken = await signAccessToken(
      { userId: tokenRow.user.id, email: tokenRow.user.email },
      env
    );
    const newExpiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86400 * 1000);

    await prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: tokenRow.user.id,
          tokenHash: sha256Hex(newRefreshRaw),
          expiresAt: newExpiresAt,
          ipAddress: request.ip ?? null,
          userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
        },
      });

      await tx.refreshToken.update({
        where: { id: tokenRow.id },
        data: {
          revokedAt: new Date(),
          replacedById: created.id,
        },
      });
    });

    setAuthCookies(reply, env, {
      accessToken: newAccessToken,
      refreshToken: newRefreshRaw,
    });

    return reply.send({
      accessToken: newAccessToken,
      refreshToken: newRefreshRaw,
    });
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const parsed = RefreshBodySchema.safeParse(request.body);
    const cookieToken = request.cookies?.[REFRESH_COOKIE_NAME];
    const rawRefresh = parsed.success ? parsed.data?.refreshToken ?? cookieToken : cookieToken;

    if (rawRefresh) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: sha256Hex(rawRefresh), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    clearAuthCookies(reply);
    return reply.send({ ok: true });
  });

  app.get('/api/v1/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const authUser = request.authUser!;
    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      include: {
        profile: {
          include: {
            ageGroup: true,
            educationLevel: true,
            preferredTaxonomies: { include: { taxonomy: true } },
          },
        },
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    }

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
        roles: authUser.roleCodes,
        permissions: Array.from(authUser.permissions),
        profile: user.profile
          ? {
              ageGroupId: user.profile.ageGroupId,
              ageGroup: user.profile.ageGroup
                ? {
                    ...user.profile.ageGroup,
                    rulesJson: parseJson(user.profile.ageGroup.rulesJson, {}),
                  }
                : null,
              educationLevelId: user.profile.educationLevelId,
              educationLevel: user.profile.educationLevel
                ? {
                    ...user.profile.educationLevel,
                    rulesJson: parseJson(user.profile.educationLevel.rulesJson, {}),
                  }
                : null,
              preferredTaxonomyIds: user.profile.preferredTaxonomies.map((p) => p.taxonomyId),
              preferredTaxonomies: user.profile.preferredTaxonomies.map((p) => ({
                ...p.taxonomy,
                rulesJson: parseJson(p.taxonomy.rulesJson, {}),
              })),
              onboardingCompleted: user.profile.onboardingCompleted,
              uiPrefsJson: parseJson(user.profile.uiPrefsJson, {}),
            }
          : null,
      },
    });
  });

  app.put('/api/v1/auth/onboarding', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = OnboardingBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
    }

    const userId = request.authUser!.userId;
    const { ageGroupId, educationLevelId, preferredTaxonomyIds, uiPrefsJson } = parsed.data;

    if (ageGroupId) {
      const ag = await prisma.taxonomy.findUnique({ where: { id: ageGroupId } });
      if (!ag || !ag.isActive || ag.group !== 'age_group') {
        return reply.code(400).send({
          error: 'INVALID_AGE_GROUP',
          message: 'الفئة العمرية المختارة غير صالحة أو غير مفعلة',
        });
      }
    }

    if (educationLevelId) {
      const lvl = await prisma.taxonomy.findUnique({ where: { id: educationLevelId } });
      if (!lvl || !lvl.isActive || lvl.group !== 'education_level') {
        return reply.code(400).send({
          error: 'INVALID_EDUCATION_LEVEL',
          message: 'المستوى التعليمي المختار غير صالح أو غير مفعل',
        });
      }
    }

    if (preferredTaxonomyIds && preferredTaxonomyIds.length > 0) {
      const found = await prisma.taxonomy.findMany({
        where: { id: { in: preferredTaxonomyIds }, isActive: true },
        select: { id: true },
      });
      if (found.length !== new Set(preferredTaxonomyIds).size) {
        return reply.code(400).send({
          error: 'INVALID_PREFERRED_TAXONOMIES',
          message: 'بعض التفضيلات المختارة غير مفعلة أو غير موجودة',
        });
      }
    }

    const updatedProfile = await prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          ageGroupId: ageGroupId ?? null,
          educationLevelId: educationLevelId ?? null,
          onboardingCompleted: true,
          uiPrefsJson: stringifyJson(uiPrefsJson ?? {}, '{}'),
        },
        update: {
          ...(ageGroupId !== undefined ? { ageGroupId } : {}),
          ...(educationLevelId !== undefined ? { educationLevelId } : {}),
          ...(uiPrefsJson !== undefined
            ? { uiPrefsJson: stringifyJson(uiPrefsJson, '{}') }
            : {}),
          onboardingCompleted: true,
        },
      });

      if (preferredTaxonomyIds !== undefined) {
        await tx.userPreferredTaxonomy.deleteMany({ where: { userId } });
        if (preferredTaxonomyIds.length > 0) {
          const uniqueIds = Array.from(new Set(preferredTaxonomyIds));
          await tx.userPreferredTaxonomy.createMany({
            data: uniqueIds.map((taxonomyId) => ({ userId, taxonomyId })),
          });
        }
      }

      await recordAuditLog(tx, {
        actorId: userId,
        action: 'user.profile.onboarding',
        targetType: 'user_profile',
        targetId: userId,
        metadata: {
          ageGroupId: profile.ageGroupId,
          educationLevelId: profile.educationLevelId,
          preferredTaxonomyIds: preferredTaxonomyIds ?? undefined,
        },
        request,
      });

      return tx.userProfile.findUniqueOrThrow({
        where: { userId },
        include: {
          ageGroup: true,
          educationLevel: true,
          preferredTaxonomies: { include: { taxonomy: true } },
        },
      });
    });

    return reply.send({
      profile: {
        ...updatedProfile,
        ageGroup: updatedProfile.ageGroup
          ? {
              ...updatedProfile.ageGroup,
              rulesJson: parseJson(updatedProfile.ageGroup.rulesJson, {}),
            }
          : null,
        educationLevel: updatedProfile.educationLevel
          ? {
              ...updatedProfile.educationLevel,
              rulesJson: parseJson(updatedProfile.educationLevel.rulesJson, {}),
            }
          : null,
        preferredTaxonomies: updatedProfile.preferredTaxonomies.map((pt) => ({
          ...pt,
          taxonomy: {
            ...pt.taxonomy,
            rulesJson: parseJson(pt.taxonomy.rulesJson, {}),
          },
        })),
        uiPrefsJson: parseJson(updatedProfile.uiPrefsJson, {}),
        metadataJson: parseJson(updatedProfile.metadataJson, {}),
      },
    });
  });

  app.delete('/api/v1/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.authUser!.userId;
    const body = (request.body as { password?: string } | undefined) ?? {};

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    }

    if (body.password) {
      const valid = await verifyPassword(body.password, existing.passwordHash);
      if (!valid) {
        return reply.code(401).send({
          error: 'INVALID_CREDENTIALS',
          message: 'كلمة المرور المدخلة غير صحيحة',
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.updateMany({ where: { assignedById: userId }, data: { assignedById: null } });
      await tx.systemConfig.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
      await tx.cmsSection.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
      await tx.newsPost.updateMany({ where: { authorId: userId }, data: { authorId: null } });
      await tx.book.updateMany({ where: { authorId: userId }, data: { authorId: null } });
      await tx.reviewTicket.updateMany({ where: { reviewerId: userId }, data: { reviewerId: null } });
      await tx.auditLog.updateMany({ where: { actorId: userId }, data: { actorId: null } });

      await recordAuditLog(tx, {
        actorId: null,
        action: 'user.self_delete',
        targetType: 'user',
        targetId: userId,
        metadata: { email: existing.email },
        request,
      });

      await tx.user.delete({ where: { id: userId } });
    });

    clearAuthCookies(reply);
    return reply.send({ ok: true, deleted: true });
  });

  app.patch(
    '/api/v1/users/:id/status',
    { preHandler: [authenticate, requirePermission('users.manage')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateUserStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: 'USER_NOT_FOUND' });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: { status: parsed.data.status },
        });
        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'user.status.update',
          targetType: 'user',
          targetId: id,
          metadata: {
            before: { status: existing.status },
            after: { status: user.status },
            reason: parsed.data.reason ?? null,
          },
          request,
        });
        return user;
      });

      return reply.send({
        user: {
          id: updated.id,
          email: updated.email,
          fullName: updated.fullName,
          status: updated.status,
        },
      });
    }
  );

  app.get(
    '/api/v1/users',
    { preHandler: [authenticate, requireAnyPermission(['users.manage', 'roles.manage'])] },
    async (request, reply) => {
      const q = request.query as { status?: UserStatus; limit?: string };
      const limit = Math.min(200, Math.max(1, parseInt(q.limit || '100', 10) || 100));

      const users = await prisma.user.findMany({
        where: q.status ? { status: q.status } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          userRoles: {
            select: {
              role: {
                select: { id: true, code: true, nameAr: true },
              },
            },
          },
          profile: {
            select: {
              onboardingCompleted: true,
              ageGroup: { select: { id: true, slug: true, labelAr: true } },
              educationLevel: { select: { id: true, slug: true, labelAr: true } },
            },
          },
        },
      });

      return reply.send({
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          status: u.status,
          emailVerifiedAt: u.emailVerifiedAt,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
          roles: u.userRoles.map((ur) => ur.role),
          profile: u.profile,
        })),
      });
    }
  );
}
