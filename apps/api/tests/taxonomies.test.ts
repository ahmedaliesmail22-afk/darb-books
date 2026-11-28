import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  sqlServerAvailable,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  type TestContext,
} from './helpers/testHarness';

describe.skipIf(!sqlServerAvailable)('Dynamic Taxonomies & CMS Sections', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    if (ctx) await ctx.cleanup();
  });

  it('creates, edits, reorders, and deactivates taxonomies dynamically across custom groups', async () => {
    const admin = await ctx.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);

    // Create a brand new custom group & item without schema changes
    const createCustom = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/taxonomies',
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        group: 'track_badge',
        slug: 'research-fellowship',
        labelAr: 'مسار الزمالة البحثية',
        labelEn: 'Research Fellowship',
        sortOrder: 20,
        rulesJson: { icon: '🎓' },
      },
    });
    expect(createCustom.statusCode).toBe(201);
    const taxId = createCustom.json().item.id as string;

    // Create second item to test reorder
    const createSecond = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/taxonomies',
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        group: 'track_badge',
        slug: 'coding-bootcamp',
        labelAr: 'معسكر البرمجة',
        sortOrder: 30,
      },
    });
    expect(createSecond.statusCode).toBe(201);
    const secondId = createSecond.json().item.id as string;

    // Update label
    const patchRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/taxonomies/${taxId}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { labelAr: 'مسار البروفيسوراه والزمالة البحثية' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().item.labelAr).toBe('مسار البروفيسوراه والزمالة البحثية');

    // Reorder
    const reorderRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/taxonomies/reorder',
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        items: [
          { id: secondId, sortOrder: 1 },
          { id: taxId, sortOrder: 2 },
        ],
      },
    });
    expect(reorderRes.statusCode).toBe(200);

    const listGroup = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/taxonomies?group=track_badge',
    });
    expect(listGroup.statusCode).toBe(200);
    expect(listGroup.json().items.map((x: { slug: string }) => x.slug)).toEqual([
      'coding-bootcamp',
      'research-fellowship',
    ]);

    // Deactivate first item -> hidden from public endpoint, visible with includeInactive=true for admin
    const delRes = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/taxonomies/${secondId}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    expect(delRes.statusCode).toBe(200);

    const publicAfter = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/taxonomies?group=track_badge',
    });
    expect(publicAfter.json().items).toHaveLength(1);

    const adminAll = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/taxonomies?group=track_badge&includeInactive=true',
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    expect(adminAll.json().items).toHaveLength(2);
  });

  it('serves editable CMS sections and branding configs via public bootstrap immediately after update', async () => {
    const admin = await ctx.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);

    const updateHero = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/cms/pages/home/sections/hero',
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        titleAr: 'عنوان ترحيبي محدث من لوحة التحكم',
        contentJson: { subtitle: 'وصف ديناميكي مرن' },
        sortOrder: 1,
        isVisible: true,
      },
    });
    expect(updateHero.statusCode).toBe(200);

    const boot = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/bootstrap' });
    expect(boot.statusCode).toBe(200);
    const body = boot.json();
    expect(body.configs['branding.portal'].portalTitle).toBeTruthy();
    const hero = (body.homePage.sections as Array<{ sectionKey: string; titleAr: string }>).find(
      (s) => s.sectionKey === 'hero'
    );
    expect(hero?.titleAr).toBe('عنوان ترحيبي محدث من لوحة التحكم');
  });
});
