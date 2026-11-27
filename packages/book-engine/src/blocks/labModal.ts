import type { BookBlock } from '@darb/book-schema';
import type { BlockCleanupFn } from './types';
import type { InteractiveBlockRegistry } from './registry';

export interface InteractiveLabModalOptions {
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  subtitleEl: HTMLElement;
  bodyEl: HTMLElement;
  closeBtnEl: HTMLElement;
  onBeforeOpen?: () => void;
  onToast?: (msg: string) => void;
}

export class InteractiveLabModal {
  private opts: InteractiveLabModalOptions;
  private activeCleanup: BlockCleanupFn | null = null;
  private openState = false;

  constructor(opts: InteractiveLabModalOptions) {
    this.opts = opts;
    this.opts.closeBtnEl.addEventListener('click', () => this.close());
    this.opts.modalEl.addEventListener('click', (e) => {
      if (e.target === this.opts.modalEl) {
        this.close();
      }
    });
  }

  public isOpen(): boolean {
    return this.openState;
  }

  public open(
    block: BookBlock,
    registry: InteractiveBlockRegistry,
    extra: { isMobile?: boolean } = {}
  ): void {
    this.disposeActiveBlock();
    this.opts.onBeforeOpen?.();

    const plugin = registry.get(block.type);
    this.opts.titleEl.textContent = block.title || plugin?.labelAr || 'المختبر التفاعلي الكامل';
    this.opts.subtitleEl.textContent =
      plugin?.descriptionAr || 'بيئة تفاعلية موسعة بملء الشاشة داخل منصة درب';

    this.activeCleanup = registry.mountBlock(this.opts.bodyEl, block, {
      mode: 'fullscreen',
      isMobile: Boolean(extra.isMobile),
      onOpenFullscreen: () => {},
      onToast: this.opts.onToast,
    });

    this.openState = true;
    this.opts.modalEl.style.display = 'flex';
    this.opts.modalEl.classList.add('active');
  }

  private disposeActiveBlock(): void {
    if (this.activeCleanup) {
      try {
        this.activeCleanup();
      } catch {
        // ignore cleanup errors
      }
      this.activeCleanup = null;
    }
    this.opts.bodyEl.innerHTML = '';
  }

  public close(): void {
    this.disposeActiveBlock();
    this.openState = false;
    this.opts.modalEl.classList.remove('active');
    this.opts.modalEl.style.display = 'none';
  }

  public dispose(): void {
    this.close();
  }
}
