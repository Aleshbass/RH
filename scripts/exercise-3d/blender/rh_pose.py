"""Posing toolkit for the Rehabify exercise rig (RH_Rig in assets-src/3d/rehabify-character.blend).

Exercises are written as clinical joint angles in degrees, measured from the neutral
standing pose (arms by the sides, palms facing the thighs). Rig facts this relies on:
the character faces -Y, Z is up, the wearer's left is +X, and the rest pose is a T-pose.

Each anatomical movement is a rotation about a fixed world axis, applied in the
parent bone's rest frame and converted to the bone's local frame:
    q_local = B_rest^-1 * D * B_rest
so the angles do not depend on how Mixamo oriented each bone.
"""

import math

import bpy
from mathutils import Quaternion, Vector

RIG_NAME = "RH_Rig"
FPS = 30
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# Arms hang this far below the T-pose to reach "by the sides".
ARM_DOWN_DEG = 78.0

# Joint -> (bone, world axis, sign for the left side, sign for the right side).
# Signs are chosen so a positive angle is the clinical direction named.
JOINTS = {
    "hip_flex":       ("UpLeg",    X, -1, -1),   # thigh forward
    "hip_abd":        ("UpLeg",    Y, -1, +1),   # thigh out to the side
    "hip_ext_rot":    ("UpLeg",    Z, +1, -1),   # toes turn out
    "knee_flex":      ("Leg",      X, +1, +1),   # heel towards buttock
    "ankle_plantar":  ("Foot",     X, +1, +1),   # point the toes (negative = dorsiflex)
    "ankle_inv":      ("Foot",     Y, +1, -1),   # turn the sole inwards (negative = evert)
    "toe_ext":        ("ToeBase",  X, -1, -1),   # toes bend up (for heel raises)
    "shoulder_elev":  ("Shoulder", Y, -1, +1),   # shrug the shoulder girdle up
    "shoulder_protr": ("Shoulder", Z, -1, +1),   # shoulder girdle forward (negative = squeeze back)
    "elbow_flex":     ("ForeArm",  Z, -1, +1),   # forearm towards the upper arm
    "forearm_pron":   ("ForeArm",  X, +1, +1),   # turn the palm down (from thumb-up)
    "wrist_ext":      ("Hand",     Y, -1, +1),   # back of the hand up (in the T-pose frame)
    "wrist_dev":      ("Hand",     Z, -1, +1),   # tilt the hand towards the thumb side
}
# Spine and neck joints have no side.
AXIAL = {
    "spine_flex":      (("Spine", "Spine1", "Spine2"), X, +1),   # bend forward (negative = arch back)
    "spine_side":      (("Spine", "Spine1", "Spine2"), Y, -1),   # lean to the wearer's left
    "spine_rot":       (("Spine", "Spine1", "Spine2"), Z, +1),   # turn the chest to the wearer's left
    "neck_flex":       (("Neck",), X, +1),                       # lower neck forward
    "neck_side":       (("Neck", "Head"), Y, -1),                # ear towards the wearer's left shoulder
    "neck_rot":        (("Neck", "Head"), Z, +1),                # turn the head to the wearer's left
    "head_flex":       (("Head",), X, +1),                       # nod (upper neck)
    "upper_back_flex": (("Spine1", "Spine2"), X, +1),            # round the upper back (negative = extend)
}


def rig():
    return bpy.data.objects[RIG_NAME]


def _bone_quat(bone_name, world_rotation):
    """Convert a rotation expressed in world axes into the bone's local pose rotation."""
    r = rig()
    a = r.matrix_world.to_quaternion()
    b = r.data.bones[bone_name].matrix_local.to_quaternion()
    d_arm = a.inverted() @ world_rotation @ a
    return b.inverted() @ d_arm @ b


def _rot(axis, deg):
    return Quaternion(axis, math.radians(deg))


def side_name(side):
    return "Left" if side == "L" else "Right"


def arm_rotation(side, flex=0.0, abd=0.0, ext_rot=0.0, horiz=0.0, plane=0.0):
    """World rotation for the upper arm, starting from hanging by the side.

    flex: forward raise in the sagittal plane (0 = by the side, 90 = forward, 180 = overhead).
    abd: sideways raise in the frontal plane, or in a plane turned `plane` degrees forwards
    (about 35 = the scapular plane of scaption).
    ext_rot: external rotation about the arm's long axis (palm turns forward).
    horiz: turn about the trunk's vertical axis, applied last: positive takes a raised arm
    backwards (horizontal abduction), negative brings it across the chest.
    """
    s = 1 if side == "L" else -1
    down = _rot(Y, s * ARM_DOWN_DEG)
    twist = _rot(X, -ext_rot)                # about the T-pose long axis (same sign both sides)
    if plane:
        a = math.radians(plane)
        raise_side = Quaternion(-s * math.cos(a) * Y - math.sin(a) * X, math.radians(abd))
    else:
        raise_side = _rot(Y, -s * abd)
    raise_fwd = _rot(X, -flex)
    turn = _rot(Z, s * horiz)
    return turn @ raise_fwd @ raise_side @ down @ twist


def pose_quats(p):
    """Turn a pose dict of clinical angles into {bone_name: local quaternion}.

    Keys look like "knee_flex_L", "spine_flex", "arm_L": {"flex": 90}. Missing joints
    stay at neutral; arms default to hanging by the sides.
    """
    world = {}

    def add(bone, q):
        world[bone] = q @ world.get(bone, Quaternion())

    for side in ("L", "R"):
        arm = p.get(f"arm_{side}", {})
        world[f"{side_name(side)}Arm"] = arm_rotation(side, **arm)

    # Twists about a limb's own long axis must be applied first (innermost), then hinges.
    inner_first = {"hip_ext_rot": 0, "forearm_pron": 0, "ankle_inv": 0}
    for key in sorted(p, key=lambda k: inner_first.get(k.rpartition("_")[0], 1)):
        deg = p[key]
        if key.startswith("arm_") or key in ("hips", "root", "label"):
            continue
        if key in AXIAL:
            bones, axis, sign = AXIAL[key]
            share = deg / len(bones)
            for b in bones:
                add(b, _rot(axis, sign * share))
            continue
        joint, _, side = key.rpartition("_")
        if joint == "grip" and side in ("L", "R"):
            # Close the hand: fingers curl towards the palm (about the T-pose's front-back axis), thumb less.
            s = 1 if side == "L" else -1
            for finger in ("Index", "Middle", "Ring", "Pinky"):
                for seg, share in ((1, 0.8), (2, 1.0), (3, 0.7)):
                    add(f"{side_name(side)}Hand{finger}{seg}", _rot(Y, s * deg * share))
            for seg in (2, 3):
                add(f"{side_name(side)}HandThumb{seg}", _rot(Y, s * deg * 0.35))
            continue
        if joint not in JOINTS or side not in ("L", "R"):
            raise KeyError(f"Unknown joint '{key}'")
        part, axis, sl, sr = JOINTS[joint]
        sign = sl if side == "L" else sr
        add(f"{side_name(side)}{part}", _rot(axis, sign * deg))

    return {bone: _bone_quat(bone, q) for bone, q in world.items()}


def reset_pose():
    for pb in rig().pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
        pb.scale = Vector((1, 1, 1))


def _hips_local(world_offset=Vector(), world_rotation=Quaternion()):
    """Hips pose location/rotation for a world-space shift (metres) and whole-body rotation."""
    r = rig()
    a = r.matrix_world.to_quaternion()
    scale = r.matrix_world.to_scale()[0]
    b = r.data.bones["Hips"].matrix_local.to_quaternion()
    loc_arm = a.inverted() @ Vector(world_offset) / scale
    loc = b.inverted() @ loc_arm
    rot = _bone_quat("Hips", world_rotation)
    return loc, rot


def apply_pose(p):
    """Set the rig to pose dict p (no keyframes)."""
    reset_pose()
    r = rig()
    for bone, q in pose_quats(p).items():
        r.pose.bones[bone].rotation_quaternion = q
    root = Quaternion()
    for axis, deg in p.get("root", []):
        root = _rot({"x": X, "y": Y, "z": Z}[axis], deg) @ root
    loc, rot = _hips_local(Vector(p.get("hips", (0, 0, 0))), root)
    hips = r.pose.bones["Hips"]
    hips.location = loc
    hips.rotation_quaternion = rot @ hips.rotation_quaternion
    bpy.context.view_layer.update()


def new_action(name):
    r = rig()
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    if r.animation_data is None:
        r.animation_data_create()
    r.animation_data.action = act
    return act


def key_pose(frame, p):
    """Apply pose dict p and keyframe every bone at frame."""
    apply_pose(p)
    for pb in rig().pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        if pb.name == "Hips":
            pb.keyframe_insert("location", frame=frame)


def build(name, keys, ease=True):
    """Create an action from [(frame, pose_dict), ...]. Returns the action."""
    act = new_action(name)
    for frame, p in keys:
        key_pose(frame, p)
    for layer_fc in _fcurves(act):
        for kp in layer_fc.keyframe_points:
            kp.interpolation = "BEZIER" if ease else "LINEAR"
            kp.easing = "AUTO"
    scene = bpy.context.scene
    scene.frame_start = keys[0][0]
    scene.frame_end = keys[-1][0]
    return act


def _fcurves(act):
    """F-curves of an action, for both legacy and layered (Blender 4.4+) actions."""
    if getattr(act, "fcurves", None) is not None and len(act.fcurves):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def world_point(bone, tail=False):
    r = rig()
    pb = r.pose.bones[bone]
    return r.matrix_world @ (pb.tail if tail else pb.head)


def points(bones, p=None):
    """World positions of bone heads in pose p (neutral standing when p is None)."""
    apply_pose(p or {})
    return {b: world_point(b).copy() for b in bones}


def lock(p, targets):
    """Return p with the hips shifted so the given bone heads land on their targets.

    targets: {bone_name: world Vector}. With several targets the average error is
    removed, which is exact when the locked points move together (both feet in a
    symmetric movement, for example).
    """
    q = dict(p)
    base = Vector(q.get("hips", (0, 0, 0)))
    apply_pose(q)
    delta = Vector()
    for bone, target in targets.items():
        delta += target - world_point(bone)
    q["hips"] = tuple(base + delta / len(targets))
    return q


def _get(p, key):
    if isinstance(key, tuple):
        group, field = key
        if group == "root":
            return dict(p.get("root", [])).get(field, 0.0)
        return p.get(group, {}).get(field, 0.0)
    return p.get(key, 0.0)


def _set(p, key, value):
    if isinstance(key, tuple):
        group, field = key
        if group == "root":
            root = list(p.get("root", []))
            for i, (ax, _) in enumerate(root):
                if ax == field:
                    root[i] = (ax, value)
                    break
            else:
                root.append((field, value))
            p["root"] = root
        else:
            p[group] = dict(p.get(group, {}), **{field: value})
    else:
        p[key] = value


def _copy_pose(p):
    return {k: (dict(v) if isinstance(v, dict) else list(v) if isinstance(v, list) else v) for k, v in p.items()}


def solve(p, params, targets, iters=14, tol=0.0015, step=0.5):
    """Adjust clinical angles so bone heads reach world targets (a small Levenberg-Marquardt IK).

    params: angle keys to adjust, e.g. ["hip_flex_L", "knee_flex_L"] or ("arm_L", "flex").
    targets: {bone_name: world Vector}. The hips are not moved, so call lock() first.
    A step is only taken when it brings the bones closer, so the angles never wander off.
    Returns a new pose dict; the result stays in readable joint angles.
    """
    import numpy as np

    q = _copy_pose(p)
    bones = list(targets)
    start = np.array([_get(q, key) for key in params])
    # A very light pull back to the starting angles (1 mm per 50 degrees): it doesn't stop the bones
    # reaching their targets, but where several joints can trade off against each other (pelvis tilt
    # against hip flexion, say) it keeps the pose near where it started instead of drifting.
    prior = 2e-5

    def residual(pose):
        apply_pose(pose)
        reach = np.concatenate([np.array(world_point(b) - targets[b]) for b in bones])
        angles = np.array([_get(pose, key) for key in params])
        return np.concatenate([reach, prior * (angles - start)])

    r = residual(q)
    cost = float(r @ r)
    # Damping is relative to the Jacobian's scale (a fixed value swamps short segments such as
    # forearms, which move contact points only a few millimetres per degree) and adapts: smaller
    # after a good step, larger after a rejected one.
    mu = 1e-3
    for _ in range(iters):
        if np.abs(r[: 3 * len(bones)]).max() < tol:
            break
        jac = np.zeros((len(r), len(params)))
        for j, key in enumerate(params):
            trial = _copy_pose(q)
            _set(trial, key, _get(q, key) + step)
            jac[:, j] = (residual(trial) - r) / step
        jtj = jac.T @ jac
        scale = float(np.max(np.diag(jtj))) + 1e-12
        while True:
            # Small steps keep the solution in the basin of the starting pose (several joints can
            # often reach the same point; a long jump lands on a different, wrong configuration).
            delta = np.clip(np.linalg.solve(jtj + mu * scale * np.eye(len(params)), -jac.T @ r), -6, 6)
            trial = _copy_pose(q)
            for j, key in enumerate(params):
                _set(trial, key, _get(q, key) + float(delta[j]))
            r_trial = residual(trial)
            if float(r_trial @ r_trial) < cost:
                q, r, cost = trial, r_trial, float(r_trial @ r_trial)
                mu = max(mu / 3, 1e-6)
                break
            mu *= 5
            if mu > 1e4:
                apply_pose(q)
                return q
    apply_pose(q)
    return q


def ground(p, floor_z=0.0):
    """Return p with the hips raised or lowered so the body's lowest point rests on floor_z."""
    q = dict(p)
    apply_pose(q)
    lo = body_min_z()
    base = Vector(q.get("hips", (0, 0, 0)))
    q["hips"] = tuple(base + Vector((0, 0, floor_z - lo)))
    return q


def lock_error(targets):
    """Largest distance (metres) between locked bones and their targets in the current pose."""
    return max((world_point(b) - t).length for b, t in targets.items())


def blend(a, b, t):
    """Pose dict between a (t=0) and b (t=1). Missing joints count as neutral (0)."""
    out = {}
    for k in set(a) | set(b):
        va, vb = a.get(k), b.get(k)
        if k.startswith("arm_"):
            va, vb = va or {}, vb or {}
            out[k] = {f: (1 - t) * va.get(f, 0.0) + t * vb.get(f, 0.0) for f in set(va) | set(vb)}
        elif k == "root":
            da, db = dict(va or []), dict(vb or [])
            order = list(dict.fromkeys([ax for ax, _ in (va or [])] + [ax for ax, _ in (vb or [])]))
            out[k] = [(ax, (1 - t) * da.get(ax, 0.0) + t * db.get(ax, 0.0)) for ax in order]
        elif k == "hips":
            pa, pb_ = Vector(va or (0, 0, 0)), Vector(vb or (0, 0, 0))
            out[k] = tuple(pa.lerp(pb_, t))
        else:
            out[k] = (1 - t) * (va or 0.0) + t * (vb or 0.0)
    return out


def mirror(p):
    """Mirror a pose dict left <-> right (for the other-side version of an exercise)."""
    out = {}
    for k, v in p.items():
        if k.endswith("_L"):
            out[k[:-2] + "_R"] = v
        elif k.endswith("_R"):
            out[k[:-2] + "_L"] = v
        elif k in ("spine_side", "spine_rot", "neck_side", "neck_rot"):
            out[k] = -v
        elif k == "root":
            out[k] = [(ax, -deg if ax in ("y", "z") else deg) for ax, deg in v]
        elif k == "hips":
            out[k] = (-v[0], v[1], v[2])
        else:
            out[k] = v
    return out


def mirror_bone(name):
    if name.startswith("Left"):
        return "Right" + name[4:]
    if name.startswith("Right"):
        return "Left" + name[5:]
    return name


def ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * t)


def animate(name, start, moves, locks=None, step=3, reach=None, rounds=1):
    """Key an action by easing from pose to pose, re-solving the hip lock on every sample.

    start: the first pose. moves: [(pose, frames), ...], each eased from the previous
    pose over that many frames (use the same pose again for a hold).
    locks: {bone: world target} or a function(frame_pose) -> targets, applied to every
    sample so planted feet or hands stay put between keys too.
    reach: optional [(params, targets), ...]; after the lock, solve() adjusts those
    angles on every sample so limbs stay on their contact points (hands on a wall,
    knees on the mat). targets may be a function(pose) -> {bone: Vector} for contacts
    that slide. rounds > 1 alternates lock and reach, for when the reach params include
    the pelvis tilt and so move the locked points.
    A move can also be (pose, frames, opts): opts may replace "locks" and "reach" for that
    segment (stepping, where the planted foot changes), set "ease": False for a steady pace,
    and "step" to sample a hold more sparsely.
    Segment boundaries should be poses where both the old and new contacts hold.
    Returns (action, report) where report has the worst lock error and lowest point.
    """
    act = new_action(name)
    first = moves[0][2] if len(moves[0]) > 2 else {}
    samples = [(1, start, first.get("locks", locks), first.get("reach", reach))]
    frame, prev = 1, start
    for move in moves:
        pose, frames = move[0], move[1]
        opts = move[2] if len(move) > 2 else {}
        curve = ease if opts.get("ease", True) else (lambda t: t)
        seg_step = opts.get("step", step)
        for i in range(1, frames + 1):
            if i % seg_step and i != frames:
                continue
            samples.append((frame + i, blend(prev, pose, curve(i / frames)), opts.get("locks", locks), opts.get("reach", reach)))
        frame += frames
        prev = pose
    worst, lowest, by = 0.0, math.inf, {}
    for f, p, seg_locks, seg_reach in samples:
        targets = seg_locks(p) if callable(seg_locks) else seg_locks
        resolved = [(params, t(p) if callable(t) else t) for params, t in seg_reach or []]
        for _ in range(rounds):
            if targets:
                p = lock(p, targets)
            for params, reach_targets in resolved:
                p = solve(p, params, reach_targets)
        key_pose(f, p)
        if targets:
            worst = max(worst, lock_error(targets))
            by["lock"] = max(by.get("lock", 0.0), lock_error(targets))
        for params, reach_targets in resolved:
            err = lock_error(reach_targets)
            worst = max(worst, err)
            label = "+".join(sorted(reach_targets))
            by[label] = max(by.get(label, 0.0), err)
        lowest = min(lowest, body_min_z())
    for fc in _fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, frame
    report = {"frames": frame, "seconds": round(frame / FPS, 2), "lock_error_mm": round(worst * 1000, 1), "lowest_mm": round(lowest * 1000, 1)}
    if worst > 0.005:
        # Which contacts miss, for authoring (not written to the manifest).
        report["contacts_mm"] = {k: round(v * 1000, 1) for k, v in by.items() if v > 0.005}
    return act, report


def body_min_z(names=("RH_Body1", "RH_Shoes", "RH_Pants", "RH_Shirt")):
    """Lowest point of the deformed character at the current frame (metres)."""
    deps = bpy.context.evaluated_depsgraph_get()
    lo = math.inf
    for n in names:
        o = bpy.data.objects[n].evaluated_get(deps)
        me = o.to_mesh()
        mw = o.matrix_world
        for v in me.vertices:
            z = (mw @ v.co).z
            if z < lo:
                lo = z
        o.to_mesh_clear()
    return lo
