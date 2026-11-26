import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/apiClient';
import { usePortal } from '../lib/portalContext';
import { PUBLICATION_STATUS_META } from '../lib/statusLabels';
import type {
  ModerationChecklistItemDto,
  ModerationQueueItemDto,
} from '../lib/types';

export const ModerationPortalPage: React.FC = () => {
  const { mode, apiBase, user, hasPermission, showToast } = usePortal();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | 'PUBLISHED' | 'REJECTED'>(
    'ACTIVE'
  );
  const [checklistItems, setChecklistItems] = useState<ModerationChecklistItemDto[]>([]);
  const [queue, setQueue] = useState<ModerationQueueItemDto[]>([]);

  // حالة نموذج المراجعة لكل إصدار
  const [checksByVersion, setChecksByVersion] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [contentVerifiedMap, setContentVerifiedMap] = useState<Record<string, boolean>>({});
  const [ipVerifiedMap, setIpVerifiedMap] = useState<Record<string, boolean>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [busyVersionId, setBusyVersionId] = useState<string | null>(null);

  const canReview = hasPermission('books.review');
  const canPublish = hasPermission('books.publish');

  const loadQueue = useCallback(async () => {
    if (mode !== 'api' || !user || !canReview) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [checklistRes, queueRes] = await Promise.all([
        apiRequest<{ items: ModerationChecklistItemDto[] }>('/api/v1/moderation/checklist', {
          apiBase,
        }),
        apiRequest<{ items: ModerationQueueItemDto[] }>(
          `/api/v1/moderation/queue?status=${encodeURIComponent(statusFilter)}`,
          { apiBase }
        ),
      ]);
      setChecklistItems(checklistRes.items);
      setQueue(queueRes.items);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل طابور المراجعة');
    } finally {
      setLoading(false);
    }
  }, [mode, user, canReview, apiBase, statusFilter]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const handleClaim = async (versionId: string) => {
    setBusyVersionId(versionId);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/moderation/versions/${encodeURIComponent(versionId)}/claim`, {
        method: 'POST',
        apiBase,
        body: {},
      });
      showToast('تم استلام الإصدار وبدء المراجعة العلمية');
      await loadQueue();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'تعذر استلام المراجعة');
    } finally {
      setBusyVersionId(null);
    }
  };

  const handleDecision = async (
    versionId: string,
    decision: 'APPROVE_AND_PUBLISH' | 'REQUEST_CHANGES' | 'REJECT'
  ) => {
    setBusyVersionId(versionId);
    setErrorMsg(null);
    try {
      await apiRequest(
        `/api/v1/moderation/versions/${encodeURIComponent(versionId)}/decision`,
        {
          method: 'POST',
          apiBase,
          body: {
            decision,
            checklist: checksByVersion[versionId] ?? {},
            contentVerified: contentVerifiedMap[versionId] === true,
            ipVerified: ipVerifiedMap[versionId] === true,
            notes: notesMap[versionId]?.trim() || undefined,
          },
        }
      );

      if (decision === 'APPROVE_AND_PUBLISH') {
        showToast('تم اعتماد الإصدار وتفعيله في المكتبة مع توثيق القرار في سجل التدقيق');
      } else if (decision === 'REQUEST_CHANGES') {
        showToast('تمت إعادة الإصدار للمؤلف مع ملاحظات التعديل');
      } else {
        showToast('تم تسجيل قرار رفض الإصدار وتوثيقه');
      }

      await loadQueue();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'تعذر تنفيذ قرار المراجعة');
    } finally {
      setBusyVersionId(null);
    }
  };

  if (mode !== 'api') {
    return (
      <main className="portal-main">
        <div className="portal-card">
          <h2>🧑‍⚖️ بوابة المراجعة والاعتماد</h2>
          <p>تتطلب بوابة المراجعة الاتصال بالخادم الحي (API Mode).</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="portal-main">
        <div className="portal-card">
          <h2>🧑‍⚖️ بوابة المراجعة والاعتماد</h2>
          <p>يرجى تسجيل الدخول بحساب مراجع محتوى معتمد.</p>
          <Link to="/login" className="portal-btn primary">
            تسجيل الدخول
          </Link>
        </div>
      </main>
    );
  }

  if (!canReview) {
    return (
      <main className="portal-main">
        <div className="portal-error-box">
          <h3>⛔ صلاحيات غير كافية</h3>
          <p>حسابك لا يملك صلاحية `books.review` المخصصة للجنة المراجعة والمصادقة.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="portal-main">
      <div className="portal-hero" style={{ padding: '26px 28px', marginBottom: 24 }}>
        <span className="portal-badge">بوابة المراجعة العلمية والملكية الفكرية</span>
        <h1 style={{ fontSize: 'clamp(1.35rem, 2.5vw, 1.95rem)' }}>
          طابور مراجعة الكتب والمصادقة على النشر
        </h1>
        <p style={{ marginBottom: 12 }}>
          افحص الإصدارات المرسلة في المحرك ثلاثي الأبعاد، وتحقق من استيفاء معايير المحتوى
          والملكية الفكرية المُدارة من الإعدادات المركزية قبل اعتماد النشر في المكتبة.
        </p>

        <div className="portal-chips">
          {(
            [
              ['ACTIVE', '📥 طابور المراجعة النشط'],
              ['PUBLISHED', '🟢 الإصدارات المعتمدة'],
              ['REJECTED', '⛔ المرفوضة'],
              ['ALL', '📋 كل السجلات'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={`portal-chip ${statusFilter === val ? 'selected' : ''}`}
              onClick={() => setStatusFilter(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="portal-error-box" style={{ marginBottom: 18 }} role="alert">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="portal-card">جاري تحميل طابور المراجعة...</div>
      ) : queue.length === 0 ? (
        <div className="portal-card">
          <h3>🎉 لا توجد عناصر مطابقة لهذا الفلتر</h3>
          <p>طابور المراجعة نظيف حالياً.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {queue.map((item) => {
            const st = PUBLICATION_STATUS_META[item.status];
            const isActionable =
              item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW';
            const versionChecks = checksByVersion[item.id] ?? {};

            return (
              <article
                key={item.id}
                className="portal-card"
                data-testid={`moderationItem-${item.book.slug}-${item.versionLabel}`}
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
                      <h3 style={{ fontSize: '1.2rem' }}>
                        {item.book.title} — الإصدار {item.versionLabel}
                      </h3>
                      <span
                        className="portal-mode-pill"
                        style={{
                          background: st.bg,
                          color: st.color,
                          borderColor: st.border,
                        }}
                      >
                        {st.labelAr}
                      </span>
                      {item.ipDeclarationSigned ? (
                        <span className="portal-mode-pill" style={{ color: '#4ade80' }}>
                          ⚖️ إقرار المؤلف موقّع
                        </span>
                      ) : (
                        <span className="portal-mode-pill" style={{ color: '#f87171' }}>
                          ⚠️ إقرار غير موقع
                        </span>
                      )}
                    </div>

                    <p style={{ marginTop: 4 }}>
                      المؤلف: {item.book.author?.fullName ?? 'غير محدد'} (
                      {item.book.author?.email ?? '-'}) • المعرف:{' '}
                      <code dir="ltr">{item.book.slug}</code> • الصيغة: {item.sourceFormat} •{' '}
                      {item.chaptersCount} فصول / {item.spreadsCount} نشرات
                    </p>

                    {item.book.activeVersion && (
                      <p style={{ color: '#38bdf8', fontSize: '0.86rem', marginTop: 4 }}>
                        🔄 تحديث غير هدّام: الكتاب منشور حالياً بالإصدار{' '}
                        <strong>{item.book.activeVersion.versionLabel}</strong>، وسيستبدله هذا
                        الإصدار ذرياً فور الاعتماد.
                      </p>
                    )}

                    <div className="portal-chips" style={{ marginTop: 6 }}>
                      {item.book.taxonomies.map((t) => (
                        <span key={t.id} className="portal-mode-pill">
                          {t.labelAr}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link
                      to={`/read/${item.book.slug}?versionId=${encodeURIComponent(item.id)}`}
                      className="portal-btn accent"
                      data-testid={`reviewPreviewBtn-${item.book.slug}-${item.versionLabel}`}
                    >
                      👁️ معاينة في القارئ 3D
                    </Link>
                    {item.status === 'SUBMITTED' && (
                      <button
                        type="button"
                        className="portal-btn"
                        disabled={busyVersionId === item.id}
                        onClick={() => void handleClaim(item.id)}
                        data-testid={`claimBtn-${item.id}`}
                      >
                        📥 استلام للمراجعة
                      </button>
                    )}
                  </div>
                </div>

                {item.latestTicket?.notes && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--portal-border)',
                      background: 'rgba(15, 23, 42, 0.28)',
                      fontSize: '0.88rem',
                    }}
                  >
                    <strong>آخر ملاحظة في التذكرة:</strong> {item.latestTicket.notes}
                  </div>
                )}

                {isActionable && (
                  <div
                    style={{
                      borderTop: '1px solid var(--portal-border)',
                      paddingTop: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <strong style={{ color: 'var(--brand-primary)' }}>
                      قائمة التحقق الديناميكية للمراجعة (من الإعدادات المركزية):
                    </strong>

                    {checklistItems.map((chk) => (
                      <label
                        key={chk.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          fontSize: '0.92rem',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={versionChecks[chk.id] === true}
                          onChange={(e) =>
                            setChecksByVersion((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...(prev[item.id] ?? {}),
                                [chk.id]: e.target.checked,
                              },
                            }))
                          }
                          data-testid={`checklist-${item.id}-${chk.id}`}
                        />
                        <span>{chk.labelAr}</span>
                        {chk.required && (
                          <span className="portal-mode-pill" style={{ fontSize: '0.72rem' }}>
                            إلزامي
                          </span>
                        )}
                      </label>
                    ))}

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: 10,
                        padding: 10,
                        borderRadius: 10,
                        background: 'rgba(34, 197, 94, 0.06)',
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={contentVerifiedMap[item.id] === true}
                          onChange={(e) =>
                            setContentVerifiedMap((prev) => ({
                              ...prev,
                              [item.id]: e.target.checked,
                            }))
                          }
                          data-testid={`contentVerified-${item.id}`}
                        />
                        <span>تأكيد سلامة المحتوى العلمي والأدبي</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={ipVerifiedMap[item.id] === true}
                          onChange={(e) =>
                            setIpVerifiedMap((prev) => ({
                              ...prev,
                              [item.id]: e.target.checked,
                            }))
                          }
                          data-testid={`ipVerified-${item.id}`}
                        />
                        <span>تأكيد سلامة حقوق الملكية الفكرية</span>
                      </label>
                    </div>

                    <div className="portal-field">
                      <label htmlFor={`notes-${item.id}`}>
                        ملاحظات المراجع (إلزامية عند طلب التعديل أو الرفض):
                      </label>
                      <textarea
                        id={`notes-${item.id}`}
                        className="portal-textarea"
                        rows={2}
                        value={notesMap[item.id] ?? ''}
                        onChange={(e) =>
                          setNotesMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder="اكتب قرار التقييم أو التعديلات المطلوبة للمؤلف..."
                        data-testid={`moderationNotes-${item.id}`}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {canPublish && (
                        <button
                          type="button"
                          className="portal-btn primary"
                          disabled={busyVersionId === item.id}
                          onClick={() => void handleDecision(item.id, 'APPROVE_AND_PUBLISH')}
                          data-testid={`approvePublishBtn-${item.id}`}
                        >
                          ✅ اعتماد وتفعيل النشر
                        </button>
                      )}
                      <button
                        type="button"
                        className="portal-btn"
                        disabled={busyVersionId === item.id}
                        onClick={() => void handleDecision(item.id, 'REQUEST_CHANGES')}
                        data-testid={`requestChangesBtn-${item.id}`}
                      >
                        📝 طلب تعديلات
                      </button>
                      <button
                        type="button"
                        className="portal-btn danger"
                        disabled={busyVersionId === item.id}
                        onClick={() => void handleDecision(item.id, 'REJECT')}
                        data-testid={`rejectBtn-${item.id}`}
                      >
                        ⛔ رفض الإصدار
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
};
