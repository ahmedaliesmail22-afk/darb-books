import { z } from 'zod';
import type { BlockCleanupFn, BlockMountContext, InteractiveBlockPlugin } from '../types';

const DialogueTurnSchema = z.object({
  speakerAr: z.string().min(1),
  avatarEmoji: z.string().default('💬'),
  textAr: z.string().min(1),
});

export const StoryMagazineBlockPayloadSchema = z.object({
  layout: z.enum(['magazine_split', 'comic_dialogue', 'hero_column', 'poll_sidebar']).default('comic_dialogue'),
  kickerAr: z.string().optional(),
  headlineAr: z.string().min(1),
  bylineAr: z.string().optional(),
  leadParagraphAr: z.string().min(1),
  calloutQuoteAr: z.string().optional(),
  dialogueTurns: z.array(DialogueTurnSchema).default([]),
  poll: z
    .object({
      questionAr: z.string().min(1),
      options: z.array(z.string().min(1)).min(2),
    })
    .optional(),
});

export type StoryMagazineBlockPayload = z.infer<typeof StoryMagazineBlockPayloadSchema>;

function mountStoryMagazine(
  container: HTMLElement,
  payload: StoryMagazineBlockPayload,
  ctx: BlockMountContext
): BlockCleanupFn {
  let revealedCount = Math.min(2, payload.dialogueTurns.length);
  let votedIndex: number | null = null;

  const headerMeta = document.createElement('div');
  headerMeta.style.display = 'flex';
  headerMeta.style.justifyContent = 'space-between';
  headerMeta.style.fontSize = '10.8px';
  headerMeta.style.opacity = '0.85';
  headerMeta.textContent = [payload.kickerAr, payload.bylineAr].filter(Boolean).join(' • ');

  const lead = document.createElement('p');
  lead.style.margin = '0';
  lead.style.fontSize = ctx.mode === 'fullscreen' ? '15px' : '12px';
  lead.style.lineHeight = '1.65';
  lead.textContent = payload.leadParagraphAr;

  const quote = document.createElement('blockquote');
  quote.className = 'darb-story-quote';
  quote.style.margin = '0';

  const dialogueWrap = document.createElement('div');
  dialogueWrap.style.display = 'flex';
  dialogueWrap.style.flexDirection = 'column';
  dialogueWrap.style.gap = '4px';

  const pollWrap = document.createElement('div');
  pollWrap.className = 'darb-blk-chips';

  if (headerMeta.textContent) container.appendChild(headerMeta);
  container.appendChild(lead);
  if (payload.calloutQuoteAr) {
    quote.textContent = `«${payload.calloutQuoteAr}»`;
    container.appendChild(quote);
  }
  if (payload.dialogueTurns.length > 0) container.appendChild(dialogueWrap);
  if (payload.poll) container.appendChild(pollWrap);

  const renderInteractive = () => {
    dialogueWrap.innerHTML = '';
    if (payload.dialogueTurns.length > 0) {
      const visible =
        ctx.mode === 'fullscreen'
          ? payload.dialogueTurns
          : payload.dialogueTurns.slice(0, revealedCount);

      for (const turn of visible) {
        const row = document.createElement('div');
        row.className = 'darb-dialogue-turn';
        row.innerHTML = `<strong>${turn.avatarEmoji} ${turn.speakerAr}:</strong> ${turn.textAr}`;
        dialogueWrap.appendChild(row);
      }

      if (ctx.mode === 'inline' && revealedCount < payload.dialogueTurns.length) {
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'darb-blk-btn';
        moreBtn.textContent = `متابعة الحوار (${revealedCount}/${payload.dialogueTurns.length})`;
        moreBtn.addEventListener('click', () => {
          revealedCount = Math.min(payload.dialogueTurns.length, revealedCount + 1);
          renderInteractive();
        });
        dialogueWrap.appendChild(moreBtn);
      }
    }

    pollWrap.innerHTML = '';
    if (payload.poll) {
      const qSpan = document.createElement('span');
      qSpan.style.fontSize = '11px';
      qSpan.style.fontWeight = '700';
      qSpan.textContent = `🗳️ ${payload.poll.questionAr}: `;
      pollWrap.appendChild(qSpan);

      payload.poll.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `darb-blk-btn ${votedIndex === idx ? 'active' : ''}`;
        btn.textContent = votedIndex === idx ? `✓ ${opt}` : opt;
        btn.addEventListener('click', () => {
          votedIndex = idx;
          ctx.onToast?.(`تم تسجيل اختيارك: ${opt}`);
          renderInteractive();
        });
        pollWrap.appendChild(btn);
      });
    }
  };

  renderInteractive();

  return () => {
    dialogueWrap.innerHTML = '';
    pollWrap.innerHTML = '';
  };
}

export const storyMagazinePlugin: InteractiveBlockPlugin<StoryMagazineBlockPayload> = {
  type: 'story_magazine',
  labelAr: 'سرد ومجلة تفاعلية',
  descriptionAr: 'تخطيط مرن للقصص والروايات والمجلات مع حوارات متسلسلة واستطلاعات للقراء',
  icon: '📰',
  schema: StoryMagazineBlockPayloadSchema,
  examplePayload: {
    layout: 'comic_dialogue',
    kickerAr: 'ملف العدد التفاعلي',
    headlineAr: 'حوار في مرصد الفلك الحديث',
    bylineAr: 'بقلم هيئة تحرير مجلة درب',
    leadParagraphAr: 'يتبادل المهندسون والطلبة النقاش حول تصميم التلسكوبات المدارية وقراءة أطياف النجوم البعيدة.',
    calloutQuoteAr: 'كل تجربة علمية تبدأ بسؤال شجاع وملاحظة دقيقة.',
    dialogueTurns: [
      { speakerAr: 'ندى', avatarEmoji: '🔭', textAr: 'هل تكفي المرايا التقليدية لرصد الكواكب الخافتة؟' },
      { speakerAr: 'الدكتور رامي', avatarEmoji: '🛰️', textAr: 'في الفضاء نعتمد على مرايا سداسية مجزأة تتكيف رقمياً بدقة النانومتر!' },
    ],
    poll: {
      questionAr: 'ما العدد القادم الذي تفضّل متابعته؟',
      options: ['هندسة الفضاء', 'تاريخ الخط العربي'],
    },
  },
  extractSearchText: (p) =>
    [p.headlineAr, p.leadParagraphAr, p.calloutQuoteAr ?? '', ...p.dialogueTurns.map((d) => d.textAr)].join(' '),
  mountInline: mountStoryMagazine,
  mountFullscreen: mountStoryMagazine,
};
