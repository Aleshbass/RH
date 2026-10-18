"""Authoring checks in a live Blender session: show a clip in the viewport and render contact sheets.

    import rh_preview as V
    V.show("EX_calf_stretch_L", view=(1.0, -0.4, 0.2))
    V.sheet(r"C:/tmp/calf.png", [0.0, 0.3, 0.6], [(1.0, -0.4, 0.2), (0.2, -1.0, 0.25)])
"""

import os

import bpy
import numpy as np
from mathutils import Vector

import build_all as B
import rh_pose as R


def _view3d():
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                return window, area
    return None, None


def look(view=(1.0, -0.7, 0.25), distance=None):
    """Point the user's 3D viewport at the character from direction `view`, with material shading."""
    window, area = _view3d()
    if area is None:
        return
    space = area.spaces.active
    space.shading.type = "MATERIAL"
    r3d = space.region_3d
    hips = R.world_point("Hips")
    target = Vector((hips.x, hips.y, max(0.55, hips.z * 0.85)))
    d = Vector(view).normalized()
    r3d.view_perspective = "PERSP"
    r3d.view_location = target
    r3d.view_rotation = d.to_track_quat("Z", "Y")
    r3d.view_distance = distance or 3.4
    area.tag_redraw()


def show(action_name, view=None):
    """Put an action on the rig, set the frame range to it and go to its first frame."""
    rig = R.rig()
    act = bpy.data.actions[action_name]
    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = act
    scene = bpy.context.scene
    start, end = (int(round(v)) for v in act.frame_range)
    scene.frame_start, scene.frame_end = start, end
    scene.frame_set(start)
    if view:
        look(view)
    return start, end


def sheet(path, fractions, views, size=320):
    """Render the current action at clip fractions (columns) from view directions (rows) into one PNG."""
    scene = bpy.context.scene
    r = scene.render
    saved = (r.resolution_x, r.resolution_y, r.film_transparent, r.image_settings.file_format, r.filepath, scene.frame_current)
    tmp = os.path.join(os.path.dirname(path), "_tile.png")
    start, end = scene.frame_start, scene.frame_end
    rows = []
    try:
        for view in views:
            row = []
            for t in fractions:
                B.frame_camera(int(round(start + t * (end - start))), view)
                r.resolution_x = r.resolution_y = size
                r.film_transparent = False
                r.image_settings.file_format = "PNG"
                r.filepath = tmp
                bpy.ops.render.render(write_still=True)
                img = bpy.data.images.load(tmp, check_existing=False)
                px = np.empty(size * size * 4, dtype=np.float32)
                img.pixels.foreach_get(px)
                bpy.data.images.remove(img)
                row.append(px.reshape(size, size, 4))
            rows.append(np.concatenate(row, axis=1))
        grid = np.concatenate(rows[::-1], axis=0)   # Blender images are stored bottom row first
        h, w = grid.shape[:2]
        out = bpy.data.images.new("_rh_sheet", w, h, alpha=False)
        out.pixels.foreach_set(grid.ravel())
        out.filepath_raw = path
        out.file_format = "PNG"
        out.save()
        bpy.data.images.remove(out)
    finally:
        r.resolution_x, r.resolution_y, r.film_transparent, r.image_settings.file_format, r.filepath = saved[:5]
        scene.frame_set(saved[5])
        if os.path.exists(tmp):
            os.remove(tmp)
    return path
