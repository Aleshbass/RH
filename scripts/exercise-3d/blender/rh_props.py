"""Simple props for the exercise scenes: chair, mat, step, wall, decline board, towel.

They exist in Blender only to check contact and framing. The web viewer draws the same
props from the dimensions each builder reports, so they add nothing to the download.
A towel strap follows the hands and foot, so Blender updates it on every frame change and
the web viewer rebuilds it from the same bones.
"""

import json
import math

import bpy
from mathutils import Matrix, Vector

COLLECTION = "RH_Props"
COLORS = {
    "wood": (0.85, 0.71, 0.56),
    "mat": (0.83, 0.98, 0.91),      # Rehabify mint #d4fae8
    "step": (0.94, 0.92, 0.89),     # Rehabify sand #efeae2
    "wall": (0.97, 0.96, 0.94),     # Rehabify canvas #f7f5ef
    "pillow": (0.90, 0.94, 0.94),   # Rehabify mist #e6f0ef
    "towel": (0.72, 0.86, 0.85),    # soft teal #b8dbd8
    "line": (0.0, 0.36, 0.34),      # Rehabify teal #005b57
}


def _collection():
    col = bpy.data.collections.get(COLLECTION)
    if col is None:
        col = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(col)
    return col


def _material(name):
    mat = bpy.data.materials.get(f"RH_Prop_{name}")
    if mat is None:
        mat = bpy.data.materials.new(f"RH_Prop_{name}")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        srgb = COLORS[name]
        lin = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)
        bsdf.inputs["Base Color"].default_value = (*lin, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.8
    return mat


def _box(name, size, center, material):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    for c in list(o.users_collection):
        c.objects.unlink(o)
    _collection().objects.link(o)
    o.data.materials.append(_material(material))
    return o


def clear():
    col = bpy.data.collections.get(COLLECTION)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)


def chair(seat_top, front_y, x=0.0, width=0.46, depth=0.42):
    """Chair facing -Y whose seat front edge is at front_y and seat top at seat_top (metres)."""
    t = 0.04
    back_y = front_y + depth
    _box("Prop_Chair_Seat", (width, depth, t), (x, front_y + depth / 2, seat_top - t / 2), "wood")
    leg = 0.035
    for i, (dx, dy) in enumerate(((-1, 0), (1, 0), (-1, 1), (1, 1))):
        lx = x + dx * (width / 2 - leg / 2)
        ly = front_y + leg / 2 + dy * (depth - leg)
        _box(f"Prop_Chair_Leg{i}", (leg, leg, seat_top - t), (lx, ly, (seat_top - t) / 2), "wood")
    _box("Prop_Chair_Back", (width, 0.03, 0.42), (x, back_y - 0.015, seat_top + 0.21), "wood")
    return {"type": "chair", "seatTop": round(seat_top, 3), "frontY": round(front_y, 3), "x": x, "width": width, "depth": depth}


def mat(center_y=0.0, length=1.8, width=0.62, along="y"):
    """Exercise mat on the floor, long axis along Y (or X)."""
    size = (width, length, 0.008) if along == "y" else (length, width, 0.008)
    _box("Prop_Mat", size, (0.0, center_y, 0.004), "mat")
    return {"type": "mat", "centerY": round(center_y, 3), "length": length, "width": width, "along": along}


def step(height, front_y, depth=0.32, width=0.7):
    _box("Prop_Step", (width, depth, height), (0.0, front_y + depth / 2, height / 2), "step")
    return {"type": "step", "height": height, "frontY": round(front_y, 3), "depth": depth, "width": width}


def pillow(center_x, center_y, top_z, length=0.5, depth=0.34):
    """Pillow on the mat whose top surface is at top_z (supports the head when side-lying)."""
    h = max(top_z - 0.008, 0.02)
    _box("Prop_Pillow", (length, depth, h), (center_x, center_y, 0.008 + h / 2), "pillow")
    return {"type": "pillow", "x": round(center_x, 3), "y": round(center_y, 3), "top": round(top_z, 3), "length": length, "depth": depth}


def wall(face_y, width=2.4, height=2.4, x=0.0, behind=False):
    """Wall whose face is the plane y = face_y, in front of the character (-Y side) or behind it."""
    center_y = face_y + 0.05 if behind else face_y - 0.05
    _box("Prop_Wall", (width, 0.1, height), (x, center_y, height / 2), "wall")
    out = {"type": "wall", "faceY": round(face_y, 3), "width": width, "height": height}
    if x:
        out["x"] = round(x, 3)
    if behind:
        out["at"] = "back"
    return out


def _mesh(name, verts, faces, material):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    _collection().objects.link(o)
    o.data.materials.append(_material(material))
    return o


def wedge(front_y, depth, rise, width=0.5, x=0.0):
    """Decline board: its low edge at front_y (under the toes), rising to `rise` metres at front_y + depth."""
    x0, x1, y0, y1 = x - width / 2, x + width / 2, front_y, front_y + depth
    verts = [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0), (x0, y1, rise), (x1, y1, rise)]
    faces = [(0, 3, 2, 1), (2, 3, 4, 5), (0, 1, 5, 4), (0, 4, 3), (1, 2, 5)]
    _mesh("Prop_Wedge", verts, faces, "step")
    return {"type": "wedge", "frontY": round(front_y, 3), "depth": depth, "rise": round(rise, 3), "width": width, "x": round(x, 3)}


def slope_z(wedge_prop, y):
    """Height of the decline board's top surface at y."""
    t = (y - wedge_prop["frontY"]) / wedge_prop["depth"]
    return wedge_prop["rise"] * max(0.0, min(1.0, t))


def roll(x, y, z, radius=0.035, length=0.32):
    """Rolled towel lying across the body (along X), resting on the surface at height z."""
    old = bpy.data.objects.get("Prop_Roll")
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=length, vertices=24,
                                        location=(x, y, z + radius), rotation=(0, math.pi / 2, 0))
    o = bpy.context.active_object
    o.name = "Prop_Roll"
    for c in list(o.users_collection):
        c.objects.unlink(o)
    _collection().objects.link(o)
    o.data.materials.append(_material("towel"))
    return {"type": "roll", "x": round(x, 3), "y": round(y, 3), "z": round(z, 3), "radius": radius, "length": length}


def line(x=0.0, width=0.05, length=8.0):
    """A straight line on the floor along Y (heel-to-toe walking)."""
    _box("Prop_Line", (width, length, 0.002), (x, 0.0, 0.001), "line")
    return {"type": "line", "x": round(x, 3), "width": width, "length": length}


# Towel strap ------------------------------------------------------------------------------
# The towel runs from each hand to the sole of one foot ("ball" of the foot, or the "toes").
# The web viewer computes the same points from the same bones (components/exercise3d).

STRAP_RADIUS = 0.014


def strap_points(foot, at):
    """World points: (left hand grip, right hand grip, left anchor, right anchor) for the towel."""
    import rh_pose as R

    def head(b):
        return R.world_point(b)

    def tail(b):
        return R.world_point(b, tail=True)

    grips = []
    for s in ("Left", "Right"):
        grips.append(head(f"{s}Hand").lerp(head(f"{s}HandMiddle1"), 0.6))
    ankle, ball, knee = head(f"{foot}Foot"), head(f"{foot}ToeBase"), head(f"{foot}Leg")
    along = (ball - ankle).normalized()
    shin = (ankle - knee).normalized()
    plantar = (shin - along * shin.dot(along)).normalized()
    if at == "toes":
        base, depth = ball.lerp(tail(f"{foot}ToeBase"), 0.55), 0.022
    else:
        base, depth = ball, 0.03
    center = base + plantar * depth
    across = along.cross(plantar).normalized() * 0.035
    a, b = center + across, center - across
    left_anchor, right_anchor = (a, b) if a.x > b.x else (b, a)
    return grips[0], grips[1], left_anchor, right_anchor


def _place_segment(o, p0, p1):
    d = p1 - p0
    length = max(d.length, 1e-4)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    o.matrix_world = Matrix.Translation((p0 + p1) / 2) @ rot @ Matrix.Diagonal((1, 1, length, 1))


def _rh_update_straps(scene=None, depsgraph=None):
    first = bpy.data.objects.get("Prop_Strap_0")
    if first is None or "rh_strap" not in first:
        return
    spec = json.loads(first["rh_strap"])
    lh, rh, la, ra = strap_points(spec["foot"], spec["at"])
    for i, (p0, p1) in enumerate(((lh, la), (rh, ra), (la, ra))):
        o = bpy.data.objects.get(f"Prop_Strap_{i}")
        if o is not None:
            _place_segment(o, p0, p1)


def strap(foot="Left", at="ball"):
    """Towel looped under one foot and held in both hands; it follows the pose on every frame."""
    for i in range(3):
        old = bpy.data.objects.get(f"Prop_Strap_{i}")
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
        bpy.ops.mesh.primitive_cylinder_add(radius=STRAP_RADIUS, depth=1.0, vertices=12)
        o = bpy.context.active_object
        o.name = f"Prop_Strap_{i}"
        for c in list(o.users_collection):
            c.objects.unlink(o)
        _collection().objects.link(o)
        o.data.materials.append(_material("towel"))
    bpy.data.objects["Prop_Strap_0"]["rh_strap"] = json.dumps({"foot": foot, "at": at})
    handlers = bpy.app.handlers.frame_change_post
    for h in list(handlers):
        if getattr(h, "__name__", "") == "_rh_update_straps":
            handlers.remove(h)
    handlers.append(_rh_update_straps)
    _rh_update_straps()
    return {"type": "strap", "foot": foot, "at": at}
