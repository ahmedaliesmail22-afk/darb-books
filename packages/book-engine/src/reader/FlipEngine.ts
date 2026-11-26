import type {
  BookBlock,
  BookPageSide,
  BookSpread,
  EngineConfig,
  FontScale,
  MobilePage,
  SearchHit,
  ThemeMode,
} from '@darb/book-schema';
import { normalizeArabic, stripHtmlText } from '@darb/book-schema';
import type { BookStage3D } from '../scene/BookStage3D';

export type BlockRendererFn = (block: BookBlock) => string;

export interface FlipEngineCallbacks {
  onSpreadChanged: (spreadIdx: number) => void;
  onChapterLongPress: (chapterNum: number) => void;
  renderBlock?: BlockRendererFn;
}

/**
 * نواة القراءة الورقية RTL القابلة للتهيئة الديناميكية:
 * - عرض مزدوج للحواسيب وفردي متسلسل للهواتف مع تخطي الصفحات الفارغة.
 * - تقليب 180° ثلاثي الأبعاد متزامن مع مجسم BookStage3D.
 * - دعم الروابط العميقة و3 مستويات لحجم الخط وتخصيص المفاتيح والخطوط من EngineConfig.
 */
export class FlipEngine {
  private bookEl: HTMLElement;
  private rightPageEl: HTMLElement;
  private leftPageEl: HTMLElement;
  private progressFillEl: HTMLElement;
  private pageIndicatorEl: HTMLElement;
  private stage3D: BookStage3D | null;
  private callbacks: FlipEngineCallbacks;

  private mobileBreakpointPx: number;
  private longPressDelayMs: number;
  private cloudLabel: string;
  private fontScaleStorageKey: string;
  private themeStorageKey: string;

  private spreads: BookSpread[] = [];
  private mobilePages: MobilePage[] = [];
  private currentSpreadIndex = 0;
  private mobilePageIndex = 0;
  private bookTitle = 'مَلْحَمَةُ دَرْب';
  private bookFooter = 'مَلْحَمَةُ دَرْب — السيرة التقنية الكاملة';
  private activeChaptersCount = 7;

  private fontScale: FontScale;
  private theme: ThemeMode;

  constructor(
    elements: {
      bookEl: HTMLElement;
      rightPageEl: HTMLElement;
      leftPageEl: HTMLElement;
      progressFillEl: HTMLElement;
      pageIndicatorEl: HTMLElement;
    },
    stage3D: BookStage3D | null,
    callbacks: FlipEngineCallbacks,
    config?: Partial<EngineConfig>
  ) {
    this.bookEl = elements.bookEl;
    this.rightPageEl = elements.rightPageEl;
    this.leftPageEl = elements.leftPageEl;
    this.progressFillEl = elements.progressFillEl;
    this.pageIndicatorEl = elements.pageIndicatorEl;
    this.stage3D = stage3D;
    this.callbacks = callbacks;

    this.mobileBreakpointPx = config?.mobileBreakpointPx ?? 960;
    this.longPressDelayMs = config?.longPressDelayMs ?? 600;
    this.cloudLabel = config?.branding?.cloudLabel ?? 'منظومة درب السحابية';
    const prefix = config?.storagePrefix ?? 'darb_books';
    this.fontScaleStorageKey = `${prefix}_font_scale_v1`;
    this.themeStorageKey = `${prefix}_theme_v1`;

    this.fontScale = config?.defaultFontScale ?? 'md';
    this.theme = config?.defaultTheme ?? 'sepia';

    this.restorePreferences();
  }

  private restorePreferences(): void {
    try {
      const savedScale = localStorage.getItem(this.fontScaleStorageKey) as FontScale | null;
      if (savedScale === 'sm' || savedScale === 'md' || savedScale === 'lg') {
        this.setFontScale(savedScale, false);
      } else {
        this.setFontScale(this.fontScale, false);
      }

      const savedTheme = localStorage.getItem(this.themeStorageKey) as ThemeMode | null;
      if (savedTheme === 'sepia' || savedTheme === 'dark' || savedTheme === 'light') {
        this.setTheme(savedTheme, false);
      } else {
        this.setTheme(this.theme, false);
      }
    } catch {
      this.setFontScale(this.fontScale, false);
      this.setTheme(this.theme, false);
    }
  }

  public isMobile(): boolean {
    return window.innerWidth < this.mobileBreakpointPx;
  }

  public setEdition(
    spreads: BookSpread[],
    meta: { title: string; footer: string; initialSpread?: number; chaptersCount?: number }
  ): void {
    this.spreads = spreads;
    this.bookTitle = meta.title;
    this.bookFooter = meta.footer;
    this.activeChaptersCount = meta.chaptersCount ?? 7;
    this.rebuildMobilePages();

    const maxIdx = Math.max(0, this.spreads.length - 1);
    const target = Math.max(0, Math.min(maxIdx, meta.initialSpread ?? 0));
    this.currentSpreadIndex = target;

    const mIdx = this.mobilePages.findIndex((p) => p.spreadIdx === target);
    this.mobilePageIndex = mIdx !== -1 ? mIdx : 0;

    this.renderSpread('none', target);
  }

  public getSpreads(): BookSpread[] {
    return this.spreads;
  }

  public getTotalSpreads(): number {
    return this.spreads.length;
  }

  public getCurrentSpreadIndex(): number {
    return this.currentSpreadIndex;
  }

  public getUnifiedSpreadIndex(): number {
    if (this.isMobile()) {
      return this.mobilePages[this.mobilePageIndex]?.spreadIdx ?? this.currentSpreadIndex;
    }
    return this.currentSpreadIndex;
  }

  public getMobilePagesCount(): number {
    return this.mobilePages.length;
  }

  public getTheme(): ThemeMode {
    return this.theme;
  }

  public setTheme(theme: ThemeMode, persist = true): ThemeMode {
    this.theme = theme;
    document.body.classList.remove('theme-sepia', 'theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
    this.stage3D?.setTheme(theme);
    if (persist) {
      try {
        localStorage.setItem(this.themeStorageKey, theme);
      } catch {
        // ignore storage quota errors
      }
    }
    return theme;
  }

  public cycleTheme(): ThemeMode {
    const order: ThemeMode[] = ['sepia', 'dark', 'light'];
    const next = order[(order.indexOf(this.theme) + 1) % order.length];
    return this.setTheme(next);
  }

  public getFontScale(): FontScale {
    return this.fontScale;
  }

  public setFontScale(scale: FontScale, persist = true): FontScale {
    this.fontScale = scale;
    document.body.classList.remove('font-scale-sm', 'font-scale-md', 'font-scale-lg');
    document.body.classList.add(`font-scale-${scale}`);
    if (persist) {
      try {
        localStorage.setItem(this.fontScaleStorageKey, scale);
      } catch {
        // ignore
      }
    }
    return scale;
  }

  public stepFontScale(delta: 1 | -1): FontScale {
    const order: FontScale[] = ['sm', 'md', 'lg'];
    const currIdx = order.indexOf(this.fontScale);
    const nextIdx = Math.max(0, Math.min(order.length - 1, currIdx + delta));
    return this.setFontScale(order[nextIdx]);
  }

  public getMaxPageNumber(): number {
    let max = 0;
    for (const s of this.spreads) {
      if (s.pageRightNum && s.pageRightNum > max) max = s.pageRightNum;
      if (s.pageLeftNum && s.pageLeftNum > max) max = s.pageLeftNum;
    }
    return max || 50;
  }

  private rebuildMobilePages(): void {
    this.mobilePages = [];
    const maxPage = this.getMaxPageNumber();
    this.spreads.forEach((spread, spreadIdx) => {
      if (spread.isFrontCover) {
        if (spread.right) {
          this.mobilePages.push({
            spreadIdx,
            isCover: true,
            side: 'right',
            data: spread.right,
            indicator: 'الغلاف الملكي الأمامي',
          });
        }
      } else if (spread.isBackCover) {
        if (spread.right) {
          this.mobilePages.push({
            spreadIdx,
            isCover: true,
            side: 'right',
            data: spread.right,
            indicator: 'الغلاف الملكي الخلفي',
          });
        }
      } else {
        if (spread.right && !spread.right.isBlank) {
          this.mobilePages.push({
            spreadIdx,
            side: 'right',
            data: spread.right,
            pageNum: spread.pageRightNum,
            indicator: `صفحة ${spread.pageRightNum ?? ''} من ${maxPage}`,
          });
        }
        if (spread.left && !spread.left.isBlank) {
          this.mobilePages.push({
            spreadIdx,
            side: 'left',
            data: spread.left,
            pageNum: spread.pageLeftNum,
            indicator: `صفحة ${spread.pageLeftNum ?? ''} من ${maxPage}`,
          });
        }
      }
    });
  }

  public getSpreadSummary(spreadIdx: number): { title: string; pageLabel: string } {
    const sp = this.spreads[spreadIdx];
    if (!sp) return { title: `نشرة ${spreadIdx}`, pageLabel: '' };
    if (sp.isFrontCover) return { title: 'الغلاف الملكي الأمامي', pageLabel: 'الغلاف' };
    if (sp.isBackCover) return { title: 'الغلاف الملكي الخلفي', pageLabel: 'الختام' };

    const leftTitle = sp.left?.title || this.extractHeroTitle(sp.left?.html) || sp.left?.header;
    const rightTitle = sp.right?.title || this.extractHeroTitle(sp.right?.html) || sp.right?.header;
    const title = leftTitle || rightTitle || `نشرة ${spreadIdx}`;

    const pages: number[] = [];
    if (!sp.right?.isBlank && sp.pageRightNum) pages.push(sp.pageRightNum);
    if (!sp.left?.isBlank && sp.pageLeftNum) pages.push(sp.pageLeftNum);
    const pageLabel = pages.length > 0 ? `ص ${pages.join(' - ')}` : `نشرة ${spreadIdx}`;
    return { title, pageLabel };
  }

  private extractHeroTitle(html?: string): string {
    if (!html) return '';
    const m = html.match(/<h2[^>]*class="chapter-hero-title"[^>]*>([\s\S]*?)<\/h2>/i);
    return m ? stripHtmlText(m[1]) : '';
  }

  public findTocSpreadIndex(): number {
    const idx = this.spreads.findIndex(
      (s) =>
        (s.right?.html && s.right.html.includes('toc-item')) ||
        (s.left?.html && s.left.html.includes('toc-item'))
    );
    return idx !== -1 ? idx : Math.min(2, Math.max(0, this.spreads.length - 1));
  }

  public nextPage(): void {
    if (this.isMobile()) {
      if (this.mobilePageIndex < this.mobilePages.length - 1) {
        const prev = this.currentSpreadIndex;
        this.mobilePageIndex++;
        this.renderSpread('forward', prev);
      }
    } else if (this.currentSpreadIndex < this.spreads.length - 1) {
      const prev = this.currentSpreadIndex;
      this.currentSpreadIndex++;
      this.renderSpread('forward', prev);
    }
  }

  public prevPage(): void {
    if (this.isMobile()) {
      if (this.mobilePageIndex > 0) {
        const prev = this.currentSpreadIndex;
        this.mobilePageIndex--;
        this.renderSpread('backward', prev);
      }
    } else if (this.currentSpreadIndex > 0) {
      const prev = this.currentSpreadIndex;
      this.currentSpreadIndex--;
      this.renderSpread('backward', prev);
    }
  }

  public goToSpread(spreadIdx: number): void {
    if (spreadIdx < 0 || spreadIdx >= this.spreads.length) return;
    if (spreadIdx === this.currentSpreadIndex && !this.isMobile()) return;

    const prev = this.currentSpreadIndex;
    const dir =
      spreadIdx > this.currentSpreadIndex
        ? 'forward'
        : spreadIdx < this.currentSpreadIndex
          ? 'backward'
          : 'none';
    this.currentSpreadIndex = spreadIdx;
    if (this.isMobile()) {
      const mIdx = this.mobilePages.findIndex((p) => p.spreadIdx === spreadIdx);
      if (mIdx !== -1) this.mobilePageIndex = mIdx;
    }
    this.renderSpread(dir, prev);
  }

  public jumpByProgressRatio(ratioFromLeft: number): void {
    const clamped = Math.max(0, Math.min(1, ratioFromLeft));
    if (this.isMobile()) {
      const maxIdx = Math.max(0, this.mobilePages.length - 1);
      const target = Math.round((1 - clamped) * maxIdx);
      const prev = this.currentSpreadIndex;
      const dir = target > this.mobilePageIndex ? 'forward' : 'backward';
      this.mobilePageIndex = Math.max(0, Math.min(maxIdx, target));
      this.renderSpread(dir, prev);
    } else {
      const maxIdx = Math.max(0, this.spreads.length - 1);
      const target = Math.round((1 - clamped) * maxIdx);
      this.goToSpread(target);
    }
  }

  public handleResize(): void {
    this.renderSpread('none', this.currentSpreadIndex);
    this.stage3D?.resize();
  }

  private renderPageContent(data: BookPageSide | null | undefined, pageNum?: number, isRight = true): string {
    if (!data) return '';
    if (data.isCover) return data.html;
    if (data.isBlank) return data.html;

    const hotspotId = isRight ? 'cornerHotspotRight' : 'cornerHotspotLeft';
    const hotspotTitle = isRight ? 'انقر للرجوع للصفحة السابقة' : 'انقر لتقليب الصفحة التالية';
    const blocksHtml =
      data.blocks && data.blocks.length > 0 && this.callbacks.renderBlock
        ? data.blocks.map((b) => this.callbacks.renderBlock?.(b) ?? '').join('')
        : '';

    return `
      <div class="corner-peel-hotspot" id="${hotspotId}" title="${hotspotTitle}"></div>
      <div class="corner-peel-curl"></div>
      <div class="page-header-tag">
        <span>${data.header || this.bookTitle}</span>
        <span>${this.cloudLabel}</span>
      </div>
      ${data.title ? `<h2 class="page-title">${data.title}</h2>` : ''}
      <div class="page-body">${data.html}${blocksHtml}</div>
      <div class="page-footer">
        ${isRight
          ? `<span class="page-num-tag">${pageNum ? 'صفحة ' + pageNum : ''}</span><span class="page-book-tag">${this.bookFooter}</span>`
          : `<span class="page-book-tag">${this.bookFooter}</span><span class="page-num-tag">${pageNum ? 'صفحة ' + pageNum : ''}</span>`}
      </div>
    `;
  }

  private renderSpread(direction: 'none' | 'forward' | 'backward', prevSpreadIndex: number): void {
    if (this.spreads.length === 0) return;

    if (direction !== 'none') {
      this.trigger3DLeafTurn(direction, prevSpreadIndex);
      this.stage3D?.triggerFlipImpulse(direction);
    }

    if (this.isMobile()) {
      const mobilePage = this.mobilePages[this.mobilePageIndex];
      if (!mobilePage) return;

      this.bookEl.classList.remove('book-closed-front', 'book-closed-back');
      if (mobilePage.isCover) {
        if (this.mobilePageIndex === 0) this.bookEl.classList.add('book-closed-front');
        else this.bookEl.classList.add('book-closed-back');
      }

      this.rightPageEl.innerHTML = this.renderPageContent(
        mobilePage.data,
        mobilePage.pageNum,
        mobilePage.side === 'right'
      );
      this.leftPageEl.innerHTML = '';
      this.leftPageEl.style.display = 'none';

      this.pageIndicatorEl.textContent = mobilePage.indicator;
      const maxIdx = Math.max(1, this.mobilePages.length - 1);
      this.progressFillEl.style.width = `${(this.mobilePageIndex / maxIdx) * 100}%`;

      this.currentSpreadIndex = mobilePage.spreadIdx;
    } else {
      const spreadData = this.spreads[this.currentSpreadIndex];
      if (!spreadData) return;

      this.bookEl.classList.remove('book-closed-front', 'book-closed-back');
      if (spreadData.isFrontCover) this.bookEl.classList.add('book-closed-front');
      else if (spreadData.isBackCover) this.bookEl.classList.add('book-closed-back');

      this.leftPageEl.style.display = '';
      this.rightPageEl.innerHTML = spreadData.right
        ? this.renderPageContent(spreadData.right, spreadData.pageRightNum, true)
        : '';
      this.leftPageEl.innerHTML = spreadData.left
        ? this.renderPageContent(spreadData.left, spreadData.pageLeftNum, false)
        : '';

      this.updateDesktopIndicators();

      const mIdx = this.mobilePages.findIndex((p) => p.spreadIdx === this.currentSpreadIndex);
      if (mIdx !== -1) this.mobilePageIndex = mIdx;
    }

    const activeSpread = this.spreads[this.currentSpreadIndex];
    this.stage3D?.setBookState({
      spreadIndex: this.currentSpreadIndex,
      totalSpreads: this.spreads.length,
      isClosedFront: Boolean(activeSpread?.isFrontCover),
      isClosedBack: Boolean(activeSpread?.isBackCover),
    });

    this.bindPageInteractions();
    this.callbacks.onSpreadChanged(this.currentSpreadIndex);
  }

  private updateDesktopIndicators(): void {
    const spreadData = this.spreads[this.currentSpreadIndex];
    if (!spreadData) return;
    const maxPage = this.getMaxPageNumber();

    if (spreadData.isFrontCover) {
      this.pageIndicatorEl.textContent = 'الغلاف الملكي الأمامي';
    } else if (spreadData.isBackCover) {
      this.pageIndicatorEl.textContent = 'الغلاف الملكي الخلفي';
    } else {
      this.pageIndicatorEl.textContent = `صفحة ${spreadData.pageRightNum ?? ''} - ${spreadData.pageLeftNum ?? ''} من ${maxPage}`;
    }

    const count = this.spreads.length;
    const pct = count > 1 ? (this.currentSpreadIndex / (count - 1)) * 100 : 0;
    this.progressFillEl.style.width = `${pct}%`;
  }

  private trigger3DLeafTurn(dir: 'forward' | 'backward', prevSpreadIndex: number): void {
    if (this.isMobile()) return;

    const oldLeaf = document.querySelector('.turning-leaf-container');
    if (oldLeaf) oldLeaf.remove();

    const leafContainer = document.createElement('div');
    leafContainer.className = `turning-leaf-container ${dir === 'forward' ? 'turn-forward' : 'turn-backward'}`;

    const frontFace = document.createElement('div');
    frontFace.className = 'turning-leaf-face front';
    const backFace = document.createElement('div');
    backFace.className = 'turning-leaf-face back';

    const prevSpread = this.spreads[prevSpreadIndex];
    const targetSpread = this.spreads[this.currentSpreadIndex];

    if (dir === 'forward') {
      if (prevSpreadIndex === 0) {
        if (prevSpread?.right) frontFace.innerHTML = this.renderPageContent(prevSpread.right, undefined, true);
        if (targetSpread?.right) backFace.innerHTML = this.renderPageContent(targetSpread.right, targetSpread.pageRightNum, true);
      } else {
        if (prevSpread?.left) frontFace.innerHTML = this.renderPageContent(prevSpread.left, prevSpread.pageLeftNum, false);
        if (targetSpread?.right) backFace.innerHTML = this.renderPageContent(targetSpread.right, targetSpread.pageRightNum, true);
      }
    } else {
      if (prevSpread?.right) frontFace.innerHTML = this.renderPageContent(prevSpread.right, prevSpread.pageRightNum, true);
      if (targetSpread?.left) backFace.innerHTML = this.renderPageContent(targetSpread.left, targetSpread.pageLeftNum, false);
    }

    leafContainer.appendChild(frontFace);
    leafContainer.appendChild(backFace);
    this.bookEl.appendChild(leafContainer);

    window.setTimeout(() => {
      leafContainer.remove();
    }, 640);
  }

  private bindPageInteractions(): void {
    const rightCorner = document.getElementById('cornerHotspotRight');
    const leftCorner = document.getElementById('cornerHotspotLeft');
    if (leftCorner) leftCorner.addEventListener('click', () => this.nextPage());
    if (rightCorner) rightCorner.addEventListener('click', () => this.prevPage());

    const tocItems = document.querySelectorAll<HTMLElement>('.toc-item');
    tocItems.forEach((item) => {
      let pressTimer: number | null = null;
      let isLongPress = false;
      const chId = parseInt(item.getAttribute('data-chapter') || '', 10);
      const hasHoldPreview =
        Boolean(item.querySelector('.hold-ring-svg')) &&
        !Number.isNaN(chId) &&
        chId >= 1 &&
        chId <= this.activeChaptersCount;

      item.addEventListener('contextmenu', (e) => e.preventDefault());

      const startPress = (e: PointerEvent) => {
        if (e.button && e.button !== 0) return;
        isLongPress = false;
        if (!hasHoldPreview) return;

        item.classList.add('holding');
        pressTimer = window.setTimeout(() => {
          isLongPress = true;
          item.classList.remove('holding');
          if (navigator.vibrate) navigator.vibrate([40, 20, 60]);
          this.callbacks.onChapterLongPress(chId);
        }, this.longPressDelayMs);
      };

      const cancelPress = () => {
        if (pressTimer !== null) {
          window.clearTimeout(pressTimer);
          pressTimer = null;
        }
        item.classList.remove('holding');
      };

      const handleClick = () => {
        if (!isLongPress) {
          const spreadAttr = parseInt(item.getAttribute('data-spread') || '', 10);
          if (!Number.isNaN(spreadAttr)) this.goToSpread(spreadAttr);
        }
        isLongPress = false;
      };

      item.addEventListener('pointerdown', startPress);
      item.addEventListener('pointerup', cancelPress);
      item.addEventListener('pointerleave', cancelPress);
      item.addEventListener('pointercancel', cancelPress);
      item.addEventListener('click', handleClick);
    });
  }

  public searchInBook(rawQuery: string): SearchHit[] {
    const query = rawQuery.trim();
    if (!query) return [];
    const normQuery = normalizeArabic(query);
    if (!normQuery) return [];

    const hits: SearchHit[] = [];
    this.spreads.forEach((sp, idx) => {
      const textParts: string[] = [];
      for (const side of [sp.right, sp.left]) {
        if (!side || side.isBlank) continue;
        if (side.title) textParts.push(side.title);
        if (side.html) textParts.push(stripHtmlText(side.html));
      }
      const combined = textParts.join(' — ');
      const normCombined = normalizeArabic(combined);
      const matchPos = normCombined.indexOf(normQuery);
      if (matchPos !== -1) {
        const start = Math.max(0, matchPos - 42);
        const end = Math.min(combined.length, matchPos + normQuery.length + 78);
        let snippet = combined.slice(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < combined.length) snippet = snippet + '...';

        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const safeSnippet = snippet
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');

        const summary = this.getSpreadSummary(idx);
        hits.push({
          spreadIdx: idx,
          title: summary.title,
          pageLabel: summary.pageLabel,
          snippetHtml: safeSnippet,
        });
      }
    });
    return hits;
  }
}
