import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  normalizeAssetDir,
  parseCatalogData,
  type ThemeMode,
  type FontScale,
} from '@darb/book-schema';
import {
  apiRequest,
  getStoredTokens,
  resolveApiBaseUrl,
  setStoredTokens,
} from './apiClient';
import type {
  BootstrapPayload,
  CmsSectionItem,
  NewsPostItem,
  PortalBookItem,
  PortalMode,
  PortalUser,
  TaxonomyItem,
} from './types';

interface PortalContextValue {
  loading: boolean;
  mode: PortalMode;
  apiBase: string | null;
  configs: Record<string, unknown>;
  taxonomies: Record<string, TaxonomyItem[]>;
  homeSections: CmsSectionItem[];
  latestNews: NewsPostItem[];
  user: PortalUser | null;
  theme: ThemeMode;
  fontScale: FontScale;
  staticCatalogBooks: PortalBookItem[];
  toastMessage: string | null;
  showToast: (msg: string) => void;
  setTheme: (next: ThemeMode) => void;
  setFontScale: (next: FontScale) => void;
  refreshPortal: () => Promise<void>;
  refreshUser: () => Promise<PortalUser | null>;
  logout: () => Promise<void>;
  connectApiServer: (url: string) => Promise<boolean>;
  hasPermission: (permCode: string) => boolean;
}

const PortalContext = createContext<PortalContextValue | null>(null);

const DEFAULT_STATIC_SECTIONS: CmsSectionItem[] = [
  {
    id: 'static-hero',
    pageId: 'home',
    sectionKey: 'hero',
    titleAr: 'بوابة درب للكتب التفاعلية ثلاثية الأبعاد',
    sortOrder: 1,
    isVisible: true,
    contentJson: {
      badge: 'بوابة القراءة التفاعلية',
      subtitle: 'تصفح الكتب والروايات والمراجع التقنية في تجربة تقليب ثلاثية الأبعاد مع الراوي الصوتي وملخصات الفيديو.',
      primaryCtaText: 'دخول المكتبة الآن',
      primaryCtaHref: '/library',
    },
  },
  {
    id: 'static-features',
    pageId: 'home',
    sectionKey: 'features',
    titleAr: 'مميزات القراءة الغامرة',
    sortOrder: 2,
    isVisible: true,
    contentJson: {
      items: [
        { icon: '📚', title: 'محرك تقليب ثلاثي الأبعاد RTL', desc: 'قراءة عربية طبيعية بإضاءة Three.js وتجربة ورقية واقعية.' },
        { icon: '🎙️', title: 'الراوي الصوتي الفصيح MP3', desc: 'تلاوة متزامنة مع تسريع وانتقال تلقائي بين النشرات.' },
        { icon: '🎬', title: 'ملخصات فيديو وكواليس', desc: 'عروض مرئية متزامنة عند الضغط المطول على فصول الفهرس.' },
      ],
    },
  },
  {
    id: 'static-how',
    pageId: 'home',
    sectionKey: 'how_it_works',
    titleAr: 'كيف تعمل البوابة؟',
    sortOrder: 3,
    isVisible: true,
    contentJson: {
      steps: [
        { step: 1, title: 'اختر الكتاب', desc: 'تصفح الإصدارات المتاحة في المكتبة واختر ما يناسبك.' },
        { step: 2, title: 'اقرأ واستمع', desc: 'استخدم القارئ الثلاثي الأبعاد والراوي الصوتي والاختصارات.' },
        { step: 3, title: 'احفظ دون إنترنت', desc: 'دعم PWA لحفظ الأجزاء والعودة السريعة من آخر صفحة.' },
      ],
    },
  },
];

function applyDynamicBrandingCss(configs: Record<string, unknown>): void {
  const branding = configs['branding.portal'] as Record<string, unknown> | undefined;
  const root = document.documentElement;
  if (typeof branding?.primaryColor === 'string') {
    root.style.setProperty('--gold', branding.primaryColor);
    root.style.setProperty('--brand-primary', branding.primaryColor);
  }
  if (typeof branding?.accentColor === 'string') {
    root.style.setProperty('--brand-accent', branding.accentColor);
  }
}

export const PortalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PortalMode>('static');
  const [apiBase, setApiBase] = useState<string | null>(() => resolveApiBaseUrl());
  const [configs, setConfigs] = useState<Record<string, unknown>>({});
  const [taxonomies, setTaxonomies] = useState<Record<string, TaxonomyItem[]>>({});
  const [homeSections, setHomeSections] = useState<CmsSectionItem[]>(DEFAULT_STATIC_SECTIONS);
  const [latestNews, setLatestNews] = useState<NewsPostItem[]>([]);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [staticCatalogBooks, setStaticCatalogBooks] = useState<PortalBookItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('darb_books_theme_v1') as ThemeMode | null;
      return saved === 'dark' || saved === 'light' || saved === 'sepia' ? saved : 'sepia';
    } catch {
      return 'sepia';
    }
  });

  const [fontScale, setFontScaleState] = useState<FontScale>(() => {
    try {
      const saved = localStorage.getItem('darb_books_font_scale_v1') as FontScale | null;
      return saved === 'sm' || saved === 'md' || saved === 'lg' ? saved : 'md';
    } catch {
      return 'md';
    }
  });

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3000);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    document.body.classList.remove('theme-sepia', 'theme-dark', 'theme-light');
    document.body.classList.add(`theme-${next}`);
    try {
      localStorage.setItem('darb_books_theme_v1', next);
    } catch {
      // ignore
    }
  }, []);

  const setFontScale = useCallback((next: FontScale) => {
    setFontScaleState(next);
    document.body.classList.remove('font-scale-sm', 'font-scale-md', 'font-scale-lg');
    document.body.classList.add(`font-scale-${next}`);
    try {
      localStorage.setItem('darb_books_font_scale_v1', next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.body.classList.remove('theme-sepia', 'theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
    document.body.classList.remove('font-scale-sm', 'font-scale-md', 'font-scale-lg');
    document.body.classList.add(`font-scale-${fontScale}`);
  }, [theme, fontScale]);

  const loadStaticFallback = useCallback(async () => {
    setMode('static');
    setUser(null);
    setHomeSections(DEFAULT_STATIC_SECTIONS);
    try {
      const res = await fetch('./editions/catalog.json');
      if (!res.ok) return;
      const catalog = parseCatalogData(await res.json());
      const mapped: PortalBookItem[] = catalog.editions.map((ed) => ({
        id: ed.id,
        slug: ed.id,
        title: ed.title,
        subtitle: ed.subtitle,
        description: ed.description,
        badge: ed.badge,
        badgeColor: ed.badgeColor,
        theme: ed.theme,
        direction: 'rtl',
        coverUrl: ed.coverUrl ?? null,
        minAge: 0,
        isRecommended: false,
        matchScore: 0,
        taxonomies: [],
        activeVersion: {
          id: ed.id,
          versionNumber: 1,
          versionLabel: 'v1',
          audioDir: normalizeAssetDir(ed.audioDir),
          videoDir: normalizeAssetDir(ed.videoDir),
          chaptersCount: ed.chaptersCount,
          spreadsCount: ed.spreadsCount,
          audioTracksCount: ed.audioTracksCount,
          videosCount: ed.videosCount,
        },
        legacyMeta: ed,
      }));
      setStaticCatalogBooks(mapped);
    } catch {
      // ignore offline error
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<PortalUser | null> => {
    if (apiBase === null) {
      setUser(null);
      return null;
    }
    try {
      const tokens = getStoredTokens();
      if (!tokens?.accessToken) {
        // Attempt silent cookie-based check only when tokens exist or cookie may exist
        const me = await apiRequest<{ user: PortalUser }>('/api/v1/auth/me', {
          apiBase,
          skipRefresh: true,
        });
        setUser(me.user);
        return me.user;
      }
      const me = await apiRequest<{ user: PortalUser }>('/api/v1/auth/me', { apiBase });
      setUser(me.user);
      if (me.user.profile?.uiPrefsJson?.theme) {
        setTheme(me.user.profile.uiPrefsJson.theme);
      }
      if (me.user.profile?.uiPrefsJson?.fontScale) {
        setFontScale(me.user.profile.uiPrefsJson.fontScale);
      }
      return me.user;
    } catch {
      setUser(null);
      return null;
    }
  }, [apiBase, setFontScale, setTheme]);

  const refreshPortal = useCallback(async () => {
    setLoading(true);
    const currentBase = resolveApiBaseUrl();
    setApiBase(currentBase);

    if (currentBase === null) {
      await loadStaticFallback();
      setLoading(false);
      return;
    }

    try {
      const boot = await apiRequest<BootstrapPayload>('/api/v1/public/bootstrap', {
        apiBase: currentBase,
        skipRefresh: true,
      });
      setMode('api');
      setConfigs(boot.configs);
      setTaxonomies(boot.taxonomies);
      setHomeSections(boot.homePage?.sections ?? []);
      setLatestNews(boot.latestNews ?? []);
      applyDynamicBrandingCss(boot.configs);

      const portalBrand = boot.configs['branding.portal'] as Record<string, unknown> | undefined;
      if (typeof portalBrand?.portalTitle === 'string') {
        document.title = portalBrand.portalTitle;
      }

      if (getStoredTokens()) {
        try {
          const me = await apiRequest<{ user: PortalUser }>('/api/v1/auth/me', {
            apiBase: currentBase,
          });
          setUser(me.user);
          if (me.user.profile?.uiPrefsJson?.theme) {
            setTheme(me.user.profile.uiPrefsJson.theme);
          }
          if (me.user.profile?.uiPrefsJson?.fontScale) {
            setFontScale(me.user.profile.uiPrefsJson.fontScale);
          }
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch {
      await loadStaticFallback();
    } finally {
      setLoading(false);
    }
  }, [loadStaticFallback, setFontScale, setTheme]);

  useEffect(() => {
    void refreshPortal();
  }, [refreshPortal]);

  const logout = useCallback(async () => {
    if (apiBase !== null) {
      const tokens = getStoredTokens();
      try {
        await apiRequest('/api/v1/auth/logout', {
          method: 'POST',
          apiBase,
          body: tokens?.refreshToken ? { refreshToken: tokens.refreshToken } : {},
          skipRefresh: true,
        });
      } catch {
        // ignore logout failure
      }
    }
    setStoredTokens(null);
    setUser(null);
  }, [apiBase]);

  const connectApiServer = useCallback(
    async (url: string): Promise<boolean> => {
      const cleaned = url.trim().replace(/\/+$/, '');
      if (!cleaned) {
        localStorage.removeItem('darb_api_base');
        await refreshPortal();
        return false;
      }
      localStorage.setItem('darb_api_base', cleaned);
      await refreshPortal();
      return true;
    },
    [refreshPortal]
  );

  const hasPermission = useCallback(
    (permCode: string) => Boolean(user?.permissions?.includes(permCode)),
    [user]
  );

  return (
    <PortalContext.Provider
      value={{
        loading,
        mode,
        apiBase,
        configs,
        taxonomies,
        homeSections,
        latestNews,
        user,
        theme,
        fontScale,
        staticCatalogBooks,
        toastMessage,
        showToast,
        setTheme,
        setFontScale,
        refreshPortal,
        refreshUser,
        logout,
        connectApiServer,
        hasPermission,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
};

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider');
  return ctx;
}
