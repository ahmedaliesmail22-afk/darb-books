# tools/generate_audio_assets.py
import math, wave, struct, random, os

SAMPLE_RATE = 44100

def write_wav(filename, samples):
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for s in samples:
            s_clamped = max(-1.0, min(1.0, s))
            frames.extend(struct.pack('<h', int(s_clamped * 32767)))
        wf.writeframes(frames)
    print(f"Generated {filename} ({len(samples)/SAMPLE_RATE:.2f}s)")

def make_ambient_bed(duration_sec=120):
    n_samples = int(SAMPLE_RATE * duration_sec)
    samples = []
    # Serene chord: D3 (146.83Hz), A3 (220.0Hz), F#3 (185.0Hz), E4 (329.63Hz)
    chords = [
        [146.83, 220.0, 185.0, 329.63], # Dmaj9
        [130.81, 196.0, 164.81, 261.63], # Cmaj7
        [110.0, 164.81, 220.0, 277.18],  # Amaj
        [146.83, 220.0, 185.0, 329.63], # Dmaj9
    ]
    chord_len = duration_sec / len(chords)
    
    for i in range(n_samples):
        t = i / SAMPLE_RATE
        chord_idx = int(t / chord_len) % len(chords)
        next_chord_idx = (chord_idx + 1) % len(chords)
        chord_t = (t % chord_len) / chord_len
        # Crossfade between chords
        w_next = math.sin(chord_t * math.pi / 2) ** 2
        w_curr = 1.0 - w_next
        
        val = 0.0
        # Current chord
        for freq in chords[chord_idx]:
            lfo = 1.0 + 0.15 * math.sin(2 * math.pi * 0.15 * t + freq * 0.01)
            val += w_curr * math.sin(2 * math.pi * freq * t) * 0.22 * lfo
            # soft second harmonic
            val += w_curr * math.sin(2 * math.pi * freq * 2 * t) * 0.06 * lfo
            
        # Next chord
        for freq in chords[next_chord_idx]:
            lfo = 1.0 + 0.15 * math.sin(2 * math.pi * 0.15 * t + freq * 0.01)
            val += w_next * math.sin(2 * math.pi * freq * t) * 0.22 * lfo
            val += w_next * math.sin(2 * math.pi * freq * 2 * t) * 0.06 * lfo
            
        # Air breath
        val += (random.random() * 2 - 1) * 0.012
        samples.append(val)
    return samples

def make_paper_turn(duration_sec=0.85):
    n_samples = int(SAMPLE_RATE * duration_sec)
    samples = []
    random.seed(101)
    
    for i in range(n_samples):
        t = i / SAMPLE_RATE
        # Envelope: quick rise, rustle sustain, smooth decay
        if t < 0.12:
            env = (t / 0.12) ** 2
        else:
            env = max(0.0, (1.0 - (t - 0.12) / (duration_sec - 0.12)) ** 1.6)
            
        # Realistic paper friction: pink/white noise filtered with frequency sweep
        sweep_freq = 1400 - 600 * (t / duration_sec)
        friction = math.sin(2 * math.pi * sweep_freq * t) * 0.25
        flutter = math.sin(2 * math.pi * 18 * t) * 0.3 + 0.7
        noise = (random.random() * 2 - 1) * 0.65
        
        sample = (noise + friction) * env * flutter * 0.7
        samples.append(sample)
    return samples

def make_chime(duration_sec=3.0):
    n_samples = int(SAMPLE_RATE * duration_sec)
    samples = []
    # Pentatonic bell harmonics: C5, E5, G5, B5, D6
    bell_freqs = [523.25, 659.25, 783.99, 987.77, 1174.66]
    delays = [0.0, 0.12, 0.25, 0.38, 0.52]
    
    for i in range(n_samples):
        t = i / SAMPLE_RATE
        val = 0.0
        for freq, delay in zip(bell_freqs, delays):
            if t >= delay:
                dt = t - delay
                decay = math.exp(-2.2 * dt)
                # Strike bell tone + shimmer
                tone = math.sin(2 * math.pi * freq * dt) + 0.35 * math.sin(2 * math.pi * freq * 2.76 * dt)
                val += tone * decay * 0.18
        samples.append(val)
    return samples

if __name__ == '__main__':
    os.makedirs('tools', exist_ok=True)
    write_wav('tools/ambient_bed.wav', make_ambient_bed(120))
    write_wav('tools/paper_turn.wav', make_paper_turn(0.85))
    write_wav('tools/chime.wav', make_chime(3.0))
