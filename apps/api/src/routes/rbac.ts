import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { recordAuditLog } from '../plugins/audit';
import { requirePermission } from '../plugins/rbac';

const CreateRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9_]+$/),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  permissionCodes: z.array(z.string().min(1)).default([]),
});

const UpdateRoleSchema = z.object({
  nameAr: z.string().trim().min(2).max(120).optional(),
  nameEn: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  permissionCodes: z.array(z.string().min(1)).optional(),
});

const AssignUserRolesSchema = z.object({
  roleCodes: z.array(z.string().min(1)).min(1),
});

export function registerRbacRoutes(
  app: FastifyInstance,
  deps: {
    prisma: PrismaClient;
    authenticate: ReturnType<typeof import('../plugins/auth').createAuthHooks>['authenticate'];
  }
): void {
  const { prisma, authenticate } = deps;

  app.get(
    '/api/v1/rbac/permissions',
    { preHandler: [authenticate, requirePermission('roles.manage')] },
    async (_request, reply) => {
      const permissions = await prisma.permission.findMany({
        orderBy: [{ module: 'asc' }, { code: 'asc' }],
      });
      return reply.send({ permissions });
    }
  );

  app.get(
    '/api/v1/rbac/roles',
    { preHandler: [authenticate, requirePermission('roles.manage')] },
    async (_request, reply) => {
      const roles = await prisma.role.findMany({
        orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
        include: {
          rolePermissions: { include: { permission: true } },
          _count: { select: { userRoles: true } },
        },
      });
      return reply.send({
        roles: roles.map((r) => ({
          id: r.id,
          code: r.code,
          nameAr: r.nameAr,
          nameEn: r.nameEn,
          description: r.description,
          isSystem: r.isSystem,
          isActive: r.isActive,
          usersCount: r._count.userRoles,
          permissions: r.rolePermissions.map((rp) => rp.permission),
        })),
      });
    }
  );

  app.post(
    '/api/v1/rbac/roles',
    { preHandler: [authenticate, requirePermission('roles.manage')] },
    async (request, reply) => {
      const parsed = CreateRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const existing = await prisma.role.findUnique({ where: { code: parsed.data.code } });
      if (existing) {
        return reply.code(409).send({
          error: 'ROLE_EXISTS',
          message: 'يوجد دور بنفس الرمز بالفعل',
        });
      }

      const uniqueCodes = Array.from(new Set(parsed.data.permissionCodes));
      const perms = uniqueCodes.length
        ? await prisma.permission.findMany({ where: { code: { in: uniqueCodes } } })
        : [];
      if (perms.length !== uniqueCodes.length) {
        return reply.code(400).send({
          error: 'INVALID_PERMISSIONS',
          message: 'بعض أكواد الصلاحيات المحددة غير موجودة',
        });
      }

      const created = await prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            code: parsed.data.code,
            nameAr: parsed.data.nameAr,
            nameEn: parsed.data.nameEn ?? null,
            description: parsed.data.description ?? null,
            isSystem: false,
            isActive: true,
          },
        });

        if (perms.length > 0) {
          await tx.rolePermission.createMany({
            data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
          });
        }

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'rbac.role.create',
          targetType: 'role',
          targetId: role.id,
          metadata: {
            code: role.code,
            nameAr: role.nameAr,
            permissionCodes: uniqueCodes,
          },
          request,
        });

        return role;
      });

      return reply.code(201).send({
        role: {
          ...created,
          permissions: perms,
        },
      });
    }
  );

  app.patch(
    '/api/v1/rbac/roles/:id',
    { preHandler: [authenticate, requirePermission('roles.manage')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const existing = await prisma.role.findUnique({
        where: { id },
        include: { rolePermissions: { include: { permission: true } } },
      });
      if (!existing) {
        return reply.code(404).send({ error: 'ROLE_NOT_FOUND' });
      }

      let targetPermissions = existing.rolePermissions.map((rp) => rp.permission);
      if (parsed.data.permissionCodes !== undefined) {
        const uniqueCodes = Array.from(new Set(parsed.data.permissionCodes));
        const perms = uniqueCodes.length
          ? await prisma.permission.findMany({ where: { code: { in: uniqueCodes } } })
          : [];
        if (perms.length !== uniqueCodes.length) {
          return reply.code(400).send({
            error: 'INVALID_PERMISSIONS',
            message: 'بعض أكواد الصلاحيات المحددة غير موجودة',
          });
        }
        targetPermissions = perms;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const role = await tx.role.update({
          where: { id },
          data: {
            ...(parsed.data.nameAr !== undefined ? { nameAr: parsed.data.nameAr } : {}),
            ...(parsed.data.nameEn !== undefined ? { nameEn: parsed.data.nameEn } : {}),
            ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
            ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
          },
        });

        if (parsed.data.permissionCodes !== undefined) {
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          if (targetPermissions.length > 0) {
            await tx.rolePermission.createMany({
              data: targetPermissions.map((p) => ({ roleId: id, permissionId: p.id })),
            });
          }
        }

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'rbac.role.update',
          targetType: 'role',
          targetId: id,
          metadata: {
            before: {
              nameAr: existing.nameAr,
              isActive: existing.isActive,
              permissionCodes: existing.rolePermissions.map((rp) => rp.permission.code),
            },
            after: {
              nameAr: role.nameAr,
              isActive: role.isActive,
              permissionCodes: targetPermissions.map((p) => p.code),
            },
          },
          request,
        });

        return role;
      });

      return reply.send({
        role: {
          ...updated,
          permissions: targetPermissions,
        },
      });
    }
  );

  app.delete(
    '/api/v1/rbac/roles/:id',
    { preHandler: [authenticate, requirePermission('roles.manage')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.role.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: 'ROLE_NOT_FOUND' });
      }
      if (existing.isSystem) {
        return reply.code(400).send({
          error: 'SYSTEM_ROLE_PROTECTED',
          message: 'لا يمكن حذف الأدوار النظامية الأساسية؛ يمكنك تعديل صلاحياتها فقط',
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.role.delete({ where: { id } });
        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'rbac.role.delete',
          targetType: 'role',
          targetId: id,
          metadata: { deletedRoleCode: existing.code },
          request,
        });
      });

      return reply.send({ ok: true });
    }
  );

  app.put(
    '/api/v1/rbac/users/:userId/roles',
    { preHandler: [authenticate, requirePermission('roles.manage')] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const parsed = AssignUserRolesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!targetUser) {
        return reply.code(404).send({ error: 'USER_NOT_FOUND' });
      }

      const uniqueCodes = Array.from(new Set(parsed.data.roleCodes));
      const roles = await prisma.role.findMany({
        where: { code: { in: uniqueCodes }, isActive: true },
      });
      if (roles.length !== uniqueCodes.length) {
        return reply.code(400).send({
          error: 'INVALID_ROLES',
          message: 'بعض الأدوار المطلوبة غير موجودة أو غير مفعلة',
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({ where: { userId } });
        await tx.userRole.createMany({
          data: roles.map((r) => ({
            userId,
            roleId: r.id,
            assignedById: request.authUser!.userId,
          })),
        });

        await recordAuditLog(tx, {
          actorId: request.authUser!.userId,
          action: 'rbac.user_roles.assign',
          targetType: 'user',
          targetId: userId,
          metadata: {
            beforeRoleCodes: targetUser.userRoles.map((ur) => ur.role.code),
            afterRoleCodes: roles.map((r) => r.code),
          },
          request,
        });
      });

      return reply.send({
        userId,
        roles: roles.map((r) => ({ id: r.id, code: r.code, nameAr: r.nameAr })),
      });
    }
  );
}
