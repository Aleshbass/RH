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
    # Knee and ankle pack (Oct 2026). Sided clips name the leg being worked or stretched.
    *[c for s, sx in (("left", 1.0), ("right", -1.0)) for c in (
        (f"calf-stretch-{s}", "calf_stretch", s[0].upper(), f"Calf stretch at a wall ({s})", 0.3, (sx, 0.3, 0.15)),
        (f"plantar-fascia-wall-stretch-{s}", "plantar_fascia_wall_stretch", s[0].upper(), f"Plantar fascia wall stretch ({s})", 0.45, (sx, 0.3, 0.12)),
        (f"quad-stretch-{s}", "quad_stretch", s[0].upper(), f"Standing thigh (quadriceps) stretch ({s})", 0.45, (sx, -0.2, 0.15)),
        (f"single-leg-balance-{s}", "single_leg_balance", s[0].upper(), f"Single-leg balance ({s} leg)", 0.35, (-sx, -0.3, 0.15)),
        (f"seated-hamstring-stretch-{s}", "seated_hamstring_stretch", s[0].upper(), f"Seated hamstring stretch ({s})", 0.4, (sx, -0.4, 0.15)),
        (f"seated-static-quads-{s}", "seated_static_quads", s[0].upper(), f"Static thigh push in sitting ({s})", 0.5, (sx * 0.9, -0.7, 0.15)),
        (f"calf-towel-stretch-{s}", "calf_towel_stretch", s[0].upper(), f"Calf stretch with a towel ({s})", 0.35, (sx, -0.3, 0.3)),
        (f"plantar-fascia-towel-stretch-{s}", "plantar_fascia_towel_stretch", s[0].upper(), f"Plantar fascia towel stretch ({s})", 0.35, (sx, -0.3, 0.3)),
        (f"static-push-down-{s}", "static_push_down", s[0].upper(), f"Static push down with the foot ({s})", 0.4, (sx, -0.3, 0.3)),
        (f"ankle-circles-{s}", "ankle_circles", s[0].upper(), f"Ankle circles ({s})", 0.2, (sx, -0.6, 0.3)),
        (f"hamstring-doorway-stretch-{s}", "hamstring_doorway_stretch", s[0].upper(), f"Hamstring stretch in a doorway ({s})", 0.4, (sx, 0.3, 0.35)),
        (f"eccentric-heel-drop-{s}", "eccentric_heel_drop", s[0].upper(), f"Eccentric heel drop ({s})", 0.55, (sx, 0.25, 0.15)),
        (f"plantar-fascia-loading-{s}", "plantar_fascia_loading", s[0].upper(), f"Plantar fascia loading ({s})", 0.4, (sx, 0.25, 0.15)),
        (f"forward-step-up-{s}", "forward_step_up", s[0].upper(), f"Forward step-up ({s} leg)", 0.25, (sx, -0.3, 0.15)),
        (f"single-leg-decline-squat-{s}", "single_leg_decline_squat", s[0].upper(), f"Single-leg decline squat ({s})", 0.5, (sx, -0.4, 0.15)),
        (f"static-quads-{s}", "static_quads", s[0].upper(), f"Static thigh tightening ({s})", 0.4, (sx, -0.3, 0.25)),
        # Lower back and hip pack
        (f"sciatic-nerve-glide-{s}", "sciatic_nerve_glide", s[0].upper(), f"Sciatic nerve glide ({s})", 0.45, (sx, -0.4, 0.15)),
        (f"femoral-nerve-glide-{s}", "femoral_nerve_glide", s[0].upper(), f"Femoral nerve glide ({s})", 0.45, (0.3 * sx, -1.0, 0.5)),
        (f"pelvic-dips-{s}", "pelvic_dips", s[0].upper(), f"Pelvic dips on a step ({s} leg)", 0.42, (0.25 * sx, -1.0, 0.15)),
        (f"side-lying-hip-lift-{s}", "side_lying_hip_lift", s[0].upper(), f"Side-lying hip lift ({s})", 0.4, (0.3 * sx, -1.0, 0.45)),
        (f"pendulum-leg-swing-{s}", "pendulum_leg_swing", s[0].upper(), f"Pendulum leg swings ({s} leg)", 0.35, (sx, -0.2, 0.15)),
        # Shoulder and upper back pack (Nov 2026)
        (f"cross-body-stretch-{s}", "cross_body_stretch", s[0].upper(), f"Cross-body shoulder stretch ({s})", 0.5, (0.4 * sx, -1.0, 0.2)),
        (f"assisted-external-rotation-{s}", "assisted_external_rotation", s[0].upper(), f"Assisted outward rotation with a stick ({s})", 0.45, (0.3 * sx, -1.0, 0.6)),
        (f"assisted-abduction-{s}", "assisted_abduction", s[0].upper(), f"Assisted arm lift out to the side ({s})", 0.5, (0.2 * sx, -1.0, 0.2)),
        (f"static-shoulder-abduction-{s}", "static_shoulder_abduction", s[0].upper(), f"Static shoulder push out to the side ({s})", 0.5, (-0.3 * sx, -1.0, 0.3)),
        (f"static-external-rotation-{s}", "static_external_rotation", s[0].upper(), f"Static outward rotation against a wall ({s})", 0.5, (-0.3 * sx, -1.0, 0.3)),
        (f"pendulum-{s}", "pendulum", s[0].upper(), f"Pendulum exercise ({s} arm)", 0.3, (sx, -0.5, 0.3)),
        (f"open-book-{s}", "open_book", s[0].upper(), f"Side-lying rotation, open book ({s} arm)", 0.45, (0.2 * sx, -0.5, 1.0)),
        (f"wall-rotation-{s}", "wall_rotation", s[0].upper(), f"Wall rotation for the mid back ({s})", 0.4, (-0.4 * sx, -1.0, 0.4)),
        (f"doorway-chest-stretch-{s}", "doorway_chest_stretch", s[0].upper(), f"Doorway chest stretch ({s})", 0.5, (0.6 * sx, 1.0, 0.35)),
        # Neck pack
        (f"upper-trap-stretch-{s}", "upper_trap_stretch", s[0].upper(), f"Upper trapezius stretch ({s})", 0.5, (0.3 * sx, -1.0, 0.25)),
        (f"median-nerve-glide-{s}", "median_nerve_glide", s[0].upper(), f"Median nerve glide ({s} arm)", 0.45, (0.2 * sx, -1.0, 0.25)),
        (f"tennis-ball-neck-{s}", "tennis_ball_neck", s[0].upper(), f"Tennis ball self-massage, top of the shoulder ({s})", 0.3, (sx, -0.4, 0.2)),
        # Elbow, wrist and hand pack
        (f"static-wrist-extension-{s}", "static_wrist_extension", s[0].upper(), f"Static wrist extension ({s})", 0.5, (0.6 * sx, -1.0, 0.6)),
        (f"eccentric-wrist-extension-{s}", "eccentric_wrist_extension", s[0].upper(), f"Slow lowering wrist exercise ({s})", 0.2, (0.8 * sx, -1.0, 0.5)),
        (f"wrist-flexor-curl-{s}", "wrist_flexor_curl", s[0].upper(), f"Wrist curl, palm up ({s})", 0.4, (0.8 * sx, -1.0, 0.5)),
        (f"wrist-flexor-stretch-{s}", "wrist_flexor_stretch", s[0].upper(), f"Wrist and forearm stretch, palm up ({s})", 0.5, (0.6 * sx, -1.0, 0.4)),
        (f"wrist-range-of-movement-{s}", "wrist_range_of_movement", s[0].upper(), f"Wrist range of movement ({s})", 0.08, (0.6 * sx, -1.0, 0.5)),
        (f"finger-pip-bend-{s}", "finger_pip_bend", s[0].upper(), f"Finger middle-joint bending ({s} hand)", 0.4, (0.4 * sx, -0.8, 0.9)),
        (f"hand-band-open-{s}", "hand_band_open", s[0].upper(), f"Hand opening against a rubber band ({s})", 0.4, (0.6 * sx, -1.0, 0.5)),
    )],
    ("knee-rolling", "knee_rolling", None, "Knee rolling", 0.25, (0.3, -1.0, 0.9)),
    ("pelvic-rocking", "pelvic_rocking", None, "Pelvic rocking", 0.55, (1.0, -0.2, 0.25)),
    ("sitting-pelvic-rocking", "sitting_pelvic_rocking", None, "Sitting pelvic rocking", 0.22, (1.0, -0.3, 0.12)),
    ("forward-bend-sitting", "forward_bend_sitting", None, "Forward bend in sitting", 0.4, (1.0, -0.6, 0.2)),
    ("childs-pose", "childs_pose", None, "Child's pose", 0.45, (1.0, -0.2, 0.25)),
    ("chair-squat", "chair_squat", None, "Chair squat", 0.42, (1.0, -0.3, 0.15)),
    ("static-hip-pushout", "static_hip_pushout", None, "Static hip push-out", 0.4, (0.4, -1.0, 0.8)),
    ("buttock-squeeze", "buttock_squeeze", None, "Buttock squeeze", 0.4, (1.0, -0.3, 0.35)),
    ("wall-sit", "wall_sit", None, "Wall sit", 0.4, (1.0, -0.4, 0.15)),
    ("wall-squat", "wall_squat", None, "Wall squat", 0.4, (1.0, -0.4, 0.15)),
    ("seated-calf-hold", "seated_calf_hold", None, "Seated static calf hold", 0.4, (1.0, -0.5, 0.12)),
    ("heel-to-toe-walking", "heel_to_toe_walking", None, "Heel-to-toe walking", 0.25, (1.0, -0.4, 0.2)),
    # Shoulder and upper back pack (Nov 2026)
    ("shoulder-blade-setting", "shoulder_blade_setting", None, "Shoulder blade setting", 0.4, (0.6, 1.0, 0.3)),
    ("scaption", "scaption", None, "Scaption (arm lift at an angle)", 0.45, (0.6, -1.0, 0.2)),
    ("wall-angels", "wall_angels", None, "Wall angels", 0.5, (0.3, -1.0, 0.2)),
    ("band-row", "band_row", None, "Rowing with a resistance band", 0.4, (1.0, -0.3, 0.25)),
    ("rhomboid-doorway-stretch", "rhomboid_doorway_stretch", None, "Rhomboid doorway stretch", 0.5, (1.0, 0.25, 0.2)),
    ("rolled-towel-extension", "rolled_towel_extension", None, "Rolled towel extension", 0.45, (1.0, 0.0, 0.3)),
    ("tennis-ball-upper-back", "tennis_ball_upper_back", None, "Tennis ball rolling for the upper back", 0.4, (1.0, -0.5, 0.2)),
    # Neck pack
    ("chin-tuck-lying", "chin_tuck_lying", None, "Chin tuck lying down", 0.4, (1.0, 0.3, 0.4)),
    ("neck-flexion-extension", "neck_flexion_extension", None, "Neck bending forwards and backwards", 0.2, (1.0, -0.5, 0.2)),
    ("neck-side-bending", "neck_side_bending", None, "Neck side bending", 0.25, (0.2, -1.0, 0.2)),
    ("neck-band-push-back", "neck_band_push_back", None, "Neck push-back into a towel", 0.5, (0.8, -0.8, 0.3)),
    # Elbow, wrist and hand pack
    ("towel-twist", "towel_twist", None, "Towel twist", 0.25, (0.4, -1.0, 0.5)),
]
NEW_IDS = [c[0] for c in CATALOG[20:]]

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


def frame_camera(frame, view, focus=None):
    """Aim RH_PosterCam at the character and props at this frame, from direction `view`, and light it.
    A focus prop (small movements such as the hands) frames its sphere instead."""
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
    if focus:
        center, radius = Vector((focus["x"], focus["y"], focus["z"])), focus["radius"]

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


def render_poster(clip_id, frame, view, focus=None):
    """Transparent-background still from a three-quarter camera that frames the character and props."""
    scene = bpy.context.scene
    frame_camera(frame, view, focus)
    r = scene.render
    r.resolution_x = r.resolution_y = 640
    r.film_transparent = True
    r.image_settings.file_format = "WEBP"
    r.image_settings.quality = 80
    r.filepath = os.path.join(OUT, "posters", f"{clip_id}.webp")
    bpy.ops.render.render(write_still=True)


LEG_MESHES = ("RH_Pants", "RH_Shoes", "RH_Body1")


def clear_chair(prop, frames, gap=0.02):
    """Slide a chair back until nothing below its seat (calves, shins, shoes) passes into it on any
    frame of the clip. The seat height stays. Returns how far the front edge moved (m)."""
    import numpy as np

    scene = bpy.context.scene
    x0, half = prop.get("x", 0.0), prop["width"] / 2 + 0.01
    under = prop["seatTop"] - 0.045                     # underside of the seat board
    front, back = prop["frontY"], prop["frontY"] + prop["depth"]
    worst = None
    for fr in range(1, frames + 1, 2):
        scene.frame_set(fr)
        deps = bpy.context.evaluated_depsgraph_get()
        for n in LEG_MESHES:
            o = bpy.data.objects[n].evaluated_get(deps)
            m = np.array(o.matrix_world)
            me = o.to_mesh()
            co = np.empty(len(me.vertices) * 3)
            me.vertices.foreach_get("co", co)
            o.to_mesh_clear()
            w = co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]
            hit = (w[:, 2] < under) & (np.abs(w[:, 0] - x0) < half) & (w[:, 1] > front - gap) & (w[:, 1] < back)
            if hit.any():
                y = float(w[hit, 1].max())
                worst = y if worst is None else max(worst, y)
    if worst is None:
        return 0.0
    new = P.chair(seat_top=prop["seatTop"], front_y=worst + gap, x=x0, width=prop["width"], depth=prop["depth"])
    moved = new["frontY"] - front
    prop.clear()
    prop.update(new)
    return moved


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
        R.rig().animation_data.action = action
        for prop in report.get("props", []):
            if prop.get("type") == "chair":
                moved = clear_chair(prop, frames)
                if moved > 0.001:
                    print(f"[build] {clip_id}: chair moved back {moved * 100:.1f} cm to clear the legs")
        clip_bytes = export_clip(clip_id, action)
        focus = next((p for p in report.get("props", []) if p.get("type") == "focus"), None)
        render_poster(clip_id, max(1, round(frames * poster_at)), view, focus)
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
