import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { normalizeArabic } from '@darb/book-schema';
import { apiRequest } from '../lib/apiClient';
import { localDatabase } from '../lib/offline/localDatabase';
import {
  downloadBookForOffline,
  type OfflineDownloadProgress,
} from '../lib/offline/offlineBookAssets';
import { syncManager } from '../lib/offline/syncManager';
import { usePortal } from '../lib/portalContext';
import type { PortalBookItem } from '../lib/types';

export const LibraryPage: React.FC = () => {
  const {
    mode,
    apiBase,
    taxonomies,
    user,
    staticCatalogBooks,
    offlineBookSlugs,
    refreshOfflineBooks,
    showToast,
  } = usePortal();

  const [books, setBooks] = useState<PortalBookItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedTaxSlug, setSelectedTaxSlug] = useState('');
  const [progressBySlug, setProgressBySlug] = useState<
    Record<string, { currentSpread: number; percent: number }>
  >({});
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, OfflineDownloadProgress | null>
  >({});
  const [loading, setLoading] = useState(true);

  const offlineSet = useMemo(() => new Set(offlineBookSlugs), [offlineBookSlugs]);

  useEffect(() => {
    let active = true;
    const loadBooks = async () => {
      setLoading(true);
      const localProgress = await localDatabase.getAllProgressMap();
      if (mode === 'api') {
        try {
          const params = new URLSearchParams();
          if (query.trim()) params.set('q', query.trim());
          if (selectedTaxSlug) params.set('taxonomy', selectedTaxSlug);
          const qs = params.toString() ? `?${params.toString()}` : '';
          const res = await apiRequest<{ books: PortalBookItem[] }>(`/api/v1/books${qs}`, {
            apiBase,
          });
          if (active) setBooks(res.books);
          void syncManager.cacheCatalogBooks(res.books);

          if (user) {
            try {
              const prog = await apiRequest<{
                progressBySlug: Record<string, { currentSpread: number; percent: number }>;
              }>('/api/v1/books/progress/mine', { apiBase });
              if (active) setProgressBySlug({ ...localProgress, ...prog.progressBySlug });
            } catch {
              if (active) setProgressBySlug(localProgress);
            }
          } else if (active) {
            setProgressBySlug(localProgress);
          }
        } catch {
          const cachedBooks = await localDatabase.listBooks();
          if (active) {
            setBooks(cachedBooks.length > 0 ? cachedBooks.map((b) => b.metadata) : staticCatalogBooks);
            setProgressBySlug(localProgress);
          }
        } finally {
          if (active) setLoading(false);
        }
      } else {
        const cachedBooks = await localDatabase.listBooks();
        const fallbackList =
          staticCatalogBooks.length > 0
            ? staticCatalogBooks
            : cachedBooks.map((b) => b.metadata);
        if (active) {
          setBooks(fallbackList);
          setProgressBySlug(localProgress);
          setLoading(false);
        }
      }
    };
    void loadBooks();
    return () => {
      active = false;
    };
  }, [mode, apiBase, query, selectedTaxSlug, user, staticCatalogBooks]);

  const handleSaveOffline = async (book: PortalBookItem) => {
    setDownloadProgress((prev) => ({ ...prev, [book.slug]: { done: 0, total: 1 } }));
    try {
      await downloadBookForOffline(book, mode === 'api' ? apiBase : null, (p) => {
        setDownloadProgress((prev) => ({ ...prev, [book.slug]: p }));
      });
      await refreshOfflineBooks();
      showToast(`تم حفظ «${book.title}» للقراءة بدون إنترنت بنجاح`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر حفظ الكتاب للقراءة بدون إنترنت');
    } finally {
      setDownloadProgress((prev) => ({ ...prev, [book.slug]: null }));
    }
  };

  const filterTaxonomies = useMemo(() => {
    return [...(taxonomies.domain ?? []), ...(taxonomies.book_type ?? []), ...(taxonomies.education_level ?? [])].filter(
      (t) => t.isActive
    );
  }, [taxonomies]);

  const visibleBooks = useMemo(() => {
    if (mode === 'api') return books;
    const norm = normalizeArabic(query);
    if (!norm) return books;
    return books.filter((b) =>
      normalizeArabic(`${b.title} ${b.subtitle ?? ''} ${b.description ?? ''}`).includes(norm)
    );
  }, [books, mode, query]);

  return (
    <main className="portal-main">
      <div className="portal-section-title">
        <span>📚 مكتبة الكتب والإصدارات التفاعلية</span>
        {user?.profile?.ageGroup && (
          <span className="portal-badge">
            🛡️ الفئة العمرية المطبقة: {user.profile.ageGroup.labelAr}
          </span>
        )}
      </div>

      <div className="portal-card" style={{ marginBottom: 22 }}>
        <div className="portal-field">
          <label htmlFor="librarySearchInput">🔍 البحث العربي المطبّع في المكتبة</label>
          <input
            id="librarySearchInput"
            type="search"
            className="portal-input"
            placeholder="ابحث عن كتاب، تخصص، أو موضوع..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {filterTaxonomies.length > 0 && (
          <div className="portal-chips">
            <button
              type="button"
              className={`portal-chip${selectedTaxSlug === '' ? ' selected' : ''}`}
              onClick={() => setSelectedTaxSlug('')}
            >
              الكل
            </button>
            {filterTaxonomies.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`portal-chip${selectedTaxSlug === t.slug ? ' selected' : ''}`}
                onClick={() => setSelectedTaxSlug(t.slug)}
              >
                {t.labelAr}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="portal-card">جاري تحميل المكتبة...</div>
      ) : visibleBooks.length === 0 ? (
        <div className="portal-card">لا توجد كتب مطابقة لمعايير البحث أو الفئة العمرية الحالية.</div>
      ) : (
        <div className="portal-grid">
          {visibleBooks.map((book) => {
            const cloudProg = progressBySlug[book.slug];
            const isSavedOffline = offlineSet.has(book.slug);
            const prog = downloadProgress[book.slug];
            return (
              <article
                key={book.slug}
                className={`portal-card${book.isRecommended ? ' recommended' : ''}`}
                data-book-slug={book.slug}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <span className="portal-badge">{book.badge || 'إصدار تفاعلي'}</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {isSavedOffline && (
                      <span className="portal-badge" data-testid={`offlineBadge-${book.slug}`}>
                        ✅ محفوظ أوفلاين
                      </span>
                    )}
                    {book.isRecommended && <span className="portal-badge">مناسب لتفضيلاتك ⭐</span>}
                  </div>
                </div>

                <h3>{book.title}</h3>
                {book.subtitle && <p>{book.subtitle}</p>}
                {book.description && <p>{book.description}</p>}

                {book.taxonomies.length > 0 && (
                  <div className="portal-chips">
                    {book.taxonomies.slice(0, 4).map((t) => (
                      <span key={t.id} className="portal-mode-pill">
                        {t.labelAr}
                      </span>
                    ))}
                  </div>
                )}

                {cloudProg && (
                  <div className="portal-mode-pill">
                    التقدم المحفوظ: {Math.round(cloudProg.percent)}% (النشرة {cloudProg.currentSpread})
                  </div>
                )}

                <div
                  style={{
                    marginTop: 'auto',
                    paddingTop: 8,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <Link
                    to={`/read/${book.slug}${cloudProg ? `?spread=${cloudProg.currentSpread}` : ''}`}
                    className="portal-btn primary"
                  >
                    {cloudProg && cloudProg.currentSpread > 0
                      ? '▶ استئناف القراءة ثلاثية الأبعاد'
                      : '📖 ابدأ القراءة ثلاثية الأبعاد'}
                  </Link>

                  <button
                    type="button"
                    className="portal-btn"
                    data-testid={`saveOfflineBtn-${book.slug}`}
                    disabled={Boolean(prog)}
                    onClick={() => void handleSaveOffline(book)}
                  >
                    {prog
                      ? `⏳ جاري الحفظ (${prog.done}/${prog.total})`
                      : isSavedOffline
                        ? '🔄 تحديث النسخة المحفوظة'
                        : '📥 حفظ للقراءة بدون إنترنت'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
};
