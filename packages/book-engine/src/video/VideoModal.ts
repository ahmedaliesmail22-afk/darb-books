import type { EditionMeta } from '@darb/book-schema';

export interface VideoModalOptions {
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  subtitleEl: HTMLElement;
  closeBtnEl: HTMLElement;
  videoWrapperEl: HTMLElement;
  videoEl: HTMLVideoElement;
  noticeEl: HTMLElement;
  onBeforeOpen: () => void;
}

const DEFAULT_EPIC_TITLES: Record<number, string> = {
  1: 'كواليس الفصل الأول: نداء الاستغاثة ومخاض الفكرة',
  2: 'كواليس الفصل الثاني: المخطط الكبير وصدمة الجداول الـ 39',
  3: 'كواليس الفصل الثالث: معركة القيود المستحيلة وكيف قهرناها',
  4: 'كواليس الفصل الرابع: عثرات في المعمعة ولحظات الإنقاذ',
  5: 'كواليس الفصل الخامس: ولادة المحركات الكبرى',
  6: 'كواليس الفصل السادس: ملحمة التوثيق الأكبر',
  7: 'كواليس الفصل السابع: الإطلاق وملاقاة السحاب',
};

const DEFAULT_ANATOMICAL_TITLES: Record<number, string> = {
  1: 'كواليس الباب الأول: الأسس المعمارية والهندسية وتطويع الـ 64 بايت',
  2: 'كواليس الباب الثاني: التشريح الهيكلي لقاعدة البيانات (39 جدولاً)',
  3: 'كواليس الباب الثالث: المحرك التفاعلي وآلة الحالة المنتهية (FSM)',
  4: 'كواليس الباب الرابع: محركات المنطق البرمجي والمكتبات المشتركة (179 دالة)',
  5: 'كواليس الباب الخامس: نقاط النهاية السحابية (52 Endpoint) وتكامل initData',
  6: 'كواليس الباب السادس: تطبيقات الويب المصغرة وتجربة المستخدم Pure SVG',
  7: 'كواليس الباب السابع: هندسة الإطلاق والنشر السحابي والحوكمة',
};

export class VideoModal {
  private modalEl: HTMLElement;
  private titleEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private closeBtnEl: HTMLElement;
  private videoWrapperEl: HTMLElement;
  private videoEl: HTMLVideoElement;
  private noticeEl: HTMLElement;
  private onBeforeOpen: () => void;

  constructor(opts: VideoModalOptions) {
    this.modalEl = opts.modalEl;
    this.titleEl = opts.titleEl;
    this.subtitleEl = opts.subtitleEl;
    this.closeBtnEl = opts.closeBtnEl;
    this.videoWrapperEl = opts.videoWrapperEl;
    this.videoEl = opts.videoEl;
    this.noticeEl = opts.noticeEl;
    this.onBeforeOpen = opts.onBeforeOpen;

    this.closeBtnEl.addEventListener('click', () => this.close());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });
  }

  public isOpen(): boolean {
    return this.modalEl.classList.contains('active');
  }

  public open(chapterNum: number, edition: EditionMeta, videoDir: string): void {
    this.onBeforeOpen();

    const customTitle = edition.chapterTitles?.[String(chapterNum)];
    const hasVideo = edition.videosCount >= chapterNum && chapterNum >= 1 && Boolean(videoDir);

    if (!hasVideo || edition.id === 'anatomical-book') {
      const noticeTitle =
        customTitle ||
        DEFAULT_ANATOMICAL_TITLES[chapterNum] ||
        `كواليس الفصل ${chapterNum}`;
      this.titleEl.textContent = noticeTitle;
      this.subtitleEl.textContent = 'بطاقة كواليس الفصل';

      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
      this.videoWrapperEl.style.display = 'none';

      this.noticeEl.style.display = 'block';
      this.noticeEl.innerHTML = `
        <div style="font-size: 2.2rem; margin-bottom: 8px;">🎬</div>
        <h4 style="margin: 0 0 8px; color: #38bdf8; font-size: 1.1rem; font-weight: bold;">${noticeTitle}</h4>
        <p style="margin: 0 0 12px; color: #94a3b8; font-size: 0.88rem; line-height: 1.6;">
          عروض الفيديو المتحركة لهذا الإصدار قيد الإعداد والمونتاج، وستُتاح في التحديث القادم لمكتبة البوابة.
        </p>
        <div style="display: inline-block; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 20px; padding: 4px 14px; font-size: 0.78rem; color: #7dd3fc;">
          ✨ يمكنك الآن متابعة القراءة وتفعيل الراوي الصوتي المدمج للنشرات
        </div>
      `;
      this.showModal();
      return;
    }

    this.noticeEl.style.display = 'none';
    this.videoWrapperEl.style.display = 'block';
    this.titleEl.textContent =
      customTitle || DEFAULT_EPIC_TITLES[chapterNum] || `كواليس الفصل ${chapterNum}`;
    this.subtitleEl.textContent = 'ملخص مرئي متزامن بالصوت الفصيح والرسوم الهندسية';

    this.videoEl.src = `${videoDir}ch${chapterNum}.mp4`;
    this.videoEl.currentTime = 0;
    this.videoEl.play().catch(() => {
      // autoplay might require tap on strict mobile browsers
    });
    this.showModal();
  }

  private showModal(): void {
    this.modalEl.style.display = 'flex';
    this.modalEl.classList.add('active');
  }

  public close(): void {
    this.videoEl.pause();
    this.videoEl.removeAttribute('src');
    this.videoEl.load();
    this.noticeEl.style.display = 'none';
    this.videoWrapperEl.style.display = 'block';
    this.modalEl.classList.remove('active');
    this.modalEl.style.display = 'none';
  }
}
