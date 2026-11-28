import React from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../lib/portalContext';

export const GuideAndNewsPage: React.FC = () => {
  const { homeSections, latestNews } = usePortal();
  const howSection = homeSections.find((s) => s.sectionKey === 'how_it_works');
  const steps = Array.isArray(howSection?.contentJson?.steps)
    ? (howSection.contentJson.steps as Array<{ step?: number; title?: string; desc?: string }>)
    : [];

  return (
    <main className="portal-main">
      <section className="portal-section">
        <div className="portal-section-title">
          <span>📰 الأخبار والتحديثات</span>
          <Link to="/library" className="portal-btn primary">
            دخول المكتبة ←
          </Link>
        </div>

        {latestNews.length === 0 ? (
          <div className="portal-card">لا توجد أخبار منشورة حالياً في هذا الوضع.</div>
        ) : (
          <div className="portal-grid">
            {latestNews.map((post) => (
              <article key={post.id} className="portal-card">
                <h3>{post.title}</h3>
                {post.summary && <p><strong>{post.summary}</strong></p>}
                <p>{post.bodyMd}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="portal-section">
        <h2 className="portal-section-title">🧭 دليل الاستخدام والاختصارات</h2>
        <div className="portal-grid">
          {steps.map((st, idx) => (
            <div key={idx} className="portal-card">
              <span className="portal-badge">الخطوة {st.step ?? idx + 1}</span>
              <h3>{st.title}</h3>
              <p>{st.desc}</p>
            </div>
          ))}
          <div className="portal-card">
            <h3>⌨️ اختصارات القارئ السريعة</h3>
            <p>
              الأسهم أو مفتاح المسافة للتقليب، حرف N لتشغيل الراوي الصوتي، علامتا الزائد والناقص
              لحجم الخط، حرف F لملء الشاشة، والضغط المطوّل لمدة 600 مللي ثانية على فهرس الفصل
              لفتح الفيديو.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};
