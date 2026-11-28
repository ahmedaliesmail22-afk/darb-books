import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '@darb/book-engine/styles/tokens.css';
import '@darb/book-engine/styles/book.css';
import '@darb/book-engine/styles/modals.css';
import '@darb/book-engine/styles/blocks.css';
import '@darb/book-engine/styles/themes.css';
import {
  normalizeAssetDir,
  normalizeDataFile,
  parseCatalogData,
  parseEditionData,
  type BookmarkRecord,
  type EditionData,
  type EditionMeta,
} from '@darb/book-schema';
import {
  applyEngineThemeTokens,
  BookStage3D,
  createDefaultBlockRegistry,
  FlipEngine,
  InteractiveLabModal,
  NarratorController,
  OfflineManager,
  resolveEngineConfig,
  VideoModal,
} from '@darb/book-engine';
import { ApiError, apiRequest, resolveMediaBaseUrl } from '../lib/apiClient';
import { getPublicationStatusLabelAr } from '../lib/arabicLabels';
import { usePortal } from '../lib/portalContext';
import type { PortalBookItem } from '../lib/types';
import { LibraryPanel } from '../library/LibraryPanel';

interface BookReaderShellProps {
  initialEditionSlug?: string;
  initialSpread?: number;
  initialVersionId?: string;
}

function getReqEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing reader element #${id}`);
  return el as T;
}

export const BookReaderShell: React.FC<BookReaderShellProps> = ({
  initialEditionSlug,
  initialSpread = 0,
  initialVersionId,
}) => {
  const { mode, apiBase, configs, user, theme, fontScale, setTheme, setFontScale } = usePortal();
  const navigate = useNavigate();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewInfo, setPreviewInfo] = useState<{ label: string; status: string } | null>(null);
  const modeRef = useRef(mode);
  const apiBaseRef = useRef(apiBase);
  const userRef = useRef(user);
  modeRef.current = mode;
  apiBaseRef.current = apiBase;
  userRef.current = user;

  useEffect(() => {
    document.body.classList.add('reader-mode');

    const branding = (configs['branding.portal'] as Record<string, unknown> | undefined) ?? {};
    const flags = (configs['features.flags'] as Record<string, unknown> | undefined) ?? {};

    const engineConfig = resolveEngineConfig({
      direction: 'rtl',
      defaultTheme: theme,
      defaultFontScale: fontScale,
      autoFlipDelayMs: 100,
      longPressDelayMs: 600,
      branding: {
        portalTitle:
          typeof branding.portalTitle === 'string'
            ? branding.portalTitle
            : 'بوابة درب للكتب التفاعلية',
        cloudLabel:
          typeof branding.cloudLabel === 'string'
            ? branding.cloudLabel
            : 'منظومة درب السحابية',
      },
      features: {
        enable3DStage: flags.enable3DStage !== false,
        enableNarrator: flags.enableNarrator !== false,
        enableChapterVideos: flags.enableChapterVideos !== false,
        enableOfflineCache: flags.enableOfflineCache !== false,
        enableBookmarks: flags.enableBookmarks !== false,
        enableSearch: flags.enableSearch !== false,
        enableGridOverview: flags.enableGridOverview !== false,
        enableShare: flags.enableShare !== false,
      },
    });

    applyEngineThemeTokens(engineConfig);

    const toastEl = getReqEl('toastBanner');
    const brandTitleEl = getReqEl('bookBrandTitle');
    const btnThemeEl = getReqEl('btnTheme');
    const stageEl = getReqEl('stage');
    const stageCanvasEl = getReqEl<HTMLCanvasElement>('bookStageCanvas');

    let toastTimer: number | null = null;
    const showToast = (msg: string) => {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      if (toastTimer !== null) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastEl.classList.remove('show');
      }, 2800);
    };

    const stage3D = new BookStage3D(stageEl, stageCanvasEl, {
      enabled: engineConfig.features.enable3DStage,
      mobileBreakpointPx: engineConfig.mobileBreakpointPx,
      lightingOverrides: engineConfig.stageLightingOverrides,
    });

    const offlineManager = new OfflineManager({
      swUrl: engineConfig.swUrl,
      swScope: engineConfig.swScope,
      storagePrefix: engineConfig.storagePrefix,
    });
    if (engineConfig.features.enableOfflineCache) {
      void offlineManager.registerServiceWorker();
    }

    let editionsList: EditionMeta[] = [];
    let currentEdition: EditionMeta | null = null;
    const editionCache = new Map<string, EditionData>();
    let disposed = false;

    let flipEngine!: FlipEngine;
    let libraryPanel!: LibraryPanel;
    let narrator!: NarratorController;
    let videoModal!: VideoModal;

    let syncTimer: number | null = null;
    const scheduleCloudSync = (editionId: string, spreadIdx: number) => {
      if (modeRef.current !== 'api' || !userRef.current || initialVersionId) return;
      if (syncTimer !== null) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        const total = Math.max(1, flipEngine.getTotalSpreads() - 1);
        const percent = Math.round((spreadIdx / total) * 100);
        const bookmarksJson = libraryPanel.getBookmarksForEdition(editionId);
        void apiRequest(`/api/v1/books/${encodeURIComponent(editionId)}/progress`, {
          method: 'PUT',
          apiBase: apiBaseRef.current,
          body: { currentSpread: spreadIdx, percent, bookmarksJson },
        }).catch(() => {
          // keep local progress silently if offline
        });
      }, 250);
    };

    narrator = new NarratorController(
      {
        audioEl: getReqEl<HTMLAudioElement>('narratorAudioPlayer'),
        btnToggleEl: getReqEl('btnToggleNarrator'),
        barEl: getReqEl('narratorBar'),
        statusEl: getReqEl('narratorStatus'),
        timeEl: getReqEl('narratorTime'),
        btnPlayEl: getReqEl('btnNarratorPlay'),
        btnStopEl: getReqEl('btnNarratorStop'),
        btnBack10El: getReqEl('btnNarratorBack10'),
        btnFwd10El: getReqEl('btnNarratorFwd10'),
        speedEl: getReqEl<HTMLSelectElement>('narratorSpeed'),
      },
      {
        getTotalSpreads: () => flipEngine.getTotalSpreads(),
        getUnifiedSpreadIndex: () => flipEngine.getUnifiedSpreadIndex(),
        isMobile: () => flipEngine.isMobile(),
        goToSpread: (idx) => flipEngine.goToSpread(idx),
        nextPage: () => flipEngine.nextPage(),
        onBookCompleted: () => libraryPanel.showCelebration(),
      },
      {
        autoFlipDelayMs: engineConfig.autoFlipDelayMs,
        preloadNext: true,
      }
    );

    videoModal = new VideoModal({
      modalEl: getReqEl('cartoonModal'),
      titleEl: getReqEl('cartoonModalTitle'),
      subtitleEl: getReqEl('cartoonModalSubtitle'),
      closeBtnEl: getReqEl('btnCartoonClose'),
      videoWrapperEl: getReqEl('videoWrapper'),
      videoEl: getReqEl<HTMLVideoElement>('chapterVideo'),
      noticeEl: getReqEl('anatomicalVideoNotice'),
      onBeforeOpen: () => narrator.pauseNarrator(),
    });

    const blockRegistry = createDefaultBlockRegistry();
    const labModal = new InteractiveLabModal({
      modalEl: getReqEl('interactiveLabModal'),
      titleEl: getReqEl('labModalTitle'),
      subtitleEl: getReqEl('labModalSubtitle'),
      bodyEl: getReqEl('labModalBody'),
      closeBtnEl: getReqEl('btnLabClose'),
      onBeforeOpen: () => narrator.pauseNarrator(),
      onToast: showToast,
    });

    flipEngine = new FlipEngine(
      {
        bookEl: getReqEl('book'),
        rightPageEl: getReqEl('rightPage'),
        leftPageEl: getReqEl('leftPage'),
        progressFillEl: getReqEl('progressFill'),
        pageIndicatorEl: getReqEl('pageIndicator'),
      },
      stage3D,
      {
        onSpreadChanged: (spreadIdx) => {
          narrator.onSpreadChanged(spreadIdx);
          if (currentEdition) {
            const summary = flipEngine.getSpreadSummary(spreadIdx);
            libraryPanel.saveProgress(currentEdition.id, spreadIdx, summary.pageLabel);
            libraryPanel.syncBookmarkButton();
            scheduleCloudSync(currentEdition.id, spreadIdx);
          }
        },
        onChapterLongPress: (chapterNum) => {
          if (!currentEdition || !engineConfig.features.enableChapterVideos) return;
          const vDir = resolveMediaBaseUrl(currentEdition.videoDir, modeRef.current === 'api' ? apiBaseRef.current : null);
          videoModal.open(chapterNum, currentEdition, vDir);
        },
        blockRegistry,
        onOpenBlockFullscreen: (block) =>
          labModal.open(block, blockRegistry, { isMobile: flipEngine.isMobile() }),
        onToast: showToast,
      },
      engineConfig
    );

    const switchEdition = async (editionId: string, startSpread = 0) => {
      if (disposed || editionsList.length === 0) return;
      const ed = editionsList.find((e) => e.id === editionId) ?? editionsList[0];
      if (!ed) return;

      narrator.stop();
      currentEdition = ed;
      setLoadError(null);

      const audioBase =
        modeRef.current === 'api'
          ? resolveMediaBaseUrl(ed.audioDir, apiBaseRef.current)
          : normalizeAssetDir(ed.audioDir);
      narrator.setAudioDir(audioBase);
      stage3D.setEditionAccent(ed.theme);

      let data = editionCache.get(ed.id);
      if (!data) {
        if (modeRef.current === 'api') {
          try {
            const rawData = await apiRequest<unknown>(
              `/api/v1/books/${encodeURIComponent(ed.id)}/editions-data`,
              { apiBase: apiBaseRef.current }
            );
            data = parseEditionData(rawData);
          } catch (err) {
            if (err instanceof ApiError && err.status === 403) {
              setLoadError(err.message);
              return;
            }
            const res = await fetch(normalizeDataFile(ed.dataFile));
            if (!res.ok) {
              setLoadError(`تعذر تحميل بيانات ${ed.title}`);
              return;
            }
            data = parseEditionData(await res.json());
          }
        } else {
          const res = await fetch(normalizeDataFile(ed.dataFile));
          if (!res.ok) {
            setLoadError(`تعذر تحميل بيانات ${ed.title}`);
            return;
          }
          data = parseEditionData(await res.json());
        }
        editionCache.set(ed.id, data);
      }

      if (disposed) return;

      let resolvedSpread = startSpread;
      if (modeRef.current === 'api' && userRef.current && !initialVersionId) {
        try {
          const progRes = await apiRequest<{
            progress: { currentSpread: number; bookmarksJson: BookmarkRecord[] } | null;
          }>(`/api/v1/books/${encodeURIComponent(ed.id)}/progress`, {
            apiBase: apiBaseRef.current,
          });
          if (progRes.progress) {
            if (Array.isArray(progRes.progress.bookmarksJson)) {
              libraryPanel.mergeEditionBookmarks(ed.id, progRes.progress.bookmarksJson);
            }
            if (startSpread === 0 && progRes.progress.currentSpread > 0) {
              resolvedSpread = progRes.progress.currentSpread;
            }
          }
        } catch {
          // ignore if progress endpoint fails
        }
      }

      const titleText = data.title || ed.title;
      brandTitleEl.textContent = titleText;
      document.title = `${titleText} — ${engineConfig.branding?.portalTitle ?? 'بوابة درب'}`;

      flipEngine.setEdition(data.spreads, {
        title: titleText,
        footer: titleText,
        initialSpread: resolvedSpread,
        chaptersCount: ed.chaptersCount,
      });
    };

    libraryPanel = new LibraryPanel(
      {
        libraryModalEl: getReqEl('libraryModal'),
        libraryListEl: getReqEl('libraryList'),
        btnLibraryCloseEl: getReqEl('btnLibraryClose'),
        gridModalEl: getReqEl('gridModal'),
        gridOverviewEl: getReqEl('gridOverview'),
        btnGridCloseEl: getReqEl('btnGridClose'),
        searchModalEl: getReqEl('searchModal'),
        searchInputEl: getReqEl<HTMLInputElement>('searchInput'),
        searchResultsEl: getReqEl('searchResults'),
        btnSearchCloseEl: getReqEl('btnSearchClose'),
        bookmarksModalEl: getReqEl('bookmarksModal'),
        bookmarksListEl: getReqEl('bookmarksList'),
        btnBookmarksCloseEl: getReqEl('btnBookmarksClose'),
        shortcutsModalEl: getReqEl('shortcutsModal'),
        btnShortcutsCloseEl: getReqEl('btnShortcutsClose'),
        celebrationModalEl: getReqEl('celebrationModal'),
        celebrationTitleEl: getReqEl('celebrationTitle'),
        celebrationDescEl: getReqEl('celebrationDesc'),
        btnCelebrationCloseEl: getReqEl('btnCelebrationClose'),
        btnRestartBookEl: getReqEl('btnRestartBook'),
        btnOpenLibraryFromCelebrationEl: getReqEl('btnOpenLibraryFromCelebration'),
        btnBookmarkEl: getReqEl('btnBookmark'),
      },
      {
        flipEngine,
        offlineManager,
        getEditions: () => editionsList,
        getCurrentEdition: () => currentEdition,
        onSwitchEdition: (editionId, sp) => switchEdition(editionId, sp ?? 0),
        onToast: showToast,
        onBookmarksChanged: (editionId) => {
          scheduleCloudSync(editionId, flipEngine.getCurrentSpreadIndex());
        },
      }
    );

    const syncThemeButton = () => {
      const t = flipEngine.getTheme();
      btnThemeEl.textContent = t === 'sepia' ? '📜' : t === 'dark' ? '🌙' : '☀️';
    };
    syncThemeButton();
    stage3D.setTheme(flipEngine.getTheme());
    const initialResizeRaf = window.requestAnimationFrame(() => {
      if (!disposed) stage3D.resize();
    });

    // Bind controls with clean teardown
    const isModalOpen = () =>
      videoModal.isOpen() || labModal.isOpen() || libraryPanel.isAnyModalOpen();
    const onNext = () => flipEngine.nextPage();
    const onPrev = () => flipEngine.prevPage();
    const onToc = () => flipEngine.goToSpread(flipEngine.findTocSpreadIndex());
    const onLib = () => libraryPanel.openLibrary();
    const onGrid = () => libraryPanel.openGridOverview();
    const onSearch = () => libraryPanel.openSearch();
    const onBm = () => libraryPanel.toggleCurrentBookmark();
    const onBmList = () => libraryPanel.openBookmarks();
    const onShare = () => void libraryPanel.shareCurrentPage();
    const onShortcuts = () => libraryPanel.openShortcuts();
    const onOffline = () => void libraryPanel.saveCurrentEditionOfflineQuick();
    const onFontDec = () => {
      const s = flipEngine.stepFontScale(-1);
      setFontScale(s);
    };
    const onFontInc = () => {
      const s = flipEngine.stepFontScale(1);
      setFontScale(s);
    };
    const onTheme = () => {
      const next = flipEngine.cycleTheme();
      setTheme(next);
      syncThemeButton();
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };
    const progressTrack = getReqEl('progressTrack');
    const onTrackClick = (e: MouseEvent) => {
      const rect = progressTrack.getBoundingClientRect();
      flipEngine.jumpByProgressRatio((e.clientX - rect.left) / rect.width);
    };

    const onResize = () => flipEngine.handleResize();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (labModal.isOpen()) labModal.close();
        if (videoModal.isOpen()) videoModal.close();
        libraryPanel.closeAllModals();
        return;
      }
      if (isModalOpen()) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === ' ') {
        if (e.key === ' ') e.preventDefault();
        flipEngine.nextPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageUp') {
        flipEngine.prevPage();
      } else if (e.key === 'Home') {
        flipEngine.goToSpread(0);
      } else if (e.key === 'End') {
        flipEngine.goToSpread(flipEngine.getTotalSpreads() - 1);
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        libraryPanel.openShortcuts();
      } else if (e.key === '+' || e.key === '=') {
        onFontInc();
      } else if (e.key === '-') {
        onFontDec();
      } else if (e.key === 'f' || e.key === 'F') {
        onFullscreen();
      } else if (e.key === 'n' || e.key === 'N') {
        narrator.toggle();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (flipEngine.isMobile() || isModalOpen()) return;
      const rect = stageEl.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      getReqEl('book').style.transform = `rotateY(${nx * 5}deg) rotateX(${-ny * 3.5}deg)`;
      stage3D.setPointerTilt(nx, ny);
    };
    const onMouseLeave = () => {
      getReqEl('book').style.transform = 'rotateY(0deg) rotateX(0deg)';
      stage3D.resetPointerTilt();
    };

    getReqEl('btnNext').addEventListener('click', onNext);
    getReqEl('btnPrev').addEventListener('click', onPrev);
    getReqEl('btnToc').addEventListener('click', onToc);
    getReqEl('btnLibrary').addEventListener('click', onLib);
    getReqEl('btnGrid').addEventListener('click', onGrid);
    getReqEl('btnSearch').addEventListener('click', onSearch);
    getReqEl('btnBookmark').addEventListener('click', onBm);
    getReqEl('btnBookmarksList').addEventListener('click', onBmList);
    getReqEl('btnShare').addEventListener('click', onShare);
    getReqEl('btnShortcuts').addEventListener('click', onShortcuts);
    getReqEl('btnOfflineQuick').addEventListener('click', onOffline);
    getReqEl('btnFontDec').addEventListener('click', onFontDec);
    getReqEl('btnFontInc').addEventListener('click', onFontInc);
    btnThemeEl.addEventListener('click', onTheme);
    getReqEl('btnFullscreen').addEventListener('click', onFullscreen);
    progressTrack.addEventListener('click', onTrackClick);
    stageEl.addEventListener('mousemove', onMouseMove);
    stageEl.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);

    const bootstrapReader = async () => {
      let defaultId = initialEditionSlug || 'epic-v1';
      setPreviewInfo(null);

      if (initialVersionId && modeRef.current === 'api') {
        try {
          const previewRes = await apiRequest<{
            book: {
              slug: string;
              title: string;
              subtitle?: string | null;
              description?: string | null;
              badge?: string | null;
              badgeColor?: string | null;
              theme: string;
            };
            version: {
              id: string;
              versionNumber: number;
              versionLabel: string;
              audioDir?: string | null;
              videoDir?: string | null;
              chaptersCount: number;
              spreadsCount: number;
              status: string;
            };
            editionData: unknown;
          }>(`/api/v1/author/versions/${encodeURIComponent(initialVersionId)}/preview`, {
            apiBase: apiBaseRef.current,
          });
          const parsedData = parseEditionData(previewRes.editionData);
          editionCache.set(previewRes.book.slug, parsedData);
          editionsList = [
            {
              id: previewRes.book.slug,
              title: parsedData.title || previewRes.book.title,
              subtitle: previewRes.book.subtitle ?? '',
              badge: `معاينة ${previewRes.version.versionLabel}`,
              badgeColor: previewRes.book.badgeColor ?? '#38bdf8',
              theme: previewRes.book.theme ?? 'royal-gold',
              description: previewRes.book.description ?? '',
              dataFile: `./editions/${previewRes.book.slug}.json`,
              audioDir: previewRes.version.audioDir ?? '',
              videoDir: previewRes.version.videoDir ?? '',
              chaptersCount: previewRes.version.chaptersCount,
              spreadsCount: previewRes.version.spreadsCount,
              audioTracksCount: 0,
              videosCount: 0,
              releaseDate: '',
              status: 'draft',
            },
          ];
          defaultId = previewRes.book.slug;
          setPreviewInfo({
            label: previewRes.version.versionLabel,
            status: previewRes.version.status,
          });
        } catch (err) {
          setLoadError(
            err instanceof Error ? err.message : 'تعذر تحميل معاينة الإصدار غير المنشور'
          );
          return;
        }
      } else if (modeRef.current === 'api') {
        try {
          const apiBooks = await apiRequest<{ books: PortalBookItem[] }>('/api/v1/books', {
            apiBase: apiBaseRef.current,
          });
          editionsList = apiBooks.books.map((b) => ({
            id: b.slug,
            title: b.title,
            subtitle: b.subtitle ?? '',
            badge: b.badge ?? 'إصدار تفاعلي',
            badgeColor: b.badgeColor ?? '#f59e0b',
            theme: b.theme ?? 'royal-gold',
            description: b.description ?? '',
            dataFile: `./editions/${b.slug}.json`,
            audioDir: b.activeVersion?.audioDir ?? `./audio/${b.slug}/`,
            videoDir: b.activeVersion?.videoDir ?? `./videos/${b.slug}/`,
            chaptersCount: b.activeVersion?.chaptersCount ?? 7,
            spreadsCount: b.activeVersion?.spreadsCount ?? 27,
            audioTracksCount: b.activeVersion?.audioTracksCount ?? 0,
            videosCount: b.activeVersion?.videosCount ?? 0,
            releaseDate: '',
            status: 'published',
          }));
          if (!initialEditionSlug && editionsList[0]) {
            defaultId = editionsList[0].id;
          }
        } catch {
          // fallback below
        }
      }

      if (editionsList.length === 0) {
        const res = await fetch('./editions/catalog.json');
        if (!res.ok) {
          setLoadError('تعذر تحميل فهرس الإصدارات');
          return;
        }
        const catalog = parseCatalogData(await res.json());
        editionsList = catalog.editions;
        if (!initialEditionSlug) defaultId = catalog.defaultEdition;
      }

      const startSlug =
        initialEditionSlug || defaultId || editionsList[0]?.id;
      if (startSlug) {
        await switchEdition(startSlug, initialSpread);
      }
    };

    void bootstrapReader();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(initialResizeRaf);
      if (toastTimer !== null) window.clearTimeout(toastTimer);
      if (syncTimer !== null) window.clearTimeout(syncTimer);
      narrator.stop();
      labModal.dispose();
      flipEngine.dispose();
      stage3D.dispose();
      document.body.classList.remove('reader-mode');

      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      stageEl.removeEventListener('mousemove', onMouseMove);
      stageEl.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [initialEditionSlug, initialSpread, initialVersionId]);

  return (
    <>
      <audio id="narratorAudioPlayer" preload="none" style={{ display: 'none' }} />

      <header className="top-bar">
        <div className="book-brand">
          <button
            type="button"
            className="btn-action"
            onClick={() => (initialVersionId ? navigate(-1) : navigate('/library'))}
            title={initialVersionId ? 'العودة إلى صفحة التأليف/المراجعة' : 'العودة إلى المكتبة'}
            style={{ padding: '4px 10px' }}
          >
            {initialVersionId ? '← عودة' : '← المكتبة'}
          </button>
          <span className="brand-icon">📜</span>
          <span id="bookBrandTitle">مَلْحَمَةُ دَرْب: السِّيرَةُ التَّقْنِيَّةُ</span>
          {previewInfo && (
            <span
              className="portal-mode-pill"
              data-testid="readerPreviewBadge"
              style={{
                background: 'rgba(56, 189, 248, 0.16)',
                color: '#38bdf8',
                borderColor: 'rgba(56, 189, 248, 0.45)',
              }}
            >
              👁️ معاينة {previewInfo.label} ({getPublicationStatusLabelAr(previewInfo.status)})
            </span>
          )}
        </div>

        <div className="top-actions">
          <button className="btn-action" id="btnLibrary" title="مكتبة الأجزاء والإصدارات">
            <span>📚</span>
            <span className="btn-text-label">المكتبة</span>
          </button>

          <button className="btn-action" id="btnToggleNarrator" title="تفعيل وضع الراوي الصوتي التلقائي (N)">
            <span>🎙️</span>
            <span className="btn-text-label">الراوي</span>
          </button>

          <button className="btn-action" id="btnToc" title="الانتقال إلى الفهرس">
            <span>📑</span>
            <span className="btn-text-label">الفهرس</span>
          </button>

          <button className="icon-btn" id="btnSearch" title="البحث داخل الكتاب">🔍</button>
          <button className="icon-btn" id="btnGrid" title="عرض مصغّرات الصفحات">⊞</button>
          <button className="icon-btn" id="btnBookmark" title="إشارة مرجعية للصفحة الحالية">☆</button>
          <button className="icon-btn" id="btnBookmarksList" title="قائمة الإشارات المرجعية">🔖</button>

          <div className="font-size-group" title="تغيير حجم خط القراءة">
            <button className="icon-btn font-btn" id="btnFontDec" title="تصغير الخط (-)">A-</button>
            <button className="icon-btn font-btn" id="btnFontInc" title="تكبير الخط (+)">A+</button>
          </div>

          <button className="icon-btn" id="btnTheme" title="تبديل الثيم (مخطوطة / ليلي / فاتح)">📜</button>
          <button className="icon-btn" id="btnFullscreen" title="ملء الشاشة (F)">⛶</button>
        </div>
      </header>

      <div className="narrator-bar" id="narratorBar">
        <div className="narrator-eq">
          <span /><span /><span /><span />
        </div>
        <div className="narrator-text-status" id="narratorStatus">جاهز للرواية...</div>
        <span className="narrator-time" id="narratorTime">00:00 / 00:00</span>
        <button className="narrator-btn" id="btnNarratorBack10" title="ترجيع 10 ثوانٍ">10↺</button>
        <button className="narrator-btn" id="btnNarratorPlay" title="تشغيل / إيقاف مؤقت">▶</button>
        <button className="narrator-btn" id="btnNarratorFwd10" title="تقديم 10 ثوانٍ">↻10</button>
        <button className="narrator-btn" id="btnNarratorStop" title="إيقاف نهائي">⏹</button>
        <select className="speed-select" id="narratorSpeed" title="سرعة القراءة" defaultValue="1.0">
          <option value="0.85">0.85x هادئ</option>
          <option value="1.0">1.0x متزن</option>
          <option value="1.15">1.15x سريع</option>
        </select>
      </div>

      {loadError ? (
        <main className="portal-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="portal-card" style={{ maxWidth: 480, textAlign: 'center' }}>
            <h2>🛡️ تعذر فتح الكتاب</h2>
            <p>{loadError}</p>
            <Link to="/library" className="portal-btn primary">
              العودة إلى المكتبة
            </Link>
          </div>
        </main>
      ) : null}

      <main className="stage" id="stage" style={loadError ? { display: 'none' } : undefined}>
        <canvas className="book-stage-canvas" id="bookStageCanvas" aria-hidden="true" />
        <div className="book book-closed-front" id="book">
          <div className="spread">
            <div className="page-leaf right-leaf" id="rightPage">
              <div className="corner-peel-hotspot" id="cornerHotspotRight" title="انقر للرجوع للصفحة السابقة" />
              <div className="corner-peel-curl" />
            </div>
            <div className="page-leaf left-leaf" id="leftPage">
              <div className="corner-peel-hotspot" id="cornerHotspotLeft" title="انقر لتقليب الصفحة التالية" />
              <div className="corner-peel-curl" />
            </div>
          </div>
        </div>
      </main>

      <footer className="bottom-bar">
        <div className="page-nav-btns">
          <button className="nav-btn" id="btnPrev" title="الصفحة السابقة">
            <span>▶</span>
            <span className="nav-label">السابق</span>
          </button>
        </div>

        <div className="progress-wrap">
          <div className="progress-track" id="progressTrack" title="انقر للقفز المباشر">
            <div className="progress-fill" id="progressFill" />
          </div>
          <div className="page-indicator" id="pageIndicator">الغلاف الأمامي</div>
        </div>

        <div className="reader-tools-strip">
          <button className="icon-btn" id="btnOfflineQuick" title="حفظ هذا الكتاب للقراءة دون إنترنت">📥</button>
          <button className="icon-btn" id="btnShare" title="مشاركة / نسخ رابط الصفحة الحالية">🔗</button>
          <button className="icon-btn desktop-only-tool" id="btnShortcuts" title="دليل اختصارات لوحة المفاتيح (?)">?</button>
          <button className="nav-btn" id="btnNext" title="الصفحة التالية">
            <span className="nav-label">التالي</span>
            <span>◀</span>
          </button>
        </div>
      </footer>

      <div className="modal-overlay" id="cartoonModal" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="cartoonModalTitle">
        <div className="modal-card video-card">
          <div className="modal-header">
            <div className="modal-title-wrap">
              <h3 id="cartoonModalTitle">كواليس الفصل</h3>
              <p id="cartoonModalSubtitle">ملخص مرئي متزامن بالصوت الفصيح</p>
            </div>
            <button className="modal-close-btn" id="btnCartoonClose" title="إغلاق">✕</button>
          </div>
          <div className="video-wrapper" id="videoWrapper">
            <video id="chapterVideo" controls playsInline preload="metadata" />
          </div>
          <div id="anatomicalVideoNotice" className="video-notice" style={{ display: 'none' }} />
        </div>
      </div>

      <div className="modal-overlay" id="libraryModal" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="libraryModalTitle">
        <div className="modal-card library-card">
          <div className="modal-header">
            <div className="modal-title-wrap">
              <h3 id="libraryModalTitle">📚 مكتبة أجزاء وإصدارات منظومة درب</h3>
              <p>تابع القراءة من آخر موضع، بدّل الإصدار فوراً، أو احفظه للقراءة دون إنترنت</p>
            </div>
            <button className="modal-close-btn" id="btnLibraryClose" title="إغلاق">✕</button>
          </div>
          <div id="libraryList" className="library-grid" />
        </div>
      </div>

      <div className="modal-overlay" id="gridModal" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="gridModalTitle">
        <div className="modal-card grid-card">
          <div className="modal-header">
            <div className="modal-title-wrap">
              <h3 id="gridModalTitle">⊞ استعراض مصغّرات صفحات الكتاب</h3>
              <p>اضغط على أي نشرة للقفز المباشر إليها</p>
            </div>
            <button className="modal-close-btn" id="btnGridClose" title="إغلاق">✕</button>
          </div>
          <div id="gridOverview" className="grid-overview" />
        </div>
      </div>

      <div className="modal-overlay" id="searchModal" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="searchModalTitle">
        <div className="modal-card tools-card">
          <div className="modal-header">
            <div className="modal-title-wrap">
              <h3 id="searchModalTitle">🔍 البحث الفوري في صفحات الكتاب</h3>
              <p>ابحث بالكلمات أو المصطلحات التقنية داخل الكتاب المفتوح</p>
            </div>
            <button className="modal-close-btn" id="btnSearchClose" title="إغلاق">✕</button>
          </div>
          <div className="search-input-wrap">
            <input className="search-input" id="searchInput" type="search" placeholder="اكتب كلمة البحث هنا..." />
          </div>
          <div id="searchResults" className="search-results" />
        </div>
      </div>

      <div className="modal-overlay" id="bookmarksModal" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="bookmarksModalTitle">
        <div className="modal-card tools-card">
          <div className="modal-header">
            <div className="modal-title-wrap">
              <h3 id="bookmarksModalTitle">⭐ الإشارات المرجعية المحفوظة</h3>
              <p>اضغط على أي إشارة للانتقال السريع إلى صفحتها</p>
            </div>
            <button className="modal-close-btn" id="btnBookmarksClose" title="إغلاق">✕</button>
          </div>
          <div id="bookmarksList" className="bookmarks-list" />
        </div>
      </div>

      <div className="modal-overlay" id="shortcutsModal" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="shortcutsModalTitle">
        <div className="modal-card tools-card">
          <div className="modal-header">
            <div className="modal-title-wrap">
              <h3 id="shortcutsModalTitle">⌨️ اختصارات لوحة المفاتيح السريعة</h3>
              <p>تحكم كامل وسريع بتجربة القراءة والراوي الصوتي</p>
            </div>
            <button className="modal-close-btn" id="btnShortcutsClose" title="إغلاق">✕</button>
          </div>
          <div className="shortcuts-grid">
            <div className="shortcut-row"><span>الصفحة التالية</span><kbd>← / Space</kbd></div>
            <div className="shortcut-row"><span>الصفحة السابقة</span><kbd>→ / PageUp</kbd></div>
            <div className="shortcut-row"><span>بداية الكتاب / الغلاف</span><kbd>Home</kbd></div>
            <div className="shortcut-row"><span>نهاية الكتاب</span><kbd>End</kbd></div>
            <div className="shortcut-row"><span>تشغيل / إيقاف الراوي</span><kbd>N</kbd></div>
            <div className="shortcut-row"><span>تكبير / تصغير الخط</span><kbd>+ / -</kbd></div>
            <div className="shortcut-row"><span>ملء الشاشة</span><kbd>F</kbd></div>
            <div className="shortcut-row"><span>دليل الاختصارات / إغلاق</span><kbd>? / Esc</kbd></div>
          </div>
        </div>
      </div>

      <div className="modal-overlay" id="celebrationModal" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="celebrationTitle">
        <div className="modal-card celebration-card">
          <button className="modal-close-btn celebration-close-btn" id="btnCelebrationClose" title="إغلاق">✕</button>
          <div className="celebration-badge">🏆</div>
          <h2 id="celebrationTitle">«اكتملت الرواية بحمد الله»</h2>
          <p id="celebrationDesc">لقد أتممت قراءة واستماع الكتاب بالكامل.</p>
          <div className="celebration-actions">
            <button className="celebration-btn" id="btnRestartBook">🔄 العودة للبداية</button>
            <button className="celebration-btn primary" id="btnOpenLibraryFromCelebration">📚 تصفح الأجزاء</button>
          </div>
        </div>
      </div>

      <div className="modal-overlay" id="interactiveLabModal" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="labModalTitle">
        <div className="modal-card lab-card">
          <div className="modal-header">
            <div className="modal-title-wrap">
              <h3 id="labModalTitle">المختبر التفاعلي الكامل</h3>
              <p id="labModalSubtitle">تجربة تفاعلية موسعة بملء الشاشة</p>
            </div>
            <button className="modal-close-btn" id="btnLabClose" title="إغلاق">✕</button>
          </div>
          <div id="labModalBody" className="lab-body" />
        </div>
      </div>

      <div className="toast-banner" id="toastBanner" role="status" aria-live="polite" />
    </>
  );
};
