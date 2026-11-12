"""Measures the shipped voice MP3s the way the 3D player trims them (lib/exercise3d/voice.ts).

  blender -b --factory-startup --python measure.py -- <list.json> <out.json>

list.json is a list of MP3 paths. For each file: length, the player's trim (first/last sample above
3% of the peak, channel 0), a stricter trim (0.5% of the peak) to catch soft word endings the player
would cut, speech loudness, and the longest pause inside the speech.
"""
import json
import math
import sys

import aud
import numpy as np

args = sys.argv[sys.argv.index("--") + 1 :]
files = json.load(open(args[0], encoding="utf-8"))
out = {}
for path in files:
    sound = aud.Sound(path)
    rate = int(sound.specs[0])
    data = sound.data()
    ch0 = data[:, 0] if data.ndim > 1 else data
    mag = np.abs(ch0)
    peak = float(mag.max()) if len(mag) else 0.0

    def span(frac):
        idx = np.nonzero(mag >= peak * frac)[0]
        return (int(idx[0]), int(idx[-1])) if len(idx) else (0, 0)

    a, b = span(0.03)
    sa, sb = span(0.005)
    # Speech loudness and the longest pause: 20 ms blocks above -40 dB relative to the peak
    blk = max(1, rate // 50)
    n = len(ch0) // blk
    blocks = ch0[: n * blk].reshape(n, blk)
    rms = np.sqrt(np.mean(blocks.astype(np.float64) ** 2, axis=1))
    loud = rms > peak * 0.01
    active = rms[loud]
    speech_db = 20 * math.log10(max(float(np.sqrt(np.mean(active**2))) if len(active) else 0.0, 1e-9))
    longest = run = 0
    first, last = (np.nonzero(loud)[0][[0, -1]] if loud.any() else (0, 0))
    for v in loud[first : last + 1]:
        run = 0 if v else run + 1
        longest = max(longest, run)
    out[path] = {
        "seconds": round(len(ch0) / rate, 3),
        "a": round(a / rate, 3),
        "b": round(b / rate, 3),
        "strictA": round(sa / rate, 3),
        "strictB": round(sb / rate, 3),
        "speechDb": round(speech_db, 1),
        "peakDb": round(20 * math.log10(max(peak, 1e-9)), 1),
        "longestPause": round(longest * blk / rate, 2),
    }
json.dump(out, open(args[1], "w", encoding="utf-8"), indent=1)
print("measured", len(out))
