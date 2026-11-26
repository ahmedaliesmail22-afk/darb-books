import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../lib/apiClient';
import { usePortal } from '../lib/portalContext';
import type { CmsPageItem, CmsSectionItem, NewsPostItem } from '../lib/types';

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
  const [contentJsonText, setContentJsonText] = useState('{}');

  // New section form
  const [newSectionKey, setNewSectionKey] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionBody, setNewSectionBody] = useState('');

  // New news form
  const [newsSlug, setNewsSlug] = useState('');
  const [newsTitle, setNewsTitle] = useState('');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsBody, setNewsBody] = useState('');

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
    setContentJsonText(JSON.stringify(sec.contentJson ?? {}, null, 2));
    setError(null);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;
    setError(null);
    try {
      const parsedJson = JSON.parse(contentJsonText) as Record<string, unknown>;
      await apiRequest(`/api/v1/cms/pages/home/sections/${editingKey}`, {
        method: 'PUT',
        apiBase,
        body: {
          titleAr,
          sortOrder: Number(sortOrder),
          isVisible,
          contentJson: parsedJson,
        },
      });
      showToast(`تم حفظ قسم «${editingKey}» وتحديث الصفحة الرئيسية فوراً`);
      setEditingKey(null);
      await loadAll();
      await refreshPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ القسم');
    }
  };

  const handleCreateCustomSection = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest(`/api/v1/cms/pages/home/sections/${newSectionKey.trim()}`, {
        method: 'PUT',
        apiBase,
        body: {
          titleAr: newSectionTitle.trim(),
          sortOrder: sections.length + 1,
          isVisible: true,
          contentJson: { body: newSectionBody.trim() },
        },
      });
      showToast('تمت إضافة القسم المخصص إلى الصفحة الرئيسية');
      setNewSectionKey('');
      setNewSectionTitle('');
      setNewSectionBody('');
      await loadAll();
      await refreshPortal();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إضافة القسم');
    }
  };

  const handleCreateNews = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/v1/news', {
        method: 'POST',
        apiBase,
        body: {
          slug: newsSlug.trim(),
          title: newsTitle.trim(),
          summary: newsSummary.trim() || null,
          bodyMd: newsBody.trim(),
          status: 'PUBLISHED',
        },
      });
      showToast('تم نشر الخبر الجديد بنجاح');
      setNewsSlug('');
      setNewsTitle('');
      setNewsSummary('');
      setNewsBody('');
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
          <h3>📝 محرر أقسام الصفحة الرئيسية (`cms_sections`)</h3>
          <div className="portal-table-wrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>المعرّف</th>
                  <th>العنوان</th>
                  <th>الترتيب</th>
                  <th>الحالة</th>
                  <th>تحرير</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => (
                  <tr key={sec.id}>
                    <td><code>{sec.sectionKey}</code></td>
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
              <h4>تحرير القسم: <code>{editingKey}</code></h4>
              <div className="portal-field">
                <label htmlFor="cmsEditTitleAr">عنوان القسم</label>
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
                <div className="portal-field">
                  <label>
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={(e) => setIsVisible(e.target.checked)}
                    />{' '}
                    إظهار القسم في الصفحة الرئيسية
                  </label>
                </div>
              </div>
              <div className="portal-field">
                <label htmlFor="cmsEditJson">محتوى القسم المرن (`contentJson`)</label>
                <textarea
                  id="cmsEditJson"
                  rows={6}
                  className="portal-textarea"
                  dir="ltr"
                  value={contentJsonText}
                  onChange={(e) => setContentJsonText(e.target.value)}
                />
              </div>
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
            <h4>➕ إضافة قسم مخصص جديد</h4>
            <div className="portal-grid">
              <div className="portal-field">
                <label>مفتاح القسم (`sectionKey`)</label>
                <input
                  className="portal-input"
                  dir="ltr"
                  placeholder="custom_announcement"
                  value={newSectionKey}
                  onChange={(e) => setNewSectionKey(e.target.value)}
                  required
                />
              </div>
              <div className="portal-field">
                <label>العنوان</label>
                <input
                  className="portal-input"
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="portal-field">
              <label>المحتوى النصي</label>
              <input
                className="portal-input"
                value={newSectionBody}
                onChange={(e) => setNewSectionBody(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="portal-btn">
              إضافة القسم
            </button>
          </form>
        </div>
      )}

      {canNews && (
        <div className="portal-card">
          <h3>📰 إدارة الأخبار والتحديثات (`news_posts`)</h3>
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
                      <div style={{ fontSize: '0.8rem', color: 'var(--portal-muted)' }}>
                        {post.slug}
                      </div>
                    </td>
                    <td>{post.status}</td>
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
                <label>المعرّف (`slug`)</label>
                <input
                  className="portal-input"
                  dir="ltr"
                  placeholder="phase-2-launch"
                  value={newsSlug}
                  onChange={(e) => setNewsSlug(e.target.value)}
                  required
                />
              </div>
              <div className="portal-field">
                <label>عنوان الخبر</label>
                <input
                  className="portal-input"
                  value={newsTitle}
                  onChange={(e) => setNewsTitle(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="portal-field">
              <label>ملخص قصير</label>
              <input
                className="portal-input"
                value={newsSummary}
                onChange={(e) => setNewsSummary(e.target.value)}
              />
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
            <button type="submit" className="portal-btn primary">
              نشر الخبر الآن
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
