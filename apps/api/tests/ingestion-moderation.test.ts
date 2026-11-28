import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  createTestContext,
  sqlServerAvailable,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  type TestContext,
} from './helpers/testHarness';

async function createMultipartRequest(
  file: { filename: string; content: Buffer | string; mimeType: string },
  fields: Record<string, string> = {}
): Promise<{ contentType: string; payload: Buffer }> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }
  const bytes = typeof file.content === 'string' ? Buffer.from(file.content, 'utf8') : file.content;
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: file.mimeType }),
    file.filename
  );
  const req = new Request('http://localhost/upload', { method: 'POST', body: form });
  const contentType = req.headers.get('content-type')!;
  const payload = Buffer.from(await req.arrayBuffer());
  return { contentType, payload };
}

describe.skipIf(!sqlServerAvailable)(
  'Phase 3: Ingestion, Non-Destructive Versioning & Moderation API',
  () => {
  let ctx: TestContext;
  let adminToken = '';
  let authorToken = '';
  let reviewerToken = '';
  let limitedReviewerToken = '';
  let learnerToken = '';

  beforeAll(async () => {
    ctx = await createTestContext();
    adminToken = (await ctx.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)).accessToken;

    const createUserWithRole = async (
      email: string,
      fullName: string,
      roleCode: string
    ): Promise<string> => {
      const regRes = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email,
          password: 'Password123!',
          fullName,
        },
      });
      expect(regRes.statusCode).toBe(201);
      const userId = (regRes.json() as { user: { id: string } }).user.id;
      const assignRes = await ctx.app.inject({
        method: 'PUT',
        url: `/api/v1/rbac/users/${userId}/roles`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { roleCodes: [roleCode] },
      });
      expect(assignRes.statusCode).toBe(200);
      return (await ctx.login(email, 'Password123!')).accessToken;
    };

    // Custom role with books.review ONLY (without books.publish)
    const customRoleRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/rbac/roles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: 'LIMITED_REVIEWER',
        nameAr: 'مراجع أولي بدون نشر',
        permissionCodes: ['books.review'],
      },
    });
    expect(customRoleRes.statusCode).toBe(201);

    authorToken = await createUserWithRole('author.p3@darb.local', 'مؤلف الاختبار', 'AUTHOR');
    reviewerToken = await createUserWithRole(
      'reviewer.p3@darb.local',
      'المراجع المعتمد',
      'CONTENT_REVIEWER'
    );
    limitedReviewerToken = await createUserWithRole(
      'limited.reviewer@darb.local',
      'المراجع الأولي',
      'LIMITED_REVIEWER'
    );
    learnerToken = await createUserWithRole('learner.p3@darb.local', 'متعلم اختبار', 'LEARNER');
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('lists parser formats and generates live official template updated via admin config', async () => {
    const formatsRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/parsers/formats',
    });
    expect(formatsRes.statusCode).toBe(200);
    const formatsBody = formatsRes.json() as { formats: Array<{ formatId: string }> };
    expect(formatsBody.formats.map((f) => f.formatId)).toEqual(
      expect.arrayContaining(['template-zip', 'json', 'markdown', 'docx', 'epub'])
    );

    const updateTplCfg = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/configs/templates.official_package',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        category: 'templates',
        isPublic: true,
        valueJson: {
          version: '2.5.0',
          title: 'قالب درب المحدث من الإدارة',
          guideMarkdown: 'دليل محدث مباشرة من system_configs',
        },
      },
    });
    expect(updateTplCfg.statusCode).toBe(200);

    const downloadRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/templates/official/download',
    });
    expect(downloadRes.statusCode).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('application/zip');

    const zip = await JSZip.loadAsync(downloadRes.rawPayload);
    const readme = await zip.file('README.md')!.async('string');
    const manifest = JSON.parse(await zip.file('book.manifest.json')!.async('string'));
    expect(readme).toContain('2.5.0');
    expect(readme).toContain('دليل محدث مباشرة من system_configs');
    expect(manifest.schemaVersion).toBe('2.5.0');
    expect(manifest.title).toBe('قالب درب المحدث من الإدارة');
  });

  it('runs complete non-destructive upload, preview, IP declaration, checklist moderation, and v2 rollout', async () => {
    // 1. Author uploads Official Template ZIP with audio asset
    const templateRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/templates/official/download',
    });
    const zip = await JSZip.loadAsync(templateRes.rawPayload);
    const fakeMp3 = Buffer.from('ID3_DUMMY_MP3_STREAM_0123456789ABCDEF');
    zip.file('audio/spread_0.mp3', fakeMp3);
    const customZipBuf = await zip.generateAsync({ type: 'nodebuffer' });

    const multipartV1 = await createMultipartRequest(
      {
        filename: 'physics-v1.zip',
        content: customZipBuf,
        mimeType: 'application/zip',
      },
      {
        slug: 'interactive-physics-book',
        title: 'مختبر الفيزياء التفاعلي — الإصدار الأول',
      }
    );

    const uploadV1Res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/author/books',
      headers: {
        authorization: `Bearer ${authorToken}`,
        'content-type': multipartV1.contentType,
      },
      payload: multipartV1.payload,
    });
    expect(uploadV1Res.statusCode).toBe(201);
    const v1Body = uploadV1Res.json() as {
      book: { id: string; slug: string; status: string; activeVersionId: string | null };
      version: { id: string; versionNumber: number; status: string; audioDir: string | null };
    };
    expect(v1Body.book.status).toBe('DRAFT');
    expect(v1Body.book.activeVersionId).toBeNull();
    expect(v1Body.version.versionNumber).toBe(1);
    expect(v1Body.version.audioDir).toBe('books/interactive-physics-book/v1/audio');

    // Verify media Range 206 streaming works on extracted audio asset
    const rangeRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/media/stream/books/interactive-physics-book/v1/audio/spread_0.mp3',
      headers: { range: 'bytes=0-9' },
    });
    expect(rangeRes.statusCode).toBe(206);
    expect(rangeRes.headers['content-range']).toBe(`bytes 0-9/${fakeMp3.length}`);
    expect(rangeRes.rawPayload.length).toBe(10);

    // 2. Unapproved book must NEVER appear in public library
    const publicListBefore = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books',
    });
    expect(publicListBefore.statusCode).toBe(200);
    const slugsBefore = (publicListBefore.json() as { books: Array<{ slug: string }> }).books.map(
      (b) => b.slug
    );
    expect(slugsBefore).not.toContain('interactive-physics-book');

    // 3. Author & Reviewer can preview Draft v1; unrelated learner cannot (403)
    const authorPreviewRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/author/versions/${v1Body.version.id}/preview`,
      headers: { authorization: `Bearer ${authorToken}` },
    });
    expect(authorPreviewRes.statusCode).toBe(200);

    const learnerPreviewRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/author/versions/${v1Body.version.id}/preview`,
      headers: { authorization: `Bearer ${learnerToken}` },
    });
    expect(learnerPreviewRes.statusCode).toBe(403);

    // 4. Mandatory IP Declaration check on submission
    const badSubmitRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/author/versions/${v1Body.version.id}/submit`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { ipDeclarationSigned: false },
    });
    expect(badSubmitRes.statusCode).toBe(400);
    expect((badSubmitRes.json() as { error: string }).error).toBe('IP_DECLARATION_REQUIRED');

    const submitV1Res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/author/versions/${v1Body.version.id}/submit`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { ipDeclarationSigned: true, authorNotes: 'جاهز للمراجعة العلمية' },
    });
    expect(submitV1Res.statusCode).toBe(200);

    // 5. Limited reviewer claims and requests changes, but CANNOT publish (403)
    const claimRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/moderation/versions/${v1Body.version.id}/claim`,
      headers: { authorization: `Bearer ${limitedReviewerToken}` },
    });
    expect(claimRes.statusCode).toBe(200);

    const unauthorizedPublishRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/moderation/versions/${v1Body.version.id}/decision`,
      headers: { authorization: `Bearer ${limitedReviewerToken}` },
      payload: {
        decision: 'APPROVE_AND_PUBLISH',
        checklist: { ip_ownership: true, content_accuracy: true, age_appropriateness: true },
        contentVerified: true,
        ipVerified: true,
      },
    });
    expect(unauthorizedPublishRes.statusCode).toBe(403);

    const requestChangesRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/moderation/versions/${v1Body.version.id}/decision`,
      headers: { authorization: `Bearer ${limitedReviewerToken}` },
      payload: {
        decision: 'REQUEST_CHANGES',
        checklist: { ip_ownership: true },
        contentVerified: false,
        ipVerified: true,
        notes: 'يرجى تدقيق أمثلة الفصل الأول وإعادة الإرسال.',
      },
    });
    expect(requestChangesRes.statusCode).toBe(200);
    expect((requestChangesRes.json() as { version: { status: string } }).version.status).toBe(
      'CHANGES_REQUESTED'
    );

    // Author resubmits v1
    const resubmitV1Res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/author/versions/${v1Body.version.id}/submit`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { ipDeclarationSigned: true },
    });
    expect(resubmitV1Res.statusCode).toBe(200);

    // 6. CONTENT_REVIEWER checks dynamic checklist, cannot publish incomplete checklist, then publishes
    const checklistRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/moderation/checklist',
      headers: { authorization: `Bearer ${reviewerToken}` },
    });
    expect(checklistRes.statusCode).toBe(200);
    const checklistItems = (
      checklistRes.json() as { items: Array<{ id: string; required: boolean }> }
    ).items;

    const incompleteApproveRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/moderation/versions/${v1Body.version.id}/decision`,
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: {
        decision: 'APPROVE_AND_PUBLISH',
        checklist: { ip_ownership: true },
        contentVerified: true,
        ipVerified: true,
      },
    });
    expect(incompleteApproveRes.statusCode).toBe(400);
    expect((incompleteApproveRes.json() as { error: string }).error).toBe('CHECKLIST_INCOMPLETE');

    const fullChecklist: Record<string, boolean> = {};
    for (const item of checklistItems) {
      fullChecklist[item.id] = true;
    }

    const approveV1Res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/moderation/versions/${v1Body.version.id}/decision`,
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: {
        decision: 'APPROVE_AND_PUBLISH',
        checklist: fullChecklist,
        contentVerified: true,
        ipVerified: true,
        notes: 'محتوى متكامل وموثق الملكية.',
      },
    });
    expect(approveV1Res.statusCode).toBe(200);

    // Now public library serves v1
    const editionV1Res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books/interactive-physics-book/editions-data',
    });
    expect(editionV1Res.statusCode).toBe(200);
    expect((editionV1Res.json() as { title: string }).title).toBe(
      'مختبر الفيزياء التفاعلي — الإصدار الأول'
    );

    // 7. Author uploads v2 (Markdown) NON-DESTRUCTIVELY while v1 remains active
    const mdContent = `---
title: مختبر الفيزياء التفاعلي — الإصدار الثاني المحدّث
subtitle: نسخة منقحة مع تجارب إضافية
---
# الفصل الأول: تحديثات الكهرومغناطيسية
محتوى النسخة الثانية المحدثة للعرض في المحرك ثلاثي الأبعاد.
`;
    const multipartV2 = await createMultipartRequest(
      {
        filename: 'physics-v2.md',
        content: mdContent,
        mimeType: 'text/markdown',
      },
      {
        format: 'markdown',
      }
    );

    const uploadV2Res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/author/books/interactive-physics-book/versions',
      headers: {
        authorization: `Bearer ${authorToken}`,
        'content-type': multipartV2.contentType,
      },
      payload: multipartV2.payload,
    });
    expect(uploadV2Res.statusCode).toBe(201);
    const v2Body = uploadV2Res.json() as {
      book: { activeVersionId: string };
      version: { id: string; versionNumber: number; status: string };
    };
    expect(v2Body.version.versionNumber).toBe(2);
    expect(v2Body.version.status).toBe('DRAFT');
    expect(v2Body.book.activeVersionId).toBe(v1Body.version.id);

    // Public reader STILL receives v1 while v2 is unapproved!
    const publicDuringV2Draft = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books/interactive-physics-book/editions-data',
    });
    expect(publicDuringV2Draft.statusCode).toBe(200);
    expect((publicDuringV2Draft.json() as { title: string }).title).toBe(
      'مختبر الفيزياء التفاعلي — الإصدار الأول'
    );

    // 8. Author submits v2 & Reviewer approves v2 -> atomic activeVersionId swap to v2
    const submitV2Res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/author/versions/${v2Body.version.id}/submit`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { ipDeclarationSigned: true },
    });
    expect(submitV2Res.statusCode).toBe(200);

    const approveV2Res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/moderation/versions/${v2Body.version.id}/decision`,
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: {
        decision: 'APPROVE_AND_PUBLISH',
        checklist: fullChecklist,
        contentVerified: true,
        ipVerified: true,
        notes: 'تم اعتماد الإصدار الثاني.',
      },
    });
    expect(approveV2Res.statusCode).toBe(200);

    const publicAfterV2Publish = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/books/interactive-physics-book/editions-data',
    });
    expect(publicAfterV2Publish.statusCode).toBe(200);
    expect((publicAfterV2Publish.json() as { title: string }).title).toBe(
      'مختبر الفيزياء التفاعلي — الإصدار الثاني المحدّث'
    );

    const v1Archived = await ctx.prisma.bookVersion.findUnique({
      where: { id: v1Body.version.id },
    });
    expect(v1Archived?.status).toBe('ARCHIVED');

    // Audit trail contains full moderation & author workflow actions
    const audits = await ctx.prisma.auditLog.findMany({
      where: { targetId: { in: [v1Body.version.id, v2Body.version.id] } },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'author.book_upload',
        'author.version_upload',
        'author.version_submit',
        'moderation.claim',
        'moderation.request_changes',
        'moderation.approve_and_publish',
      ])
    );
  });
});
