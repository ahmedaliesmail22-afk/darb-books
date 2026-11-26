import type {
  BookmarkRecord,
  EditionMeta,
  ReadingProgressRecord,
} from '@darb/book-schema';
import type { FlipEngine, OfflineManager } from '@darb/book-engine';

const PROGRESS_STORAGE_KEY = 'darb_books_progress_v1';
const BOOKMARKS_STORAGE_KEY = 'darb_books_bookmarks_v1';

export interface LibraryPanelOptions {
  flipEngine: FlipEngine;
  offlineManager: OfflineManager;
  getEditions: () => EditionMeta[];
  getCurrentEdition: () => EditionMeta | null;
  onSwitchEdition: (editionId: string, startSpread?: number) => Promise<void>;
  onToast: (msg: string) => void;
}

export class LibraryPanel {
  private opts: LibraryPanelOptions;

  private libraryModalEl: HTMLElement;
  private libraryListEl: HTMLElement;
  private gridModalEl: HTMLElement;
  private gridOverviewEl: HTMLElement;
  private searchModalEl: HTMLElement;
  private searchInputEl: HTMLInputElement;
  private searchResultsEl: HTMLElement;
  private bookmarksModalEl: HTMLElement;
  private bookmarksListEl: HTMLElement;
  private shortcutsModalEl: HTMLElement;
  private celebrationModalEl: HTMLElement;
  private celebrationTitleEl: HTMLElement;
  private celebrationDescEl: HTMLElement;
  private btnBookmarkEl: HTMLElement;

  private downloadingEditionId: string | null = null;
  private downloadProgressText = '';

  constructor(
    elements: {
      libraryModalEl: HTMLElement;
      libraryListEl: HTMLElement;
      btnLibraryCloseEl: HTMLElement;
      gridModalEl: HTMLElement;
      gridOverviewEl: HTMLElement;
      btnGridCloseEl: HTMLElement;
      searchModalEl: HTMLElement;
      searchInputEl: HTMLInputElement;
      searchResultsEl: HTMLElement;
      btnSearchCloseEl: HTMLElement;
      bookmarksModalEl: HTMLElement;
      bookmarksListEl: HTMLElement;
      btnBookmarksCloseEl: HTMLElement;
      shortcutsModalEl: HTMLElement;
      btnShortcutsCloseEl: HTMLElement;
      celebrationModalEl: HTMLElement;
      celebrationTitleEl: HTMLElement;
      celebrationDescEl: HTMLElement;
      btnCelebrationCloseEl: HTMLElement;
      btnRestartBookEl: HTMLElement;
      btnOpenLibraryFromCelebrationEl: HTMLElement;
      btnBookmarkEl: HTMLElement;
    },
    opts: LibraryPanelOptions
  ) {
    this.opts = opts;
    this.libraryModalEl = elements.libraryModalEl;
    this.libraryListEl = elements.libraryListEl;
    this.gridModalEl = elements.gridModalEl;
    this.gridOverviewEl = elements.gridOverviewEl;
    this.searchModalEl = elements.searchModalEl;
    this.searchInputEl = elements.searchInputEl;
    this.searchResultsEl = elements.searchResultsEl;
    this.bookmarksModalEl = elements.bookmarksModalEl;
    this.bookmarksListEl = elements.bookmarksListEl;
    this.shortcutsModalEl = elements.shortcutsModalEl;
    this.celebrationModalEl = elements.celebrationModalEl;
    this.celebrationTitleEl = elements.celebrationTitleEl;
    this.celebrationDescEl = elements.celebrationDescEl;
    this.btnBookmarkEl = elements.btnBookmarkEl;

    this.bindModalClose(this.libraryModalEl, elements.btnLibraryCloseEl);
    this.bindModalClose(this.gridModalEl, elements.btnGridCloseEl);
    this.bindModalClose(this.searchModalEl, elements.btnSearchCloseEl);
    this.bindModalClose(this.bookmarksModalEl, elements.btnBookmarksCloseEl);
    this.bindModalClose(this.shortcutsModalEl, elements.btnShortcutsCloseEl);
    this.bindModalClose(this.celebrationModalEl, elements.btnCelebrationCloseEl);

    elements.btnRestartBookEl.addEventListener('click', () => {
      this.closeModal(this.celebrationModalEl);
      this.opts.flipEngine.goToSpread(0);
    });
    elements.btnOpenLibraryFromCelebrationEl.addEventListener('click', () => {
      this.closeModal(this.celebrationModalEl);
      this.openLibrary();
    });

    this.searchInputEl.addEventListener('input', () => this.renderSearchResults());
  }

  private bindModalClose(modalEl: HTMLElement, closeBtn: HTMLElement): void {
    closeBtn.addEventListener('click', () => this.closeModal(modalEl));
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) this.closeModal(modalEl);
    });
  }

  private openModal(modalEl: HTMLElement): void {
    modalEl.style.display = 'flex';
    modalEl.classList.add('active');
  }

  private closeModal(modalEl: HTMLElement): void {
    modalEl.classList.remove('active');
    modalEl.style.display = 'none';
  }

  public isAnyModalOpen(): boolean {
    return [
      this.libraryModalEl,
      this.gridModalEl,
      this.searchModalEl,
      this.bookmarksModalEl,
      this.shortcutsModalEl,
      this.celebrationModalEl,
    ].some((m) => m.classList.contains('active'));
  }

  public closeAllModals(): void {
    for (const m of [
      this.libraryModalEl,
      this.gridModalEl,
      this.searchModalEl,
      this.bookmarksModalEl,
      this.shortcutsModalEl,
      this.celebrationModalEl,
    ]) {
      this.closeModal(m);
    }
  }

  // ============================================================
  // 1. حفظ موضع آخر صفحة تلقائياً في localStorage لكل كتاب
  // ============================================================
  private readProgressMap(): Record<string, ReadingProgressRecord> {
    try {
      const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, ReadingProgressRecord>) : {};
    } catch {
      return {};
    }
  }

  public saveProgress(editionId: string, spreadIdx: number, pageLabel: string): void {
    const map = this.readProgressMap();
    map[editionId] = { spreadIdx, pageLabel, updatedAt: Date.now() };
    try {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }

  public getSavedProgress(editionId: string): ReadingProgressRecord | null {
    return this.readProgressMap()[editionId] ?? null;
  }

  public openLibrary(): void {
    this.renderLibraryCards();
    this.openModal(this.libraryModalEl);
  }

  public renderLibraryCards(): void {
    const editions = this.opts.getEditions();
    const currentId = this.opts.getCurrentEdition()?.id ?? '';
    const progressMap = this.readProgressMap();

    this.libraryListEl.innerHTML = '';

    editions.forEach((ed) => {
      const isCurrent = ed.id === currentId;
      const saved = progressMap[ed.id];
      const maxSp = Math.max(1, (ed.spreadsCount || 27) - 1);
      const savedSpread = saved ? Math.max(0, Math.min(maxSp, saved.spreadIdx)) : 0;
      const pct = Math.round((savedSpread / maxSp) * 100);
      const isOffline = this.opts.offlineManager.isEditionMarkedOffline(ed.id);
      const isDownloading = this.downloadingEditionId === ed.id;

      const card = document.createElement('div');
      card.className = `edition-card ${isCurrent ? 'active' : ''}`;
      card.setAttribute('data-edition-id', ed.id);
      card.innerHTML = `
        <div class="edition-header-row">
          <span class="edition-badge" style="background:${ed.badgeColor || '#f59e0b'}; color:#0b0f19;">${ed.badge}</span>
          ${isOffline ? '<span class="edition-offline-pill">✓ متاح دون إنترنت</span>' : ''}
        </div>
        <div class="edition-title">${ed.title}</div>
        <div class="edition-desc">${ed.description}</div>
        <div class="edition-meta">
          <span>📖 ${ed.spreadsCount || 27} نشرة</span>
          <span>🎧 ${ed.audioTracksCount || 27} تراكاً صوتياً</span>
          <span>🎬 ${ed.videosCount ?? 0} فيديوهات كواليس</span>
          <span>📅 ${ed.releaseDate || '2026'}</span>
        </div>
        <div class="edition-progress-wrap">
          <div class="edition-progress-label">
            <span>تقدم القراءة: ${savedSpread > 0 ? saved?.pageLabel || `نشرة ${savedSpread}` : 'لم تبدأ بعد'}</span>
            <span>${pct}%</span>
          </div>
          <div class="edition-progress-track">
            <div class="edition-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="edition-actions-row">
          ${
            savedSpread > 0
              ? `<button class="edition-action-btn primary" data-action="resume">▶ متابعة من حيث توقفت (${saved?.pageLabel || `نشرة ${savedSpread}`})</button>`
              : `<button class="edition-action-btn primary" data-action="open">${isCurrent ? '📖 قراءة الكتاب الحالي' : '📖 فتح هذا الكتاب'}</button>`
          }
          ${
            savedSpread > 0
              ? `<button class="edition-action-btn" data-action="restart">من الغلاف</button>`
              : ''
          }
          <button class="edition-action-btn offline-btn" data-action="offline" ${isDownloading ? 'disabled' : ''}>
            ${
              isDownloading
                ? this.downloadProgressText || '⏳ جاري الحفظ...'
                : isOffline
                  ? '🗑️ حذف النسخة الأوفلاين'
                  : '📥 حفظ هذا الكتاب للقراءة دون إنترنت'
            }
          </button>
        </div>
      `;

      card.querySelector('[data-action="resume"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (ed.id === currentId) {
          this.opts.flipEngine.goToSpread(savedSpread);
          this.closeModal(this.libraryModalEl);
        } else {
          await this.opts.onSwitchEdition(ed.id, savedSpread);
          this.closeModal(this.libraryModalEl);
        }
      });

      card.querySelector('[data-action="open"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (ed.id === currentId) {
          this.closeModal(this.libraryModalEl);
        } else {
          await this.opts.onSwitchEdition(ed.id, 0);
          this.closeModal(this.libraryModalEl);
        }
      });

      card.querySelector('[data-action="restart"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (ed.id === currentId) {
          this.opts.flipEngine.goToSpread(0);
          this.closeModal(this.libraryModalEl);
        } else {
          await this.opts.onSwitchEdition(ed.id, 0);
          this.closeModal(this.libraryModalEl);
        }
      });

      card.querySelector('[data-action="offline"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (this.downloadingEditionId) return;
        if (isOffline) {
          await this.opts.offlineManager.removeEditionOfflineCache(ed.id);
          this.opts.onToast('تم حذف النسخة المحفوظة دون إنترنت');
          this.renderLibraryCards();
          return;
        }
        try {
          this.downloadingEditionId = ed.id;
          this.downloadProgressText = '⏳ جاري التحضير...';
          this.renderLibraryCards();
          await this.opts.offlineManager.cacheEditionForOffline(ed, (done, total) => {
            this.downloadProgressText = `⏳ جاري الحفظ: ${done} / ${total}`;
            const btn = this.libraryListEl.querySelector(
              `.edition-card[data-edition-id="${ed.id}"] [data-action="offline"]`
            );
            if (btn) btn.textContent = this.downloadProgressText;
          });
          this.opts.onToast(`تم حفظ «${ed.title}» للقراءة والاستماع دون إنترنت ✓`);
        } catch {
          this.opts.onToast('تعذر حفظ الملفات دون إنترنت، تحقق من الاتصال');
        } finally {
          this.downloadingEditionId = null;
          this.downloadProgressText = '';
          this.renderLibraryCards();
        }
      });

      this.libraryListEl.appendChild(card);
    });
  }

  public async saveCurrentEditionOfflineQuick(): Promise<void> {
    const ed = this.opts.getCurrentEdition();
    if (!ed) return;
    if (this.opts.offlineManager.isEditionMarkedOffline(ed.id)) {
      this.opts.onToast('هذا الكتاب محفوظ بالفعل للقراءة دون إنترنت ✓');
      this.openLibrary();
      return;
    }
    this.openLibrary();
    const btn = this.libraryListEl.querySelector<HTMLButtonElement>(
      `.edition-card[data-edition-id="${ed.id}"] [data-action="offline"]`
    );
    btn?.click();
  }

  // ============================================================
  // 2. الإشارات المرجعية (Bookmarks ⭐)
  // ============================================================
  private readBookmarks(): BookmarkRecord[] {
    try {
      const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as BookmarkRecord[]) : [];
    } catch {
      return [];
    }
  }

  private writeBookmarks(list: BookmarkRecord[]): void {
    try {
      localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  public syncBookmarkButton(): void {
    const ed = this.opts.getCurrentEdition();
    if (!ed) return;
    const spreadIdx = this.opts.flipEngine.getCurrentSpreadIndex();
    const exists = this.readBookmarks().some(
      (b) => b.editionId === ed.id && b.spreadIdx === spreadIdx
    );
    this.btnBookmarkEl.classList.toggle('bookmarked', exists);
    this.btnBookmarkEl.textContent = exists ? '★' : '☆';
    this.btnBookmarkEl.title = exists ? 'إزالة الإشارة المرجعية لهذه الصفحة' : 'حفظ إشارة مرجعية لهذه الصفحة';
  }

  public toggleCurrentBookmark(): void {
    const ed = this.opts.getCurrentEdition();
    if (!ed) return;
    const spreadIdx = this.opts.flipEngine.getCurrentSpreadIndex();
    const list = this.readBookmarks();
    const existingIdx = list.findIndex(
      (b) => b.editionId === ed.id && b.spreadIdx === spreadIdx
    );

    if (existingIdx !== -1) {
      list.splice(existingIdx, 1);
      this.writeBookmarks(list);
      this.syncBookmarkButton();
      this.opts.onToast('تمت إزالة الإشارة المرجعية');
    } else {
      const summary = this.opts.flipEngine.getSpreadSummary(spreadIdx);
      list.unshift({
        id: `${ed.id}_${spreadIdx}`,
        editionId: ed.id,
        spreadIdx,
        title: summary.title,
        subtitle: `${ed.title} — ${summary.pageLabel}`,
        createdAt: Date.now(),
      });
      this.writeBookmarks(list);
      this.syncBookmarkButton();
      this.opts.onToast(`تم حفظ إشارة مرجعية (${summary.pageLabel}) ⭐`);
    }
  }

  public openBookmarks(): void {
    const ed = this.opts.getCurrentEdition();
    const all = this.readBookmarks();
    const currentId = ed?.id ?? '';
    const sorted = [
      ...all.filter((b) => b.editionId === currentId),
      ...all.filter((b) => b.editionId !== currentId),
    ];

    this.bookmarksListEl.innerHTML = '';
    if (sorted.length === 0) {
      this.bookmarksListEl.innerHTML =
        '<div class="empty-state-msg">لا توجد إشارات مرجعية محفوظة بعد. اضغط زر ☆ لإضافة الصفحة الحالية.</div>';
    } else {
      sorted.forEach((bm) => {
        const row = document.createElement('div');
        row.className = 'bookmark-item';
        row.innerHTML = `
          <div>
            <div class="bookmark-title">⭐ ${bm.title}</div>
            <div class="bookmark-sub">${bm.subtitle}</div>
          </div>
          <button class="bookmark-del-btn" title="حذف">حذف</button>
        `;
        row.addEventListener('click', async () => {
          if (bm.editionId === currentId) {
            this.opts.flipEngine.goToSpread(bm.spreadIdx);
          } else {
            await this.opts.onSwitchEdition(bm.editionId, bm.spreadIdx);
          }
          this.closeModal(this.bookmarksModalEl);
        });
        row.querySelector('.bookmark-del-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = this.readBookmarks().filter((x) => x.id !== bm.id);
          this.writeBookmarks(next);
          this.syncBookmarkButton();
          this.openBookmarks();
        });
        this.bookmarksListEl.appendChild(row);
      });
    }
    this.openModal(this.bookmarksModalEl);
  }

  // ============================================================
  // 3. عرض مصغّرات الصفحات (Grid Overview)
  // ============================================================
  public openGridOverview(): void {
    const spreads = this.opts.flipEngine.getSpreads();
    const currentIdx = this.opts.flipEngine.getCurrentSpreadIndex();
    const edId = this.opts.getCurrentEdition()?.id ?? '';
    const bookmarkedSet = new Set(
      this.readBookmarks()
        .filter((b) => b.editionId === edId)
        .map((b) => b.spreadIdx)
    );

    this.gridOverviewEl.innerHTML = '';
    spreads.forEach((_, idx) => {
      const summary = this.opts.flipEngine.getSpreadSummary(idx);
      const card = document.createElement('div');
      card.className = `thumb-card ${idx === currentIdx ? 'current' : ''}`;
      card.innerHTML = `
        <div class="thumb-top-row">
          <span>#${idx}</span>
          <span>${bookmarkedSet.has(idx) ? '⭐' : summary.pageLabel}</span>
        </div>
        <div class="thumb-title">${summary.title}</div>
        <div class="thumb-pages">${summary.pageLabel}</div>
      `;
      card.addEventListener('click', () => {
        this.opts.flipEngine.goToSpread(idx);
        this.closeModal(this.gridModalEl);
      });
      this.gridOverviewEl.appendChild(card);
    });

    this.openModal(this.gridModalEl);
  }

  // ============================================================
  // 4. البحث الفوري داخل نصوص الكتاب المفتوح
  // ============================================================
  public openSearch(): void {
    this.renderSearchResults();
    this.openModal(this.searchModalEl);
    window.setTimeout(() => this.searchInputEl.focus(), 60);
  }

  private renderSearchResults(): void {
    const q = this.searchInputEl.value.trim();
    this.searchResultsEl.innerHTML = '';
    if (!q) {
      this.searchResultsEl.innerHTML =
        '<div class="empty-state-msg">اكتب كلمة أو مصطلحاً للبحث داخل صفحات الكتاب الحالي...</div>';
      return;
    }

    const hits = this.opts.flipEngine.searchInBook(q);
    if (hits.length === 0) {
      this.searchResultsEl.innerHTML = `<div class="empty-state-msg">لا توجد نتائج مطابقة لـ «${q.replace(/</g, '&lt;')}»</div>`;
      return;
    }

    hits.forEach((hit) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <div>
          <div class="search-result-title">${hit.title} (${hit.pageLabel})</div>
          <div class="search-result-snippet">${hit.snippetHtml}</div>
        </div>
        <span style="color: var(--gold); font-size: 12px; flex-shrink: 0;">انتقال ◀</span>
      `;
      item.addEventListener('click', () => {
        this.opts.flipEngine.goToSpread(hit.spreadIdx);
        this.closeModal(this.searchModalEl);
      });
      this.searchResultsEl.appendChild(item);
    });
  }

  // ============================================================
  // 5. مشاركة / نسخ رابط الصفحة الدقيقة
  // ============================================================
  public async shareCurrentPage(): Promise<void> {
    const ed = this.opts.getCurrentEdition();
    const spreadIdx = this.opts.flipEngine.getCurrentSpreadIndex();
    const url = new URL(window.location.href);
    if (ed) url.searchParams.set('edition', ed.id);
    url.searchParams.set('spread', String(spreadIdx));
    const shareUrl = url.toString();
    const summary = this.opts.flipEngine.getSpreadSummary(spreadIdx);

    if (navigator.share) {
      try {
        await navigator.share({
          title: ed?.title || 'بوابة درب للكتب التفاعلية',
          text: `${summary.title} (${summary.pageLabel})`,
          url: shareUrl,
        });
        return;
      } catch {
        // user cancelled or unsupported; fallback to clipboard copy
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      this.opts.onToast(`تم نسخ رابط الصفحة (${summary.pageLabel}) ✓`);
    } catch {
      this.opts.onToast(`الرابط: ?edition=${ed?.id || 'epic-v1'}&spread=${spreadIdx}`);
    }
  }

  // ============================================================
  // 6. دليل اختصارات لوحة المفاتيح + نافذة الاحتفال
  // ============================================================
  public openShortcuts(): void {
    this.openModal(this.shortcutsModalEl);
  }

  public showCelebration(): void {
    const edId = this.opts.getCurrentEdition()?.id;
    if (edId === 'anatomical-book') {
      this.celebrationTitleEl.textContent = '«اكتمل الكتاب التشريحي بحمد الله»';
      this.celebrationDescEl.textContent =
        'لقد أتممت تصفح واستماع كتاب درب التشريحي لـ 78 ملفاً برمجياً ومعمارية الـ 39 جدولاً و52 نقطة نهاية سحابية.';
    } else {
      this.celebrationTitleEl.textContent = '«اكتملت الرواية بحمد الله»';
      this.celebrationDescEl.textContent =
        'لقد أتممت قراءة واستماع ملحمة درب التقنية الكاملة.. من شرارة الفكرة الأولى وحتى معانقة السحاب.';
    }
    this.openModal(this.celebrationModalEl);
  }
}
