#!/usr/bin/env python3
"""Synthesise Mimi's voice into src/assets/*.wav

A meow is a vowel glide: the mouth opens from a nasal /m/ into an open /ee-ah/
and closes again through /ow/, while the pitch rises and falls. So: a buzzy
harmonic source, four moving formant resonators, a mouth-opening filter, and an
envelope. Run with:  python3 tools/make-sounds.py   (needs numpy)

Want a real cat instead? Drop your own mono 44.1k WAVs in src/assets/ using the
same file names and Mimi will play those instead. Nothing else to change.
"""
import numpy as np, wave, os, sys

FS = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets')


def glide(t, points):
    return np.interp(t, [p[0] for p in points], [p[1] for p in points])


def resonator(x, F, BW, fs=FS):
    """Second-order resonator whose centre frequency moves over time."""
    n = len(x)
    y = np.zeros(n)
    r = np.exp(-np.pi * BW / fs)
    th = 2 * np.pi * F / fs
    a1 = 2 * r * np.cos(th)
    a2 = -(r ** 2)
    g = (1 - r) * np.sqrt(1 - 2 * r * np.cos(2 * th) + r ** 2)
    y1 = y2 = 0.0
    for i in range(n):
        v = g[i] * x[i] + a1[i] * y1 + a2 * y2
        y2, y1 = y1, v
        y[i] = v
    return y


def onepole_lp(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / FS)
    y = 0.0
    out = np.empty_like(x)
    for i in range(len(x)):
        y = (1 - a[i]) * x[i] + a[i] * y
        out[i] = y
    return out


def source(f0, dur, vib_hz=6.0, vib_depth=0.025):
    n = int(dur * FS)
    t = np.linspace(0, 1, n, endpoint=False)
    f = f0 * (1 + vib_depth * np.sin(2 * np.pi * vib_hz * t * dur))
    f *= 1 + 0.004 * np.random.randn(n).cumsum() / max(1, np.sqrt(n))
    phase = 2 * np.pi * np.cumsum(f) / FS
    x = np.zeros(n)
    for k in range(1, 61):
        fk = f * k
        if np.min(fk) > 8000:
            break
        x += (1.0 / k ** 1.55) * np.sin(phase * k) * (fk < 9000)
    return x / (np.max(np.abs(x)) + 1e-9)


DEFAULT_FORMANTS = {
    'F1': [(0, 300), (0.18, 800), (0.55, 560), (1.0, 340)],
    'F2': [(0, 1100), (0.18, 1650), (0.55, 1050), (1.0, 820)],
    'F3': [(0, 2400), (0.5, 2700), (1.0, 2500)],
    'F4': [(0, 3400), (1.0, 3300)],
}
AMPS = {'F1': 1.0, 'F2': 0.5, 'F3': 0.18, 'F4': 0.08}
BWS = {'F1': 90, 'F2': 130, 'F3': 190, 'F4': 260}


def meow(dur=0.55, f0_lo=300, f0_hi=520, formants=None, trill=0.0, breath=0.02, seed=0):
    np.random.seed(seed)
    n = int(dur * FS)
    t = np.linspace(0, 1, n, endpoint=False)
    f0 = glide(t, [(0, f0_lo * 0.95), (0.12, f0_hi), (0.45, f0_hi * 0.92), (1.0, f0_lo * 0.8)])
    src = source(f0, dur) + breath * np.random.randn(n)

    out = np.zeros(n)
    for name, pts in (formants or DEFAULT_FORMANTS).items():
        out += AMPS[name] * resonator(src, glide(t, pts), BWS[name])

    # a closing mouth is quieter and duller
    out = onepole_lp(out, glide(t, [(0, 1200), (0.22, 3800), (0.6, 3200), (1.0, 1000)]))
    out *= glide(t, [(0, 0.35), (0.2, 1.0), (0.62, 0.9), (1.0, 0.25)])
    out *= glide(t, [(0, 0.0), (0.04, 1.0), (0.6, 0.95), (1.0, 0.0)])

    if trill:
        out *= 1 - trill * (t < 0.25) * (0.5 + 0.5 * np.sin(2 * np.pi * 28 * t * dur))
    return finish(out, 0.92)


def chirp(dur=0.3, seed=3):
    np.random.seed(seed)
    n = int(dur * FS)
    t = np.linspace(0, 1, n, endpoint=False)
    f0 = glide(t, [(0, 480), (0.5, 760), (1.0, 700)])
    src = source(f0, dur, vib_hz=30, vib_depth=0.06)
    out = resonator(src, glide(t, [(0, 700), (1, 900)]), 110)
    out += 0.5 * resonator(src, glide(t, [(0, 1800), (1, 2100)]), 160)
    out *= glide(t, [(0, 0), (0.05, 1), (0.7, 0.9), (1.0, 0)])
    out *= 1 - 0.35 * (0.5 + 0.5 * np.sin(2 * np.pi * 34 * t * dur))
    return finish(out, 0.85)


def purr(dur=1.2, seed=5):
    np.random.seed(seed)
    n = int(dur * FS)
    t = np.linspace(0, 1, n, endpoint=False)
    pulses = np.zeros(n)
    period = int(FS / 26.0)
    for start in range(0, n, period):
        L = min(period, n - start)
        pulses[start:start + L] += np.exp(-np.linspace(0, 9, L)) * np.random.randn(L)
    out = resonator(pulses, np.full(n, 150.0), 70) + 0.6 * resonator(pulses, np.full(n, 320.0), 140)
    out += 0.25 * np.sin(2 * np.pi * 55 * t * dur)
    out *= glide(t, [(0, 0), (0.08, 1), (0.85, 1), (1, 0)])
    return finish(out, 0.6)


def finish(out, peak):
    out /= np.max(np.abs(out)) + 1e-9
    fade = int(0.006 * FS)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out * peak


def save(name, sig):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    pcm = (np.clip(sig, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(FS)
        w.writeframes(pcm.tobytes())
    print('  %-12s %.2fs  %dKB' % (name, len(sig) / FS, os.path.getsize(path) // 1024))


if __name__ == '__main__':
    print('synthesising Mimi…')
    save('meow-1.wav', meow(0.55, 300, 520, seed=1))
    save('meow-2.wav', meow(0.62, 330, 610, seed=2, formants={
        'F1': [(0, 320), (0.2, 880), (0.6, 600), (1.0, 360)],
        'F2': [(0, 1150), (0.2, 1750), (0.6, 1100), (1.0, 850)],
        'F3': [(0, 2500), (0.5, 2800), (1.0, 2550)],
        'F4': [(0, 3500), (1.0, 3350)]}))
    save('meow-3.wav', meow(0.34, 380, 700, seed=4, breath=0.03))
    save('meow-4.wav', meow(0.80, 280, 480, seed=6, trill=0.5))
    save('chirp.wav', chirp())
    save('purr.wav', purr())
    print('done →', os.path.normpath(OUT))
