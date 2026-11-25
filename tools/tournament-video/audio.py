#!/usr/bin/env python3
"""Audio original del vídeo de torneo: música chiptune y efectos de golpe sintetizados aquí mismo con numpy.
Autoría: generado por código de este repositorio, sin muestras ni música de terceros, sin licencias externas.
Uso: python3 audio.py video.mp4.events.json out.wav [intro_seconds] [outro_seconds]"""
import json, sys, wave
import numpy as np
SR = 44100
ev = json.load(open(sys.argv[1]))
dur = ev['frames'] / ev['fps']
intro = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0
outro = float(sys.argv[4]) if len(sys.argv) > 4 else 5.0
N = int(dur * SR) + SR
rng = np.random.default_rng(7)
music = np.zeros(N); sfx = np.zeros(N)

def add(buf, t, x, g=1.0):
    i = int(t * SR); j = min(N, i + len(x))
    if i < N: buf[i:j] += x[:j - i] * g
def tt(d): return np.arange(int(d * SR)) / SR
def env(x, a=0.003, r=0.05):
    n = len(x); e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na); e[-nr:] = np.minimum(e[-nr:], np.linspace(1, 0, nr)); return x * e
def sq(f, d, duty=0.5): t = tt(d); return np.where((t * f) % 1 < duty, 1.0, -1.0)
def tri(f, d): t = tt(d); return 2 * np.abs(2 * ((t * f) % 1) - 1) - 1
def noise(d): return rng.uniform(-1, 1, int(d * SR))
def hz(n): return 440.0 * 2 ** ((n - 69) / 12)

# ---- música: La menor, 150 bpm, Am F C G ----
bpm = 150; beat = 60 / bpm; step = beat / 2
prog = [(57, [69, 72, 76]), (53, [65, 69, 72]), (48, [67, 72, 76]), (55, [67, 71, 74])]  # bajo, acorde
mel = [76, 79, 81, 79, 76, 74, 72, 74, 76, 81, 79, 76, 74, 72, 71, 72]
total_steps = int(dur / step) + 2
for s in range(total_steps):
    t = s * step
    bar = (s // 8) % 4; root, chord = prog[bar]
    full = t >= intro
    # arpegio (siempre, suave en la intro)
    n = chord[s % 3] + (12 if (s // 3) % 2 else 0)
    add(music, t, env(sq(hz(n), step * 0.9, 0.25), 0.002, 0.04), 0.10 if full else 0.07)
    if not full: continue
    add(music, t, env(tri(hz(root - 12 if s % 2 == 0 else root), step * 0.95), 0.003, 0.05), 0.40)
    if (s // 2) % 2 == 0 or s % 8 in (3, 7):
        m = mel[(s // 2) % len(mel)]
        add(music, t, env(sq(hz(m), step * 1.6, 0.5), 0.004, 0.08), 0.11)
    if s % 4 == 0:  # bombo
        d = 0.16; x = np.sin(2 * np.pi * (50 + 110 * np.exp(-tt(d) * 30)) * tt(d) * 1.0); add(music, t, env(x, 0.001, 0.05), 0.60)
    if s % 4 == 2:  # caja
        add(music, t, env(noise(0.12) * 0.7 + sq(190, 0.12) * 0.15, 0.001, 0.09), 0.30)
    add(music, t, env(noise(0.03), 0.0005, 0.02), 0.10 if s % 2 else 0.06)  # hi-hat
# cierre: acorde largo en la pantalla de campeón
ot = dur - outro
for k, n in enumerate([57, 64, 69, 72, 76] if outro >= 1 else []):
    add(music, ot + 0.1, env(sq(hz(n), outro - 0.2, 0.25), 0.02, 1.2), 0.07)
# volumen: entrada suave y salida larga
fade = np.ones(N); fi = int(0.6 * SR); fade[:fi] = np.linspace(0, 1, fi)
fo = int(1.6 * SR); end = int(dur * SR); fade[max(0, end - fo):end] = np.linspace(1, 0, min(fo, end)); fade[end:] = 0
music *= fade

# ---- efectos ----
def sweep(f0, f1, d, wave='sq'):
    t = tt(d); f = f0 + (f1 - f0) * (t / d); ph = np.cumsum(f) / SR
    return np.where(ph % 1 < 0.5, 1.0, -1.0) if wave == 'sq' else np.sin(2 * np.pi * ph)
def thump(d, f0, f1): t = tt(d); return np.sin(2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t * 25)) / SR)
def S(*xs):
    n = max(len(x) for x in xs); o = np.zeros(n)
    for x in xs: o[:len(x)] += x
    return o
FX = {
 'lightHit': lambda: env(S(noise(0.05) * 0.5, sweep(520, 240, 0.07) * 0.4), 0.001, 0.04),
 'heavyHit': lambda: env(S(thump(0.22, 190, 55) * 0.9, noise(0.12) * 0.5), 0.001, 0.12),
 'koImpact': lambda: env(S(thump(0.6, 150, 40), noise(0.4) * 0.6), 0.001, 0.35),
 'block': lambda: env(S(sweep(900, 700, 0.06) * 0.5, noise(0.04) * 0.3), 0.001, 0.04),
 'parry': lambda: np.concatenate([env(sq(1320, 0.05), 0.001, 0.03), env(sq(1980, 0.09), 0.001, 0.06)]) * 0.5,
 'superFlash': lambda: env(sweep(200, 1600, 0.45), 0.01, 0.15) * 0.5,
 'guardBreak': lambda: env(S(noise(0.3) * 0.8, sweep(400, 90, 0.2) * 0.4), 0.001, 0.2),
 'commandGrab': lambda: env(sweep(300, 120, 0.15) * 0.6, 0.002, 0.08),
 'projectile': lambda: env(noise(0.14) * 0.25 * np.linspace(0.2, 1, int(0.14 * SR)), 0.01, 0.08),
 'armorAbsorb': lambda: env(S(sq(660, 0.07, 0.25) * 0.5, sq(990, 0.07, 0.25) * 0.3), 0.001, 0.05),
 'victoryFanfare': lambda: np.concatenate([env(sq(hz(n), 0.14, 0.5), 0.003, 0.05) for n in (69, 72, 76, 81)] + [env(sq(hz(81), 0.6, 0.5), 0.003, 0.4)]) * 0.5,
}
GAIN = {'lightHit': 0.5, 'heavyHit': 0.8, 'koImpact': 1.0, 'block': 0.35, 'parry': 0.4, 'superFlash': 0.45, 'guardBreak': 0.6, 'commandGrab': 0.4, 'projectile': 0.25, 'armorAbsorb': 0.3, 'victoryFanfare': 0.7}
MINGAP = {'lightHit': 0.07, 'heavyHit': 0.09, 'projectile': 0.25, 'block': 0.1}
last = {}
cache = {k: f() for k, f in FX.items()}
for e in ev['events']:
    n = e['n']; t = e['t']
    if t - last.get(n, -9) < MINGAP.get(n, 0.12): continue
    last[n] = t
    add(sfx, t, cache[n], GAIN[n] * e.get('w', 1.0))
mix = music * 0.30 + sfx * 0.55
mix = np.tanh(mix * 1.3)
mix = mix[:int(dur * SR)]
mix = mix / max(1e-6, np.abs(mix).max()) * 0.9
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('audio', round(dur, 1), 's')
