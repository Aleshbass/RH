"""Masters voice MP3s in place, so every line sounds alike on a phone speaker.

  blender -b --factory-startup --python master.py -- <list.json>

For each file: keeps 60 ms before the first and 120 ms after the last audible sample (0.5% of the
peak, so soft word endings stay) with short fades, brings the speech to TARGET_DB, rounds off the
rare peak above the knee, and writes a 24 kHz mono 48 kbps MP3 (what the player expects).
"""
import json
import math
import sys

import aud
import numpy as np

TARGET_DB = -19.0  # speech loudness (the Google voice before was -19) (RMS of the 20 ms blocks with speech)
KNEE = 0.6
CEILING = 10 ** (-1 / 20)
RATE = 24000

files = json.load(open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8"))
for path in files:
    sound = aud.Sound(path)
    rate = int(sound.specs[0])
    data = sound.data()
    x = (data[:, 0] if data.ndim > 1 else data).astype(np.float64)
    peak = float(np.abs(x).max())
    if peak <= 0:
        print("silent", path)
        continue
    loud = np.nonzero(np.abs(x) >= peak * 0.005)[0]
    start = max(0, int(loud[0] - 0.06 * rate))
    end = min(len(x), int(loud[-1] + 0.12 * rate))
    x = x[start:end].copy()
    fade_in = int(0.01 * rate)
    fade_out = int(0.04 * rate)
    x[:fade_in] *= np.linspace(0, 1, fade_in)
    x[-fade_out:] *= np.linspace(1, 0, fade_out)

    blk = rate // 50
    n = len(x) // blk
    rms = np.sqrt(np.mean(x[: n * blk].reshape(n, blk) ** 2, axis=1))
    speech = rms[rms > peak * 0.01]
    level = float(np.sqrt(np.mean(speech**2))) if len(speech) else peak
    x *= 10 ** (TARGET_DB / 20) / level

    # Soft limiter: above the knee, ease into the ceiling instead of clipping
    over = np.abs(x) > KNEE
    if over.any():
        room = CEILING - KNEE
        x[over] = np.sign(x[over]) * (KNEE + room * np.tanh((np.abs(x[over]) - KNEE) / room))

    out = aud.Sound.buffer(np.ascontiguousarray(x.astype(np.float32).reshape(-1, 1)), float(rate))
    if rate != RATE:
        out = out.resample(RATE, aud.RESAMPLE_QUALITY_HIGH if hasattr(aud, "RESAMPLE_QUALITY_HIGH") else True)
    out.write(path, RATE, aud.CHANNELS_MONO, aud.FORMAT_S16, aud.CONTAINER_MP3, aud.CODEC_MP3, 48000, 0)
print("mastered", len(files))
