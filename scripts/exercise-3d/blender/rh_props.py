"""Simple props for the exercise scenes: chair, mat, step, walls, doorway, table, decline board, towel.

They exist in Blender only to check contact and framing. The web viewer draws the same
props from the dimensions each builder reports, so they add nothing to the download.
Props held in the hands or pressed against the body (towel, band, stick, bottles, ball) follow
the bones, so Blender updates them on every frame change and the web viewer rebuilds them from
the same bones.
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
    "band": (0.91, 0.53, 0.42),     # coral #e8876b
    "bottle": (0.62, 0.80, 0.90),   # light blue #9ecce5
    "ball": (0.80, 0.90, 0.31),     # tennis ball #cce64f
    "door": (0.80, 0.68, 0.55),     # #ccad8c
    "metal": (0.35, 0.36, 0.38),
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


def table(top, x, y, width=0.9, depth=0.6):
    """Table centred at (x, y) with its top surface at `top`."""
    t, leg = 0.03, 0.04
    _box("Prop_Table_Top", (width, depth, t), (x, y, top - t / 2), "wood")
    for i, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        _box(f"Prop_Table_Leg{i}", (leg, leg, top - t),
             (x + dx * (width / 2 - leg), y + dy * (depth / 2 - leg), (top - t) / 2), "wood")
    return {"type": "table", "top": round(top, 3), "x": round(x, 3), "y": round(y, 3), "width": width, "depth": depth}


def mat(center_y=0.0, length=1.8, width=0.62, along="y"):
    """Exercise mat on the floor, long axis along Y (or X)."""
    size = (width, length, 0.008) if along == "y" else (length, width, 0.008)
    _box("Prop_Mat", size, (0.0, center_y, 0.004), "mat")
    return {"type": "mat", "centerY": round(center_y, 3), "length": length, "width": width, "along": along}


def step(height, front_y, depth=0.32, width=0.7, x=0.0):
    _box("Prop_Step", (width, depth, height), (x, front_y + depth / 2, height / 2), "step")
    out = {"type": "step", "height": height, "frontY": round(front_y, 3), "depth": depth, "width": width}
    if x:
        out["x"] = round(x, 3)
    return out


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


def side_wall(face_x, y=0.0, width=2.4, height=2.4):
    """Wall beside the character whose face is the plane x = face_x (on the wearer's left when face_x > 0)."""
    center_x = face_x + 0.05 if face_x > 0 else face_x - 0.05
    _box("Prop_Wall", (0.1, width, height), (center_x, y, height / 2), "wall")
    return {"type": "wall", "faceX": round(face_x, 3), "y": round(y, 3), "width": width, "height": height}


def doorway(face_y, opening=0.84, x=0.0, width=3.0, height=2.4, header=2.05):
    """Wall in front of the character (face towards it at y = face_y) with a door opening centred on x."""
    half = (width - opening) / 2
    for i, sx in enumerate((-1, 1)):
        _box(f"Prop_Doorway_{i}", (half, 0.1, height), (x + sx * (opening / 2 + half / 2), face_y - 0.05, height / 2), "wall")
    _box("Prop_Doorway_Head", (opening, 0.1, height - header), (x, face_y - 0.05, (height + header) / 2), "wall")
    return {"type": "doorway", "faceY": round(face_y, 3), "x": round(x, 3), "opening": opening, "width": width,
            "height": height, "header": header}


def jamb(x, near_y, length=1.0, thick=0.1, height=2.4):
    """End of a wall pointing at the character (a door frame to hold): its edge at near_y, running away along -Y."""
    _box("Prop_Jamb", (thick, length, height), (x, near_y - length / 2, height / 2), "wall")
    return {"type": "jamb", "x": round(x, 3), "nearY": round(near_y, 3), "length": length, "thick": thick, "height": height}


def door(face_y, handle, width=0.82, height=2.0):
    """Closed door in front of the character (face towards it at y = face_y) with a handle at world point `handle`."""
    hx, hz = handle[0], handle[2]
    x = hx + (width / 2 - 0.08 if hx <= 0 else -(width / 2 - 0.08))
    _box("Prop_Door", (width, 0.04, height), (x, face_y - 0.02, height / 2), "door")
    _box("Prop_Door_Handle", (0.12, 0.05, 0.022), (hx, face_y + 0.025, hz), "metal")
    return {"type": "door", "faceY": round(face_y, 3), "x": round(x, 3), "width": width, "height": height,
            "handle": [round(c, 3) for c in handle]}


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


# Props that follow the body -----------------------------------------------------------------
# A towel or belt (strap), a resistance band, a stick, water bottles and a ball pressed between the
# back and a wall are drawn as pieces (cylinders between two points, or a sphere) rebuilt from the
# bones on every frame change. The web viewer computes the same pieces from the same bones
# (components/exercise3d/ExerciseStage.tsx).

STRAP_RADIUS = 0.014
# type: (material, radius, number of pieces)
DYNAMIC = {
    "strap": ("towel", STRAP_RADIUS, 4),
    "band": ("band", 0.008, 2),
    "stick": ("wood", 0.013, 1),
    "bottle": ("bottle", 0.032, 2),
    "ball": ("ball", 0.033, 1),
}


def grip(s):
    """Inside the closed fist of hand s ("Left"/"Right"): between the knuckle and the curled fingertip joint."""
    import rh_pose as R

    return R.world_point(f"{s}HandMiddle1").lerp(R.world_point(f"{s}HandMiddle3"), 0.5)


def belt_points():
    """A belt looped around both knees (just above them): front and back of the loop,
    from the outside of the left knee to the outside of the right knee."""
    import rh_pose as R

    lk, rk = R.world_point("LeftLeg"), R.world_point("RightLeg")
    lh, rh = R.world_point("LeftUpLeg"), R.world_point("RightUpLeg")
    # Just above the knees, on the outside of each thigh.
    la, ra = lk.lerp(lh, 0.12), rk.lerp(rh, 0.12)
    across = (la - ra).normalized()
    la, ra = la + across * 0.065, ra - across * 0.065
    thigh = ((lh - lk) + (rh - rk)).normalized()
    front = across.cross(thigh).normalized() * 0.055
    return la + front, ra + front, la - front, ra - front


def strap_points(foot, at):
    """World points: (left hand grip, right hand grip, left anchor, right anchor) for the towel.
    at="knees" is a belt around both knees instead (front pair, back pair)."""
    import rh_pose as R

    if at == "knees":
        return belt_points()

    def head(b):
        return R.world_point(b)

    def tail(b):
        return R.world_point(b, tail=True)

    ankle, ball_, knee = head(f"{foot}Foot"), head(f"{foot}ToeBase"), head(f"{foot}Leg")
    along = (ball_ - ankle).normalized()
    shin = (ankle - knee).normalized()
    plantar = (shin - along * shin.dot(along)).normalized()
    if at == "toes":
        base, depth = ball_.lerp(tail(f"{foot}ToeBase"), 0.55), 0.022
    else:
        base, depth = ball_, 0.03
    center = base + plantar * depth
    across = along.cross(plantar).normalized() * 0.035
    a, b = center + across, center - across
    left_anchor, right_anchor = (a, b) if a.x > b.x else (b, a)
    return grip("Left"), grip("Right"), left_anchor, right_anchor


def strap_segments(at, a, b, c, d):
    """Towel: each hand to the foot and across the sole (the fourth segment is unused).
    Belt (at="knees"): front, back and both sides of the loop."""
    if at == "knees":
        return ((a, b), (c, d), (a, c), (b, d))
    return ((a, c), (b, d), (c, d), (c, c))


def bottle_axis(s):
    """Direction of a bottle held in fist s: across the palm, from the little finger to the index knuckle."""
    import rh_pose as R

    return (R.world_point(f"{s}HandIndex1") - R.world_point(f"{s}HandPinky1")).normalized()


def pieces(spec):
    """Pieces of a body-following prop in the current pose: (a, b) segments; a == b is a sphere's
    centre, or an unused segment."""
    import rh_pose as R

    kind = spec["type"]
    if kind == "strap":
        return list(strap_segments(spec["at"], *strap_points(spec["foot"], spec["at"])))
    if kind == "band":
        # Both ends held, the middle looped round a fixed anchor (a door handle).
        a = Vector(spec["anchor"])
        return [(a, grip("Left")), (a, grip("Right"))]
    if kind == "stick":
        # Held in both fists; it runs from just outside the `hand` fist through the other fist.
        a = grip(spec["hand"])
        b = grip("Right" if spec["hand"] == "Left" else "Left")
        d = (b - a).normalized()
        return [(a - d * 0.08, a + d * (spec["length"] - 0.08))]
    if kind == "bottle":
        out = []
        for s in ("Left", "Right"):
            if s in spec["hands"]:
                c, axis = grip(s), bottle_axis(s)
                out.append((c - axis * 0.09, c + axis * 0.09))
            else:
                out.append((Vector(), Vector()))
        return out
    if kind == "ball":
        # Pressed between the back and a wall behind it: it rides up and down with the body.
        b = R.world_point(spec["bone"])
        c = Vector((b.x + spec["dx"], spec["faceY"] - DYNAMIC["ball"][1], b.z + spec["dz"]))
        return [(c, c)]
    raise KeyError(kind)


def _place_segment(o, p0, p1):
    d = p1 - p0
    o.hide_render = o.hide_viewport = d.length < 1e-4     # an unused segment
    if o.hide_render:
        return
    length = d.length
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    o.matrix_world = Matrix.Translation((p0 + p1) / 2) @ rot @ Matrix.Diagonal((1, 1, length, 1))


def _rh_update_straps(scene=None, depsgraph=None):
    col = bpy.data.collections.get(COLLECTION)
    for first in list(col.objects) if col else []:
        if "rh_dyn" not in first:
            continue
        spec = json.loads(first["rh_dyn"])
        prefix = first.name[:-2]
        for i, (p0, p1) in enumerate(pieces(spec)):
            o = bpy.data.objects.get(f"{prefix}_{i}")
            if o is None:
                continue
            if spec["type"] == "ball":
                o.matrix_world = Matrix.Translation(p0)
            else:
                _place_segment(o, p0, p1)


def _dynamic(spec):
    """Create the pieces of a body-following prop and keep them updated on frame changes."""
    kind = spec["type"]
    material, radius, n = DYNAMIC[kind]
    prefix = f"Prop_{kind.capitalize()}"
    for i in range(n):
        old = bpy.data.objects.get(f"{prefix}_{i}")
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
        if kind == "ball":
            bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=24, ring_count=12)
        else:
            bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=1.0, vertices=12)
        o = bpy.context.active_object
        o.name = f"{prefix}_{i}"
        for c in list(o.users_collection):
            c.objects.unlink(o)
        _collection().objects.link(o)
        o.data.materials.append(_material(material))
    bpy.data.objects[f"{prefix}_0"]["rh_dyn"] = json.dumps(spec)
    handlers = bpy.app.handlers.frame_change_post
    for h in list(handlers):
        if getattr(h, "__name__", "") == "_rh_update_straps":
            handlers.remove(h)
    handlers.append(_rh_update_straps)
    _rh_update_straps()
    return spec


def strap(foot="Left", at="ball"):
    """Towel looped under one foot and held in both hands (at="ball" or "toes"), or a belt around
    both knees (at="knees"); it follows the pose on every frame."""
    return _dynamic({"type": "strap", "foot": foot, "at": at})


def band(anchor):
    """Resistance band looped round a fixed point (a door handle), one end in each hand."""
    return _dynamic({"type": "band", "anchor": [round(c, 3) for c in anchor]})


def stick(hand="Left", length=1.0):
    """Stick held in both fists, sticking out 8 cm beyond the `hand` fist."""
    return _dynamic({"type": "stick", "hand": hand, "length": length})


def bottles(hands=("Left", "Right")):
    """A water bottle held in each named fist."""
    return _dynamic({"type": "bottle", "hands": list(hands)})


def ball(bone, face_y, dx=0.0, dz=0.0):
    """Tennis ball between the back and a wall behind (wall face at face_y), level with `bone` + dz."""
    return _dynamic({"type": "ball", "bone": bone, "faceY": round(face_y, 3), "dx": round(dx, 3), "dz": round(dz, 3)})
