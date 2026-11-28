import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  apiRequest,
  apiUploadFormData,
  resolveApiAssetUrl,
} from '../lib/apiClient';
import { usePortal } from '../lib/portalContext';
import {
  getFormatLabelAr,
  getReviewDecisionLabelAr,
  getTaxonomyGroupLabelAr,
  slugifyArabicToSlug,
} from '../lib/arabicLabels';
import { PUBLICATION_STATUS_META } from '../lib/statusLabels';
import type {
  AuthorBookDto,
  OfficialTemplateInfoDto,
  TaxonomyItem,
} from '../lib/types';

export const AuthorPortalPage: React.FC = () => {
  const { mode, apiBase, user, taxonomies, hasPermission, showToast } = usePortal();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [templateInfo, setTemplateInfo] = useState<OfficialTemplateInfoDto | null>(null);
  const [books, setBooks] = useState<AuthorBookDto[]>([]);

  // نموذج الرفع
  const [uploadMode, setUploadMode] = useState<'new' | 'version'>('new');
  const [targetSlug, setTargetSlug] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [subtitleInput, setSubtitleInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [formatInput, setFormatInput] = useState('');
  const [directionInput, setDirectionInput] = useState<'rtl' | 'ltr'>('rtl');
  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // حالة إقرار الملكية لكل إصدار عند الإرسال
  const [ipCheckedMap, setIpCheckedMap] = useState<Record<string, boolean>>({});
  const [authorNotesMap, setAuthorNotesMap] = useState<Record<string, string>>({});
  const [submittingVersionId, setSubmittingVersionId] = useState<string | null>(null);

  const canCreate = hasPermission('books.create');

  const loadData = useCallback(async () => {
    if (mode !== 'api' || !user || !canCreate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [tplRes, booksRes] = await Promise.all([
        apiRequest<OfficialTemplateInfoDto>('/api/v1/templates/official', { apiBase }),
        apiRequest<{ books: AuthorBookDto[] }>('/api/v1/author/books', { apiBase }),
      ]);
      setTemplateInfo(tplRes);
      setBooks(booksRes.books);
      if (booksRes.books.length > 0 && !targetSlug) {
        setTargetSlug(booksRes.books[0]!.slug);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل بيانات بوابة المؤلف');
    } finally {
      setLoading(false);
    }
  }, [mode, user, canCreate, apiBase, targetSlug]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const groupedTaxonomies = useMemo(() => {
    if (Object.keys(taxonomies).length > 0) {
      return taxonomies;
    }
    const map: Record<string, TaxonomyItem[]> = {};
    for (const item of templateInfo?.activeTaxonomies ?? []) {
      if (!map[item.group]) map[item.group] = [];
      map[item.group]!.push(item);
    }
    return map;
  }, [taxonomies, templateInfo]);

  const acceptedExtensions = useMemo(() => {
    if (!templateInfo) return '.zip,.json,.md,.markdown,.docx,.epub';
    const exts = templateInfo.formats.flatMap((f) => f.extensions);
    return Array.from(new Set(exts)).join(',');
  }, [templateInfo]);

  const toggleTaxonomy = (id: string) => {
    setSelectedTaxIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const effectiveAuthorSlug = slugTouched
    ? slugInput.trim()
    : slugifyArabicToSlug(titleInput, 'book');

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('يرجى اختيار ملف الكتاب بإحدى الصيغ المعتمدة');
      return;
    }
    if (uploadMode === 'version' && !targetSlug) {
      setErrorMsg('يرجى اختيار الكتاب المستهدف لرفع إصدار جديد عليه');
      return;
    }

    setUploading(true);
    setErrorMsg(null);
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      if (formatInput) form.append('format', formatInput);
      if (titleInput.trim()) form.append('title', titleInput.trim());
      if (subtitleInput.trim()) form.append('subtitle', subtitleInput.trim());

      if (uploadMode === 'new') {
        if (effectiveAuthorSlug) form.append('slug', effectiveAuthorSlug);
        if (descriptionInput.trim()) form.append('description', descriptionInput.trim());
        form.append('direction', directionInput);
        if (selectedTaxIds.length > 0) {
          form.append('taxonomyIds', JSON.stringify(selectedTaxIds));
        }
        const res = await apiUploadFormData<{
          book: { slug: string; title: string };
          version: { versionLabel: string };
        }>('/api/v1/author/books', form, { apiBase });
        showToast(
          `تم تحويل ورفع "${res.book.title}" (${res.version.versionLabel}) كمسودة للمعاينة`
        );
      } else {
        const res = await apiUploadFormData<{
          book: { slug: string; title: string };
          version: { versionLabel: string };
        }>(`/api/v1/author/books/${encodeURIComponent(targetSlug)}/versions`, form, {
          apiBase,
        });
        showToast(
          `تم رفع الإصدار الجديد ${res.version.versionLabel} دون المساس بالنسخة المنشورة حالياً`
        );
      }

      setSelectedFile(null);
      setTitleInput('');
      setSubtitleInput('');
      setDescriptionInput('');
      setSlugInput('');
      setSlugTouched(false);
      const fileEl = document.getElementById('authorBookFileInput') as HTMLInputElement | null;
      if (fileEl) fileEl.value = '';
      await loadData();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'تعذر تحويل الملف المرفوع إلى تنسيق منصة درب'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitForReview = async (versionId: string) => {
    const signed = ipCheckedMap[versionId] === true;
    if (!signed) {
      setErrorMsg(
        'يجب الموافقة على إقرار الملكية الفكرية وحقوق النشر وتحديد مربع التأكيد قبل إرسال الإصدار للمراجعة.'
      );
      return;
    }

    setSubmittingVersionId(versionId);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/author/versions/${encodeURIComponent(versionId)}/submit`, {
        method: 'POST',
        apiBase,
        body: {
          ipDeclarationSigned: true,
          authorNotes: authorNotesMap[versionId]?.trim() || undefined,
        },
      });
      showToast('تم توقيع إقرار الملكية الفكرية وإرسال الإصدار إلى طابور المراجعة بنجاح');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'تعذر إرسال الإصدار للمراجعة');
    } finally {
      setSubmittingVersionId(null);
    }
  };

  if (mode !== 'api') {
    return (
      <main className="portal-main">
        <div className="portal-card">
          <h2>✍️ بوابة المؤلف</h2>
          <p>تتطلب بوابة المؤلف ورفع الكتب وإدارة الإصدارات الاتصال بالخادم الحي للمنصة.</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="portal-main">
        <div className="portal-card">
          <h2>✍️ بوابة المؤلف والنشر</h2>
          <p>يرجى تسجيل الدخول بحساب يملك صلاحية إنشاء الكتب للوصول إلى بوابة المؤلف.</p>
          <div>
            <Link to="/login" className="portal-btn primary">
              تسجيل الدخول
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!canCreate) {
    return (
      <main className="portal-main">
        <div className="portal-error-box">
          <h3>⛔ صلاحيات غير كافية</h3>
          <p>حسابك الحالي لا يملك صلاحية إنشاء الكتب ورفع الإصدارات المخصصة للمؤلفين ومنشئي المحتوى.</p>
        </div>
      </main>
    );
  }

  const downloadHref = templateInfo
    ? resolveApiAssetUrl(templateInfo.downloadPath, apiBase)
    : '#';

  return (
    <main className="portal-main">
      <div className="portal-hero" style={{ padding: '26px 28px', marginBottom: 24 }}>
        <span className="portal-badge">بوابة المؤلف — النشر متعدد الإصدارات</span>
        <h1 style={{ fontSize: 'clamp(1.35rem, 2.5vw, 1.95rem)' }}>
          تأليف الكتب التفاعلية ورفع الإصدارات غير الهدامة
        </h1>
        <p style={{ marginBottom: 14 }}>
          حمّل القالب القياسي المحدّث من إدارة المنصة، أو ارفع كتابك بالصيغ المعتمدة لتحويله
          آلياً ومعاينته داخل المحرك ثلاثي الأبعاد قبل إرساله للمراجعة.
        </p>

        {templateInfo && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <a
              href={downloadHref}
              download
              className="portal-btn primary"
              data-testid="downloadOfficialTemplateBtn"
            >
              ⬇️ تحميل القالب القياسي الرسمي (الإصدار {templateInfo.template.version})
            </a>
            <span className="portal-mode-pill">
              الصيغ المسموحة:{' '}
              {templateInfo.uploadsPolicy.allowedFormats
                .map((f) => getFormatLabelAr(f))
                .join(' • ')}{' '}
              | الحد الأقصى: {templateInfo.uploadsPolicy.maxFileSizeMb} ميجابايت
            </span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="portal-error-box" style={{ marginBottom: 18 }} role="alert">
          {errorMsg}
        </div>
      )}

      {templateInfo && (
        <section className="portal-section" style={{ marginBottom: 24 }}>
          <div className="portal-card">
            <h3>📋 إرشادات القالب القياسي ({templateInfo.template.title})</h3>
            <p>{templateInfo.template.guideMarkdown}</p>
            <div className="portal-chips">
              {templateInfo.formats.map((fmt) => (
                <span key={fmt.formatId} className="portal-mode-pill" title={fmt.descriptionAr}>
                  {fmt.labelAr}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="portal-section" id="authorUploadSection">
        <div className="portal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--brand-primary)' }}>
              📤 رفع وتحويل كتاب أو إصدار جديد
            </h2>
            <div className="portal-chips">
              <button
                type="button"
                className={`portal-chip ${uploadMode === 'new' ? 'selected' : ''}`}
                onClick={() => setUploadMode('new')}
                data-testid="modeNewBookBtn"
              >
                + كتاب جديد
              </button>
              <button
                type="button"
                className={`portal-chip ${uploadMode === 'version' ? 'selected' : ''}`}
                onClick={() => setUploadMode('version')}
                disabled={books.length === 0}
                data-testid="modeNewVersionBtn"
              >
                🔄 إصدار جديد لكتاب قائم ({books.length})
              </button>
            </div>
          </div>

          <form className="portal-form" onSubmit={(e) => void handleUploadSubmit(e)}>
            {uploadMode === 'version' ? (
              <div className="portal-field">
                <label htmlFor="targetBookSlugSelect">اختر الكتاب القائم لإضافة إصدار جديد:</label>
                <select
                  id="targetBookSlugSelect"
                  className="portal-select"
                  value={targetSlug}
                  onChange={(e) => setTargetSlug(e.target.value)}
                  data-testid="targetBookSlugSelect"
                >
                  {books.map((b) => (
                    <option key={b.id} value={b.slug}>
                      {b.title} — {b.activeVersion ? `المنشور حالياً: ${b.activeVersion.versionLabel}` : 'غير منشور بعد'}
                    </option>
                  ))}
                </select>
                <small style={{ color: 'var(--portal-muted)' }}>
                  نظام الإصدارات غير الهدام: سيُحفظ التحديث كمسودة جديدة دون تعطيل الإصدار المنشور حالياً للقراء.
                </small>
              </div>
            ) : (
              <div className="portal-field" style={{ maxWidth: 320 }}>
                <label htmlFor="bookDirectionSelect">اتجاه القراءة الافتراضي:</label>
                <select
                  id="bookDirectionSelect"
                  className="portal-select"
                  value={directionInput}
                  onChange={(e) => setDirectionInput(e.target.value as 'rtl' | 'ltr')}
                >
                  <option value="rtl">عربي من اليمين لليسار</option>
                  <option value="ltr">لاتيني من اليسار لليمين</option>
                </select>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <div className="portal-field">
                <label htmlFor="bookTitleInput">عنوان الكتاب (اختياري عند وجوده بالملف):</label>
                <input
                  id="bookTitleInput"
                  className="portal-input"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="مثال: رحلة في علم الفيزياء التفاعلية"
                  data-testid="authorTitleInput"
                />
              </div>
              <div className="portal-field">
                <label htmlFor="bookSubtitleInput">العنوان الفرعي (اختياري):</label>
                <input
                  id="bookSubtitleInput"
                  className="portal-input"
                  value={subtitleInput}
                  onChange={(e) => setSubtitleInput(e.target.value)}
                  placeholder="سلسلة المناهج الذكية"
                />
              </div>
              <div className="portal-field">
                <label htmlFor="bookFormatSelect">تحديد نوع الملف المحوَّل:</label>
                <select
                  id="bookFormatSelect"
                  className="portal-select"
                  value={formatInput}
                  onChange={(e) => setFormatInput(e.target.value)}
                  data-testid="authorFormatSelect"
                >
                  <option value="">تحديد تلقائي حسب امتداد الملف</option>
                  {(templateInfo?.formats ?? []).map((fmt) => (
                    <option key={fmt.formatId} value={fmt.formatId}>
                      {fmt.labelAr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {uploadMode === 'new' && (
              <>
                <div className="portal-field">
                  <label htmlFor="bookDescriptionInput">وصف مختصر للمكتبة (اختياري):</label>
                  <textarea
                    id="bookDescriptionInput"
                    className="portal-textarea"
                    rows={2}
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="وصف موجز يساعد المتعلمين على اختيار الكتاب..."
                  />
                </div>

                <div className="portal-field">
                  <label>التصنيفات والمجالات المرتبطة:</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(groupedTaxonomies).map(([group, items]) => (
                      <div key={group}>
                        <div
                          style={{
                            fontSize: '0.82rem',
                            color: 'var(--portal-muted)',
                            marginBottom: 4,
                          }}
                        >
                          {getTaxonomyGroupLabelAr(group)}
                        </div>
                        <div className="portal-chips">
                          {items
                            .filter((t) => t.isActive)
                            .map((tax) => (
                              <button
                                key={tax.id}
                                type="button"
                                className={`portal-chip ${
                                  selectedTaxIds.includes(tax.id) ? 'selected' : ''
                                }`}
                                onClick={() => toggleTaxonomy(tax.id)}
                              >
                                {tax.labelAr}
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <details className="portal-advanced-details">
                  <summary>إعدادات تقنية متقدمة (توليد رابط الكتاب تلقائياً)</summary>
                  <div className="portal-field">
                    <label htmlFor="bookSlugInput">المعرف اللاتيني للكتاب (اختياري):</label>
                    <input
                      id="bookSlugInput"
                      className="portal-input"
                      value={effectiveAuthorSlug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlugInput(e.target.value);
                      }}
                      placeholder="my-interactive-science-book"
                      dir="ltr"
                    />
                  </div>
                </details>
              </>
            )}

            <div className="portal-field">
              <label htmlFor="authorBookFileInput">
                ملف الكتاب المطلوب تحويله:
              </label>
              <input
                id="authorBookFileInput"
                type="file"
                accept={acceptedExtensions}
                className="portal-input"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                data-testid="authorBookFileInput"
              />
            </div>

            <div>
              <button
                type="submit"
                className="portal-btn primary"
                disabled={uploading}
                data-testid="authorUploadSubmitBtn"
              >
                {uploading
                  ? '⏳ جاري التحويل وبناء صفحات الكتاب...'
                  : uploadMode === 'new'
                    ? '🚀 رفع وتحويل إلى مسودة كتاب'
                    : '🔄 رفع وتحويل كإصدار جديد غير هدّام'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="portal-section">
        <div className="portal-section-title">
          <span>📚 كتبي وإصداراتها ({books.length})</span>
          <button type="button" className="portal-btn" onClick={() => void loadData()}>
            🔄 تحديث القائمة
          </button>
        </div>

        {loading ? (
          <div className="portal-card">جاري تحميل أعمال المؤلف...</div>
        ) : books.length === 0 ? (
          <div className="portal-card">
            <p>لم ترفع أي كتاب بعد. حمّل القالب القياسي أعلاه أو ارفع ملف كتابك للبدء.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {books.map((book) => {
              const bookStatusMeta = PUBLICATION_STATUS_META[book.status];
              return (
                <article
                  key={book.id}
                  className="portal-card"
                  data-testid={`authorBookCard-${book.slug}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.2rem' }}>{book.title}</h3>
                        <span
                          className="portal-mode-pill"
                          style={{
                            background: bookStatusMeta.bg,
                            color: bookStatusMeta.color,
                            borderColor: bookStatusMeta.border,
                          }}
                        >
                          {bookStatusMeta.labelAr}
                        </span>
                        {book.activeVersion && (
                          <span className="portal-mode-pill" style={{ color: '#4ade80' }}>
                            🟢 النشط للقراء: {book.activeVersion.versionLabel}
                          </span>
                        )}
                      </div>
                      {book.subtitle && <p style={{ marginTop: 4 }}>{book.subtitle}</p>}
                      <div className="portal-chips" style={{ marginTop: 6 }}>
                        {book.taxonomies.map((t) => (
                          <span key={t.id} className="portal-mode-pill">
                            {t.labelAr}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="portal-btn accent"
                      onClick={() => {
                        setUploadMode('version');
                        setTargetSlug(book.slug);
                        document
                          .getElementById('authorUploadSection')
                          ?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      data-testid={`newVersionBtn-${book.slug}`}
                    >
                      + رفع إصدار جديد
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      marginTop: 8,
                      borderTop: '1px solid var(--portal-border)',
                      paddingTop: 12,
                    }}
                  >
                    {book.versions.map((ver) => {
                      const verStatus = PUBLICATION_STATUS_META[ver.status];
                      const canSubmit =
                        ver.status === 'DRAFT' || ver.status === 'CHANGES_REQUESTED';

                      return (
                        <div
                          key={ver.id}
                          style={{
                            border: '1px solid var(--portal-border)',
                            borderRadius: 12,
                            padding: 14,
                            background: 'rgba(15, 23, 42, 0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                          }}
                          data-testid={`versionRow-${book.slug}-${ver.versionLabel}`}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: 8,
                            }}
                          >
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <strong>الإصدار {ver.versionLabel}</strong>
                              <span
                                className="portal-mode-pill"
                                style={{
                                  background: verStatus.bg,
                                  color: verStatus.color,
                                  borderColor: verStatus.border,
                                }}
                              >
                                {verStatus.labelAr}
                              </span>
                              <span className="portal-mode-pill">
                                الصيغة: {getFormatLabelAr(ver.sourceFormat)} • {ver.chaptersCount} فصول • {ver.spreadsCount}{' '}
                                نشرات
                                {ver.audioTracksCount > 0 ? ` • 🎙️ ${ver.audioTracksCount}` : ''}
                                {ver.videosCount > 0 ? ` • 🎬 ${ver.videosCount}` : ''}
                              </span>
                              {ver.ipDeclarationSigned && (
                                <span className="portal-mode-pill" style={{ color: '#4ade80' }}>
                                  ⚖️ إقرار الملكية موقّع
                                </span>
                              )}
                            </div>

                            <Link
                              to={`/read/${book.slug}?versionId=${encodeURIComponent(ver.id)}`}
                              className="portal-btn"
                              data-testid={`previewVersionBtn-${book.slug}-${ver.versionLabel}`}
                            >
                              👁️ معاينة ثلاثية الأبعاد
                            </Link>
                          </div>

                          {ver.latestTicket?.notes && (
                            <div
                              style={{
                                padding: '8px 12px',
                                borderRadius: 10,
                                border: '1px solid rgba(250, 204, 21, 0.35)',
                                background: 'rgba(250, 204, 21, 0.08)',
                                fontSize: '0.88rem',
                              }}
                            >
                              <strong>ملاحظات المراجعة ({getReviewDecisionLabelAr(ver.latestTicket.decision)}):</strong>{' '}
                              {ver.latestTicket.notes}
                            </div>
                          )}

                          {canSubmit && (
                            <div
                              style={{
                                padding: 12,
                                borderRadius: 10,
                                border: '1px solid var(--portal-border)',
                                background: 'rgba(212, 175, 55, 0.06)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                              }}
                            >
                              <label
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 8,
                                  cursor: 'pointer',
                                  fontSize: '0.9rem',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={ipCheckedMap[ver.id] === true}
                                  onChange={(e) =>
                                    setIpCheckedMap((prev) => ({
                                      ...prev,
                                      [ver.id]: e.target.checked,
                                    }))
                                  }
                                  data-testid={`ipDeclarationCheckbox-${ver.id}`}
                                />
                                <span>
                                  <strong>إقرار إلزامي بالملكية الفكرية وحقوق النشر:</strong> أقرّ بأنني
                                  المؤلف الأصلي أو المصرّح له قانونياً بنشر هذا العمل والوسائط المرفقة
                                  به على منصة درب، وأتحمل كامل المسؤولية عن خلوّه من أي انتهاك لحقوق
                                  الملكية الفكرية للغير.
                                </span>
                              </label>

                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  className="portal-input"
                                  style={{ flex: 1, minWidth: 220 }}
                                  placeholder="ملاحظة للمراجع العلمي (اختياري)..."
                                  value={authorNotesMap[ver.id] ?? ''}
                                  onChange={(e) =>
                                    setAuthorNotesMap((prev) => ({
                                      ...prev,
                                      [ver.id]: e.target.value,
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="portal-btn primary"
                                  disabled={submittingVersionId === ver.id}
                                  onClick={() => void handleSubmitForReview(ver.id)}
                                  data-testid={`submitForReviewBtn-${ver.id}`}
                                >
                                  {submittingVersionId === ver.id
                                    ? '⏳ جاري الإرسال...'
                                    : '📨 توقيع وإرسال للمراجعة'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};
