"""Simple props for the exercise scenes: chair, mat, step and wall.

They exist in Blender only to check contact and framing. The web viewer draws the same
props from the dimensions each builder reports, so they add nothing to the download.
"""

import bpy

COLLECTION = "RH_Props"
COLORS = {
    "wood": (0.85, 0.71, 0.56),
    "mat": (0.83, 0.98, 0.91),      # Rehabify mint #d4fae8
    "step": (0.94, 0.92, 0.89),     # Rehabify sand #efeae2
    "wall": (0.97, 0.96, 0.94),     # Rehabify canvas #f7f5ef
    "pillow": (0.90, 0.94, 0.94),   # Rehabify mist #e6f0ef
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


def wall(face_y, width=2.4, height=2.4):
    """Wall whose face is the plane y = face_y, standing in front of the character (-Y side)."""
    _box("Prop_Wall", (width, 0.1, height), (0.0, face_y - 0.05, height / 2), "wall")
    return {"type": "wall", "faceY": round(face_y, 3), "width": width, "height": height}
