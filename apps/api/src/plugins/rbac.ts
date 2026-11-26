import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * حارس الصلاحيات الديناميكي: يعتمد حصراً على أكواد الصلاحيات المخزنة في قاعدة البيانات
 * دون التحقق من أسماء أدوار جامدة.
 */
export function requirePermission(permissionCode: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.authUser) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'يلزم تسجيل الدخول للوصول إلى هذا المورد',
      });
    }

    if (!request.authUser.permissions.has(permissionCode)) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: `لا تملك الصلاحية المطلوبة: ${permissionCode}`,
        requiredPermission: permissionCode,
      });
    }
  };
}

export function requireAnyPermission(permissionCodes: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.authUser) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'يلزم تسجيل الدخول للوصول إلى هذا المورد',
      });
    }

    const ok = permissionCodes.some((code) => request.authUser?.permissions.has(code));
    if (!ok) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'لا تملك أي صلاحية مطلوبة لتنفيذ هذا الإجراء',
        requiredPermissions: permissionCodes,
      });
    }
  };
}
