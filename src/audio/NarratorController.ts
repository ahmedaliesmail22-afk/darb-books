export interface NarratorCallbacks {
  getTotalSpreads: () => number;
  getUnifiedSpreadIndex: () => number;
  isMobile: () => boolean;
  goToSpread: (spreadIdx: number) => void;
  nextPage: () => void;
  onBookCompleted: () => void;
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * محرك الراوي الصوتي المدمج (MP3-only):
 * - يعتمد حصرياً على ملفات MP3 المدمجة بدون أي صوت تقليب برمجي.
 * - انتقال تلقائي بعد 100ms من انتهاء الصوت.
 * - أزرار تقديم/تأخير ±10 ثوانٍ، ومؤشر زمني MM:SS / MM:SS، والتحميل المسبق للنشرة التالية.
 */
export class NarratorController {
  private audioEl: HTMLAudioElement;
  private preloadAudioEl: HTMLAudioElement;
  private btnToggleEl: HTMLElement;
  private barEl: HTMLElement;
  private statusEl: HTMLElement;
  private timeEl: HTMLElement;
  private btnPlayEl: HTMLElement;
  private btnStopEl: HTMLElement;
  private btnBack10El: HTMLElement;
  private btnFwd10El: HTMLElement;
  private speedEl: HTMLSelectElement;
  private callbacks: NarratorCallbacks;

  private audioDir = './audio/epic-v1/';
  private active = false;
  private paused = false;
  private activeSpread: number | null = null;
  private autoFlipTimer: number | null = null;
  private preloadedSrc = '';

  constructor(
    elements: {
      audioEl: HTMLAudioElement;
      btnToggleEl: HTMLElement;
      barEl: HTMLElement;
      statusEl: HTMLElement;
      timeEl: HTMLElement;
      btnPlayEl: HTMLElement;
      btnStopEl: HTMLElement;
      btnBack10El: HTMLElement;
      btnFwd10El: HTMLElement;
      speedEl: HTMLSelectElement;
    },
    callbacks: NarratorCallbacks
  ) {
    this.audioEl = elements.audioEl;
    this.preloadAudioEl = new Audio();
    this.preloadAudioEl.preload = 'auto';

    this.btnToggleEl = elements.btnToggleEl;
    this.barEl = elements.barEl;
    this.statusEl = elements.statusEl;
    this.timeEl = elements.timeEl;
    this.btnPlayEl = elements.btnPlayEl;
    this.btnStopEl = elements.btnStopEl;
    this.btnBack10El = elements.btnBack10El;
    this.btnFwd10El = elements.btnFwd10El;
    this.speedEl = elements.speedEl;
    this.callbacks = callbacks;

    this.bindControls();
  }

  private bindControls(): void {
    this.btnToggleEl.addEventListener('click', () => this.toggle());
    this.btnPlayEl.addEventListener('click', () => {
      if (this.paused) this.resume();
      else this.pauseNarrator();
    });
    this.btnStopEl.addEventListener('click', () => this.stop());
    this.btnBack10El.addEventListener('click', () => this.seekBy(-10));
    this.btnFwd10El.addEventListener('click', () => this.seekBy(10));
    this.speedEl.addEventListener('change', () => {
      this.audioEl.playbackRate = parseFloat(this.speedEl.value) || 1.0;
    });

    this.audioEl.addEventListener('timeupdate', () => this.updateTimeDisplay());
    this.audioEl.addEventListener('loadedmetadata', () => this.updateTimeDisplay());
  }

  public setAudioDir(audioDir: string): void {
    this.audioDir = audioDir;
    this.preloadedSrc = '';
  }

  public isActive(): boolean {
    return this.active;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  private clearAutoFlip(): void {
    if (this.autoFlipTimer !== null) {
      window.clearTimeout(this.autoFlipTimer);
      this.autoFlipTimer = null;
    }
  }

  private updateTimeDisplay(): void {
    const cur = formatSeconds(this.audioEl.currentTime);
    const dur = formatSeconds(this.audioEl.duration);
    this.timeEl.textContent = `${cur} / ${dur}`;
  }

  public toggle(): void {
    if (this.active) {
      this.stop();
      return;
    }
    this.active = true;
    this.paused = false;
    this.activeSpread = null;
    this.btnToggleEl.classList.add('narrator-active');
    this.barEl.classList.add('show');
    this.statusEl.textContent = 'تشغيل الراوي...';
    this.btnPlayEl.textContent = '⏸';

    if (this.callbacks.getUnifiedSpreadIndex() === 0) {
      this.callbacks.goToSpread(1);
    } else {
      this.startCurrentSpread();
    }
  }

  public onSpreadChanged(newSpreadIdx: number): void {
    if (!this.active || this.paused) return;
    if (this.activeSpread !== newSpreadIdx) {
      this.startCurrentSpread();
    }
  }

  public pauseNarrator(): void {
    this.clearAutoFlip();
    if (!this.active) return;
    this.paused = true;
    if (!this.audioEl.paused) {
      this.audioEl.pause();
    }
    this.barEl.classList.remove('narrator-playing');
    this.statusEl.textContent = 'الراوي متوقف مؤقتاً';
    this.btnPlayEl.textContent = '▶';
  }

  public resume(): void {
    if (!this.active) return;
    this.paused = false;
    this.btnPlayEl.textContent = '⏸';
    if (this.audioEl.getAttribute('src')) {
      this.barEl.classList.add('narrator-playing');
      this.statusEl.textContent = 'الراوي يقرأ (صوت فصيح مسجل)...';
      this.audioEl.play().catch(() => {
        this.paused = true;
        this.barEl.classList.remove('narrator-playing');
        this.btnPlayEl.textContent = '▶';
        this.statusEl.textContent = 'اضغط ▶ لمتابعة التشغيل';
      });
    } else {
      this.startCurrentSpread();
    }
  }

  public stop(): void {
    this.clearAutoFlip();
    this.active = false;
    this.paused = false;
    this.activeSpread = null;
    this.audioEl.onended = null;
    this.audioEl.onerror = null;
    this.audioEl.pause();
    this.audioEl.removeAttribute('src');
    this.audioEl.load();
    this.timeEl.textContent = '00:00 / 00:00';
    this.barEl.classList.remove('show', 'narrator-playing');
    this.btnToggleEl.classList.remove('narrator-active');
    this.statusEl.textContent = 'تم إيقاف الراوي';
    this.btnPlayEl.textContent = '▶';
  }

  public seekBy(deltaSeconds: number): void {
    if (!this.active || !this.audioEl.getAttribute('src')) return;
    const dur = Number.isFinite(this.audioEl.duration) ? this.audioEl.duration : 0;
    const nextTime = Math.max(0, Math.min(dur || 0, this.audioEl.currentTime + deltaSeconds));
    this.audioEl.currentTime = nextTime;
    this.updateTimeDisplay();
  }

  private preloadNextSpread(currentUnifiedIdx: number): void {
    const total = this.callbacks.getTotalSpreads();
    const nextIdx = currentUnifiedIdx + 1;
    if (nextIdx >= total) return;

    const nextSrc = `${this.audioDir}spread_${nextIdx}.mp3`;
    if (nextSrc === this.preloadedSrc) return;
    this.preloadedSrc = nextSrc;
    this.preloadAudioEl.src = nextSrc;
    this.preloadAudioEl.load();
  }

  public startCurrentSpread(): void {
    this.clearAutoFlip();
    this.audioEl.onended = null;
    this.audioEl.onerror = null;
    this.audioEl.pause();

    const unifiedIdx = this.callbacks.getUnifiedSpreadIndex();
    this.activeSpread = unifiedIdx;
    this.timeEl.textContent = '00:00 / 00:00';

    const src = `${this.audioDir}spread_${unifiedIdx}.mp3`;
    this.audioEl.src = src;
    this.audioEl.playbackRate = parseFloat(this.speedEl.value) || 1.0;

    this.preloadNextSpread(unifiedIdx);

    const total = this.callbacks.getTotalSpreads();
    this.audioEl.onended = () => {
      if (!this.active || this.paused) return;
      this.barEl.classList.remove('narrator-playing');
      if (unifiedIdx >= total - 1) {
        this.statusEl.textContent = 'اكتمل الكتاب 🏆';
        this.stop();
        this.callbacks.onBookCompleted();
      } else {
        this.statusEl.textContent = 'تقليب تلقائي للصفحة...';
        this.autoFlipTimer = window.setTimeout(() => {
          if (!this.active || this.paused) return;
          if (this.callbacks.isMobile()) {
            this.callbacks.goToSpread(unifiedIdx + 1);
          } else {
            this.callbacks.nextPage();
          }
        }, 100);
      }
    };

    this.audioEl.onerror = () => {
      if (!this.active) return;
      this.paused = true;
      this.barEl.classList.remove('narrator-playing');
      this.btnPlayEl.textContent = '▶';
      this.statusEl.textContent = 'تعذر تحميل المقطع الصوتي';
    };

    const p = this.audioEl.play();
    if (p !== undefined) {
      p.then(() => {
        if (!this.active || this.paused) {
          this.audioEl.pause();
          return;
        }
        this.barEl.classList.add('narrator-playing');
        this.statusEl.textContent = 'الراوي يقرأ (صوت فصيح مسجل)...';
        this.btnPlayEl.textContent = '⏸';
      }).catch(() => {
        if (!this.active) return;
        this.paused = true;
        this.barEl.classList.remove('narrator-playing');
        this.btnPlayEl.textContent = '▶';
        this.statusEl.textContent = 'اضغط ▶ لبدء الصوت';
      });
    }
  }
}
