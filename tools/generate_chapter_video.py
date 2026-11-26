# tools/generate_chapter_video.py
"""
توليد فيديوهات ملخصات الفصول السبعة لإصدار ملحمة درب (videos/epic-v1/ch1.mp4 .. ch7.mp4)
- أيقونات هندسية مرسومة بالكود في Pillow بدون أي رموز إيموجي (لا مربعات □).
- حركة تتابعية للبطاقات الأربع متزامنة مع توقيتات التعليق الصوتي (edge-tts ar-SA-HamedNeural).
- شريط تقدم سفلي متحرك مع محطات المراحل ومؤشر زمني.
- تصيير MP4 بترميز H.264 (yuv420p) + AAC + movflags +faststart.
"""
import asyncio
import math
import os
import re
import shutil
import subprocess
import sys

import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS_DIR = os.path.join(ROOT_DIR, 'tools')
OUT_DIR = os.path.join(ROOT_DIR, 'videos', 'epic-v1')
TEMP_DIR = os.path.join(TOOLS_DIR, '_temp_video_build')

FFMPEG = r'C:\Program Files (x86)\FormatFactory\ffmpeg.exe'
if not os.path.exists(FFMPEG):
    FFMPEG = 'ffmpeg'

FONT_PATH = 'C:/Windows/Fonts/tahoma.ttf'
FONT_BOLD_PATH = 'C:/Windows/Fonts/tahomabd.ttf'
if not os.path.exists(FONT_BOLD_PATH):
    FONT_BOLD_PATH = FONT_PATH

FPS = 24
WIDTH, HEIGHT = 1280, 720

CHAPTERS = {
    1: {
        "title": "الفصل الأول: نداء الاستغاثة ومخاض الفكرة",
        "subtitle": "أزمة التطبيقات المدرسية والمبادئ الهندسية الحاكمة الثلاثة",
        "challenge": "متابعة آلاف أولياء الأمور والطلاب في قرى نائية بشبكات اتصال ضعيفة وهواتف محدودة السعة.",
        "dilemma": "التطبيقات التقليدية تتطلب تنزيلاً وتحديثات تثقل الأجهزة وتستهلك الباقات، مما يعيق الوصول للجميع.",
        "solution": "اعتماد بيئة تيليجرام اللامركزية وبناء بوت Serverless فائق الخفة والسرعة يعمل على أضعف الشبكات.",
        "outcome": "سرعة استجابة مذهلة في حدود 200ms، صفر تكلفة تخزين على هواتف المستخدمين، وتغطية ميدانية بنسبة 100%!",
        "script": "كواليس الفصل الأول: نداء الاستغاثة ومخاض الفكرة. التحدي والاحتياج الواقعي: متابعة آلاف الطلاب وأولياء الأمور في بيئات نائية بشبكات اتصال محدودة. معضلة التطبيقات التقليدية: كيف تبني منصة دون إلزام أولياء الأمور بتنزيل تطبيقات تثقل هواتفهم أو تستهلك باقاتهم؟ الحل الهندسي المبتكر: اعتماد تيليجرام وبناء بوت خادم فائق الخفة والسرعة. النتيجة والأثر: استجابة فورية خلال 200 مللي ثانية وتغطية كاملة للمدارس بنجاح!"
    },
    2: {
        "title": "الفصل الثاني: المخطط الكبير وصدمة الجداول الـ 39",
        "subtitle": "هندسة SQLite و Drizzle ORM وفلسفة دفتر الأستاذ المحاسبي",
        "challenge": "إدارة مئات المدارس والآلاف من الطلاب مع ضمان سرعة فائقة وعزل صارم للمستأجرين وتفادي تضارب البيانات.",
        "dilemma": "تداخل سجل النقاط عند انقطاع الاتصال ومخاطر هلوسة نماذج الذكاء التوليدي في رصد الدرجات الحساسة.",
        "solution": "معمارية دفتر الأستاذ المزدوج لحصانة النقاط، وحظر الذكاء التوليدي تماماً في رصد الدرجات وحسم التقييم رياضياً.",
        "outcome": "39 جدولاً مترابطاً بلا تضارب، صفر هلوسة في رصد الدرجات، وسجل تدقيق مالي محاسبي لا يقبل الشك!",
        "script": "كواليس الفصل الثاني: المخطط الكبير وصدمة الجداول التسعة وثلاثين. التحدي الواقعي: إدارة مئات المدارس والطلاب مع سرعة استعلام فائقة وعزل تام للمستأجرين. المعضلة: تداخل سجل النقاط ومخاطر هلوسة الذكاء الاصطناعي في درجات الطلاب. الحل الهندسي: معمارية دفتر الأستاذ المزدوج وحظر الذكاء التوليدي تماماً في التقييم. النتيجة: تسعة وثلاثون جدولاً مترابطاً وصفر هلوسة في رصد الدرجات."
    },
    3: {
        "title": "الفصل الثالث: معركة القيود المستحيلة وكيف قهرناها",
        "subtitle": "سقف الـ 64 بايت، ابتكار البادئات فائقة الكثافة، وترويض حد الـ 4096 حرفاً",
        "challenge": "سقف قيود واجهات تيليجرام الصارم: 64 بايت كحد أقصى لحمولة الأزرار، و 4096 حرفاً لنص الرسالة.",
        "dilemma": "كيف نمرر سياق المدرسة والصف والمادة والطالب والحالة FSM ضمن 64 بايت دون فقدان البيانات؟",
        "solution": "ابتكار خوارزمية البادئات فائقة الكثافة بترميز مقتضب، وتقسيم النصوص والرسائل جراحياً بنظام الصفحات.",
        "outcome": "ضغط الحمولات بنسبة 85% من 120 بايت إلى 18 بايت، وتشغيل كافة مسارات البوت بسلاسة مطلقة!",
        "script": "كواليس الفصل الثالث: معركة القيود المستحيلة وكيف قهرناها. التحدي: سقف تيليجرام الصارم في أربعة وستين بايت للأزرار وأربعة آلاف وستة وتسعين حرفاً للرسائل. المعضلة: كيف نمرر سياق المدرسة والصف والمادة والطالب في أربعة وستين بايت فقط؟ الحل الهندسي: ابتكار خوارزمية البادئات فائقة الكثافة وتقسيم الرسائل بنظام الصفحات. النتيجة: ضغط الحمولات بنسبة خمسة وثمانين بالمئة وتشغيل المنظومة بلا تعثر."
    },
    4: {
        "title": "الفصل الرابع: عثرات في المعمعة ولحظات الإنقاذ",
        "subtitle": "أزمة تعابير Regex، معركة توقيت مكة UTC+3، ولغز محيط الدائرة 251px",
        "challenge": "أخطاء برمجية حرجة كادت تعصف بالنظام: تعابير نمطية تبتلع النصوص، وتفاوت التوقيت، ولغز دائرة الحضور.",
        "dilemma": "تسجيل الحضور في غير وقته بسبب فارق السيرفر، وتشوه واجهة Mini App عند رسم دائرة الإنجاز.",
        "solution": "فرض توقيت مكة المكرمة UTC+3 مركزياً، وتحصين regex، وحساب محيط الدائرة الرياضي بدقة الميكرون: 251.3px.",
        "outcome": "دقة توقيت 100% في كافة التذكيرات والتقارير، وثبات بصري ميكروني في لوحات الطالب والمعلم!",
        "script": "كواليس الفصل الرابع: عثرات في المعمعة ولحظات الإنقاذ. التحدي: أخطاء حية كادت تعصف بالنظام في تعابير ريجكس وتفاوت التوقيت. المعضلة: تسجيل الحضور في غير وقته وانهيار دائرة الإنجاز في تطبيق الويب. الحل الهندسي: فرض توقيت مكة المكرمة مركزياً وحساب محيط الدائرة الرياضي بدقة الميكرون. النتيجة: دقة توقيت مئة بالمئة وثبات بصري ميكروني في كافة الواجهات."
    },
    5: {
        "title": "الفصل الخامس: ولادة المحركات الكبرى",
        "subtitle": "حلبة النزالات 1v1، باركود التحضير الذكي، ورادار سد الفجوات المهارية",
        "challenge": "تحفيز الطلاب على المذاكرة المستمرة دون ملل، واكتشاف مواطن الضعف الدراسي ومعالجتها مبكراً.",
        "dilemma": "عند تساوي درجات الطلاب في التحديات كان التعادل يحبط الحماس، وخطط العلاج التقليدية تتأخر شهوراً.",
        "solution": "حلبة نزالات 1v1 تقيس زمن الاستجابة بالمللي ثانية لكسر التعادل، ورادار ذكي يولد خطة تدريب تكيفية فورية.",
        "outcome": "زيادة حل المسائل بنسبة 320%، وإتقان 94% من المهارات المتعثرة لدى الطلاب خلال أسبوعين من تدخل الرادار!",
        "script": "كواليس الفصل الخامس: ولادة المحركات الكبرى. التحدي: تحفيز الطلاب على المذاكرة دون ملل واكتشاف الفجوات الدراسية مبكراً. المعضلة: التعادل في التحديات يحبط الحماس وخطط العلاج التقليدية تتأخر شهوراً. الحل الهندسي: حلبة نزالات تقيس زمن الاستجابة بالمللي ثانية ورادار يولد تدريباً تكيفياً فورياً دون ستين بالمئة. النتيجة: زيادة حل المسائل بنسبة ثلاثمئة وعشرين بالمئة وإتقان أربعة وتسعين بالمئة من المهارات!"
    },
    6: {
        "title": "الفصل السادس: ملحمة التوثيق الأكبر",
        "subtitle": "شرح 78 ملفاً باللغة العربية الفصحى سطراً بسطر وعمود check.cjs الأسطوري",
        "challenge": "تحول المشروع إلى منظومة عملاقة تضم 78 ملفاً برمجياً و 22,000 سطر، مع خطر تراكم الديون التقنية.",
        "dilemma": "صعوبة استيعاب المطورين لأسرار المعمارية، وتراكم الأخطاء الصامتة في مسارات آلة الحالات FSM.",
        "solution": "تأليف كتاب تشريحي هندسي كامل باللغة العربية الفصحى، وبناء رادار الفحص الشامل check.cjs.",
        "outcome": "صفر دوال يتيمة، صفر استدعاءات مجهولة، وفحص استباقي يمنع أي عطل قبل النشر للسحابة!",
        "script": "كواليس الفصل السادس: ملحمة التوثيق الأكبر. التحدي: تحول المشروع إلى منظومة تضم ثمانية وسبعين ملفاً واثنين وعشرين ألف سطر كود. المعضلة: تراكم الديون التقنية وصعوبة استيعاب أسرار المعمارية المعقدة. الحل الهندسي: تأليف كتاب تشريحي باللغة العربية الفصحى وبناء رادار الفحص الشامل تشيك دوت سي جي إس. النتيجة: صفر دوال يتيمة وصفر استدعاءات مجهولة وفحص استباقي صارم."
    },
    7: {
        "title": "الفصل السابع: الإطلاق وملاقاة السحاب",
        "subtitle": "الاختبارات الـ 45، التحصين الأمني الثلاثي، والارتقاء إلى Revision 23",
        "challenge": "نشر المنظومة على سحابة Telegram Serverless وضمان الصمود تحت ضغط آلاف الطلاب والمعلمين.",
        "dilemma": "مخاطر الثغرات في نقاط النهاية المفتوحة، وتجاوز عزل المدارس أو التلاعب بالأسعار والاشتراكات.",
        "solution": "تحصين أمني ثلاثي بتشفير HMAC-SHA-256، عزل صارم للمستأجرين، و 68 اختباراً آلياً شاملاً.",
        "outcome": "ترقية ناجحة إلى Revision 23 المعتمد، اجتياز 100% من الاختبارات، وانطلاق صرح درب التعليمي بكامل قوته!",
        "script": "كواليس الفصل السابع: الإطلاق وملاقاة السحاب. التحدي: نشر المنظومة على سحابة تيليجرام وضمان استقرارها تحت الضغط العالي. المعضلة: حماية نقاط النهاية المفتوحة ومنع اختراق عزل المدارس أو التلاعب بالاشتراكات. الحل الهندسي: تحصين أمني ثلاثي بتشفير إتش ماك شاتين وستة وخمسين وعزل صارم واختبارات آلية شاملة. النتيجة: ترقية ناجحة إلى ريفيجن ثلاثة وعشرين وانطلاق منصة درب بكامل قوتها!"
    }
}

CARD_SPECS = [
    {
        "key": "challenge",
        "kind": "challenge",
        "title": "التحدي والاحتياج الواقعي",
        "border": (59, 130, 246),
        "bg": (15, 23, 42),
        "bg_active": (20, 35, 64),
        "title_color": (96, 165, 250),
        "text_color": (226, 232, 240),
    },
    {
        "key": "dilemma",
        "kind": "dilemma",
        "title": "المعضلة التقنية الصادمة",
        "border": (220, 38, 38),
        "bg": (28, 18, 24),
        "bg_active": (48, 22, 30),
        "title_color": (248, 113, 113),
        "text_color": (226, 232, 240),
    },
    {
        "key": "solution",
        "kind": "solution",
        "title": "الحل الهندسي العبقري",
        "border": (217, 119, 6),
        "bg": (26, 23, 18),
        "bg_active": (46, 36, 18),
        "title_color": (251, 191, 36),
        "text_color": (226, 232, 240),
    },
    {
        "key": "outcome",
        "kind": "outcome",
        "title": "النتيجة والأثر بالأرقام",
        "border": (16, 185, 129),
        "bg": (12, 30, 24),
        "bg_active": (16, 46, 36),
        "title_color": (52, 211, 153),
        "text_color": (226, 232, 240),
    },
]


def mix_color(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


def shape_bidi(text: str) -> str:
    return get_display(arabic_reshaper.reshape(text))


def wrap_arabic_lines(draw, text: str, font, max_width=None):
    if not text:
        return [], 0
    words = text.split()
    raw_lines = []
    curr = []
    for w in words:
        test_line = " ".join(curr + [w])
        bidi_line = shape_bidi(test_line)
        bbox = draw.textbbox((0, 0), bidi_line, font=font)
        w_px = bbox[2] - bbox[0]
        if max_width and w_px > max_width and curr:
            raw_lines.append(" ".join(curr))
            curr = [w]
        else:
            curr.append(w)
    if curr:
        raw_lines.append(" ".join(curr))

    sample_box = draw.textbbox((0, 0), shape_bidi("تجربة بصرية"), font=font)
    line_h = (sample_box[3] - sample_box[1]) + 8

    shaped_lines = []
    for line in raw_lines:
        bidi_line = shape_bidi(line)
        bbox = draw.textbbox((0, 0), bidi_line, font=font)
        shaped_lines.append((bidi_line, bbox[2] - bbox[0]))
    return shaped_lines, line_h


def draw_prewrapped_lines(draw, pos, shaped_lines, line_h, font, fill, align='right'):
    x, y = pos
    for bidi_line, w_px in shaped_lines:
        if align == 'right':
            draw_x = x - w_px
        elif align == 'center':
            draw_x = x - w_px // 2
        else:
            draw_x = x
        draw.text((draw_x, y), bidi_line, font=font, fill=fill)
        y += line_h
    return y


def draw_geometric_icon(draw, cx, cy, kind, accent_rgb, badge_bg_rgb, highlight=1.0):
    """رسم أيقونات هندسية نظيفة بـ Pillow بدلاً من الإيموجي لمنع ظهور مربعات □."""
    r_badge = 20
    ring_col = mix_color((55, 65, 81), accent_rgb, highlight)
    draw.ellipse(
        [cx - r_badge, cy - r_badge, cx + r_badge, cy + r_badge],
        fill=badge_bg_rgb,
        outline=ring_col,
        width=2,
    )

    fg = mix_color((100, 116, 139), accent_rgb, highlight)
    bright_fg = mix_color(fg, (255, 255, 255), 0.35 * highlight)

    if kind == 'challenge':
        # هدف هندسي بدوائر متحدة المركز وعلامات تصويب
        draw.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], outline=fg, width=2)
        draw.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], outline=bright_fg, width=2)
        draw.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=bright_fg)
        draw.line([cx, cy - 14, cx, cy - 10], fill=fg, width=2)
        draw.line([cx, cy + 10, cx, cy + 14], fill=fg, width=2)
        draw.line([cx - 14, cy, cx - 10, cy], fill=fg, width=2)
        draw.line([cx + 10, cy, cx + 14, cy], fill=fg, width=2)

    elif kind == 'dilemma':
        # مثلث تحذير هندسي وعلامة تنبيه
        tri = [(cx, cy - 11), (cx - 11, cy + 9), (cx + 11, cy + 9)]
        draw.polygon(tri, outline=fg, width=2)
        draw.line([cx, cy - 4, cx, cy + 2], fill=bright_fg, width=3)
        draw.ellipse([cx - 1.5, cy + 4.5, cx + 1.5, cy + 7.5], fill=bright_fg)

    elif kind == 'solution':
        # مصباح فكرة هندسي مع أشعة إضاءة
        draw.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], outline=bright_fg, width=2)
        draw.rectangle([cx - 3.5, cy + 6, cx + 3.5, cy + 9], fill=fg)
        draw.line([cx - 2.5, cy + 11, cx + 2.5, cy + 11], fill=fg, width=2)
        for deg in (-145, -112, -90, -68, -35):
            rad = math.radians(deg)
            x0 = cx + math.cos(rad) * 9.5
            y0 = (cy - 1) + math.sin(rad) * 9.5
            x1 = cx + math.cos(rad) * 13.5
            y1 = (cy - 1) + math.sin(rad) * 13.5
            draw.line([x0, y0, x1, y1], fill=bright_fg, width=2)

    elif kind == 'outcome':
        # كأس/وسام هندسي للنتيجة
        cup = [(cx - 8, cy - 10), (cx + 8, cy - 10), (cx + 4.5, cy + 1), (cx - 4.5, cy + 1)]
        draw.polygon(cup, fill=fg, outline=bright_fg)
        draw.arc([cx - 12, cy - 9, cx - 5, cy - 1], start=90, end=270, fill=fg, width=2)
        draw.arc([cx + 5, cy - 9, cx + 12, cy - 1], start=270, end=90, fill=fg, width=2)
        draw.rectangle([cx - 1.5, cy + 1, cx + 1.5, cy + 7], fill=fg)
        draw.rectangle([cx - 6.5, cy + 7, cx + 6.5, cy + 10.5], fill=bright_fg)


async def generate_narration_with_timings(ch_num: int):
    text = CHAPTERS[ch_num]['script']
    os.makedirs(TEMP_DIR, exist_ok=True)
    out_voice = os.path.join(TEMP_DIR, f"voice_ch{ch_num}.mp3")

    import edge_tts
    communicate = edge_tts.Communicate(text, "ar-SA-HamedNeural", rate="+5%")

    audio_chunks = bytearray()
    boundaries = []
    async for chunk in communicate.stream():
        ctype = chunk.get("type")
        if ctype == "audio":
            audio_chunks.extend(chunk["data"])
        elif ctype == "SentenceBoundary":
            boundaries.append({
                "offset": chunk["offset"] / 1e7,
                "duration": chunk["duration"] / 1e7,
                "text": chunk.get("text", ""),
            })

    with open(out_voice, "wb") as f:
        f.write(audio_chunks)

    return out_voice, boundaries


def get_audio_duration(file_path: str) -> float:
    cmd = [FFMPEG, '-i', file_path]
    p = subprocess.run(cmd, capture_output=True, text=True)
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.\d+)', p.stderr)
    if not m:
        raise ValueError(f"Cannot read audio duration for {file_path}: {p.stderr[:300]}")
    h, mn, s = map(float, m.groups())
    return h * 3600 + mn * 60 + s


def compute_card_timings(boundaries, script: str, audio_dur: float):
    """استخراج أوقات بدء البطاقات الأربع من حدود الجمل الفعلية مع بديل تناسبي آمن."""
    markers = [
        ("التحدي",),
        ("المعضلة", "معضلة"),
        ("الحل",),
        ("النتيجة",),
    ]
    found = []
    search_idx = 0
    for kw_tuple in markers:
        matched_t = None
        for idx in range(search_idx, len(boundaries)):
            b_text = boundaries[idx]["text"]
            if any(kw in b_text for kw in kw_tuple):
                matched_t = boundaries[idx]["offset"]
                search_idx = idx + 1
                break
        found.append(matched_t)

    # fallback proportional timestamps using script offsets if any boundary wasn't isolated
    fallback_ratios = []
    for kw_tuple in markers:
        pos = -1
        for kw in kw_tuple:
            pos = script.find(kw)
            if pos != -1:
                break
        ratio = (pos / max(1, len(script))) if pos != -1 else 0.2
        fallback_ratios.append(max(0.4, ratio * audio_dur))

    timings = []
    for i in range(4):
        t = found[i] if found[i] is not None else fallback_ratios[i]
        if i > 0 and t <= timings[i - 1] + 0.8:
            t = max(timings[i - 1] + 1.0, fallback_ratios[i])
        timings.append(min(t, max(0.5, audio_dur - (4 - i) * 0.8)))

    return timings


def ensure_ambient_wav() -> str:
    os.makedirs(TEMP_DIR, exist_ok=True)
    ambient_path = os.path.join(TEMP_DIR, 'ambient_bed.wav')
    if os.path.exists(ambient_path):
        return ambient_path
    # Reuse generate_audio_assets.py in-process without leaving files in tools/
    sys.path.insert(0, TOOLS_DIR)
    import generate_audio_assets
    samples = generate_audio_assets.make_ambient_bed(120)
    generate_audio_assets.write_wav(ambient_path, samples)
    return ambient_path


def format_mmss(sec: float) -> str:
    sec_i = max(0, int(round(sec)))
    return f"{sec_i // 60:02d}:{sec_i % 60:02d}"


def prepare_chapter_render_data(ch_num: int):
    data = CHAPTERS[ch_num]
    font_main_title = ImageFont.truetype(FONT_BOLD_PATH, 32)
    font_sub_title = ImageFont.truetype(FONT_PATH, 21)
    font_card_title = ImageFont.truetype(FONT_BOLD_PATH, 23)
    font_card_body = ImageFont.truetype(FONT_PATH, 19)
    font_foot = ImageFont.truetype(FONT_PATH, 15)
    font_timer = ImageFont.truetype(FONT_BOLD_PATH, 15)

    base_img = Image.new('RGB', (WIDTH, HEIGHT), color=(11, 15, 25))
    base_draw = ImageDraw.Draw(base_img)

    # إطار خارجي أنيق
    base_draw.rounded_rectangle([24, 22, WIDTH - 24, HEIGHT - 22], radius=24, outline=(30, 41, 59), width=2)

    title_lines, title_lh = wrap_arabic_lines(base_draw, data['title'], font_main_title, max_width=1120)
    sub_lines, sub_lh = wrap_arabic_lines(base_draw, data['subtitle'], font_sub_title, max_width=1120)
    draw_prewrapped_lines(base_draw, (WIDTH // 2, 38), title_lines, title_lh, font_main_title, (245, 158, 11), align='center')
    draw_prewrapped_lines(base_draw, (WIDTH // 2, 86), sub_lines, sub_lh, font_sub_title, (148, 163, 184), align='center')

    # خط فاصل ذهبي
    base_draw.line([80, 128, WIDTH - 80, 128], fill=(212, 175, 55), width=2)

    # تذييل ثابت
    foot_lines, foot_lh = wrap_arabic_lines(
        base_draw,
        "منظومة درب للتعليم الذكي — ملخص كواليس الفصول التفاعلي",
        font_foot,
        max_width=900,
    )
    draw_prewrapped_lines(base_draw, (WIDTH // 2, HEIGHT - 48), foot_lines, foot_lh, font_foot, (100, 116, 139), align='center')

    # إحداثيات البطاقات الأربع (2x2 RTL)
    col_w = (WIDTH - 160 - 28) // 2
    row_h = 220
    r_x0 = WIDTH // 2 + 14
    r_x1 = r_x0 + col_w
    l_x0 = 80
    l_x1 = l_x0 + col_w
    top_y0 = 148
    top_y1 = top_y0 + row_h
    bot_y0 = top_y1 + 20
    bot_y1 = bot_y0 + row_h

    rects = [
        (r_x0, top_y0, r_x1, top_y1),
        (l_x0, top_y0, l_x1, top_y1),
        (r_x0, bot_y0, r_x1, bot_y1),
        (l_x0, bot_y0, l_x1, bot_y1),
    ]

    prepared_cards = []
    for spec, rect in zip(CARD_SPECS, rects):
        x0, y0, x1, y1 = rect
        title_lines, t_lh = wrap_arabic_lines(base_draw, spec['title'], font_card_title, max_width=(x1 - x0 - 95))
        body_lines, b_lh = wrap_arabic_lines(base_draw, data[spec['key']], font_card_body, max_width=(x1 - x0 - 52))
        prepared_cards.append({
            "spec": spec,
            "rect": rect,
            "title_lines": title_lines,
            "title_lh": t_lh,
            "body_lines": body_lines,
            "body_lh": b_lh,
        })

    return {
        "base_img": base_img,
        "cards": prepared_cards,
        "font_card_title": font_card_title,
        "font_card_body": font_card_body,
        "font_timer": font_timer,
    }


def render_frame(render_data, t: float, total_dur: float, audio_dur: float, timings):
    img = render_data["base_img"].copy()
    draw = ImageDraw.Draw(img)

    font_card_title = render_data["font_card_title"]
    font_card_body = render_data["font_card_body"]
    font_timer = render_data["font_timer"]

    for idx, card in enumerate(render_data["cards"]):
        spec = card["spec"]
        x0, y0, x1, y1 = card["rect"]
        t_start = timings[idx]
        t_end = timings[idx + 1] if idx < 3 else audio_dur

        if t < t_start:
            # مرحلة التمهيد قبل قراءة البطاقة: إطار هادئ خافت
            reveal = 0.0
            is_active = False
            card_fill = mix_color((11, 15, 25), spec["bg"], 0.45)
            border_col = mix_color((30, 41, 59), spec["border"], 0.25)
            border_w = 1
            title_col = mix_color((51, 65, 85), spec["title_color"], 0.35)
            body_col = mix_color(card_fill, spec["text_color"], 0.16)
            icon_hi = 0.28
            badge_bg = mix_color((15, 23, 42), spec["border"], 0.08)
            slide_dy = 0
        elif t < t_end:
            # البطاقة النشطة المتزامنة مع الراوي: إضاءة وتوهج ونبض هادئ
            reveal = min(1.0, (t - t_start) / 0.45)
            ease = 1.0 - (1.0 - reveal) ** 3
            pulse = 0.5 + 0.5 * math.sin(2.0 * math.pi * 1.35 * (t - t_start))
            is_active = True

            card_fill = mix_color(spec["bg"], spec["bg_active"], 0.55 + 0.45 * pulse)
            border_col = mix_color(spec["border"], (255, 236, 159), 0.25 + 0.3 * pulse)
            border_w = 3

            # هالة إضاءة خارجية خفيفة حول البطاقة النشطة
            halo_col = mix_color((11, 15, 25), spec["border"], 0.35 + 0.25 * pulse)
            draw.rounded_rectangle([x0 - 3, y0 - 3, x1 + 3, y1 + 3], radius=17, outline=halo_col, width=2)

            title_col = mix_color(spec["title_color"], (255, 255, 255), 0.18 * pulse)
            body_col = mix_color(card_fill, spec["text_color"], 0.25 + 0.75 * ease)
            icon_hi = 0.85 + 0.15 * pulse
            badge_bg = mix_color(card_fill, spec["border"], 0.22 + 0.1 * pulse)
            slide_dy = int(round((1.0 - ease) * 10))
        else:
            # البطاقة المكتملة بعد انتهاء قراءتها: واضحة وثابتة
            is_active = False
            tail_glow = 0.15 if t >= audio_dur else 0.0
            card_fill = mix_color(spec["bg"], spec["bg_active"], 0.2 + tail_glow)
            border_col = mix_color((30, 41, 59), spec["border"], 0.75 + tail_glow)
            border_w = 2
            title_col = spec["title_color"]
            body_col = spec["text_color"]
            icon_hi = 0.85
            badge_bg = mix_color(card_fill, spec["border"], 0.15)
            slide_dy = 0

        draw.rounded_rectangle([x0, y0, x1, y1], radius=14, fill=card_fill, outline=border_col, width=border_w)

        # أيقونة هندسية مرسومة بالكود في الزاوية اليمنى العليا للبطاقة
        badge_cx = x1 - 42
        badge_cy = y0 + 36
        draw_geometric_icon(draw, badge_cx, badge_cy, spec["kind"], spec["title_color"], badge_bg, highlight=icon_hi)

        # عنوان البطاقة بمحاذاة الأيقونة الهندسية
        draw_prewrapped_lines(
            draw,
            (x1 - 74, y0 + 21),
            card["title_lines"],
            card["title_lh"],
            font_card_title,
            title_col,
            align='right',
        )

        # مؤشر الحالة الصغيرة على يسار رأس البطاقة (نقطة نبض نشطة أو علامة إتمام)
        ind_cx = x0 + 24
        ind_cy = y0 + 34
        if is_active:
            pulse_r = 5 + 2 * (0.5 + 0.5 * math.sin(2.0 * math.pi * 2.0 * t))
            draw.ellipse([ind_cx - pulse_r, ind_cy - pulse_r, ind_cx + pulse_r, ind_cy + pulse_r], fill=(250, 204, 21))
        elif t >= t_end:
            draw.ellipse([ind_cx - 7, ind_cy - 7, ind_cx + 7, ind_cy + 7], outline=spec["border"], width=2)
            draw.line([ind_cx - 3.5, ind_cy, ind_cx - 1, ind_cy + 3, ind_cx + 4, ind_cy - 3], fill=spec["title_color"], width=2)

        # نص البطاقة
        draw_prewrapped_lines(
            draw,
            (x1 - 26, y0 + 68 + slide_dy),
            card["body_lines"],
            card["body_lh"],
            font_card_body,
            body_col,
            align='right',
        )

    # ------------------------------------------------------------------
    # شريط التقدم السفلي المتحرك (من اليمين إلى اليسار متوافق مع RTL)
    # ------------------------------------------------------------------
    bar_x0 = 165
    bar_x1 = WIDTH - 80
    bar_y0 = 632
    bar_y1 = 642
    bar_w = bar_x1 - bar_x0

    draw.rounded_rectangle([bar_x0, bar_y0, bar_x1, bar_y1], radius=5, fill=(30, 41, 59), outline=(51, 65, 85), width=1)

    progress = max(0.0, min(1.0, t / max(0.1, total_dur)))
    fill_w = max(8, int(round(bar_w * progress)))
    fill_x0 = max(bar_x0, bar_x1 - fill_w)
    draw.rounded_rectangle([fill_x0, bar_y0, bar_x1, bar_y1], radius=5, fill=(212, 175, 55))

    # نقطة رأس التقدم المضيئة
    head_cx = fill_x0
    head_cy = (bar_y0 + bar_y1) // 2
    draw.ellipse([head_cx - 7, head_cy - 7, head_cx + 7, head_cy + 7], fill=(254, 240, 138), outline=(212, 175, 55), width=2)

    # علامات المحطات الأربع على طول الشريط الزمني
    for idx, t_mark in enumerate(timings):
        ratio = max(0.0, min(1.0, t_mark / max(0.1, total_dur)))
        mx = int(round(bar_x1 - bar_w * ratio))
        reached = t >= t_mark
        m_col = CARD_SPECS[idx]["title_color"] if reached else (71, 85, 105)
        draw.ellipse([mx - 5, head_cy - 5, mx + 5, head_cy + 5], fill=m_col, outline=(11, 15, 25), width=2)

    # عداد الزمن الدقيق
    timer_text = f"{format_mmss(min(t, total_dur))} / {format_mmss(total_dur)}"
    draw.text((80, 628), timer_text, font=font_timer, fill=(203, 213, 225))

    return img


def mix_chapter_video(ch_num: int):
    ambient_wav = ensure_ambient_wav()
    voice_mp3, boundaries = asyncio.run(generate_narration_with_timings(ch_num))

    audio_dur = get_audio_duration(voice_mp3)
    total_dur = audio_dur + 1.2
    timings = compute_card_timings(boundaries, CHAPTERS[ch_num]['script'], audio_dur)

    print(
        f"Ch{ch_num} audio={audio_dur:.2f}s, total={total_dur:.2f}s, "
        f"card_timings={[round(x, 2) for x in timings]}",
        flush=True,
    )

    os.makedirs(OUT_DIR, exist_ok=True)
    out_video = os.path.join(OUT_DIR, f"ch{ch_num}.mp4")
    ffmpeg_log_path = os.path.join(TEMP_DIR, f"ffmpeg_ch{ch_num}.log")

    render_data = prepare_chapter_render_data(ch_num)
    total_frames = int(math.ceil(total_dur * FPS))

    filter_complex = (
        f"[1:a]volume=1.0[v];"
        f"[2:a]atrim=0:{total_dur:.3f},afade=t=in:ss=0:d=1.5,"
        f"afade=t=out:st={max(0.0, total_dur - 1.5):.3f}:d=1.5,volume=0.06[bgm];"
        f"[v][bgm]amix=inputs=2:duration=longest:dropout_transition=2[a]"
    )

    cmd = [
        FFMPEG, '-y',
        '-loglevel', 'warning',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-pix_fmt', 'rgb24',
        '-s', f'{WIDTH}x{HEIGHT}',
        '-r', str(FPS),
        '-i', 'pipe:0',
        '-i', voice_mp3,
        '-i', ambient_wav,
        '-filter_complex', filter_complex,
        '-map', '0:v',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        out_video
    ]

    with open(ffmpeg_log_path, 'wb') as log_f:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log_f)
        try:
            for f_idx in range(total_frames):
                t = f_idx / FPS
                frame_img = render_frame(render_data, t, total_dur, audio_dur, timings)
                proc.stdin.write(frame_img.tobytes())
            proc.stdin.close()
        except BrokenPipeError:
            pass
        ret = proc.wait()

    if ret != 0:
        with open(ffmpeg_log_path, 'r', encoding='utf-8', errors='replace') as log_f:
            err_txt = log_f.read()
        raise RuntimeError(f"❌ Error rendering ch{ch_num}.mp4: {err_txt[-600:]}")

    sz = os.path.getsize(out_video)
    print(f"✅ Rendered {out_video} ({total_dur:.1f}s, {total_frames} frames, {sz // 1024} KB)", flush=True)


def cleanup_temp():
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR, ignore_errors=True)


if __name__ == '__main__':
    arg = sys.argv[1] if len(sys.argv) > 1 else 'all'
    try:
        if arg.lower() == 'all':
            targets = list(range(1, 8))
        else:
            targets = [int(arg)]

        for ch in targets:
            print(f"\n🎬 Generating animated video for Chapter {ch}...")
            mix_chapter_video(ch)
    finally:
        cleanup_temp()
