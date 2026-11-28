import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../lib/apiClient';
import { usePortal } from '../lib/portalContext';
import type { PortalBookItem } from '../lib/types';

function renderSectionLink(href: string | undefined, label: string, primary = false) {
  if (!href) return null;
  const className = primary ? 'portal-btn primary' : 'portal-btn';
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return (
      <a href={href} className={className} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }
  const normalized = href === '/author' ? '/guide' : href;
  return (
    <Link to={normalized} className={className}>
      {label}
    </Link>
  );
}

export const HomePage: React.FC = () => {
  const { mode, apiBase, homeSections, latestNews, staticCatalogBooks, configs } = usePortal();
  const [featuredBooks, setFeaturedBooks] = useState<PortalBookItem[]>([]);

  useEffect(() => {
    let active = true;
    if (mode === 'api') {
      apiRequest<{ books: PortalBookItem[] }>('/api/v1/books', { apiBase })
        .then((res) => {
          if (active) setFeaturedBooks(res.books.slice(0, 6));
        })
        .catch(() => {
          if (active) setFeaturedBooks(staticCatalogBooks.slice(0, 6));
        });
    } else {
      setFeaturedBooks(staticCatalogBooks.slice(0, 6));
    }
    return () => {
      active = false;
    };
  }, [mode, apiBase, staticCatalogBooks]);

  const visibleSections = [...homeSections]
    .filter((s) => s.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const footerSection = visibleSections.find((s) => s.sectionKey === 'footer');
  const mainSections = visibleSections.filter((s) => s.sectionKey !== 'footer');
  const branding = (configs['branding.portal'] as Record<string, unknown> | undefined) ?? {};

  return (
    <>
      <main className="portal-main">
        {mainSections.map((sec) => {
          const content = sec.contentJson ?? {};

          if (sec.sectionKey === 'hero') {
            return (
              <section key={sec.id} className="portal-hero" data-section-key="hero">
                {typeof content.badge === 'string' && (
                  <span className="portal-badge">{content.badge}</span>
                )}
                <h1>{sec.titleAr}</h1>
                {typeof content.subtitle === 'string' && <p>{content.subtitle}</p>}
                <div className="portal-nav">
                  {renderSectionLink(
                    typeof content.primaryCtaHref === 'string' ? content.primaryCtaHref : '/library',
                    typeof content.primaryCtaText === 'string' ? content.primaryCtaText : 'دخول المكتبة',
                    true
                  )}
                  {typeof content.secondaryCtaText === 'string' &&
                    renderSectionLink(
                      typeof content.secondaryCtaHref === 'string' ? content.secondaryCtaHref : '/guide',
                      content.secondaryCtaText,
                      false
                    )}
                </div>
              </section>
            );
          }

          if (sec.sectionKey === 'features') {
            const items = Array.isArray(content.items)
              ? (content.items as Array<{ icon?: string; title?: string; desc?: string }>)
              : [];
            return (
              <section key={sec.id} className="portal-section" data-section-key="features">
                <h2 className="portal-section-title">{sec.titleAr}</h2>
                <div className="portal-grid">
                  {items.map((item, idx) => (
                    <article key={idx} className="portal-card">
                      <h3>
                        {item.icon ? `${item.icon} ` : ''}
                        {item.title}
                      </h3>
                      <p>{item.desc}</p>
                    </article>
                  ))}
                </div>
              </section>
            );
          }

          if (sec.sectionKey === 'capabilities') {
            const highlights = Array.isArray(content.highlights)
              ? (content.highlights as string[])
              : [];
            return (
              <section key={sec.id} className="portal-section" data-section-key="capabilities">
                <h2 className="portal-section-title">{sec.titleAr}</h2>
                <div className="portal-grid">
                  {highlights.map((text, idx) => (
                    <div key={idx} className="portal-card">
                      <h3>✨ ميزة منصة #{idx + 1}</h3>
                      <p>{text}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          }

          if (sec.sectionKey === 'how_it_works') {
            const steps = Array.isArray(content.steps)
              ? (content.steps as Array<{ step?: number; title?: string; desc?: string }>)
              : [];
            return (
              <section key={sec.id} className="portal-section" data-section-key="how_it_works">
                <h2 className="portal-section-title">{sec.titleAr}</h2>
                <div className="portal-grid">
                  {steps.map((st, idx) => (
                    <div key={idx} className="portal-card">
                      <span className="portal-badge">الخطوة {st.step ?? idx + 1}</span>
                      <h3>{st.title}</h3>
                      <p>{st.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          }

          if (sec.sectionKey === 'featured_books') {
            return (
              <section key={sec.id} className="portal-section" data-section-key="featured_books">
                <div className="portal-section-title">
                  <span>{sec.titleAr}</span>
                  <Link to="/library" className="portal-btn">
                    عرض المكتبة كاملة ←
                  </Link>
                </div>
                <div className="portal-grid">
                  {featuredBooks.map((book) => (
                    <article
                      key={book.slug}
                      className={`portal-card${book.isRecommended ? ' recommended' : ''}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span className="portal-badge">{book.badge || 'كتاب تفاعلي'}</span>
                        {book.isRecommended && (
                          <span className="portal-badge">موصى به لك ⭐</span>
                        )}
                      </div>
                      <h3>{book.title}</h3>
                      {book.subtitle && <p>{book.subtitle}</p>}
                      {book.description && <p>{book.description}</p>}
                      <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                        <Link to={`/read/${book.slug}`} className="portal-btn primary">
                          📖 فتح القارئ ثلاثي الأبعاد
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          }

          if (sec.sectionKey === 'news_preview') {
            if (latestNews.length === 0) return null;
            return (
              <section key={sec.id} className="portal-section" data-section-key="news_preview">
                <div className="portal-section-title">
                  <span>{sec.titleAr}</span>
                  <Link to="/guide" className="portal-btn">
                    كل الأخبار ←
                  </Link>
                </div>
                <div className="portal-grid">
                  {latestNews.map((post) => (
                    <article key={post.id} className="portal-card">
                      <h3>📰 {post.title}</h3>
                      {post.summary && <p>{post.summary}</p>}
                    </article>
                  ))}
                </div>
              </section>
            );
          }

          // دعم أي أقسام مخصصة جديدة تضيفها الإدارة من لوحة التحكم
          const customCards = Array.isArray(content.cards)
            ? (content.cards as Array<{ icon?: string; title?: string; desc?: string }>)
            : [];
          return (
            <section
              key={sec.id}
              className="portal-section portal-card"
              data-section-key={sec.sectionKey}
            >
              <h2 className="portal-section-title">{sec.titleAr}</h2>
              {typeof content.subtitle === 'string' && <p>{content.subtitle}</p>}
              {typeof content.body === 'string' && <p>{content.body}</p>}
              {customCards.length > 0 && (
                <div className="portal-grid">
                  {customCards.map((card, idx) => (
                    <article key={idx} className="portal-card">
                      <h3>
                        {card.icon ? `${card.icon} ` : ''}
                        {card.title}
                      </h3>
                      {card.desc && <p>{card.desc}</p>}
                    </article>
                  ))}
                </div>
              )}
              {typeof content.ctaText === 'string' && content.ctaText.trim() && (
                <div className="portal-nav">
                  {renderSectionLink(
                    typeof content.ctaHref === 'string' ? content.ctaHref : '/library',
                    content.ctaText,
                    true
                  )}
                </div>
              )}
            </section>
          );
        })}

        {visibleSections.every((s) => s.sectionKey !== 'featured_books') &&
          featuredBooks.length > 0 && (
            <section className="portal-section">
              <div className="portal-section-title">
                <span>📚 الكتب المتاحة للقراءة</span>
                <Link to="/library" className="portal-btn">
                  المكتبة الكاملة ←
                </Link>
              </div>
              <div className="portal-grid">
                {featuredBooks.map((book) => (
                  <article key={book.slug} className="portal-card">
                    <h3>{book.title}</h3>
                    <p>{book.subtitle || book.description}</p>
                    <Link to={`/read/${book.slug}`} className="portal-btn primary">
                      📖 فتح الكتاب
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          )}
      </main>

      <footer className="portal-footer">
        <div>
          {footerSection?.titleAr ||
            (typeof branding.cloudLabel === 'string'
              ? branding.cloudLabel
              : 'منظومة درب التعليمية السحابية')}
        </div>
        {typeof footerSection?.contentJson?.copyright === 'string' && (
          <div style={{ marginTop: 6 }}>{footerSection.contentJson.copyright}</div>
        )}
      </footer>
    </>
  );
};
