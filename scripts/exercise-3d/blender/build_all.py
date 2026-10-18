"""Build every exercise clip, export the character and clips, render posters, write a manifest.

Run headless:
    blender -b assets-src/3d/rehabify-character.blend -P scripts/exercise-3d/blender/build_all.py
or from a live Blender session (MCP) by importing this module and calling main().

Outputs (scripts/exercise-3d/out/, gitignored):
    character.glb          skinned character, no animation (Draco mesh, WebP textures)
    clips/<id>.glb         one animation each, skeleton only, no meshes
    posters/<id>.webp      still of the exercise's key position, transparent background
    manifest.json          ids, names, sides, durations, props and quality report
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.append(HERE)

import rh_exercises as E  # noqa: E402
import rh_pose as R  # noqa: E402
import rh_props as P  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(ROOT, "scripts", "exercise-3d", "out")

# id, builder, side, display name, poster frame (fraction of the clip), poster view direction
CATALOG = [
    ("mini-squat", "mini_squat", None, "Mini squat", 0.4, (1.0, -0.7, 0.25)),
    ("sit-to-stand", "sit_to_stand", None, "Sit to stand", 0.33, (1.0, -0.7, 0.25)),
    ("calf-raise", "calf_raise", None, "Calf raise", 0.4, (1.0, -0.7, 0.2)),
    ("standing-hip-abduction-left", "standing_hip_abduction", "L", "Standing hip abduction (left)", 0.4, (0.35, -1.0, 0.2)),
    ("standing-hip-abduction-right", "standing_hip_abduction", "R", "Standing hip abduction (right)", 0.4, (-0.35, -1.0, 0.2)),
    ("shoulder-flexion", "shoulder_flexion", None, "Shoulder flexion", 0.42, (1.0, -0.7, 0.2)),
    ("chin-tuck", "chin_tuck", None, "Chin tuck", 0.35, (1.0, -0.15, 0.1)),
    ("seated-knee-extension-left", "seated_knee_extension", "L", "Seated knee extension (left)", 0.35, (1.0, -0.6, 0.25)),
    ("seated-knee-extension-right", "seated_knee_extension", "R", "Seated knee extension (right)", 0.35, (-1.0, -0.6, 0.25)),
    ("wall-push-up", "wall_push_up", None, "Wall push-up", 0.4, (1.0, 0.35, 0.25)),
    ("glute-bridge", "glute_bridge", None, "Glute bridge", 0.42, (1.0, -0.35, 0.35)),
    ("straight-leg-raise-left", "straight_leg_raise", "L", "Straight leg raise (left)", 0.4, (1.0, -0.35, 0.35)),
    ("straight-leg-raise-right", "straight_leg_raise", "R", "Straight leg raise (right)", 0.4, (-1.0, -0.35, 0.35)),
    ("heel-slides-left", "heel_slides", "L", "Heel slides (left)", 0.4, (1.0, -0.35, 0.35)),
    ("heel-slides-right", "heel_slides", "R", "Heel slides (right)", 0.4, (-1.0, -0.35, 0.35)),
    ("clamshell-left", "clamshell", "L", "Clamshell (left)", 0.4, (0.3, -1.0, 0.45)),
    ("clamshell-right", "clamshell", "R", "Clamshell (right)", 0.4, (-0.3, -1.0, 0.45)),
    ("cat-camel", "cat_camel", None, "Cat-camel", 0.23, (1.0, -0.25, 0.25)),
    ("bird-dog-left", "bird_dog", "L", "Bird-dog (left arm, right leg)", 0.42, (1.0, -0.6, 0.35)),
    ("bird-dog-right", "bird_dog", "R", "Bird-dog (right arm, left leg)", 0.42, (-1.0, -0.6, 0.35)),
]

CHARACTER_OBJECTS = ("RH_Rig", "RH_Body1", "RH_Cap", "RH_Eyelashes", "RH_Mask", "RH_Pants", "RH_Shirt", "RH_Shoes",
                     "RH_Logo_Chest", "RH_Logo_Back")


def _select(names):
    bpy.ops.object.select_all(action="DESELECT")
    for n in names:
        o = bpy.data.objects.get(n)
        if o:
            o.hide_set(False)
            o.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects["RH_Rig"]


def export_character():
    rig = R.rig()
    if rig.animation_data:
        rig.animation_data.action = None
    R.reset_pose()
    bpy.context.view_layer.update()
    _select(CHARACTER_OBJECTS)
    path = os.path.join(OUT, "character.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_animations=False,
        export_def_bones=True, export_morph=False, export_cameras=False, export_lights=False,
        export_image_format="WEBP", export_image_quality=82,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
    )
    return os.path.getsize(path)


def export_clip(clip_id, action):
    rig = R.rig()
    rig.animation_data.action = action
    _select(("RH_Rig",))
    path = os.path.join(OUT, "clips", f"{clip_id}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_animations=True,
        export_animation_mode="ACTIVE_ACTIONS", export_force_sampling=True, export_frame_step=2,
        export_optimize_animation_size=True, export_def_bones=True, export_morph=False,
        export_materials="NONE", export_cameras=False, export_lights=False,
    )
    return os.path.getsize(path)


def _light(name, kind, energy, size=None):
    light = bpy.data.lights.get(name) or bpy.data.lights.new(name, kind)
    light.energy = energy
    if size is not None:
        light.angle = size
    obj = bpy.data.objects.get(name)
    if obj is None:
        obj = bpy.data.objects.new(name, light)
        bpy.context.scene.collection.objects.link(obj)
    return obj


def poster_lighting(camera_dir):
    """Soft studio light that follows the poster camera: key from above the camera, cooler fill
    from the other side, light grey ambient. Brown skin and brand teal both need the extra light."""
    from mathutils import Vector

    default = bpy.data.objects.get("Light")
    if default:
        default.hide_render = True
    world = bpy.context.scene.world or bpy.data.worlds.new("RH_World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.62, 0.64, 0.66, 1)
    bg.inputs["Strength"].default_value = 0.9

    d = Vector(camera_dir).normalized()
    side = Vector((-d.y, d.x, 0)).normalized()
    key = _light("RH_Key", "SUN", 3.2, size=0.35)
    key.rotation_euler = (-(d + side * 0.6 + Vector((0, 0, 1.1)))).to_track_quat("-Z", "Y").to_euler()
    fill = _light("RH_Fill", "SUN", 1.1, size=0.8)
    fill.rotation_euler = (-(d - side * 0.9 + Vector((0, 0, 0.3)))).to_track_quat("-Z", "Y").to_euler()
    fill.data.color = (0.9, 0.95, 1.0)


def frame_camera(frame, view):
    """Aim RH_PosterCam at the character and props at this frame, from direction `view`, and light it."""
    from mathutils import Vector

    scene = bpy.context.scene
    scene.frame_set(frame)
    deps = bpy.context.evaluated_depsgraph_get()
    pts = []
    props = bpy.data.collections.get(P.COLLECTION)
    for n in CHARACTER_OBJECTS[1:] + tuple(o.name for o in (props.objects if props else ())):
        o = bpy.data.objects.get(n)
        if o is None or o.type != "MESH" or n in ("Prop_Mat", "Prop_Wall", "Prop_Line"):
            continue
        oe = o.evaluated_get(deps)
        pts += [oe.matrix_world @ Vector(c) for c in oe.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center, radius = (lo + hi) / 2, (hi - lo).length / 2

    cam = bpy.data.objects.get("RH_PosterCam")
    if cam is None:
        cam = bpy.data.objects.new("RH_PosterCam", bpy.data.cameras.new("RH_PosterCam"))
        scene.collection.objects.link(cam)
    cam.data.lens = 50
    d = Vector(view).normalized()
    cam.location = center + d * radius * 3.1
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    poster_lighting(view)
    return cam


def render_poster(clip_id, frame, view):
    """Transparent-background still from a three-quarter camera that frames the character and props."""
    scene = bpy.context.scene
    frame_camera(frame, view)
    r = scene.render
    r.resolution_x = r.resolution_y = 640
    r.film_transparent = True
    r.image_settings.file_format = "WEBP"
    r.image_settings.quality = 80
    r.filepath = os.path.join(OUT, "posters", f"{clip_id}.webp")
    bpy.ops.render.render(write_still=True)


def main(only=None, character=True, save=True):
    """Build the catalog (or just the ids in `only`), merging into an existing manifest."""
    os.makedirs(os.path.join(OUT, "clips"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "posters"), exist_ok=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        pass
    scene.view_settings.view_transform = "Standard"

    manifest_path = os.path.join(OUT, "manifest.json")
    manifest = {"character": None, "exercises": []}
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    if character or not manifest.get("character"):
        manifest["character"] = {"file": "character.glb", "bytes": export_character()}
    order = [c[0] for c in CATALOG]
    for clip_id, builder, side, name, poster_at, view in CATALOG:
        if only and clip_id not in only:
            continue
        P.clear()
        fn = E.BUILDERS[builder]
        action, report = fn(side) if side else fn()
        frames = report["frames"]
        clip_bytes = export_clip(clip_id, action)
        render_poster(clip_id, max(1, round(frames * poster_at)), view)
        manifest["exercises"] = [e for e in manifest["exercises"] if e["id"] != clip_id]
        manifest["exercises"].append({
            "id": clip_id, "name": name, "side": side, "action": action.name,
            "seconds": report["seconds"], "fps": R.FPS, "frames": frames,
            "props": report.get("props", []), "clipBytes": clip_bytes,
            "quality": {"contactErrorMm": report["lock_error_mm"], "lowestPointMm": report["lowest_mm"]},
            "status": "draft",   # a licensed physiotherapist approves each clip before patients see it
        })
        print(f"[build] {clip_id}: {report}")
    P.clear()
    manifest["exercises"].sort(key=lambda e: order.index(e["id"]) if e["id"] in order else len(order))
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    if save:
        bpy.ops.wm.save_mainfile()
    return manifest


if __name__ == "__main__":
    main()
