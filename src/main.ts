import './styles/tokens.css';
import './styles/book.css';
import './styles/modals.css';
import './styles/themes.css';

import type { CatalogData, EditionData, EditionMeta } from './types/book';
import { normalizeAssetDir, normalizeDataFile } from './types/book';
import { BookStage3D } from './scene/BookStage3D';
import { FlipEngine } from './reader/FlipEngine';
import { NarratorController } from './audio/NarratorController';
import { VideoModal } from './video/VideoModal';
import { OfflineManager } from './pwa/OfflineManager';
import { LibraryPanel } from './library/LibraryPanel';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
      };
    };
  }
}

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required DOM element: #${id}`);
  return el as T;
}

class DarbBooksApp {
  private stage3D: BookStage3D;
  private flipEngine: FlipEngine;
  private narrator: NarratorController;
  private videoModal: VideoModal;
  private offlineManager: OfflineManager;
  private libraryPanel: LibraryPanel;

  private catalog: CatalogData | null = null;
  private currentEdition: EditionMeta | null = null;
  private editionCache = new Map<string, EditionData>();

  private toastTimer: number | null = null;
  private toastEl: HTMLElement;
  private bookBrandTitleEl: HTMLElement;
  private btnThemeEl: HTMLElement;

  constructor() {
    if (window.Telegram?.WebApp?.ready) {
      try {
        window.Telegram.WebApp.ready();
      } catch {
        // ignore outside Telegram
      }
    }

    this.toastEl = getEl('toastBanner');
    this.bookBrandTitleEl = getEl('bookBrandTitle');
    this.btnThemeEl = getEl('btnTheme');

    const stageEl = getEl('stage');
    const stageCanvasEl = getEl<HTMLCanvasElement>('bookStageCanvas');
    this.stage3D = new BookStage3D(stageEl, stageCanvasEl);

    this.offlineManager = new OfflineManager();
    void this.offlineManager.registerServiceWorker();

    this.narrator = new NarratorController(
      {
        audioEl: getEl<HTMLAudioElement>('narratorAudioPlayer'),
        btnToggleEl: getEl('btnToggleNarrator'),
        barEl: getEl('narratorBar'),
        statusEl: getEl('narratorStatus'),
        timeEl: getEl('narratorTime'),
        btnPlayEl: getEl('btnNarratorPlay'),
        btnStopEl: getEl('btnNarratorStop'),
        btnBack10El: getEl('btnNarratorBack10'),
        btnFwd10El: getEl('btnNarratorFwd10'),
        speedEl: getEl<HTMLSelectElement>('narratorSpeed'),
      },
      {
        getTotalSpreads: () => this.flipEngine.getTotalSpreads(),
        getUnifiedSpreadIndex: () => this.flipEngine.getUnifiedSpreadIndex(),
        isMobile: () => this.flipEngine.isMobile(),
        goToSpread: (idx) => this.flipEngine.goToSpread(idx),
        nextPage: () => this.flipEngine.nextPage(),
        onBookCompleted: () => this.libraryPanel.showCelebration(),
      }
    );

    this.videoModal = new VideoModal({
      modalEl: getEl('cartoonModal'),
      titleEl: getEl('cartoonModalTitle'),
      subtitleEl: getEl('cartoonModalSubtitle'),
      closeBtnEl: getEl('btnCartoonClose'),
      videoWrapperEl: getEl('videoWrapper'),
      videoEl: getEl<HTMLVideoElement>('chapterVideo'),
      noticeEl: getEl('anatomicalVideoNotice'),
      onBeforeOpen: () => this.narrator.pauseNarrator(),
    });

    this.flipEngine = new FlipEngine(
      {
        bookEl: getEl('book'),
        rightPageEl: getEl('rightPage'),
        leftPageEl: getEl('leftPage'),
        progressFillEl: getEl('progressFill'),
        pageIndicatorEl: getEl('pageIndicator'),
      },
      this.stage3D,
      {
        onSpreadChanged: (spreadIdx) => this.handleSpreadChanged(spreadIdx),
        onChapterLongPress: (chapterNum) => this.handleChapterLongPress(chapterNum),
      }
    );

    this.libraryPanel = new LibraryPanel(
      {
        libraryModalEl: getEl('libraryModal'),
        libraryListEl: getEl('libraryList'),
        btnLibraryCloseEl: getEl('btnLibraryClose'),
        gridModalEl: getEl('gridModal'),
        gridOverviewEl: getEl('gridOverview'),
        btnGridCloseEl: getEl('btnGridClose'),
        searchModalEl: getEl('searchModal'),
        searchInputEl: getEl<HTMLInputElement>('searchInput'),
        searchResultsEl: getEl('searchResults'),
        btnSearchCloseEl: getEl('btnSearchClose'),
        bookmarksModalEl: getEl('bookmarksModal'),
        bookmarksListEl: getEl('bookmarksList'),
        btnBookmarksCloseEl: getEl('btnBookmarksClose'),
        shortcutsModalEl: getEl('shortcutsModal'),
        btnShortcutsCloseEl: getEl('btnShortcutsClose'),
        celebrationModalEl: getEl('celebrationModal'),
        celebrationTitleEl: getEl('celebrationTitle'),
        celebrationDescEl: getEl('celebrationDesc'),
        btnCelebrationCloseEl: getEl('btnCelebrationClose'),
        btnRestartBookEl: getEl('btnRestartBook'),
        btnOpenLibraryFromCelebrationEl: getEl('btnOpenLibraryFromCelebration'),
        btnBookmarkEl: getEl('btnBookmark'),
      },
      {
        flipEngine: this.flipEngine,
        offlineManager: this.offlineManager,
        getEditions: () => this.catalog?.editions ?? [],
        getCurrentEdition: () => this.currentEdition,
        onSwitchEdition: (editionId, startSpread) => this.switchEdition(editionId, startSpread ?? 0),
        onToast: (msg) => this.showToast(msg),
      }
    );

    this.syncThemeButtonIcon();
    this.stage3D.setTheme(this.flipEngine.getTheme());
    this.bindGlobalControls(stageEl);
    void this.bootstrap();
  }

  private isAnyModalOpen(): boolean {
    return this.videoModal.isOpen() || this.libraryPanel.isAnyModalOpen();
  }

  private showToast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 2800);
  }

  private syncThemeButtonIcon(): void {
    const theme = this.flipEngine.getTheme();
    const icons = { sepia: '📜', dark: '🌙', light: '☀️' } as const;
    this.btnThemeEl.textContent = icons[theme];
  }

  private handleSpreadChanged(spreadIdx: number): void {
    this.narrator.onSpreadChanged(spreadIdx);
    if (this.currentEdition) {
      const summary = this.flipEngine.getSpreadSummary(spreadIdx);
      this.libraryPanel.saveProgress(this.currentEdition.id, spreadIdx, summary.pageLabel);
      this.libraryPanel.syncBookmarkButton();
      this.syncUrlParams(this.currentEdition.id, spreadIdx);
    }
  }

  private handleChapterLongPress(chapterNum: number): void {
    if (!this.currentEdition) return;
    const videoDir = normalizeAssetDir(this.currentEdition.videoDir);
    this.videoModal.open(chapterNum, this.currentEdition, videoDir);
  }

  private syncUrlParams(editionId: string, spreadIdx: number): void {
    if (!window.history?.replaceState) return;
    const url = new URL(window.location.href);
    url.searchParams.set('edition', editionId);
    url.searchParams.set('spread', String(spreadIdx));
    window.history.replaceState({ edition: editionId, spread: spreadIdx }, '', url.toString());
  }

  private bindGlobalControls(stageEl: HTMLElement): void {
    getEl('btnNext').addEventListener('click', () => this.flipEngine.nextPage());
    getEl('btnPrev').addEventListener('click', () => this.flipEngine.prevPage());
    getEl('btnToc').addEventListener('click', () => {
      this.flipEngine.goToSpread(this.flipEngine.findTocSpreadIndex());
    });
    getEl('btnLibrary').addEventListener('click', () => this.libraryPanel.openLibrary());
    getEl('btnGrid').addEventListener('click', () => this.libraryPanel.openGridOverview());
    getEl('btnSearch').addEventListener('click', () => this.libraryPanel.openSearch());
    getEl('btnBookmark').addEventListener('click', () => this.libraryPanel.toggleCurrentBookmark());
    getEl('btnBookmarksList').addEventListener('click', () => this.libraryPanel.openBookmarks());
    getEl('btnShare').addEventListener('click', () => void this.libraryPanel.shareCurrentPage());
    getEl('btnShortcuts').addEventListener('click', () => this.libraryPanel.openShortcuts());
    getEl('btnOfflineQuick').addEventListener('click', () => {
      void this.libraryPanel.saveCurrentEditionOfflineQuick();
    });

    getEl('btnFontDec').addEventListener('click', () => {
      const scale = this.flipEngine.stepFontScale(-1);
      this.showToast(scale === 'sm' ? 'حجم الخط: صغير' : scale === 'md' ? 'حجم الخط: متزن' : 'حجم الخط: كبير');
    });
    getEl('btnFontInc').addEventListener('click', () => {
      const scale = this.flipEngine.stepFontScale(1);
      this.showToast(scale === 'sm' ? 'حجم الخط: صغير' : scale === 'md' ? 'حجم الخط: متزن' : 'حجم الخط: كبير');
    });

    this.btnThemeEl.addEventListener('click', () => {
      this.flipEngine.cycleTheme();
      this.syncThemeButtonIcon();
    });

    getEl('btnFullscreen').addEventListener('click', () => this.toggleFullscreen());

    const progressTrack = getEl('progressTrack');
    progressTrack.addEventListener('click', (e) => {
      const rect = progressTrack.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      this.flipEngine.jumpByProgressRatio(ratio);
    });

    window.addEventListener('resize', () => this.flipEngine.handleResize());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.videoModal.isOpen()) this.videoModal.close();
        this.libraryPanel.closeAllModals();
        return;
      }
      if (this.isAnyModalOpen()) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === ' ') {
        if (e.key === ' ') e.preventDefault();
        this.flipEngine.nextPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageUp') {
        this.flipEngine.prevPage();
      } else if (e.key === 'Home') {
        this.flipEngine.goToSpread(0);
      } else if (e.key === 'End') {
        this.flipEngine.goToSpread(this.flipEngine.getTotalSpreads() - 1);
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        this.libraryPanel.openShortcuts();
      } else if (e.key === '+' || e.key === '=') {
        this.flipEngine.stepFontScale(1);
      } else if (e.key === '-') {
        this.flipEngine.stepFontScale(-1);
      } else if (e.key === 'f' || e.key === 'F') {
        this.toggleFullscreen();
      } else if (e.key === 'n' || e.key === 'N') {
        this.narrator.toggle();
      }
    });

    let touchStartX = 0;
    let touchStartedInModal = false;
    window.addEventListener(
      'touchstart',
      (e) => {
        const target = e.target as HTMLElement | null;
        touchStartedInModal = this.isAnyModalOpen() || Boolean(target?.closest('.modal-overlay'));
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );

    window.addEventListener(
      'touchend',
      (e) => {
        if (touchStartedInModal || this.isAnyModalOpen()) return;
        const diff = e.changedTouches[0].screenX - touchStartX;
        if (diff > 55) this.flipEngine.nextPage();
        else if (diff < -55) this.flipEngine.prevPage();
      },
      { passive: true }
    );

    stageEl.addEventListener('mousemove', (e) => {
      if (this.flipEngine.isMobile() || this.isAnyModalOpen()) return;
      const rect = stageEl.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      getEl('book').style.transform = `rotateY(${nx * 5}deg) rotateX(${-ny * 3.5}deg)`;
      this.stage3D.setPointerTilt(nx, ny);
    });

    stageEl.addEventListener('mouseleave', () => {
      getEl('book').style.transform = 'rotateY(0deg) rotateX(0deg)';
      this.stage3D.resetPointerTilt();
    });
  }

  private toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  private async bootstrap(): Promise<void> {
    try {
      const res = await fetch('./editions/catalog.json');
      if (!res.ok) throw new Error('Failed to load catalog.json');
      this.catalog = (await res.json()) as CatalogData;
    } catch (err) {
      console.error('Error loading catalog.json:', err);
      this.showToast('تعذر تحميل فهرس الإصدارات');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedEdition = params.get('edition');
    const requestedSpreadRaw = params.get('spread');
    const initialSpread = requestedSpreadRaw ? parseInt(requestedSpreadRaw, 10) : NaN;

    const editionExists = this.catalog.editions.some((e) => e.id === requestedEdition);
    const startId = editionExists
      ? (requestedEdition as string)
      : this.catalog.defaultEdition || this.catalog.editions[0]?.id;

    if (startId) {
      await this.switchEdition(
        startId,
        Number.isFinite(initialSpread) ? initialSpread : 0
      );
    }
  }

  public async switchEdition(editionId: string, startSpread = 0): Promise<void> {
    if (!this.catalog) return;
    const ed =
      this.catalog.editions.find((e) => e.id === editionId) || this.catalog.editions[0];
    if (!ed) return;

    this.narrator.stop();
    this.currentEdition = ed;
    this.narrator.setAudioDir(normalizeAssetDir(ed.audioDir));
    this.stage3D.setEditionAccent(ed.theme);

    let data = this.editionCache.get(ed.id);
    if (!data) {
      const dataUrl = normalizeDataFile(ed.dataFile);
      const res = await fetch(dataUrl);
      if (!res.ok) {
        this.showToast(`تعذر تحميل بيانات ${ed.title}`);
        return;
      }
      data = (await res.json()) as EditionData;
      this.editionCache.set(ed.id, data);
    }

    const titleText = data.title || ed.title;
    this.bookBrandTitleEl.textContent = titleText;
    document.title = `${titleText} — بوابة درب`;

    this.flipEngine.setEdition(data.spreads, {
      title: titleText,
      footer: titleText,
      initialSpread: startSpread,
      chaptersCount: ed.chaptersCount,
    });
  }
}

new DarbBooksApp();
