# tools/mix_all_audio.py
import subprocess, os, re, sys

FFMPEG = r'C:\Program Files (x86)\FormatFactory\ffmpeg.exe'
SRC_DIR = 'dist/audio'
OUT_DIR = 'darb-books/audio/epic-v1'
os.makedirs(OUT_DIR, exist_ok=True)

def get_duration(file_path):
    cmd = [FFMPEG, '-i', file_path]
    p = subprocess.run(cmd, capture_output=True, text=True)
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.\d+)', p.stderr)
    if not m:
        raise ValueError(f"Cannot get duration for {file_path}")
    h, mn, s = map(float, m.groups())
    return h * 3600 + mn * 60 + s

def mix_spread(idx):
    src_file = os.path.join(SRC_DIR, f'spread_{idx}.mp3')
    out_file = os.path.join(OUT_DIR, f'spread_{idx}.mp3')
    if not os.path.exists(src_file):
        print(f"Skipping {src_file} (does not exist)")
        return
        
    dur = get_duration(src_file)
    is_last = (idx == 26)
    fx_file = 'tools/chime.wav' if is_last else 'tools/paper_turn.wav'
    fx_vol = 0.55 if is_last else 0.65
    delay_ms = int(max(0, dur - 0.25) * 1000)
    extra_tail = 2.5 if is_last else 0.8
    total_dur = dur + extra_tail

    # Filter complex
    filter_str = (
        f'[0:a]volume=1.0[v];'
        f'[1:a]atrim=0:{total_dur},afade=t=in:ss=0:d=1.2,afade=t=out:st={max(0, total_dur - 1.2)}:d=1.2,volume=0.08[bgm];'
        f'[2:a]adelay={delay_ms}|{delay_ms},volume={fx_vol}[fx];'
        f'[v][bgm][fx]amix=inputs=3:duration=longest:dropout_transition=2[out]'
    )
    
    cmd = [
        FFMPEG, '-y',
        '-i', src_file,
        '-i', 'tools/ambient_bed.wav',
        '-i', fx_file,
        '-filter_complex', filter_str,
        '-map', '[out]',
        '-b:a', '48k',
        '-ac', '1',
        out_file
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"❌ Error mixing spread {idx}: {res.stderr[:300]}")
    else:
        sz = os.path.getsize(out_file)
        print(f"✅ spread_{idx}.mp3 mixed ({dur:.1f}s, {sz//1024} KB)")

if __name__ == '__main__':
    print("Starting audio mixing for all 27 spreads...")
    for i in range(27):
        mix_spread(i)
    print("Audio mixing complete!")
