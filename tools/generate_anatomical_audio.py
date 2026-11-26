# tools/generate_anatomical_audio.py
# توليد المقاطع الصوتية المدمجة الكاملة لكتاب درب التشريحي (27 تراكاً صوتياً)
import asyncio
import json
import os
import re
import subprocess
import edge_tts

BASE_DIR = r"D:\darb-books"
FFMPEG = r"C:\Program Files (x86)\FormatFactory\ffmpeg.exe"
JSON_PATH = os.path.join(BASE_DIR, "engine", "editions", "anatomical-v1.json")
OUT_DIR = os.path.join(BASE_DIR, "audio", "anatomical-v1")
TOOLS_DIR = os.path.join(BASE_DIR, "tools")
TEMP_DIR = os.path.join(TOOLS_DIR, "temp_tts")

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

def clean_html_text(html_str):
    if not html_str:
        return ""
    # استخراج النصوص من عناصر السرد والافتتاحيات
    # إزالة وسوم HTML
    text = re.sub(r'<svg.*?</svg>', '', html_str, flags=re.DOTALL)
    text = re.sub(r'<style.*?</style>', '', text, flags=re.DOTALL)
    # استبدال فواصل الأسطر
    text = re.sub(r'<br\s*/?>', ' ', text)
    text = re.sub(r'</p>', ' .\n', text)
    text = re.sub(r'</div>', ' .\n', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    # تنظيف المسافات والرموز الزائدة
    text = re.sub(r'[\r\n\t]+', ' ', text)
    text = re.sub(r'\s{2,}', ' ', text).strip()
    return text

def extract_text_for_spread(idx, spread):
    if spread.get("isFrontCover"):
        return (
            "كتاب درب التشريحي لـ 78 ملفاً برمجياً و52 نقطة نهاية سحابية. "
            "التشريح المعماري للشيفرة المصدرية سطراً بسطر. "
            "منشورات الفريق الهندسي المؤسس لمنظومة درب التعليمية الذكية. "
            "الإصدار السحابي التوثيقي المعياري، ريفيجن 31."
        )

    if spread.get("isBackCover"):
        return (
            "منظومة درب التعليمية الذكية. "
            "المرجع الهندسي والتشريحي المتكامل للحل السحابي الأول على تيليجرام. "
            "توثيق معماري دقيق لـ 78 ملفاً باللغة العربية الفصحى، "
            "حماية حتمية بدون كلمات مرور عبر توقيع إينيت داتا، "
            "دفتر أستاذ محاسبي للنقاط، ونزالات تفاعلية، "
            "مع اجتياز 83 فحصاً واختباراً برمجياً بنسبة نجاح 100%. "
            "جميع الحقوق محفوظة، ريفيجن 31."
        )

    parts = []

    # معالجة الصفحة اليمنى
    right = spread.get("right")
    if right and not right.get("isBlank"):
        header = right.get("header", "")
        title = right.get("title", "")
        if header and "فَاصِل" not in header and "خَلْفِيَّة" not in header:
            parts.append(header)
        if title:
            parts.append(title)
        html_txt = clean_html_text(right.get("html", ""))
        if html_txt:
            parts.append(html_txt)

    # معالجة الصفحة اليسرى
    left = spread.get("left")
    if left and not left.get("isBlank"):
        header = left.get("header", "")
        title = left.get("title", "")
        if header and "فَاصِل" not in header and "خَلْفِيَّة" not in header:
            parts.append(header)
        if title:
            parts.append(title)
        html_txt = clean_html_text(left.get("html", ""))
        if html_txt:
            parts.append(html_txt)

    combined = " . ".join([p for p in parts if p.strip()])
    # استبعاد الرموز المضللة للنطق
    combined = re.sub(r'[❖✓•➔✨🏛️📊🎖️⚔️📈🔒🧪📚⚡💡]+', ' ', combined)
    combined = re.sub(r'\s{2,}', ' ', combined).strip()
    return combined

def get_audio_duration(file_path):
    cmd = [FFMPEG, '-i', file_path]
    p = subprocess.run(cmd, capture_output=True, text=True)
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.\d+)', p.stderr)
    if not m:
        raise ValueError(f"Cannot get duration for {file_path}")
    h, mn, s = map(float, m.groups())
    return h * 3600 + mn * 60 + s

def mix_track(voice_path, out_path, is_last=False):
    dur = get_audio_duration(voice_path)
    ambient_file = os.path.join(TOOLS_DIR, "ambient_bed.wav")
    fx_file = os.path.join(TOOLS_DIR, "chime.wav" if is_last else "paper_turn.wav")
    fx_vol = 0.55 if is_last else 0.65
    delay_ms = int(max(0, dur - 0.25) * 1000)
    extra_tail = 2.5 if is_last else 0.8
    total_dur = dur + extra_tail

    filter_str = (
        f'[0:a]volume=1.0[v];'
        f'[1:a]atrim=0:{total_dur},afade=t=in:ss=0:d=1.0,afade=t=out:st={max(0, total_dur - 1.2)}:d=1.2,volume=0.08[bgm];'
        f'[2:a]adelay={delay_ms}|{delay_ms},volume={fx_vol}[fx];'
        f'[v][bgm][fx]amix=inputs=3:duration=longest:dropout_transition=2[out]'
    )

    cmd = [
        FFMPEG, '-y',
        '-i', voice_path,
        '-i', ambient_file,
        '-i', fx_file,
        '-filter_complex', filter_str,
        '-map', '[out]',
        '-b:a', '48k',
        '-ac', '1',
        out_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {res.stderr[:300]}")

async def process_all():
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    spreads = data["spreads"]
    total = len(spreads)
    print(f"📖 Loaded {total} spreads from anatomical-v1.json. Starting audio generation...")

    voice_name = "ar-SA-HamedNeural"

    for idx, sp in enumerate(spreads):
        out_file = os.path.join(OUT_DIR, f"spread_{idx}.mp3")
        temp_voice = os.path.join(TEMP_DIR, f"voice_{idx}.mp3")
        is_last = (idx == total - 1)

        text = extract_text_for_spread(idx, sp)
        if not text:
            text = f"نشرة رقم {idx} من كتاب درب التشريحي."

        # 1. توليد الصوت الخام بواسطة edge-tts
        comm = edge_tts.Communicate(text, voice_name, rate="+4%")
        await comm.save(temp_voice)

        # 2. الدمج مع الموسيقى الهادئة ومؤثر تقليب الورق
        mix_track(temp_voice, out_file, is_last=is_last)

        sz = os.path.getsize(out_file) // 1024
        dur = get_audio_duration(out_file)
        print(f"[{idx+1}/{total}] ✅ spread_{idx}.mp3 generated ({dur:.1f}s, {sz} KB)")

        # تنظيف الصوت الخام
        if os.path.exists(temp_voice):
            try: os.remove(temp_voice)
            except: pass

    # تنظيف المجلد المؤقت
    try: os.rmdir(TEMP_DIR)
    except: pass

    print(f"\n🎉 Successfully generated all {total} audio tracks in {OUT_DIR}!")

if __name__ == '__main__':
    asyncio.run(process_all())
