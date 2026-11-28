import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  sqlServerAvailable,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  type TestContext,
} from './helpers/testHarness';

describe.skipIf(!sqlServerAvailable)(
  'Auth, Policies, Refresh Rotation & Dynamic Profile Onboarding',
  () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('registers instantly, completes onboarding from active taxonomies, and rotates refresh tokens securely', async () => {
    const regRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'learner1@example.com',
        password: 'StrongPassword!123',
        fullName: 'طالب تجريبي',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const regJson = regRes.json();
    expect(regJson.accessToken).toBeTruthy();
    expect(regJson.refreshToken).toBeTruthy();
    expect(regJson.requiresOnboarding).toBe(true);

    // Fetch active taxonomies for onboarding
    const taxRes = await ctx.app.inject({ method: 'GET', url: '/api/v1/taxonomies' });
    expect(taxRes.statusCode).toBe(200);
    const grouped = taxRes.json().grouped as Record<string, Array<{ id: string; slug: string }>>;

    const kidsAge = grouped.age_group.find((t) => t.slug === 'kids-6-11')!;
    const primaryLevel = grouped.education_level.find((t) => t.slug === 'primary')!;
    const arabicDomain = grouped.domain.find((t) => t.slug === 'arabic-quran')!;

    const onbRes = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/auth/onboarding',
      headers: { authorization: `Bearer ${regJson.accessToken}` },
      payload: {
        ageGroupId: kidsAge.id,
        educationLevelId: primaryLevel.id,
        preferredTaxonomyIds: [arabicDomain.id],
        uiPrefsJson: { theme: 'dark', fontScale: 'lg' },
      },
    });
    expect(onbRes.statusCode).toBe(200);
    expect(onbRes.json().profile.onboardingCompleted).toBe(true);
    expect(onbRes.json().profile.ageGroup.slug).toBe('kids-6-11');

    // Verify /auth/me reflects live profile & DB permissions
    const meRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${regJson.accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.roles).toEqual(['LEARNER']);
    expect(meRes.json().user.profile.preferredTaxonomyIds).toEqual([arabicDomain.id]);

    // Rotate refresh token once
    const refresh1 = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: regJson.refreshToken },
    });
    expect(refresh1.statusCode).toBe(200);
    const nextTokens = refresh1.json();
    expect(nextTokens.refreshToken).not.toBe(regJson.refreshToken);

    // Reusing old refresh token must fail and revoke active family
    const replay = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: regJson.refreshToken },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error).toBe('REFRESH_TOKEN_REUSED');

    const afterReplay = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: nextTokens.refreshToken },
    });
    expect(afterReplay.statusCode).toBe(401);
  });

  it('enforces dynamic registration modes (email_verification & admin_approval) from system_configs', async () => {
    const admin = await ctx.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);

    // Switch registration policy to email_verification
    const cfg1 = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/configs/auth.registration_policy',
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        category: 'auth',
        isPublic: true,
        valueJson: {
          mode: 'email_verification',
          allowSelfRegistration: true,
          requireOnboarding: true,
          minPasswordLength: 8,
          defaultRoleCode: 'LEARNER',
        },
      },
    });
    expect(cfg1.statusCode).toBe(200);

    const regEmail = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'verifyme@example.com',
        password: 'StrongPassword!123',
        fullName: 'مستخدم للتحقق',
      },
    });
    expect(regEmail.statusCode).toBe(201);
    const regBody = regEmail.json();
    expect(regBody.verificationRequired).toBe(true);
    expect(regBody.devVerificationToken).toBeTruthy();

    // Login fails until verified
    const blockedLogin = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'verifyme@example.com', password: 'StrongPassword!123' },
    });
    expect(blockedLogin.statusCode).toBe(403);
    expect(blockedLogin.json().error).toBe('EMAIL_NOT_VERIFIED');

    // Verify email and confirm login succeeds
    const verifyRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: regBody.devVerificationToken },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().verified).toBe(true);

    // Switch registration policy to admin_approval
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/configs/auth.registration_policy',
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        category: 'auth',
        isPublic: true,
        valueJson: {
          mode: 'admin_approval',
          allowSelfRegistration: true,
          requireOnboarding: true,
          minPasswordLength: 8,
          defaultRoleCode: 'LEARNER',
        },
      },
    });

    const regApproval = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'pending@example.com',
        password: 'StrongPassword!123',
        fullName: 'حساب بانتظار الاعتماد',
      },
    });
    expect(regApproval.statusCode).toBe(201);
    expect(regApproval.json().approvalRequired).toBe(true);

    const pendingLogin = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'pending@example.com', password: 'StrongPassword!123' },
    });
    expect(pendingLogin.statusCode).toBe(403);
    expect(pendingLogin.json().error).toBe('ACCOUNT_PENDING_APPROVAL');

    // Admin activates account
    const pendingUserId = regApproval.json().user.id as string;
    const activateRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${pendingUserId}/status`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { status: 'ACTIVE', reason: 'اعتماد إداري تجريبي' },
    });
    expect(activateRes.statusCode).toBe(200);

    const activeLogin = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'pending@example.com', password: 'StrongPassword!123' },
    });
    expect(activeLogin.statusCode).toBe(200);
  });

  it('allows an authenticated user to permanently delete their own account (DELETE /api/v1/auth/me)', async () => {
    const reg = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'delete-me@example.com',
        password: 'StrongPassword!123',
        fullName: 'مستخدم للحذف',
      },
    });
    expect(reg.statusCode).toBe(201);
    const { accessToken, user } = reg.json() as {
      accessToken: string;
      user: { id: string };
    };

    const wrongPwd = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { password: 'WrongPassword!123' },
    });
    expect(wrongPwd.statusCode).toBe(401);

    const delOk = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { password: 'StrongPassword!123' },
    });
    expect(delOk.statusCode).toBe(200);
    expect(delOk.json()).toEqual({ ok: true, deleted: true });

    const meAfter = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(meAfter.statusCode).toBe(401);

    const auditEntry = await ctx.prisma.auditLog.findFirst({
      where: { action: 'user.self_delete', targetId: user.id },
    });
    expect(auditEntry).toBeTruthy();
    expect(auditEntry?.actorId).toBeNull();
  });
});
