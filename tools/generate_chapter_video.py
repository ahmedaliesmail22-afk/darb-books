# tools/generate_chapter_video.py
import os, sys, math, json, asyncio, subprocess, re
import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

FFMPEG = r'C:\Program Files (x86)\FormatFactory\ffmpeg.exe'
FONT_PATH = 'C:/Windows/Fonts/tahoma.ttf'
FONT_BOLD_PATH = 'C:/Windows/Fonts/tahomabd.ttf'
if not os.path.exists(FONT_BOLD_PATH):
    FONT_BOLD_PATH = FONT_PATH

CHAPTERS = {
    1: {
        "title": "الفصل الأول: نداء الاستغاثة ومخاض الفكرة",
        "subtitle": "أزمة التعليقات المدرسية والمبادئ الهندسية الحاكمة الثلاثة",
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
        "subtitle": "سقف الـ 64 بايت، ابتكار البادات فائقة الكثافة، وترويض حد الـ 4096 حرفاً",
        "challenge": "سقف قيود واجهات تيليجرام الصارم: 64 بايت كحد أقصى لحمولة الأزرار، و 4096 حرفاً لنص الرسالة.",
        "dilemma": "كيف نمرر سياق المدرسة والصف والمادة والطالب والحالة FSM ضمن 64 بايت دون فقدان البيانات؟",
        "solution": "ابتكار خوارزمية البادات فائقة الكثافة بترميز مقتضب، وتقسيم النصوص والرسائل جراحياً بنظام الصفحات.",
        "outcome": "ضغط الحمولات بنسبة 85% من 120 بايت إلى 18 بايت، وتشغيل كافة مسارات البوت بسلاسة مطلقة!",
        "script": "كواليس الفصل الثالث: معركة القيود المستحيلة وكيف قهرناها. التحدي: سقف تيليجرام الصارم في أربعة وستين بايت للأزرار وأربعة آلاف وستة وتسعين حرفاً للرسائل. المعضلة: كيف نمرر سياق المدرسة والصف والمادة والطالب في أربعة وستين بايت فقط؟ الحل الهندسي: ابتكار خوارزمية البادات فائقة الكثافة وتقسيم الرسائل بنظام الصفحات. النتيجة: ضغط الحمولات بنسبة خمسة وثمانين بالمئة وتشغيل المنظومة بلا تعثر."
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

def render_arabic_text(draw, pos, text, font, fill, max_width=None, align='right'):
    """
    Renders Arabic text correctly reshaped and bi-directional with word wrapping.
    """
    if not text:
        return pos[1]
    
    words = text.split()
    lines = []
    curr = []
    
    for w in words:
        test_line = " ".join(curr + [w])
        # Reshape for measurement
        reshaped = arabic_reshaper.reshape(test_line)
        bidi_line = get_display(reshaped)
        bbox = draw.textbbox((0, 0), bidi_line, font=font)
        w_px = bbox[2] - bbox[0]
        if max_width and w_px > max_width and curr:
            lines.append(" ".join(curr))
            curr = [w]
        else:
            curr.append(w)
    if curr:
        lines.append(" ".join(curr))
        
    x, y = pos
    line_h = draw.textbbox((0, 0), "تجربة", font=font)[3] - draw.textbbox((0, 0), "تجربة", font=font)[1] + 8
    
    for line in lines:
        reshaped = arabic_reshaper.reshape(line)
        bidi_line = get_display(reshaped)
        bbox = draw.textbbox((0, 0), bidi_line, font=font)
        w_px = bbox[2] - bbox[0]
        if align == 'right':
            draw_x = x - w_px
        elif align == 'center':
            draw_x = x - w_px // 2
        else:
            draw_x = x
        draw.text((draw_x, y), bidi_line, font=font, fill=fill)
        y += line_h
        
    return y

def draw_card(draw, rect, title, text, icon_badge, border_color, bg_color, title_color, text_color):
    x0, y0, x1, y1 = rect
    draw.rounded_rectangle([x0, y0, x1, y1], radius=14, fill=bg_color, outline=border_color, width=2)
    
    # Title & Badge
    font_title = ImageFont.truetype(FONT_BOLD_PATH, 24)
    font_body = ImageFont.truetype(FONT_PATH, 20)
    
    full_title = f"{icon_badge}  {title}"
    render_arabic_text(draw, (x1 - 25, y0 + 16), full_title, font_title, title_color, max_width=x1 - x0 - 50, align='right')
    
    # Body text
    render_arabic_text(draw, (x1 - 25, y0 + 60), text, font_body, text_color, max_width=x1 - x0 - 50, align='right')

def create_video_slide(ch_num, duration_sec):
    data = CHAPTERS[ch_num]
    W, H = 1280, 720
    img = Image.new('RGB', (W, H), color=(11, 15, 25))
    draw = ImageDraw.Draw(img)
    
    # Background accents / soft borders
    draw.rectangle([0, 0, W, H], fill=(11, 15, 25))
    draw.rounded_rectangle([25, 25, W - 25, H - 25], radius=24, outline=(30, 41, 59), width=2)
    
    # Golden top banner / Header
    font_main_title = ImageFont.truetype(FONT_BOLD_PATH, 34)
    font_sub_title = ImageFont.truetype(FONT_PATH, 22)
    
    render_arabic_text(draw, (W // 2, 45), data['title'], font_main_title, (245, 158, 11), max_width=1100, align='center')
    render_arabic_text(draw, (W // 2, 95), data['subtitle'], font_sub_title, (148, 163, 184), max_width=1100, align='center')
    
    # Divider line
    draw.line([80, 140, W - 80, 140], fill=(212, 175, 55), width=2)
    
    # 4 Cards Layout: 2x2 Grid
    # Card 1: Challenge (Top-Right)
    # Card 2: Dilemma (Top-Left)
    # Card 3: Solution (Bottom-Right)
    # Card 4: Outcome (Bottom-Left)
    
    col_w = (W - 160 - 30) // 2
    row_h = 240
    
    r_x0 = W // 2 + 15
    r_x1 = r_x0 + col_w
    l_x0 = 80
    l_x1 = l_x0 + col_w
    
    top_y0 = 165
    top_y1 = top_y0 + row_h
    bot_y0 = top_y1 + 25
    bot_y1 = bot_y0 + row_h
    
    # Card 1: Challenge
    draw_card(
        draw, [r_x0, top_y0, r_x1, top_y1],
        title="التحدي والاحتياج الواقعي",
        text=data['challenge'],
        icon_badge="🎯",
        border_color=(30, 58, 138),
        bg_color=(15, 23, 42),
        title_color=(96, 165, 250),
        text_color=(226, 232, 240)
    )
    
    # Card 2: Dilemma
    draw_card(
        draw, [l_x0, top_y0, l_x1, top_y1],
        title="المعضلة التقنية الصادمة",
        text=data['dilemma'],
        icon_badge="⚠️",
        border_color=(127, 29, 29),
        bg_color=(28, 18, 24),
        title_color=(248, 113, 113),
        text_color=(226, 232, 240)
    )
    
    # Card 3: Solution
    draw_card(
        draw, [r_x0, bot_y0, r_x1, bot_y1],
        title="الحل الهندسي العبقري",
        text=data['solution'],
        icon_badge="💡",
        border_color=(161, 98, 7),
        bg_color=(26, 23, 18),
        title_color=(251, 191, 36),
        text_color=(226, 232, 240)
    )
    
    # Card 4: Outcome
    draw_card(
        draw, [l_x0, bot_y0, l_x1, bot_y1],
        title="النتيجة والأثر بالأرقام",
        text=data['outcome'],
        icon_badge="🏆",
        border_color=(6, 95, 70),
        bg_color=(12, 30, 24),
        title_color=(52, 211, 153),
        text_color=(226, 232, 240)
    )
    
    # Footer watermark
    font_foot = ImageFont.truetype(FONT_PATH, 16)
    render_arabic_text(draw, (W // 2, H - 35), "منظومة درب للتعليم الذكي — السيرة التقنية الكاملة", font_foot, (100, 116, 139), align='center')
    
    slide_path = f"tools/slide_ch{ch_num}.png"
    img.save(slide_path, "PNG")
    print(f"Generated slide image: {slide_path}")
    return slide_path

async def generate_narration(ch_num):
    text = CHAPTERS[ch_num]['script']
    out_voice = f"tools/voice_ch{ch_num}.mp3"
    import edge_tts
    communicate = edge_tts.Communicate(text, "ar-SA-HamedNeural", rate="+5%")
    await communicate.save(out_voice)
    print(f"Generated voice track: {out_voice}")
    return out_voice

def mix_chapter_video(ch_num):
    slide_png = create_video_slide(ch_num, 0)
    voice_mp3 = asyncio.run(generate_narration(ch_num))
    
    # Get duration
    cmd_dur = [FFMPEG, '-i', voice_mp3]
    p = subprocess.run(cmd_dur, capture_output=True, text=True)
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.\d+)', p.stderr)
    h, mn, s = map(float, m.groups())
    dur = h * 3600 + mn * 60 + s
    total_dur = dur + 1.2
    
    out_video = f"darb-books/videos/epic-v1/ch{ch_num}.mp4"
    os.makedirs(os.path.dirname(out_video), exist_ok=True)
    
    # FFmpeg mix: loop slide as video, mix voice + ambient bed as audio
    # -movflags +faststart for immediate web streaming
    filter_complex = (
        f"[1:a]volume=1.0[v];"
        f"[2:a]atrim=0:{total_dur},afade=t=in:ss=0:d=1.5,afade=t=out:st={max(0, total_dur - 1.5)}:d=1.5,volume=0.06[bgm];"
        f"[v][bgm]amix=inputs=2:duration=longest:dropout_transition=2[a]"
    )
    
    cmd = [
        FFMPEG, '-y',
        '-loop', '1', '-framerate', '24', '-t', str(total_dur), '-i', slide_png,
        '-i', voice_mp3,
        '-i', 'tools/ambient_bed.wav',
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
    
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"❌ Error rendering video {ch_num}: {res.stderr[:400]}")
        sys.exit(1)
    else:
        sz = os.path.getsize(out_video)
        print(f"✅ Successfully rendered ch{ch_num}.mp4 ({total_dur:.1f}s, {sz//1024} KB)")

if __name__ == '__main__':
    target_ch = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    print(f"Generating video for Chapter {target_ch}...")
    mix_chapter_video(target_ch)
