"""Texture edits for the Rehabify character: scrub colours and skin tone.

Works on the 2048 body atlas (RH_Body_Diffuse) and the 1024 gear atlas (RH_Gear_Diffuse).
Regions are found by rasterising each mesh's UV triangles, so an edit never leaks from
one part of the character into another.
"""

import bpy
import numpy as np

LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)

BRAND = {
    "teal": "#005b57",       # scrub top and cap
    "teal_deep": "#00443e",  # scrub trousers
}
SKIN = "#5f3a22"             # clean brown African skin tone (median of the skin texels)


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def hex_lin(h):
    h = h.lstrip("#")
    return srgb_to_lin(np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32))


def uv_mask(obj, w, h):
    """Boolean (h, w) mask of the texels covered by obj's UV triangles."""
    me = obj.data
    me.calc_loop_triangles()
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    tri = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("loops", tri)
    pts = uv[tri.reshape(-1, 3)].astype(np.float64)
    pts -= np.floor(pts.min(axis=1, keepdims=True))   # UDIM tiles back to 0..1
    pts *= [w, h]
    mask = np.zeros((h, w), bool)
    for a, b, c in pts:
        x0 = max(int(np.floor(min(a[0], b[0], c[0]))), 0)
        x1 = min(int(np.ceil(max(a[0], b[0], c[0]))), w - 1)
        y0 = max(int(np.floor(min(a[1], b[1], c[1]))), 0)
        y1 = min(int(np.ceil(max(a[1], b[1], c[1]))), h - 1)
        if x1 < x0 or y1 < y0:
            continue
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
        w2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        e = -0.02
        mask[y0:y1 + 1, x0:x1 + 1] |= (w1 >= e) & (w2 >= e) & (1 - w1 - w2 >= e)
    return mask


def dilate(m, n):
    out = m.copy()
    for _ in range(n):
        d = out.copy()
        d[1:, :] |= out[:-1, :]
        d[:-1, :] |= out[1:, :]
        d[:, 1:] |= out[:, :-1]
        d[:, :-1] |= out[:, 1:]
        out = d
    return out


def read(img):
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def write(img, px):
    img.pixels.foreach_set(px.ravel())
    img.update()
    img.pack()


def recolor_fabric(img, regions, others):
    """Recolour fabric to brand colours, keeping its folds (luminance ratio to the median)."""
    px = read(img)
    covered = np.zeros(px.shape[:2], bool)
    for m in others:
        covered |= m
    for m, _ in regions:
        covered |= m
    for m, hexcol in regions:
        rgb = px[..., :3]
        bluish = rgb[..., 2] > rgb[..., 0] + 0.02
        sel = m | (dilate(m, 6) & ~covered & bluish)
        lin = srgb_to_lin(rgb[sel])
        lum = lin @ LUMA
        ref = np.median(lum[m[sel]]) if m[sel].any() else np.median(lum)
        ratio = np.clip(lum / max(ref, 1e-4), 0.25, 1.9) ** 0.9
        px[..., :3][sel] = lin_to_srgb(hex_lin(hexcol)[None, :] * ratio[:, None])
    write(img, px)


def skin_mask(px, body):
    """Skin texels inside the body's UV islands: warm, moderately saturated, not eye whites."""
    rgb = px[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    warm = (rgb[..., 0] >= rgb[..., 1] - 0.02) & (rgb[..., 1] >= rgb[..., 2] - 0.04)
    skin = warm & (sat > 0.10) & (sat < 0.85) & (mx > 0.10)
    grown = dilate(body, 4)   # include the gutter around islands so seams don't show
    return skin & grown


def set_skin_tone(img, body, hexcol=SKIN, strength=1.0):
    """Shift skin to a target tone with a per-channel gain, keeping pores, shading and lips."""
    px = read(img)
    m = skin_mask(px, body)
    lin = srgb_to_lin(px[..., :3][m])
    ref = np.median(lin, axis=0)
    gain = hex_lin(hexcol) / np.maximum(ref, 1e-4)
    out = lin * (1 - strength + strength * gain[None, :])
    px[..., :3][m] = lin_to_srgb(out)
    write(img, px)
    return {"texels": int(m.sum()), "from": [round(float(v), 3) for v in lin_to_srgb(ref)], "to": hexcol}
