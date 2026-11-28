import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  sqlServerAvailable,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  type TestContext,
} from './helpers/testHarness';

describe.skipIf(!sqlServerAvailable)(
  'Mandatory Age-Gating, Migrated Book Versions & Range 206 Streaming',
  () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    if (ctx) await ctx.cleanup();
  });

  it('serves migrated epic-v1, anatomical-book, and interactive-showcase editions cleanly', async () => {
    const listRes = await ctx.app.inject({ method: 'GET', url: '/api/v1/books' });
    expect(listRes.statusCode).toBe(200);
    const books = listRes.json().books as Array<{ slug: string; activeVersion: { spreadsCount: number } }>;
    expect(books.map((b) => b.slug).sort()).toEqual([
      'anatomical-book',
      'epic-v1',
      'interactive-showcase',
    ]);
    expect(books.find((b) => b.slug === 'epic-v1')?.activeVersion.spreadsCount).toBe(27);
    expect(books.find((b) => b.slug === 'anatomical-book')?.activeVersion.spreadsCount).toBe(27);
    expect(books.find((b) => b.slug === 'interactive-showcase')?.activeVersion.spreadsCount).toBe(7);

    const showcaseDataRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books/interactive-showcase/editions-data',
    });
    expect(showcaseDataRes.statusCode).toBe(200);
    const showcaseSpreads = showcaseDataRes.json().spreads as Array<{
      right?: { blocks?: Array<{ type: string }> };
      left?: { blocks?: Array<{ type: string }> };
    }>;
    const blockTypes = showcaseSpreads.flatMap((sp) => [
      ...(sp.right?.blocks?.map((b) => b.type) ?? []),
      ...(sp.left?.blocks?.map((b) => b.type) ?? []),
    ]);
    expect(blockTypes).toEqual(
      expect.arrayContaining([
        'model3d',
        'simulation',
        'geo_timeline',
        'literacy_quran',
        'code_sandbox',
        'story_magazine',
      ])
    );

    const epicDataRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books/epic-v1/editions-data',
    });
    expect(epicDataRes.statusCode).toBe(200);
    expect(epicDataRes.json().spreads).toHaveLength(27);

    // Cloud progress & bookmarks sync check
    const admin = await ctx.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    const saveProg = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/books/epic-v1/progress',
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        currentSpread: 4,
        percent: 15,
        bookmarksJson: [{ id: 'bm-4', editionId: 'epic-v1', spreadIdx: 4, title: 'الفصل الأول', subtitle: 'صفحة 7', createdAt: 1700000000 }],
      },
    });
    expect(saveProg.statusCode).toBe(200);

    const getProg = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books/epic-v1/progress',
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    expect(getProg.statusCode).toBe(200);
    expect(getProg.json().progress.currentSpread).toBe(4);

    const mineProg = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books/progress/mine',
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    expect(mineProg.statusCode).toBe(200);
    expect(mineProg.json().progressBySlug['epic-v1'].currentSpread).toBe(4);
  });

  it('enforces mandatory age-gating for younger learners while highlighting matched domains for adults', async () => {
    const admin = await ctx.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);

    const taxRes = await ctx.app.inject({ method: 'GET', url: '/api/v1/taxonomies' });
    const grouped = taxRes.json().grouped as Record<string, Array<{ id: string; slug: string }>>;
    const adultAge = grouped.age_group.find((t) => t.slug === 'adults-18-plus')!;
    const kidsAge = grouped.age_group.find((t) => t.slug === 'kids-6-11')!;
    const medDomain = grouped.domain.find((t) => t.slug === 'medicine-anatomy')!;
    const phdLevel = grouped.education_level.find((t) => t.slug === 'phd')!;

    // Publish a specialized 18+ medical PhD book
    const createBook = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/books',
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        slug: 'clinical-neuroanatomy-18',
        title: 'تشريح الأعصاب السريري المتقدم',
        taxonomyIds: [adultAge.id, medDomain.id, phdLevel.id],
        publishNow: true,
        spreadsCount: 1,
        canonicalDataJson: {
          id: 'clinical-neuroanatomy-18',
          title: 'تشريح الأعصاب السريري المتقدم',
          spreads: [{ isFrontCover: true, right: { isCover: true, html: '<h1>غلاف</h1>' }, left: null }],
        },
      },
    });
    expect(createBook.statusCode).toBe(201);

    // Child reader (6-11)
    const kidReg = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'kid@example.com',
        password: 'StrongPassword!123',
        fullName: 'قارئ صغير',
      },
    });
    const kidToken = kidReg.json().accessToken as string;
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/auth/onboarding',
      headers: { authorization: `Bearer ${kidToken}` },
      payload: { ageGroupId: kidsAge.id },
    });

    // Kid cannot see the 18+ book in library
    const kidBooks = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books',
      headers: { authorization: `Bearer ${kidToken}` },
    });
    expect(kidBooks.statusCode).toBe(200);
    const kidSlugs = (kidBooks.json().books as Array<{ slug: string }>).map((b) => b.slug);
    expect(kidSlugs).not.toContain('clinical-neuroanatomy-18');
    expect(kidSlugs).toContain('epic-v1');

    // Kid direct access is also forbidden (403)
    const kidDirect = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books/clinical-neuroanatomy-18',
      headers: { authorization: `Bearer ${kidToken}` },
    });
    expect(kidDirect.statusCode).toBe(403);
    expect(kidDirect.json().error).toBe('AGE_RESTRICTED');

    // Adult researcher (18+) with medicine domain sees & gets it recommended first
    const adultReg = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'researcher@example.com',
        password: 'StrongPassword!123',
        fullName: 'باحث طبي',
      },
    });
    const adultToken = adultReg.json().accessToken as string;
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/auth/onboarding',
      headers: { authorization: `Bearer ${adultToken}` },
      payload: {
        ageGroupId: adultAge.id,
        educationLevelId: phdLevel.id,
        preferredTaxonomyIds: [medDomain.id],
      },
    });

    const adultBooks = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books',
      headers: { authorization: `Bearer ${adultToken}` },
    });
    expect(adultBooks.statusCode).toBe(200);
    const adultList = adultBooks.json().books as Array<{ slug: string; isRecommended: boolean }>;
    expect(adultList[0].slug).toBe('clinical-neuroanatomy-18');
    expect(adultList[0].isRecommended).toBe(true);
  });

  it('streams MP3 audio and MP4 video with HTTP 206 Partial Content and Content-Range', async () => {
    const mp3Range = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/media/stream/audio/epic-v1/spread_0.mp3',
      headers: { range: 'bytes=0-1023' },
    });
    expect(mp3Range.statusCode).toBe(206);
    expect(mp3Range.headers['accept-ranges']).toBe('bytes');
    expect(mp3Range.headers['content-type']).toBe('audio/mpeg');
    expect(String(mp3Range.headers['content-range'])).toMatch(/^bytes 0-1023\/\d+$/);
    expect(mp3Range.rawPayload.length).toBe(1024);

    const mp4Range = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/media/stream/videos/epic-v1/ch1.mp4',
      headers: { range: 'bytes=0-2047' },
    });
    expect(mp4Range.statusCode).toBe(206);
    expect(mp4Range.headers['content-type']).toBe('video/mp4');
    expect(String(mp4Range.headers['content-range'])).toMatch(/^bytes 0-2047\/\d+$/);
    expect(mp4Range.rawPayload.length).toBe(2048);

    // Path traversal attempt is safely rejected
    const unsafe = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/media/stream/..%2F..%2Fpackage.json',
    });
    expect(unsafe.statusCode).toBe(400);
  });
});
