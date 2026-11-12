"""What a patient hears: the intro, then the cues on the demonstration's loop, as the player plays them.

  blender -b --factory-startup --python preview.py -- <jobs.json> <out dir>

jobs.json: [{"name", "intro", "cues": [{"at", "file"}], "loop", "loops"}] with MP3 paths. Follows
lib/exercise3d/voice.ts: each clip trimmed to its audible part (+100 ms), no cue during the intro,
and a new cue stops one still playing (so a cut-off would be heard here too). A soft click marks
each loop start, so the timing can be judged by ear.
"""
import json
import os
import sys

import aud
import numpy as np

RATE = 24000
args = sys.argv[sys.argv.index("--") + 1 :]
jobs = json.load(open(args[0], encoding="utf-8"))
out_dir = args[1]
os.makedirs(out_dir, exist_ok=True)
cache = {}


def trimmed(path):
    if path not in cache:
        x = aud.Sound(path).resample(RATE, True).data()[:, 0].astype(np.float32)
        peak = np.abs(x).max()
        loud = np.nonzero(np.abs(x) >= peak * 0.03)[0]
        a, b = loud[0], loud[-1]
        start = max(0, a - int(0.02 * RATE))
        cache[path] = x[start : min(len(x), start + (b - a) + int(0.1 * RATE))]
    return cache[path]


for job in jobs:
    loop = job["loop"]
    intro = trimmed(job["intro"])
    t0 = 0.3
    intro_end = t0 + len(intro) / RATE
    events = [(t0, intro)]
    first_loop = int(intro_end // loop)
    for k in range(first_loop, first_loop + job.get("loops", 3) + 1):
        for cue in job["cues"]:
            at = k * loop + cue["at"]
            if at >= intro_end:
                events.append((at, trimmed(cue["file"])))
    events.sort(key=lambda e: e[0])
    end = events[-1][0] + len(events[-1][1]) / RATE + 0.5
    mix = np.zeros(int(end * RATE) + 1, dtype=np.float32)
    for i, (at, clip) in enumerate(events):
        s = int(at * RATE)
        stop = int(events[i + 1][0] * RATE) if i + 1 < len(events) else s + len(clip)
        part = clip[: max(0, min(len(clip), stop - s))]  # the next cue stops this one
        mix[s : s + len(part)] += part
    # Loop markers: a quiet 1 kHz tick at each loop start after the intro
    tick = (0.06 * np.sin(2 * np.pi * 1000 * np.arange(int(0.015 * RATE)) / RATE)).astype(np.float32)
    k = first_loop
    while k * loop < end:
        s = int(k * loop * RATE)
        if k * loop >= intro_end - 0.01 and s + len(tick) < len(mix):
            mix[s : s + len(tick)] += tick
        k += 1
    buf = aud.Sound.buffer(np.ascontiguousarray(mix.reshape(-1, 1)), float(RATE))
    path = os.path.join(out_dir, job["name"] + ".mp3")
    buf.write(path, RATE, aud.CHANNELS_MONO, aud.FORMAT_S16, aud.CONTAINER_MP3, aud.CODEC_MP3, 64000, 0)
    print("preview", job["name"], round(end, 1), "s")
