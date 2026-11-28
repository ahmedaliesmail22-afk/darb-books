import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../lib/apiClient';
import {
  getCmsSectionLabelAr,
  NEWS_STATUS_LABELS,
  slugifyArabicToSlug,
  slugifyArabicToSnakeKey,
} from '../lib/arabicLabels';
import { usePortal } from '../lib/portalContext';
import type { CmsPageItem, CmsSectionItem, NewsPostItem } from '../lib/types';

interface FeatureItemDraft {
  icon: string;
  title: string;
  desc: string;
}

interface StepItemDraft {
  step: number;
  title: string;
  desc: string;
}

interface FooterLinkDraft {
  label: string;
  href: string;
}

interface CustomCardDraft {
  icon: string;
  title: string;
  desc: string;
}

interface VisualSectionDraft {
  // الترحيب الرئيسي
  badge: string;
  subtitle: string;
  primaryCtaText: string;
  primaryCtaHref: string;
  secondaryCtaText: string;
  secondaryCtaHref: string;
  // المميزات
  features: FeatureItemDraft[];
  // القدرات
  highlights: string[];
  // خطوات العمل
  steps: StepItemDraft[];
  // عدد العناصر للكتب والأخبار
  limit: number;
  // التذييل
  copyright: string;
  footerLinks: FooterLinkDraft[];
  // الأقسام المخصصة
  body: string;
  ctaText: string;
  ctaHref: string;
  cards: CustomCardDraft[];
  // الحفاظ على أي حقول إضافية غير مرئية
  extraFields: Record<string, unknown>;
}

const KNOWN_VISUAL_KEYS = new Set([
  'badge',
  'subtitle',
  'primaryCtaText',
  'primaryCtaHref',
  'secondaryCtaText',
  'secondaryCtaHref',
  'items',
  'highlights',
  'steps',
  'limit',
  'copyright',
  'links',
  'body',
  'ctaText',
  'ctaHref',
  'cards',
]);

function buildDraftFromContent(sectionKey: string, raw: Record<string, unknown>): VisualSectionDraft {
  const extraFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN_VISUAL_KEYS.has(k)) {
      extraFields[k] = v;
    }
  }

  const rawItems = Array.isArray(raw.items) ? (raw.items as Array<Record<string, unknown>>) : [];
  const rawCards = Array.isArray(raw.cards) ? (raw.cards as Array<Record<string, unknown>>) : [];
  const rawSteps = Array.isArray(raw.steps) ? (raw.steps as Array<Record<string, unknown>>) : [];
  const rawLinks = Array.isArray(raw.links) ? (raw.links as Array<Record<string, unknown>>) : [];
  const rawHighlights = Array.isArray(raw.highlights)
    ? raw.highlights.map((x) => String(x ?? ''))
    : [];

  return {
    badge: typeof raw.badge === 'string' ? raw.badge : '',
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
    primaryCtaText: typeof raw.primaryCtaText === 'string' ? raw.primaryCtaText : '',
    primaryCtaHref: typeof raw.primaryCtaHref === 'string' ? raw.primaryCtaHref : '/library',
    secondaryCtaText: typeof raw.secondaryCtaText === 'string' ? raw.secondaryCtaText : '',
    secondaryCtaHref: typeof raw.secondaryCtaHref === 'string' ? raw.secondaryCtaHref : '/guide',
    features: rawItems.map((it) => ({
      icon: typeof it.icon === 'string' ? it.icon : '✨',
      title: typeof it.title === 'string' ? it.title : '',
      desc: typeof it.desc === 'string' ? it.desc : '',
    })),
    highlights: rawHighlights,
    steps: rawSteps.map((st, idx) => ({
      step: typeof st.step === 'number' ? st.step : idx + 1,
      title: typeof st.title === 'string' ? st.title : '',
      desc: typeof st.desc === 'string' ? st.desc : '',
    })),
    limit:
      typeof raw.limit === 'number'
        ? raw.limit
        : sectionKey === 'news_preview'
          ? 3
          : 6,
    copyright: typeof raw.copyright === 'string' ? raw.copyright : '',
    footerLinks: rawLinks.map((lnk) => ({
      label: typeof lnk.label === 'string' ? lnk.label : '',
      href: typeof lnk.href === 'string' ? lnk.href : '/library',
    })),
    body: typeof raw.body === 'string' ? raw.body : '',
    ctaText: typeof raw.ctaText === 'string' ? raw.ctaText : '',
    ctaHref: typeof raw.ctaHref === 'string' ? raw.ctaHref : '/library',
    cards: rawCards.map((c) => ({
      icon: typeof c.icon === 'string' ? c.icon : '📌',
      title: typeof c.title === 'string' ? c.title : '',
      desc: typeof c.desc === 'string' ? c.desc : '',
    })),
    extraFields,
  };
}

function serializeDraftToContent(sectionKey: string, draft: VisualSectionDraft): Record<string, unknown> {
  const base = { ...draft.extraFields };

  if (sectionKey === 'hero') {
    return {
      ...base,
      badge: draft.badge.trim(),
      subtitle: draft.subtitle.trim(),
      primaryCtaText: draft.primaryCtaText.trim(),
      primaryCtaHref: draft.primaryCtaHref.trim() || '/library',
      ...(draft.secondaryCtaText.trim()
        ? {
            secondaryCtaText: draft.secondaryCtaText.trim(),
            secondaryCtaHref: draft.secondaryCtaHref.trim() || '/guide',
          }
        : {}),
    };
  }

  if (sectionKey === 'features') {
    return {
      ...base,
      items: draft.features
        .filter((f) => f.title.trim() || f.desc.trim())
        .map((f) => ({
          icon: f.icon.trim() || '✨',
          title: f.title.trim(),
          desc: f.desc.trim(),
        })),
    };
  }

  if (sectionKey === 'capabilities') {
    return {
      ...base,
      highlights: draft.highlights.map((h) => h.trim()).filter(Boolean),
    };
  }

  if (sectionKey === 'how_it_works') {
    return {
      ...base,
      steps: draft.steps
        .filter((s) => s.title.trim() || s.desc.trim())
        .map((s, idx) => ({
          step: idx + 1,
          title: s.title.trim(),
          desc: s.desc.trim(),
        })),
    };
  }

  if (sectionKey === 'featured_books') {
    return {
      ...base,
      limit: Math.max(1, Math.min(24, Number(draft.limit) || 6)),
      source: typeof base.source === 'string' ? base.source : 'dynamic_catalog',
    };
  }

  if (sectionKey === 'news_preview') {
    return {
      ...base,
      limit: Math.max(1, Math.min(12, Number(draft.limit) || 3)),
    };
  }

  if (sectionKey === 'footer') {
    return {
      ...base,
      copyright: draft.copyright.trim(),
      links: draft.footerLinks
        .filter((l) => l.label.trim() && l.href.trim())
        .map((l) => ({ label: l.label.trim(), href: l.href.trim() })),
    };
  }

  const cleanCards = draft.cards
    .filter((c) => c.title.trim() || c.desc.trim())
    .map((c) => ({
      icon: c.icon.trim() || '📌',
      title: c.title.trim(),
      desc: c.desc.trim(),
    }));

  return {
    ...base,
    ...(draft.subtitle.trim() ? { subtitle: draft.subtitle.trim() } : {}),
    ...(draft.body.trim() ? { body: draft.body.trim() } : {}),
    ...(draft.ctaText.trim()
      ? {
          ctaText: draft.ctaText.trim(),
          ctaHref: draft.ctaHref.trim() || '/library',
        }
      : {}),
    ...(cleanCards.length > 0 ? { cards: cleanCards } : {}),
  };
}

function moveArrayItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= list.length) return list;
  const copy = [...list];
  const [moved] = copy.splice(index, 1);
  copy.splice(nextIndex, 0, moved!);
  return copy;
}

export const CmsAndNewsManager: React.FC = () => {
  const { apiBase, hasPermission, refreshPortal, showToast } = usePortal();
  const canCms = hasPermission('cms.manage');
  const canNews = hasPermission('news.manage');

  const [sections, setSections] = useState<CmsSectionItem[]>([]);
  const [news, setNews] = useState<NewsPostItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [titleAr, setTitleAr] = useState('');
  const [sortOrder, setSortOrder] = useState(1);
  const [isVisible, setIsVisible] = useState(true);
  const [sectionDraft, setSectionDraft] = useState<VisualSectionDraft>(() =>
    buildDraftFromContent('hero', {})
  );

  // إضافة قسم مخصص جديد
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionSubtitle, setNewSectionSubtitle] = useState('');
  const [newSectionBody, setNewSectionBody] = useState('');
  const [newSectionCards, setNewSectionCards] = useState<CustomCardDraft[]>([]);
  const [newSectionKeyOverride, setNewSectionKeyOverride] = useState('');
  const [newSectionKeyTouched, setNewSectionKeyTouched] = useState(false);

  // نشر خبر جديد
  const [newsTitle, setNewsTitle] = useState('');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsBody, setNewsBody] = useState('');
  const [newsSlugOverride, setNewsSlugOverride] = useState('');
  const [newsSlugTouched, setNewsSlugTouched] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      if (canCms) {
        const res = await apiRequest<{ pages: CmsPageItem[] }>('/api/v1/cms/pages', { apiBase });
        const home = res.pages.find((p) => p.slug === 'home');
        setSections(home?.sections ?? []);
      }
      if (canNews) {
        const newsRes = await apiRequest<{ posts: NewsPostItem[] }>('/api/v1/news', { apiBase });
        setNews(newsRes.posts);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات المحتوى');
    }
  }, [apiBase, canCms, canNews]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const startEditSection = (sec: CmsSectionItem) => {
    setEditingKey(sec.sectionKey);
    setTitleAr(sec.titleAr);
    setSortOrder(sec.sortOrder);
    setIsVisible(sec.isVisible);
    setSectionDraft(buildDraftFromContent(sec.sectionKey, sec.contentJson ?? {}));
    setError(null);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;
    setError(null);
    try {
      const contentJson = serializeDraftToContent(editingKey, sectionDraft);
      await apiRequest(`/api/v1/cms/pages/home/sections/${editingKey}`, {
        method: 'PUT',
        apiBase,
        body: {
          titleAr: titleAr.trim(),
          sortOrder: Number(sortOrder),
          isVisible,
          contentJson,
        },
      });
      showToast(`تم حفظ قسم «${titleAr.trim() || getCmsSectionLabelAr(editingKey)}» وتحديث الصفحة الرئيسية فوراً`);
      setEditingKey(null);
      await loadAll();
      await refreshPortal();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حفظ القسم');
    }
  };

  const resolvedNewSectionKey = newSectionKeyTouched
    ? newSectionKeyOverride.trim()
    : slugifyArabicToSnakeKey(newSectionTitle, 'custom');

  const handleCreateCustomSection = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const keyToUse = resolvedNewSectionKey || slugifyArabicToSnakeKey(newSectionTitle, 'custom');
    if (!keyToUse) {
      setError('يرجى كتابة عنوان واضح للقسم ليتم توليد معرّفه تلقائياً.');
      return;
    }
    try {
      const cleanCards = newSectionCards
        .filter((c) => c.title.trim() || c.desc.trim())
        .map((c) => ({
          icon: c.icon.trim() || '📌',
          title: c.title.trim(),
          desc: c.desc.trim(),
        }));
      await apiRequest(`/api/v1/cms/pages/home/sections/${encodeURIComponent(keyToUse)}`, {
        method: 'PUT',
        apiBase,
        body: {
          titleAr: newSectionTitle.trim(),
          sortOrder: sections.length + 1,
          isVisible: true,
          contentJson: {
            ...(newSectionSubtitle.trim() ? { subtitle: newSectionSubtitle.trim() } : {}),
            body: newSectionBody.trim(),
            ...(cleanCards.length > 0 ? { cards: cleanCards } : {}),
          },
        },
      });
      showToast('تمت إضافة القسم المخصص إلى الصفحة الرئيسية بنجاح');
      setNewSectionTitle('');
      setNewSectionSubtitle('');
      setNewSectionBody('');
      setNewSectionCards([]);
      setNewSectionKeyOverride('');
      setNewSectionKeyTouched(false);
      await loadAll();
      await refreshPortal();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إضافة القسم');
    }
  };

  const resolvedNewsSlug = newsSlugTouched
    ? newsSlugOverride.trim()
    : slugifyArabicToSlug(newsTitle, 'news');

  const handleCreateNews = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const slugToUse = resolvedNewsSlug || slugifyArabicToSlug(newsTitle, 'news');
    if (!slugToUse) {
      setError('يرجى كتابة عنوان للخبر.');
      return;
    }
    try {
      await apiRequest('/api/v1/news', {
        method: 'POST',
        apiBase,
        body: {
          slug: slugToUse,
          title: newsTitle.trim(),
          summary: newsSummary.trim() || null,
          bodyMd: newsBody.trim(),
          status: 'PUBLISHED',
        },
      });
      showToast('تم نشر الخبر الجديد بنجاح');
      setNewsTitle('');
      setNewsSummary('');
      setNewsBody('');
      setNewsSlugOverride('');
      setNewsSlugTouched(false);
      await loadAll();
      await refreshPortal();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر نشر الخبر');
    }
  };

  const handleToggleNewsStatus = async (post: NewsPostItem) => {
    const nextStatus = post.status === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED';
    await apiRequest(`/api/v1/news/${post.id}`, {
      method: 'PATCH',
      apiBase,
      body: { status: nextStatus },
    });
    showToast('تم تحديث حالة الخبر');
    await loadAll();
    await refreshPortal();
  };

  const handleDeleteNews = async (id: string) => {
    await apiRequest(`/api/v1/news/${id}`, { method: 'DELETE', apiBase });
    showToast('تم حذف الخبر');
    await loadAll();
    await refreshPortal();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <div className="portal-error-box">{error}</div>}

      {canCms && (
        <div className="portal-card">
          <h3>📝 محرر أقسام الصفحة الرئيسية</h3>
          <div className="portal-table-wrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>نوع القسم</th>
                  <th>العنوان الظاهر</th>
                  <th>الترتيب</th>
                  <th>الحالة</th>
                  <th>تحرير</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => (
                  <tr key={sec.id}>
                    <td>{getCmsSectionLabelAr(sec.sectionKey, sec.titleAr)}</td>
                    <td>{sec.titleAr}</td>
                    <td>{sec.sortOrder}</td>
                    <td>{sec.isVisible ? '🟢 ظاهر' : '⚪ مخفي'}</td>
                    <td>
                      <button
                        type="button"
                        className="portal-btn"
                        data-edit-section={sec.sectionKey}
                        onClick={() => startEditSection(sec)}
                      >
                        ✏️ تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editingKey && (
            <form
              className="portal-form"
              style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--portal-border)' }}
              onSubmit={(e) => void handleSaveSection(e)}
            >
              <h4>تحرير القسم: {getCmsSectionLabelAr(editingKey, titleAr)}</h4>

              <div className="portal-field">
                <label htmlFor="cmsEditTitleAr">عنوان القسم الرئيسي</label>
                <input
                  id="cmsEditTitleAr"
                  className="portal-input"
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  required
                />
              </div>

              <div className="portal-grid">
                <div className="portal-field">
                  <label htmlFor="cmsEditSort">ترتيب العرض</label>
                  <input
                    id="cmsEditSort"
                    type="number"
                    className="portal-input"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                  />
                </div>
                <div className="portal-field" style={{ justifyContent: 'flex-end' }}>
                  <label className="portal-toggle-row">
                    <span>إظهار القسم في الصفحة الرئيسية</span>
                    <span className="portal-switch">
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={(e) => setIsVisible(e.target.checked)}
                      />
                      <span className="portal-switch-slider" />
                    </span>
                  </label>
                </div>
              </div>

              {/* محرر مرئي حسب نوع القسم */}
              {editingKey === 'hero' && (
                <div className="portal-repeater-card">
                  <div className="portal-field">
                    <label>الشارة الترحيبية أعلى العنوان</label>
                    <input
                      className="portal-input"
                      value={sectionDraft.badge}
                      onChange={(e) => setSectionDraft((d) => ({ ...d, badge: e.target.value }))}
                    />
                  </div>
                  <div className="portal-field">
                    <label>الوصف الترحيبي</label>
                    <textarea
                      rows={3}
                      className="portal-textarea"
                      value={sectionDraft.subtitle}
                      onChange={(e) => setSectionDraft((d) => ({ ...d, subtitle: e.target.value }))}
                    />
                  </div>
                  <div className="portal-grid">
                    <div className="portal-field">
                      <label>نص الزر الأساسي</label>
                      <input
                        className="portal-input"
                        value={sectionDraft.primaryCtaText}
                        onChange={(e) =>
                          setSectionDraft((d) => ({ ...d, primaryCtaText: e.target.value }))
                        }
                      />
                    </div>
                    <div className="portal-field">
                      <label>وجهة الزر الأساسي</label>
                      <input
                        className="portal-input"
                        dir="ltr"
                        value={sectionDraft.primaryCtaHref}
                        onChange={(e) =>
                          setSectionDraft((d) => ({ ...d, primaryCtaHref: e.target.value }))
                        }
                      />
                    </div>
                    <div className="portal-field">
                      <label>نص الزر الثانوي (اختياري)</label>
                      <input
                        className="portal-input"
                        value={sectionDraft.secondaryCtaText}
                        onChange={(e) =>
                          setSectionDraft((d) => ({ ...d, secondaryCtaText: e.target.value }))
                        }
                      />
                    </div>
                    <div className="portal-field">
                      <label>وجهة الزر الثانوي</label>
                      <input
                        className="portal-input"
                        dir="ltr"
                        value={sectionDraft.secondaryCtaHref}
                        onChange={(e) =>
                          setSectionDraft((d) => ({ ...d, secondaryCtaHref: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingKey === 'features' && (
                <div className="portal-repeater-card">
                  <div className="portal-section-title" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '1rem' }}>بطاقات المميزات ({sectionDraft.features.length})</span>
                    <button
                      type="button"
                      className="portal-btn"
                      onClick={() =>
                        setSectionDraft((d) => ({
                          ...d,
                          features: [...d.features, { icon: '✨', title: '', desc: '' }],
                        }))
                      }
                    >
                      ➕ إضافة ميزة
                    </button>
                  </div>
                  {sectionDraft.features.map((feat, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: '1px solid var(--portal-border)',
                        borderRadius: 10,
                        padding: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div className="portal-grid">
                        <div className="portal-field">
                          <label>الأيقونة</label>
                          <input
                            className="portal-input"
                            value={feat.icon}
                            onChange={(e) =>
                              setSectionDraft((d) => ({
                                ...d,
                                features: d.features.map((item, i) =>
                                  i === idx ? { ...item, icon: e.target.value } : item
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="portal-field">
                          <label>عنوان الميزة</label>
                          <input
                            className="portal-input"
                            value={feat.title}
                            onChange={(e) =>
                              setSectionDraft((d) => ({
                                ...d,
                                features: d.features.map((item, i) =>
                                  i === idx ? { ...item, title: e.target.value } : item
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="portal-field">
                        <label>وصف الميزة</label>
                        <input
                          className="portal-input"
                          value={feat.desc}
                          onChange={(e) =>
                            setSectionDraft((d) => ({
                              ...d,
                              features: d.features.map((item, i) =>
                                i === idx ? { ...item, desc: e.target.value } : item
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="portal-nav">
                        <button
                          type="button"
                          className="portal-btn"
                          onClick={() =>
                            setSectionDraft((d) => ({
                              ...d,
                              features: moveArrayItem(d.features, idx, -1),
                            }))
                          }
                        >
                          ↑ للأعلى
                        </button>
                        <button
                          type="button"
                          className="portal-btn"
                          onClick={() =>
                            setSectionDraft((d) => ({
                              ...d,
                              features: moveArrayItem(d.features, idx, 1),
                            }))
                          }
                        >
                          ↓ للأسفل
                        </button>
                        <button
                          type="button"
                          className="portal-btn danger"
                          onClick={() =>
                            setSectionDraft((d) => ({
                              ...d,
                              features: d.features.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          حذف الميزة
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {editingKey === 'capabilities' && (
                <div className="portal-repeater-card">
                  <div className="portal-section-title" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '1rem' }}>نقاط القدرات ({sectionDraft.highlights.length})</span>
                    <button
                      type="button"
                      className="portal-btn"
                      onClick={() =>
                        setSectionDraft((d) => ({ ...d, highlights: [...d.highlights, ''] }))
                      }
                    >
                      ➕ إضافة نقطة
                    </button>
                  </div>
                  {sectionDraft.highlights.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        className="portal-input"
                        value={item}
                        placeholder={`ميزة المنصة رقم ${idx + 1}`}
                        onChange={(e) =>
                          setSectionDraft((d) => ({
                            ...d,
                            highlights: d.highlights.map((val, i) =>
                              i === idx ? e.target.value : val
                            ),
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="portal-btn"
                        onClick={() =>
                          setSectionDraft((d) => ({
                            ...d,
                            highlights: moveArrayItem(d.highlights, idx, -1),
                          }))
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="portal-btn"
                        onClick={() =>
                          setSectionDraft((d) => ({
                            ...d,
                            highlights: moveArrayItem(d.highlights, idx, 1),
                          }))
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="portal-btn danger"
                        onClick={() =>
                          setSectionDraft((d) => ({
                            ...d,
                            highlights: d.highlights.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {editingKey === 'how_it_works' && (
                <div className="portal-repeater-card">
                  <div className="portal-section-title" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '1rem' }}>خطوات العمل ({sectionDraft.steps.length})</span>
                    <button
                      type="button"
                      className="portal-btn"
                      onClick={() =>
                        setSectionDraft((d) => ({
                          ...d,
                          steps: [...d.steps, { step: d.steps.length + 1, title: '', desc: '' }],
                        }))
                      }
                    >
                      ➕ إضافة خطوة
                    </button>
                  </div>
                  {sectionDraft.steps.map((st, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: '1px solid var(--portal-border)',
                        borderRadius: 10,
                        padding: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <strong>الخطوة {idx + 1}</strong>
                      <div className="portal-grid">
                        <div className="portal-field">
                          <label>عنوان الخطوة</label>
                          <input
                            className="portal-input"
                            value={st.title}
                            onChange={(e) =>
                              setSectionDraft((d) => ({
                                ...d,
                                steps: d.steps.map((row, i) =>
                                  i === idx ? { ...row, title: e.target.value } : row
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="portal-field">
                          <label>وصف الخطوة</label>
                          <input
                            className="portal-input"
                            value={st.desc}
                            onChange={(e) =>
                              setSectionDraft((d) => ({
                                ...d,
                                steps: d.steps.map((row, i) =>
                                  i === idx ? { ...row, desc: e.target.value } : row
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="portal-nav">
                        <button
                          type="button"
                          className="portal-btn"
                          onClick={() =>
                            setSectionDraft((d) => ({ ...d, steps: moveArrayItem(d.steps, idx, -1) }))
                          }
                        >
                          ↑ للأعلى
                        </button>
                        <button
                          type="button"
                          className="portal-btn"
                          onClick={() =>
                            setSectionDraft((d) => ({ ...d, steps: moveArrayItem(d.steps, idx, 1) }))
                          }
                        >
                          ↓ للأسفل
                        </button>
                        <button
                          type="button"
                          className="portal-btn danger"
                          onClick={() =>
                            setSectionDraft((d) => ({
                              ...d,
                              steps: d.steps.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          حذف الخطوة
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(editingKey === 'featured_books' || editingKey === 'news_preview') && (
                <div className="portal-repeater-card">
                  <div className="portal-field">
                    <label>
                      {editingKey === 'featured_books'
                        ? 'عدد الكتب المميزة المعروضة في الصفحة الرئيسية'
                        : 'عدد الأخبار الأخيرة المعروضة في الصفحة الرئيسية'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={editingKey === 'featured_books' ? 24 : 12}
                      className="portal-input"
                      value={sectionDraft.limit}
                      onChange={(e) =>
                        setSectionDraft((d) => ({ ...d, limit: Number(e.target.value) }))
                      }
                    />
                  </div>
                </div>
              )}

              {editingKey === 'footer' && (
                <div className="portal-repeater-card">
                  <div className="portal-field">
                    <label>نص حقوق النشر والتذييل</label>
                    <input
                      className="portal-input"
                      value={sectionDraft.copyright}
                      onChange={(e) =>
                        setSectionDraft((d) => ({ ...d, copyright: e.target.value }))
                      }
                    />
                  </div>
                  <div className="portal-section-title" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '1rem' }}>روابط التذييل ({sectionDraft.footerLinks.length})</span>
                    <button
                      type="button"
                      className="portal-btn"
                      onClick={() =>
                        setSectionDraft((d) => ({
                          ...d,
                          footerLinks: [...d.footerLinks, { label: '', href: '/library' }],
                        }))
                      }
                    >
                      ➕ إضافة رابط
                    </button>
                  </div>
                  {sectionDraft.footerLinks.map((lnk, idx) => (
                    <div key={idx} className="portal-grid" style={{ alignItems: 'end' }}>
                      <div className="portal-field">
                        <label>تسمية الرابط</label>
                        <input
                          className="portal-input"
                          value={lnk.label}
                          onChange={(e) =>
                            setSectionDraft((d) => ({
                              ...d,
                              footerLinks: d.footerLinks.map((row, i) =>
                                i === idx ? { ...row, label: e.target.value } : row
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="portal-field">
                        <label>المسار</label>
                        <input
                          className="portal-input"
                          dir="ltr"
                          value={lnk.href}
                          onChange={(e) =>
                            setSectionDraft((d) => ({
                              ...d,
                              footerLinks: d.footerLinks.map((row, i) =>
                                i === idx ? { ...row, href: e.target.value } : row
                              ),
                            }))
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="portal-btn danger"
                        onClick={() =>
                          setSectionDraft((d) => ({
                            ...d,
                            footerLinks: d.footerLinks.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {![
                'hero',
                'features',
                'capabilities',
                'how_it_works',
                'featured_books',
                'news_preview',
                'footer',
              ].includes(editingKey) && (
                <div className="portal-repeater-card">
                  <div className="portal-field">
                    <label>عنوان فرعي اختياري</label>
                    <input
                      className="portal-input"
                      value={sectionDraft.subtitle}
                      onChange={(e) => setSectionDraft((d) => ({ ...d, subtitle: e.target.value }))}
                    />
                  </div>
                  <div className="portal-field">
                    <label>المحتوى النصي للقسم</label>
                    <textarea
                      rows={3}
                      className="portal-textarea"
                      value={sectionDraft.body}
                      onChange={(e) => setSectionDraft((d) => ({ ...d, body: e.target.value }))}
                    />
                  </div>
                  <div className="portal-grid">
                    <div className="portal-field">
                      <label>نص زر اختياري</label>
                      <input
                        className="portal-input"
                        value={sectionDraft.ctaText}
                        onChange={(e) =>
                          setSectionDraft((d) => ({ ...d, ctaText: e.target.value }))
                        }
                      />
                    </div>
                    <div className="portal-field">
                      <label>رابط الزر</label>
                      <input
                        className="portal-input"
                        dir="ltr"
                        value={sectionDraft.ctaHref}
                        onChange={(e) =>
                          setSectionDraft((d) => ({ ...d, ctaHref: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="portal-section-title" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '1rem' }}>بطاقات القسم ({sectionDraft.cards.length})</span>
                    <button
                      type="button"
                      className="portal-btn"
                      onClick={() =>
                        setSectionDraft((d) => ({
                          ...d,
                          cards: [...d.cards, { icon: '📌', title: '', desc: '' }],
                        }))
                      }
                    >
                      ➕ إضافة بطاقة
                    </button>
                  </div>
                  {sectionDraft.cards.map((card, idx) => (
                    <div key={idx} className="portal-grid" style={{ alignItems: 'end' }}>
                      <div className="portal-field">
                        <label>الأيقونة</label>
                        <input
                          className="portal-input"
                          value={card.icon}
                          onChange={(e) =>
                            setSectionDraft((d) => ({
                              ...d,
                              cards: d.cards.map((row, i) =>
                                i === idx ? { ...row, icon: e.target.value } : row
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="portal-field">
                        <label>العنوان</label>
                        <input
                          className="portal-input"
                          value={card.title}
                          onChange={(e) =>
                            setSectionDraft((d) => ({
                              ...d,
                              cards: d.cards.map((row, i) =>
                                i === idx ? { ...row, title: e.target.value } : row
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="portal-field">
                        <label>الوصف</label>
                        <input
                          className="portal-input"
                          value={card.desc}
                          onChange={(e) =>
                            setSectionDraft((d) => ({
                              ...d,
                              cards: d.cards.map((row, i) =>
                                i === idx ? { ...row, desc: e.target.value } : row
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="portal-nav">
                        <button
                          type="button"
                          className="portal-btn"
                          onClick={() =>
                            setSectionDraft((d) => ({ ...d, cards: moveArrayItem(d.cards, idx, -1) }))
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="portal-btn"
                          onClick={() =>
                            setSectionDraft((d) => ({ ...d, cards: moveArrayItem(d.cards, idx, 1) }))
                          }
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="portal-btn danger"
                          onClick={() =>
                            setSectionDraft((d) => ({
                              ...d,
                              cards: d.cards.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <details className="portal-advanced-details">
                <summary>إعدادات تقنية متقدمة</summary>
                <div style={{ fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
                  المعرّف الداخلي للقسم: <code dir="ltr">{editingKey}</code>
                </div>
              </details>

              <div className="portal-nav">
                <button type="submit" id="btnSaveCmsSection" className="portal-btn primary">
                  💾 حفظ وتحديث الرئيسية
                </button>
                <button type="button" className="portal-btn" onClick={() => setEditingKey(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          )}

          <form
            className="portal-form"
            style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--portal-border)' }}
            onSubmit={(e) => void handleCreateCustomSection(e)}
          >
            <h4>➕ إضافة قسم مخصص جديد إلى الصفحة الرئيسية</h4>
            <div className="portal-grid">
              <div className="portal-field">
                <label>عنوان القسم</label>
                <input
                  className="portal-input"
                  placeholder="مثال: مسابقة القراءة التفاعلية"
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  required
                />
              </div>
              <div className="portal-field">
                <label>عنوان فرعي (اختياري)</label>
                <input
                  className="portal-input"
                  placeholder="وصف موجز يظهر تحت عنوان القسم"
                  value={newSectionSubtitle}
                  onChange={(e) => setNewSectionSubtitle(e.target.value)}
                />
              </div>
            </div>
            <div className="portal-field">
              <label>المحتوى النصي</label>
              <textarea
                rows={2}
                className="portal-textarea"
                placeholder="اكتب نص الإعلان أو المعلومات المعروضة للزوار..."
                value={newSectionBody}
                onChange={(e) => setNewSectionBody(e.target.value)}
                required
              />
            </div>

            <div className="portal-repeater-card">
              <div className="portal-section-title" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: '0.95rem' }}>بطاقات اختيارية داخل القسم ({newSectionCards.length})</span>
                <button
                  type="button"
                  className="portal-btn"
                  onClick={() =>
                    setNewSectionCards((prev) => [...prev, { icon: '📌', title: '', desc: '' }])
                  }
                >
                  ➕ إضافة بطاقة
                </button>
              </div>
              {newSectionCards.map((card, idx) => (
                <div key={idx} className="portal-grid" style={{ alignItems: 'end' }}>
                  <div className="portal-field">
                    <label>أيقونة</label>
                    <input
                      className="portal-input"
                      value={card.icon}
                      onChange={(e) =>
                        setNewSectionCards((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, icon: e.target.value } : row))
                        )
                      }
                    />
                  </div>
                  <div className="portal-field">
                    <label>عنوان البطاقة</label>
                    <input
                      className="portal-input"
                      value={card.title}
                      onChange={(e) =>
                        setNewSectionCards((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, title: e.target.value } : row))
                        )
                      }
                    />
                  </div>
                  <div className="portal-field">
                    <label>وصف البطاقة</label>
                    <input
                      className="portal-input"
                      value={card.desc}
                      onChange={(e) =>
                        setNewSectionCards((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, desc: e.target.value } : row))
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="portal-btn danger"
                    onClick={() =>
                      setNewSectionCards((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>

            <details className="portal-advanced-details">
              <summary>إعدادات تقنية متقدمة (توليد المعرّف تلقائياً)</summary>
              <div className="portal-field">
                <label>المعرّف البرمجي للقسم</label>
                <input
                  className="portal-input"
                  dir="ltr"
                  value={resolvedNewSectionKey}
                  onChange={(e) => {
                    setNewSectionKeyTouched(true);
                    setNewSectionKeyOverride(e.target.value);
                  }}
                />
              </div>
            </details>

            <button type="submit" className="portal-btn">
              إضافة القسم
            </button>
          </form>
        </div>
      )}

      {canNews && (
        <div className="portal-card">
          <h3>📰 إدارة الأخبار والتحديثات</h3>
          <div className="portal-table-wrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {news.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <strong>{post.title}</strong>
                      {post.summary && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--portal-muted)' }}>
                          {post.summary}
                        </div>
                      )}
                    </td>
                    <td>{NEWS_STATUS_LABELS[post.status] ?? post.status}</td>
                    <td className="portal-nav">
                      <button
                        type="button"
                        className="portal-btn"
                        onClick={() => void handleToggleNewsStatus(post)}
                      >
                        {post.status === 'PUBLISHED' ? 'أرشفة' : 'نشر'}
                      </button>
                      <button
                        type="button"
                        className="portal-btn danger"
                        onClick={() => void handleDeleteNews(post.id)}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            className="portal-form"
            style={{ marginTop: 14 }}
            onSubmit={(e) => void handleCreateNews(e)}
          >
            <h4>➕ نشر خبر جديد</h4>
            <div className="portal-grid">
              <div className="portal-field">
                <label>عنوان الخبر</label>
                <input
                  className="portal-input"
                  placeholder="مثال: إطلاق حزمة المختبرات العلمية الجديدة"
                  value={newsTitle}
                  onChange={(e) => setNewsTitle(e.target.value)}
                  required
                />
              </div>
              <div className="portal-field">
                <label>ملخص قصير (اختياري)</label>
                <input
                  className="portal-input"
                  placeholder="خلاصة سريعة تظهر في بطاقة الخبر"
                  value={newsSummary}
                  onChange={(e) => setNewsSummary(e.target.value)}
                />
              </div>
            </div>
            <div className="portal-field">
              <label>نص الخبر</label>
              <textarea
                rows={3}
                className="portal-textarea"
                value={newsBody}
                onChange={(e) => setNewsBody(e.target.value)}
                required
              />
            </div>

            <details className="portal-advanced-details">
              <summary>إعدادات تقنية متقدمة (توليد رابط الخبر تلقائياً)</summary>
              <div className="portal-field">
                <label>المعرّف اللاتيني للخبر</label>
                <input
                  className="portal-input"
                  dir="ltr"
                  value={resolvedNewsSlug}
                  onChange={(e) => {
                    setNewsSlugTouched(true);
                    setNewsSlugOverride(e.target.value);
                  }}
                />
              </div>
            </details>

            <button type="submit" className="portal-btn primary">
              نشر الخبر الآن
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
