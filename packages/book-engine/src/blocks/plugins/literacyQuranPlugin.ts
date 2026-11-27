import { z } from 'zod';
import type { BlockCleanupFn, BlockMountContext, InteractiveBlockPlugin } from '../types';

const TajweedSegmentSchema = z.object({
  text: z.string().min(1),
  ruleCode: z.string().optional(),
  ruleLabelAr: z.string().optional(),
  color: z.string().optional(),
  explanationAr: z.string().optional(),
});

const SpellingExerciseSchema = z.object({
  id: z.string().min(1),
  promptAr: z.string().min(1),
  targetWordAr: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  hintAr: z.string().optional(),
});

export const LiteracyQuranBlockPayloadSchema = z.object({
  mode: z.enum(['tajweed_recitation', 'dictation_spelling', 'vocab_cards']).default('tajweed_recitation'),
  topicTitleAr: z.string().default('التلاوة وتدبر الأحكام'),
  ayahOrSentenceAr: z.string().default('إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ'),
  translationOrMeaningAr: z.string().optional(),
  segments: z.array(TajweedSegmentSchema).default([]),
  exercises: z.array(SpellingExerciseSchema).default([]),
});

export type LiteracyQuranBlockPayload = z.infer<typeof LiteracyQuranBlockPayloadSchema>;

function mountLiteracyQuran(
  container: HTMLElement,
  payload: LiteracyQuranBlockPayload,
  ctx: BlockMountContext
): BlockCleanupFn {
  let showColors = true;
  let activeSegIdx = payload.segments.findIndex((s) => Boolean(s.ruleLabelAr));
  let activeExIdx = 0;

  const box = document.createElement('div');
  box.className = 'darb-quran-box';

  const note = document.createElement('div');
  note.className = 'darb-blk-note';

  const controls = document.createElement('div');
  controls.className = 'darb-blk-row';

  const exerciseWrap = document.createElement('div');
  exerciseWrap.className = 'darb-blk-chips';

  container.append(box, controls, note, exerciseWrap);

  const render = () => {
    box.innerHTML = '';
    if (payload.segments.length > 0) {
      payload.segments.forEach((seg, idx) => {
        const span = document.createElement('span');
        span.className = `darb-tajweed-seg${idx === activeSegIdx ? ' selected' : ''}`;
        span.textContent = seg.text;
        if (showColors && seg.color) {
          span.style.color = seg.color;
          span.style.fontWeight = '800';
        }
        if (seg.ruleLabelAr) {
          span.title = seg.ruleLabelAr;
          span.addEventListener('click', () => {
            activeSegIdx = idx;
            render();
          });
        }
        box.appendChild(span);
        box.appendChild(document.createTextNode(' '));
      });
    } else {
      box.textContent = payload.ayahOrSentenceAr;
    }

    controls.innerHTML = '';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = `darb-blk-btn ${showColors ? 'active' : ''}`;
    toggleBtn.textContent = showColors ? '🎨 ألوان الأحكام مفعّلة' : '🎨 إظهار ألوان الأحكام';
    toggleBtn.addEventListener('click', () => {
      showColors = !showColors;
      render();
    });
    controls.appendChild(toggleBtn);

    if (payload.topicTitleAr) {
      const tag = document.createElement('span');
      tag.style.fontSize = '11px';
      tag.style.opacity = '0.85';
      tag.textContent = payload.topicTitleAr;
      controls.appendChild(tag);
    }

    const activeSeg = activeSegIdx >= 0 ? payload.segments[activeSegIdx] : undefined;
    if (activeSeg?.ruleLabelAr) {
      note.innerHTML = `<strong>${activeSeg.ruleLabelAr}:</strong> ${
        activeSeg.explanationAr ?? 'انقر على المقاطع الملونة لاستعراض الحكم التجويدي أو اللغوي.'
      }`;
    } else if (payload.translationOrMeaningAr) {
      note.textContent = payload.translationOrMeaningAr;
    } else {
      note.textContent = 'انقر على الكلمات أو المقاطع الملوّنة لعرض الحكم والضبط الصحيح.';
    }

    exerciseWrap.innerHTML = '';
    const ex = payload.exercises[activeExIdx];
    if (ex) {
      const promptSpan = document.createElement('span');
      promptSpan.style.fontSize = '11px';
      promptSpan.style.fontWeight = '700';
      promptSpan.textContent = `✍️ ${ex.promptAr}: `;
      exerciseWrap.appendChild(promptSpan);

      for (const ch of ex.choices) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'darb-blk-btn';
        btn.textContent = ch;
        btn.addEventListener('click', () => {
          const correct = ch.trim() === ex.targetWordAr.trim();
          btn.classList.add('active');
          note.innerHTML = correct
            ? `✅ إجابة صحيحة! <strong>${ex.targetWordAr}</strong> — أحسنت الضبط والإملاء.`
            : `❌ حاول مجدداً (${ex.hintAr ?? 'انتبه للحركة وموضع الهمزة'}).`;
          ctx.onToast?.(correct ? 'إجابة صحيحة!' : 'حاول اختيار الضبط الأدق');
        });
        exerciseWrap.appendChild(btn);
      }

      if (payload.exercises.length > 1) {
        const nextExBtn = document.createElement('button');
        nextExBtn.type = 'button';
        nextExBtn.className = 'darb-blk-btn';
        nextExBtn.textContent = 'التالي ◀';
        nextExBtn.addEventListener('click', () => {
          activeExIdx = (activeExIdx + 1) % payload.exercises.length;
          render();
        });
        exerciseWrap.appendChild(nextExBtn);
      }
    }
  };

  render();

  return () => {
    box.innerHTML = '';
    controls.innerHTML = '';
    exerciseWrap.innerHTML = '';
  };
}

export const literacyQuranPlugin: InteractiveBlockPlugin<LiteracyQuranBlockPayload> = {
  type: 'literacy_quran',
  labelAr: 'التلاوة والإملاء واللغات',
  descriptionAr: 'تلاوة تفاعلية بأحكام التجويد المرمّزة لونياً وتمارين القراءة والإملاء',
  icon: '🕌',
  schema: LiteracyQuranBlockPayloadSchema,
  examplePayload: {
    mode: 'tajweed_recitation',
    topicTitleAr: 'تطبيق عملي لأحكام الغنة والقلقلة',
    ayahOrSentenceAr: 'قُلْ هُوَ اللَّهُ أَحَدٌ',
    translationOrMeaningAr: 'انقر على كل مقطع ملوّن لقراءة الحكم وسببه الصوتي.',
    segments: [
      { text: 'قُلْ هُوَ', ruleLabelAr: 'تفخيم القاف وسكون اللام' },
      { text: 'اللَّهُ', color: '#facc15', ruleLabelAr: 'لام لفظ الجلالة المفخمة', explanationAr: 'تُفخم لام لفظ الجلالة بعد الضم أو الفتح.' },
      { text: 'أَحَدٌ', color: '#38bdf8', ruleLabelAr: 'قلقلة كبرى عند الوقف', explanationAr: 'الدال الساكنة الموقوف عليها من حروف (قطب جد) تُقلقل بوضوح.' },
    ],
    exercises: [
      {
        id: 'hamza-1',
        promptAr: 'اختر الرسم الإملائي الصحيح',
        targetWordAr: 'قِرَاءَةٌ',
        choices: ['قِرَاءَةٌ', 'قِرَائَةٌ', 'قِرَأَةٌ'],
        hintAr: 'تُكتب الهمزة المفتوحة بعد ألف ساكنة على السطر.',
      },
    ],
  },
  extractSearchText: (p) =>
    [
      p.topicTitleAr,
      p.ayahOrSentenceAr,
      p.translationOrMeaningAr ?? '',
      ...p.segments.map((s) => `${s.text} ${s.ruleLabelAr ?? ''}`),
    ].join(' '),
  mountInline: mountLiteracyQuran,
  mountFullscreen: mountLiteracyQuran,
};
