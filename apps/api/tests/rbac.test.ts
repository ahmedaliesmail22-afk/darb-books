import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  type TestContext,
} from './helpers/testHarness';

describe('Dynamic RBAC, Custom Roles & Audit Logs', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('allows creating a custom role, attaching granular permissions, assigning it, and auditing changes', async () => {
    const admin = await ctx.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);

    // Register normal learner
    const regUser = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'curriculum-editor@example.com',
        password: 'StrongPassword!123',
        fullName: 'منسق مناهج',
      },
    });
    expect(regUser.statusCode).toBe(201);
    const userId = regUser.json().user.id as string;
    const userToken = regUser.json().accessToken as string;

    // Learner is forbidden from creating taxonomies or editing CMS
    const deniedTax = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/taxonomies',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        group: 'domain',
        slug: 'ai-robotics',
        labelAr: 'الذكاء الاصطناعي والروبوتات',
      },
    });
    expect(deniedTax.statusCode).toBe(403);

    // Super admin creates a brand-new custom role dynamically
    const createRole = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/rbac/roles',
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        code: 'TAXONOMY_CURATOR',
        nameAr: 'مشرف التصنيفات والمحتوى',
        nameEn: 'Taxonomy & CMS Curator',
        permissionCodes: ['taxonomies.manage', 'cms.manage', 'books.read'],
      },
    });
    expect(createRole.statusCode).toBe(201);
    const roleId = createRole.json().role.id as string;

    // Assign custom role to user
    const assignRes = await ctx.app.inject({
      method: 'PUT',
      url: `/api/v1/rbac/users/${userId}/roles`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { roleCodes: ['TAXONOMY_CURATOR'] },
    });
    expect(assignRes.statusCode).toBe(200);

    // Existing token takes effect immediately because permissions resolve live from DB
    const allowedTax = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/taxonomies',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        group: 'domain',
        slug: 'ai-robotics',
        labelAr: 'الذكاء الاصطناعي والروبوتات',
        sortOrder: 9,
      },
    });
    expect(allowedTax.statusCode).toBe(201);

    // Still cannot manage RBAC or configs without those permissions
    const stillDeniedConfigs = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/configs',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(stillDeniedConfigs.statusCode).toBe(403);

    // System role cannot be deleted
    const rolesRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/rbac/roles',
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    const superAdminRole = (rolesRes.json().roles as Array<{ id: string; code: string }>).find(
      (r) => r.code === 'SUPER_ADMIN'
    )!;
    const delSysRole = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/rbac/roles/${superAdminRole.id}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    expect(delSysRole.statusCode).toBe(400);
    expect(delSysRole.json().error).toBe('SYSTEM_ROLE_PROTECTED');

    // Update custom role to remove taxonomies.manage
    const patchRole = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/rbac/roles/${roleId}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { permissionCodes: ['cms.manage', 'books.read'] },
    });
    expect(patchRole.statusCode).toBe(200);

    // Permission revocation applies immediately
    const revokedTax = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/taxonomies',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        group: 'domain',
        slug: 'quantum-computing',
        labelAr: 'الحوسبة الكمية',
      },
    });
    expect(revokedTax.statusCode).toBe(403);

    // Audit logs recorded role creation, assignment, update, and taxonomy creation
    const auditRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/audit-logs?limit=50',
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    expect(auditRes.statusCode).toBe(200);
    const actions = (auditRes.json().logs as Array<{ action: string }>).map((l) => l.action);
    expect(actions).toContain('rbac.role.create');
    expect(actions).toContain('rbac.user_roles.assign');
    expect(actions).toContain('rbac.role.update');
    expect(actions).toContain('taxonomy.create');
  });
});
