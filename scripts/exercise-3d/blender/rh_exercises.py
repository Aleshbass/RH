"""Rehabify starter exercise pack, authored as clinical joint angles on RH_Rig.

Each builder makes one looping action named EX_<slug> (one repetition, starting and
ending in the same pose) and returns its report from rh_pose.animate. Angles are in
degrees; see rh_pose.JOINTS for the sign conventions. Every clip still needs sign-off
from a licensed physiotherapist before patients see it.
"""

import math

from mathutils import Vector

import rh_pose as R

STAND = {}
FEET = ("LeftFoot", "RightFoot")


def _sym(**angles):
    """Same angle on both sides: _sym(knee_flex=60) -> knee_flex_L/R = 60."""
    out = {}
    for joint, deg in angles.items():
        out[f"{joint}_L"] = deg
        out[f"{joint}_R"] = deg
    return out


def squat_pose(pelvis_tilt, thigh, knee, arm_flex=0.0, spine=0.0):
    """Squat-family pose with flat feet.

    pelvis_tilt: pelvis forward tilt in space. thigh: thigh angle forward of vertical in
    space. knee: knee flexion. The ankle is solved so the foot stays flat on the floor.
    """
    hip = thigh + pelvis_tilt
    ankle = hip - knee - pelvis_tilt
    trunk = pelvis_tilt + spine
    p = {"root": [("x", pelvis_tilt)], "spine_flex": spine,
         "neck_flex": -0.4 * trunk, "head_flex": -0.5 * trunk,
         **_sym(hip_flex=hip, knee_flex=knee, ankle_plantar=ankle)}
    if arm_flex:
        p["arm_L"] = {"flex": arm_flex + trunk}
        p["arm_R"] = {"flex": arm_flex + trunk}
    return p


def mini_squat():
    """Feet hip-width, bend to ~65 deg knee flexion, arms forward for balance. 4 s per rep."""
    feet = R.points(FEET)
    top = {"arm_L": {"flex": 80}, "arm_R": {"flex": 80}}
    bottom = squat_pose(pelvis_tilt=25, thigh=45, knee=65, arm_flex=80, spine=5)
    return R.animate("EX_mini_squat", top, [(bottom, 45), (bottom, 15), (top, 45), (top, 15)], locks=feet)


def fit_chair(sit, side="L"):
    """Place the chair under a seated pose: seat top at the buttocks, front edge behind the knees
    (measured on the `side` thigh, which should be resting on the seat)."""
    import bpy
    import rh_props as P

    R.apply_pose(sit)
    s = "Left" if side == "L" else "Right"
    knee, hip = R.world_point(f"{s}Leg"), R.world_point(f"{s}UpLeg")
    deps = bpy.context.evaluated_depsgraph_get()
    o = bpy.data.objects["RH_Pants"].evaluated_get(deps)
    me = o.to_mesh()
    pts = [o.matrix_world @ v.co for v in me.vertices]
    o.to_mesh_clear()
    under = min(p.z for p in pts if hip.y - 0.18 < p.y < hip.y + 0.12 and p.z > knee.z - 0.2)
    P.clear()
    return P.chair(seat_top=under + 0.004, front_y=knee.y + 0.10)


def sit_to_stand():
    """Sit, lean forward, stand tall, then sit back down with control. Arms reach forward. ~7 s per rep."""
    feet = R.points(FEET)
    sit = squat_pose(pelvis_tilt=0, thigh=88, knee=100, arm_flex=80)
    lean = squat_pose(pelvis_tilt=38, thigh=88, knee=100, arm_flex=80)
    lift = squat_pose(pelvis_tilt=36, thigh=58, knee=72, arm_flex=80)
    stand = {"arm_L": {"flex": 80}, "arm_R": {"flex": 80}}
    chair = fit_chair(R.lock(sit, feet))
    act, report = R.animate("EX_sit_to_stand", sit, [
        (sit, 15), (lean, 30), (lift, 18), (stand, 24), (stand, 24),
        (lift, 27), (lean, 18), (sit, 30), (sit, 12),
    ], locks=feet)
    report["props"] = [chair]
    return act, report


def _side(p, side):
    """Authoring is done on the left; side='R' mirrors the pose."""
    return p if side == "L" else R.mirror(p)


def calf_raise():
    """Rise onto the balls of both feet, hold, lower slowly. 4 s per rep."""
    balls = R.points(("LeftToeBase", "RightToeBase"))
    down = {}
    up = _sym(ankle_plantar=32, toe_ext=32)
    return R.animate("EX_calf_raise", down, [(up, 30), (up, 30), (down, 45), (down, 15)], locks=balls)


def standing_hip_abduction(side="L"):
    """Standing on one leg, lift the other leg out to the side to ~30 deg, toes forward. 4 s per rep."""
    stance = "RightFoot" if side == "L" else "LeftFoot"
    plant = R.points((stance,))
    rest = _side({"arm_L": {"abd": 12}, "arm_R": {"abd": 12}}, side)
    out = _side({"hip_abd_L": 30, "spine_side": -4, "arm_L": {"abd": 12}, "arm_R": {"abd": 12}}, side)
    return R.animate(f"EX_standing_hip_abduction_{side}", rest, [(out, 40), (out, 20), (rest, 45), (rest, 15)], locks=plant)


def shoulder_flexion():
    """Raise both straight arms forward and overhead (~165 deg), thumbs up, then lower. 6 s per rep."""
    feet = R.points(FEET)
    down = {}
    # The resting arm hangs 12 deg out from the body; adduct so the raised arms stay parallel.
    up = {"arm_L": {"flex": 165, "abd": -10}, "arm_R": {"flex": 165, "abd": -10}, "spine_flex": -4}
    return R.animate("EX_shoulder_flexion", down, [(up, 60), (up, 30), (down, 60), (down, 30)], locks=feet)


def chin_tuck():
    """Glide the head straight back, chin level (upper neck nods, lower neck extends). 5 s per rep."""
    feet = R.points(FEET)
    rest = {}
    tuck = {"neck_flex": -21, "head_flex": 23}   # ~28 mm of retraction, chin stays level
    return R.animate("EX_chin_tuck", rest, [(tuck, 24), (tuck, 72), (rest, 30), (rest, 24)], locks=feet)


def seated_knee_extension(side="L"):
    """Sitting tall, straighten one knee and pull the toes up, hold, lower slowly. 7 s per rep."""
    feet = R.points(FEET)
    # Shin vertical at the start, so straightening the knee only ever lifts the foot.
    sit = R.lock(squat_pose(pelvis_tilt=-4, thigh=88, knee=88), feet)
    # Hands hold the sides of the seat.
    sit["arm_L"] = {"flex": 8, "abd": 6}
    sit["arm_R"] = {"flex": 8, "abd": 6}
    sit["elbow_flex_L"] = sit["elbow_flex_R"] = 12
    chair = fit_chair(sit)
    other = "RightFoot" if side == "L" else "LeftFoot"
    plant = R.points((other,), sit)
    sit = _side(sit, side) if side == "R" else sit
    # Straighten the knee first, then pull the toes up (doing both at once swings the heel into the floor).
    # The thigh lifts a little off the seat so the heel clears the floor as the shin swings.
    lifted = dict(sit)
    lifted["knee_flex_L"] = 40
    lifted["hip_flex_L"] = sit["hip_flex_L"] + 6
    straight = dict(lifted)
    straight["knee_flex_L"] = 8
    straight["ankle_plantar_L"] = -15
    if side == "R":
        lifted, straight = _side(lifted, side), _side(straight, side)
    act, report = R.animate(f"EX_seated_knee_extension_{side}", sit,
                            [(lifted, 24), (straight, 21), (straight, 60), (lifted, 30), (sit, 30), (sit, 45)], locks=plant)
    report["props"] = [chair]
    return act, report


def lean_pose(angle, **extra):
    """Whole body straight from the ankles, leaning forward by angle (feet flat)."""
    return {"root": [("x", angle)], **_sym(ankle_plantar=-angle), **extra}


def wall_push_up():
    """Hands on the wall at shoulder height, body straight; bend the elbows to bring the chest
    towards the wall, then push back. Feet and hands stay planted. 4 s per rep."""
    import rh_props as P

    feet = R.points(FEET)
    palm = ("HandMiddle1", "HandPinky1", "HandIndex1")
    arms = lambda flex, elbow, wrist, dev: {
        **_sym(forearm_pron=90, wrist_ext=wrist, wrist_dev=dev, elbow_flex=elbow),
        "arm_L": {"flex": flex, "abd": -2}, "arm_R": {"flex": flex, "abd": -2},
    }
    out = R.lock(lean_pose(12, **arms(102, 5, 80, 0)), feet)
    contact = R.points([f"{s}Hand" for s in ("Left", "Right")] + [f"{s}{b}" for s in ("Left", "Right") for b in palm], out)
    wall = P.wall(face_y=contact["LeftHandMiddle1"].y - 0.016)
    # Bottom at a 19 deg lean: the solver lands on ~87 deg of elbow flexion.
    inn = lean_pose(19, **arms(83, 87, 26, -6))
    reach = []
    for s, side in (("L", "Left"), ("R", "Right")):
        # Place the wrist with shoulder and elbow, then square the palm to the wall.
        reach.append(([(f"arm_{s}", "flex"), (f"arm_{s}", "abd"), f"elbow_flex_{s}"],
                      {f"{side}Hand": contact[f"{side}Hand"]}))
        reach.append(([f"wrist_ext_{s}", f"forearm_pron_{s}", f"wrist_dev_{s}"],
                      {f"{side}{b}": contact[f"{side}{b}"] for b in palm}))
    act, report = R.animate("EX_wall_push_up", out, [(inn, 45), (inn, 12), (out, 45), (out, 18)],
                            locks=feet, reach=reach * 2)
    report["props"] = [wall]
    return act, report


MAT_TOP = 0.008


def supine(**angles):
    """Lying on the back, head towards +Y, face up."""
    return {"root": [("x", -90)], **angles}


def hook_lying():
    """Supine with knees bent and feet flat on the mat, grounded on the mat."""
    return R.ground(supine(**_sym(hip_flex=45, knee_flex=95, ankle_plantar=50)), MAT_TOP)


def _foot_reach(contact, sides=("L", "R"), extra=()):
    """Keep feet flat on their contact points by adjusting hip, knee and ankle."""
    out = []
    for s in sides:
        side = "Left" if s == "L" else "Right"
        params = [f"hip_flex_{s}", f"knee_flex_{s}", f"ankle_plantar_{s}", *[f"{e}_{s}" for e in extra]]
        out.append((params, {f"{side}Foot": contact[f"{side}Foot"], f"{side}ToeBase": contact[f"{side}ToeBase"]}))
    return out


def glute_bridge():
    """From hook lying, squeeze the buttocks and lift the hips until shoulders, hips and knees
    line up; hold, then lower one vertebra at a time. 6 s per rep."""
    import rh_props as P

    start = hook_lying()
    pts = R.points(("Neck", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftHand", "RightHand"), start)
    mat = P.mat(center_y=pts["Neck"].y - 0.55)
    top = dict(start)
    # 18 deg of lift brings the hip to ~3 deg flexion: full hip extension without arching the
    # lower back (a bigger lift puts the hip into hyperextension).
    top["root"] = [("x", -90 - 18)]
    top.update(_sym(hip_flex=3, knee_flex=77, ankle_plantar=58))
    top["arm_L"] = {"flex": -18}
    top["arm_R"] = {"flex": -18}
    reach = _foot_reach(pts) + [
        ([("arm_L", "flex")], {"LeftHand": pts["LeftHand"]}),
        ([("arm_R", "flex")], {"RightHand": pts["RightHand"]}),
    ]
    act, report = R.animate("EX_glute_bridge", start, [(start, 15), (top, 45), (top, 60), (start, 45), (start, 15)],
                            locks={"Neck": pts["Neck"]}, reach=reach)
    report["props"] = [mat]
    return act, report


HOOK = dict(hip_flex=45, knee_flex=95, ankle_plantar=50)
STRAIGHT = dict(hip_flex=0, knee_flex=0, ankle_plantar=-5)


def _leg(side, **angles):
    return {f"{k}_{side}": v for k, v in angles.items()}


def straight_leg_raise(side="L"):
    """Lying on the back, other knee bent. Tighten the thigh, lift the straight leg to the
    height of the other knee (~45 deg), hold, lower slowly. 6 s per rep."""
    import rh_props as P

    other = "R" if side == "L" else "L"
    start = R.ground(supine(**_leg(side, **STRAIGHT), **_leg(other, **HOOK)), MAT_TOP)
    neck = R.points(("Neck",), start)
    mat = P.mat(center_y=neck["Neck"].y - 0.55)
    up = dict(start)
    up.update(_leg(side, hip_flex=45, knee_flex=0, ankle_plantar=-12))
    act, report = R.animate(f"EX_straight_leg_raise_{side}", start,
                            [(start, 12), (up, 45), (up, 45), (start, 60), (start, 18)], locks=neck)
    report["props"] = [mat]
    return act, report


def heel_slides(side="L"):
    """Lying on the back, slide the heel along the mat towards the buttock, then slide it
    back out. The heel never leaves the mat. 6 s per rep."""
    import rh_props as P

    other = "R" if side == "L" else "L"
    s = "Left" if side == "L" else "Right"
    start = R.ground(supine(**_leg(side, **STRAIGHT), **_leg(other, **HOOK)), MAT_TOP)
    neck = R.points(("Neck",), start)
    mat = P.mat(center_y=neck["Neck"].y - 0.55)
    bent = dict(start)
    bent.update(_leg(side, **HOOK))
    z0 = R.points((f"{s}Foot",), start)[f"{s}Foot"].z
    z1 = R.points((f"{s}Foot",), bent)[f"{s}Foot"].z

    def heel_on_mat(p):
        # Keep the ankle at the height it has with the heel resting on the mat for this much knee bend.
        t = max(0.0, min(1.0, p.get(f"knee_flex_{side}", 0.0) / HOOK["knee_flex"]))
        R.apply_pose(p)
        a = R.world_point(f"{s}Foot")
        return {f"{s}Foot": a.__class__((a.x, a.y, z0 + t * (z1 - z0)))}

    reach = [([f"hip_flex_{side}"], heel_on_mat)]
    act, report = R.animate(f"EX_heel_slides_{side}", start,
                            [(start, 12), (bent, 60), (bent, 18), (start, 60), (start, 30)], locks=neck, reach=reach)
    report["props"] = [mat]
    return act, report


def side_lying(**angles):
    """Lying on the right side (left side up), hips 45 deg and knees 90 deg, head on a pillow."""
    p = {"root": [("y", -90)], **_sym(hip_flex=45, knee_flex=90, ankle_plantar=10),
         "arm_R": {"flex": 80, "abd": -14}, "elbow_flex_R": 75,
         "arm_L": {"abd": -14, "flex": 8}, "neck_side": -18, **angles}
    return R.ground(p, MAT_TOP)


def head_pillow(pose):
    """Pillow whose top meets the underside of the head in this pose."""
    import bpy
    import rh_props as P

    R.apply_pose(pose)
    deps = bpy.context.evaluated_depsgraph_get()
    hb = R.rig().pose.bones["Head"]
    hc = R.rig().matrix_world @ ((hb.head + hb.tail) / 2)
    under = 1.0
    for n in ("RH_Body1", "RH_Cap", "RH_Mask"):
        o = bpy.data.objects[n].evaluated_get(deps)
        me = o.to_mesh()
        for v in me.vertices:
            w = o.matrix_world @ v.co
            if (w - hc).length < 0.13:
                under = min(under, w.z)
        o.to_mesh_clear()
    return P.pillow(center_x=hc.x, center_y=hc.y, top_z=under)


def clamshell(side="L"):
    """Side-lying, knees bent, feet together. Keeping the feet touching and the pelvis still,
    lift the top knee like a clam opening (~35 deg), hold, lower. 5 s per rep.
    side names the working (top) leg: L lies on the right side."""
    import rh_props as P

    start = side_lying()
    if side == "R":
        start = R.ground(R.mirror(start), MAT_TOP)
    s = "Left" if side == "L" else "Right"
    ankle = R.points((f"{s}Foot",), start)
    P.clear()
    mat = P.mat(center_y=0.0, along="x", length=1.9)
    pillow = head_pillow(start)
    opened = dict(start)
    opened[f"hip_abd_{side}"] = 35
    reach = [([f"hip_ext_rot_{side}", f"hip_flex_{side}", f"knee_flex_{side}"], ankle)]
    act, report = R.animate(f"EX_clamshell_{side}", start, [(start, 12), (opened, 36), (opened, 45), (start, 45), (start, 12)],
                            reach=reach)
    report["props"] = [mat, pillow]
    return act, report


def four_point_kneel():
    """Hands under shoulders, knees under hips, palms flat with fingers forward.

    The rig's arms are long for its legs, so the trunk inclines ~4 deg (head end up) to get
    both knees onto the mat with straight arms."""
    def quad(tilt):
        # Thighs and arms stay vertical whatever the trunk's tilt (hip flexion and arm flexion = tilt).
        return R.ground({"root": [("x", tilt)], **_sym(hip_flex=tilt, knee_flex=90, ankle_plantar=70, forearm_pron=90, wrist_ext=85),
                         "arm_L": {"flex": tilt, "abd": -10}, "arm_R": {"flex": tilt, "abd": -10}, "neck_flex": -10}, MAT_TOP)

    def knee_minus_hand(tilt):
        # How far the knees sit above the hands' contact once the lowest point is on the mat.
        p = quad(tilt)
        R.apply_pose(p)
        k, h = R.world_point("LeftLeg"), R.world_point("LeftHand")
        knee = min(w.z for w in mesh_points(("RH_Pants",), lambda w: (w - k).length < 0.07))
        hand = min(w.z for w in mesh_points(("RH_Body1",), lambda w: (w - h).length < 0.1))
        return knee - hand

    return quad(bisect(knee_minus_hand, 90, 70, iters=12))


def _kneel_contacts(base):
    pts = R.points(("LeftHand", "RightHand", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot"), base)
    knees = {b: pts[b] for b in ("LeftLeg", "RightLeg")}
    hands = {b: pts[b] for b in ("LeftHand", "RightHand")}
    feet = {b: pts[b] for b in ("LeftFoot", "RightFoot")}
    return knees, hands, feet


def cat_camel():
    """On hands and knees: round the back up towards the ceiling, tucking the tail and chin
    (cat), then let the back gently sag, lifting the head and tail (camel / cow). 8 s per rep."""
    import rh_props as P

    base = four_point_kneel()
    knees, hands, feet = _kneel_contacts(base)
    P.clear()
    mat = P.mat(center_y=-0.05)
    cat = dict(base, spine_flex=34, neck_flex=8, head_flex=14)
    cat["root"] = [("x", base["root"][0][1] - 8)]           # tuck the pelvis
    cow = dict(base, spine_flex=-22, neck_flex=-24, head_flex=-8)
    cow["root"] = [("x", base["root"][0][1] + 6)]           # tip the pelvis forward
    reach = [
        ([("root", "x"), ("arm_L", "flex"), ("arm_R", "flex"), "elbow_flex_L", "elbow_flex_R"], hands),
        (["hip_flex_L", "knee_flex_L"], {"LeftFoot": feet["LeftFoot"]}),
        (["hip_flex_R", "knee_flex_R"], {"RightFoot": feet["RightFoot"]}),
    ]
    act, report = R.animate("EX_cat_camel", base, [(cat, 54), (cat, 24), (base, 36), (cow, 54), (cow, 24), (base, 48)],
                            locks=knees, reach=reach, rounds=3)
    report["props"] = [mat]
    return act, report


def bird_dog(side="L"):
    """On hands and knees, reach one arm forward and the opposite leg back until both are level
    with the trunk; keep the back flat and the pelvis level, hold, return. 6 s per rep.
    side names the arm that reaches (L = left arm with right leg)."""
    import rh_props as P

    base = four_point_kneel()
    knees, hands, feet = _kneel_contacts(base)
    P.clear()
    mat = P.mat(center_y=-0.05)
    trunk = base["root"][0][1]
    reach_pose = dict(base)
    # Arm level with the trunk (straight forward), opposite leg straight back in line with it.
    reach_pose["arm_L"] = {"flex": 180 - (90 - trunk), "abd": -6}
    reach_pose.update({"elbow_flex_L": 0, "wrist_ext_L": 10, "forearm_pron_L": 60,
                       # Thigh in line with the trunk, then levelled: a few degrees of hip extension.
                       "hip_flex_R": trunk - 90, "knee_flex_R": 2, "ankle_plantar_R": 30,
                       "neck_flex": -6})
    if side == "R":
        base, reach_pose = R.mirror(base), R.mirror(reach_pose)
    stance_knee = "LeftLeg" if side == "L" else "RightLeg"
    stance_hand = "RightHand" if side == "L" else "LeftHand"
    stance_foot = "LeftFoot" if side == "L" else "RightFoot"
    s_hand, s_leg = ("R", "L") if side == "L" else ("L", "R")
    reach = [
        ([("root", "x"), (f"arm_{s_hand}", "flex"), f"elbow_flex_{s_hand}"], {stance_hand: hands[stance_hand]}),
        ([f"hip_flex_{s_leg}", f"knee_flex_{s_leg}"], {stance_foot: feet[stance_foot]}),
    ]
    act, report = R.animate(f"EX_bird_dog_{side}", base, [(reach_pose, 48), (reach_pose, 54), (base, 48), (base, 30)],
                            locks={stance_knee: knees[stance_knee]}, reach=reach, rounds=3)
    report["props"] = [mat]
    return act, report


# ─── Knee and ankle pack (Oct 2026) ──────────────────────────────────────────────────────

SIDE_NAME = {"L": "Left", "R": "Right"}
OTHER = {"L": "R", "R": "L"}
PALM = ("HandMiddle1", "HandPinky1", "HandIndex1")


def foot_targets(side, shift=(0.0, 0.0, 0.0), p=None):
    """Ankle and ball-of-foot points of one foot in pose p (neutral standing by default), moved by shift."""
    s = SIDE_NAME[side]
    pts = R.points((f"{s}Foot", f"{s}ToeBase"), p)
    return {b: v + Vector(shift) for b, v in pts.items()}


def leg_params(side, *extra):
    return [f"hip_flex_{side}", f"knee_flex_{side}", f"ankle_plantar_{side}", *[f"{e}_{side}" for e in extra]]


def wall_arms(flex, elbow, wrist, dev=0.0, abd=-2.0, sides=("L", "R")):
    """Arms reaching forward with the palms facing forward, for hands flat on a wall in front."""
    p = {}
    for s in sides:
        p.update({f"forearm_pron_{s}": 90, f"wrist_ext_{s}": wrist, f"wrist_dev_{s}": dev, f"elbow_flex_{s}": elbow,
                  f"arm_{s}": {"flex": flex, "abd": abd}})
    return p


def palms_on_wall(pose, sides=("L", "R"), face=None):
    """Palm contact points in `pose`, the y of a wall face just in front of them, and the reach
    that keeps the palms there (shoulder and elbow place the wrist, then the wrist squares the palm).
    With `face` given, the palms are slid forwards or back onto that wall instead."""
    names = []
    for s in sides:
        names += [f"{SIDE_NAME[s]}Hand"] + [f"{SIDE_NAME[s]}{b}" for b in PALM]
    contact = R.points(names, pose)
    knuckles = min(contact[f"{SIDE_NAME[s]}HandMiddle1"].y for s in sides)
    if face is not None:
        shift = Vector((0, face + 0.016 - knuckles, 0))
        contact = {n: v + shift for n, v in contact.items()}
    else:
        face = knuckles - 0.016
    reach = []
    for s in sides:
        n = SIDE_NAME[s]
        reach.append(([(f"arm_{s}", "flex"), (f"arm_{s}", "abd"), f"elbow_flex_{s}"], {f"{n}Hand": contact[f"{n}Hand"]}))
        reach.append(([f"wrist_ext_{s}", f"forearm_pron_{s}", f"wrist_dev_{s}"], {f"{n}{b}": contact[f"{n}{b}"] for b in PALM}))
    return contact, face, reach


def settle(p, locks, reach, rounds=2):
    """Solve a key pose once so animation samples near it start from a pose that already fits."""
    for _ in range(rounds):
        if locks:
            p = R.lock(p, locks(p) if callable(locks) else locks)
        for params, targets in reach:
            p = R.solve(p, params, targets(p) if callable(targets) else targets, iters=25)
    return p


def mesh_points(names, keep=None, p=None):
    """World positions of the deformed vertices of these character meshes in pose p (or as posed)."""
    import bpy

    if p is not None:
        R.apply_pose(p)
    deps = bpy.context.evaluated_depsgraph_get()
    out = []
    for n in names:
        o = bpy.data.objects[n].evaluated_get(deps)
        me = o.to_mesh()
        mw = o.matrix_world
        for v in me.vertices:
            w = mw @ v.co
            if keep is None or keep(w):
                out.append(w)
        o.to_mesh_clear()
    return out


def shoe(side, p=None):
    """Vertices of one shoe (the shoes are one mesh, split by which side of the body they are on)."""
    sign = 1 if side == "L" else -1
    return mesh_points(("RH_Shoes",), lambda w: w.x * sign > 0, p)


def bisect(f, lo, hi, iters=22):
    """x in [lo, hi] where the monotonic f(x) crosses zero."""
    flo = f(lo)
    for _ in range(iters):
        mid = (lo + hi) / 2
        fm = f(mid)
        if (fm > 0) == (flo > 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return (lo + hi) / 2


def plantar_fascia_wall_stretch(side="L"):
    """Facing a wall with hands on it. The foot being stretched (side) is in front with its toes bent
    up against the wall and the heel down; the other foot is a small step back. Bend the front knee
    towards the wall, heel still down, until a stretch is felt under the foot; hold; ease back. 11 s."""
    import rh_props as P

    other = OTHER[side]
    # The front foot is ahead of the hips, so the chest stays clear of the wall the toes touch.
    front_t = foot_targets(side, (0, -0.20, 0))
    back_t = foot_targets(other, (0, 0.04, 0))
    ball = {k: v for k, v in back_t.items() if k.endswith("ToeBase")}

    def pose(knee, shin, tilt, back_ankle=-20):
        # shin: forward lean of the front shin = ankle dorsiflexion with the foot flat.
        p = {"root": [("x", tilt)], "hip_flex_L": tilt - shin + knee, "knee_flex_L": knee, "ankle_plantar_L": -shin,
             "toe_ext_L": 62, "hip_flex_R": -8, "knee_flex_R": 12, "ankle_plantar_R": back_ankle, **wall_arms(30, 50, 80)}
        return _side(p, side)

    # The back foot is flat at the start; as the body moves forward its heel lifts and only the ball stays down.
    start = settle(pose(8, -6, 0), front_t, [(leg_params(other), back_t)])
    face = min(w.y for w in shoe(side, start)) - 0.002          # toe tips touching the wall
    contact, face, arm_reach = palms_on_wall(start, face=face)
    reach = [([f"hip_flex_{other}", f"knee_flex_{other}"], ball)] + arm_reach
    start = settle(start, front_t, reach)
    stretch = settle(pose(28, 14, -3, back_ankle=22), front_t, reach, rounds=3)
    P.clear()
    wall = P.wall(face_y=face)
    hold = {"step": 10}
    act, report = R.animate(f"EX_plantar_fascia_wall_stretch_{side}", start, [
        (start, 15, hold), (stretch, 60), (stretch, 150, hold), (start, 60), (start, 45, hold),
    ], locks=front_t, reach=reach)
    report["props"] = [wall]
    return act, report


def chair_support(p, sides, depth=0.42, gap=0.03):
    """Chair in front of the body, its back towards the body, with the top rail just under the palm(s)
    of the given hands (gap: palm thickness, or more for hands hovering over it)."""
    import rh_props as P

    R.apply_pose(p)
    palms = [R.world_point(f"{SIDE_NAME[s]}Hand").lerp(R.world_point(f"{SIDE_NAME[s]}HandMiddle1"), 0.5) for s in sides]
    palm = sum(palms, Vector()) / len(palms)
    back_y = palm.y + 0.015
    x = palm.x * 0.5 if len(sides) == 1 else palm.x
    return P.chair(seat_top=palm.z - gap - 0.42, front_y=back_y - depth, x=round(x, 3), depth=depth)


def support_arm(side, flex=26, abd=6):
    """One hand resting on a chair back in front: arm forward and down, palm down."""
    return {f"arm_{side}": {"flex": flex, "abd": abd}, f"elbow_flex_{side}": 14, f"forearm_pron_{side}": 85, f"wrist_ext_{side}": 42}


def quad_stretch(side="L"):
    """Standing on the other leg with one hand on a chair. Bend the knee of the leg being stretched
    (side), take hold of that ankle behind you, and ease the heel towards the buttock with the knees
    together and the body upright; hold; let go and lower the foot. 12 s."""
    import rh_props as P

    stance = OTHER[side]
    s, o = SIDE_NAME[side], SIDE_NAME[stance]
    plant = foot_targets(stance)
    both = {**foot_targets(side), **plant}
    # Weight over the standing foot: the hip adducts and the foot everts back to flat.
    base = {**support_arm("R"), "arm_L": {"flex": 0, "abd": 8}}
    shift = dict(base, hip_abd_R=-5, ankle_inv_R=-5)
    bend = dict(shift, hip_flex_L=-2, knee_flex_L=95, ankle_plantar_L=5,
                arm_L={"flex": -25, "abd": 14}, elbow_flex_L=25, forearm_pron_L=20)
    # Catching the foot needs a straight arm, a slight lean towards it and a little arch of the back.
    grip = dict(shift, hip_flex_L=-2, knee_flex_L=134, ankle_plantar_L=30, spine_side=8, spine_flex=-4,
                arm_L={"flex": -30, "abd": 14}, elbow_flex_L=5, forearm_pron_L=20)
    stretch = dict(grip, hip_flex_L=-6, knee_flex_L=140, ankle_plantar_L=32)
    poses = [_side(p, side) for p in (base, shift, bend, grip, stretch)]
    base, shift, bend, grip, stretch = poses

    def ankle_grip(p):
        # The fingers hook over the top of the foot, just below the ankle, from the outside.
        R.apply_pose(p)
        a = R.world_point(f"{s}Foot").lerp(R.world_point(f"{s}ToeBase"), 0.6)
        out = Vector((0.035 if side == "L" else -0.035, 0, 0))
        return {f"{s}HandMiddle3": a + out}

    hand_reach = ([(f"arm_{side}", "flex"), (f"arm_{side}", "abd"), f"elbow_flex_{side}", "spine_flex"], ankle_grip)
    base = R.lock(base, both)
    chair = chair_support(base, (stance,))
    sup = R.points((f"{o}Hand", f"{o}HandMiddle1"), base)
    sup_reach = ([(f"arm_{stance}", "flex"), (f"arm_{stance}", "abd"), f"elbow_flex_{stance}"], sup)
    # Until the foot lifts, the leg being stretched keeps its foot on the floor. It lifts and lands
    # through a hover with the toes up, so the toes never sweep through the floor.
    foot_down = (leg_params(side, "hip_abd"), foot_targets(side))
    shift = settle(shift, plant, [foot_down, sup_reach])
    hover = dict(shift)
    for k, d in (("hip_flex", 8), ("knee_flex", 22), ("ankle_plantar", -12)):
        hover[f"{k}_{side}"] = shift.get(f"{k}_{side}", 0.0) + d
    grip = settle(grip, plant, [hand_reach, sup_reach], rounds=4)
    stretch = settle(stretch, plant, [hand_reach, sup_reach], rounds=4)
    free = {"reach": [sup_reach]}
    held = {"reach": [hand_reach, sup_reach]}
    planted = {"reach": [foot_down, sup_reach]}
    act, report = R.animate(f"EX_quad_stretch_{side}", base, [
        (base, 12, {"step": 6, **planted}), (shift, 24, planted), (hover, 12, free), (bend, 21, free), (grip, 21, free),
        (stretch, 36, held), (stretch, 120, {**held, "step": 10}), (grip, 30, held), (bend, 18, free),
        (hover, 18, free), (shift, 12, free), (base, 24, planted), (base, 18, {"step": 6, **planted}),
    ], locks=plant, reach=[sup_reach], rounds=2)
    report["props"] = [chair]
    return act, report


def single_leg_balance(side="L"):
    """Standing on one leg (side) beside a chair, hands hovering over it for safety. Shift the weight
    over the standing foot, lift the other foot and balance with small natural sway; put it down. 12 s."""
    lift = OTHER[side]
    plant = foot_targets(side)
    both = {**foot_targets("L"), **foot_targets("R")}
    hands = {"arm_L": {"flex": 34, "abd": 4}, "arm_R": {"flex": 34, "abd": 4}, "elbow_flex_L": 22, "elbow_flex_R": 22,
             "forearm_pron_L": 85, "forearm_pron_R": 85, "wrist_ext_L": 25, "wrist_ext_R": 25}
    base = dict(hands)
    # Weight over the standing foot: the hip adducts and the foot everts back to flat.
    shift = dict(hands, hip_abd_L=-5, ankle_inv_L=-5)
    up = dict(shift, hip_flex_R=36, knee_flex_R=62, ankle_plantar_R=-4)

    def sway(deg):
        # The whole body tips a little over the standing foot (an inverted pendulum), foot flat.
        return dict(up, root=[("y", deg)], ankle_inv_L=-5 - deg)

    keys = [base, shift, up, sway(1.2), sway(-1.0), sway(0.9), sway(-1.1), up]
    keys = [_side(k, side) for k in keys]
    base = R.lock(keys[0], both)
    chair = chair_support(base, ("L", "R"), gap=0.06)
    foot_down = (leg_params(lift, "hip_abd"), foot_targets(lift))
    shift = settle(keys[1], plant, [foot_down])
    # The foot leaves and returns through a hover with the toes up, so they never sweep the floor.
    hover = dict(shift)
    for k, d in (("hip_flex", 10), ("knee_flex", 18), ("ankle_plantar", -12)):
        hover[f"{k}_{lift}"] = shift.get(f"{k}_{lift}", 0.0) + d
    up, s1, s2, s3, s4, up2 = keys[2:]
    slow = {"step": 6}
    planted = {"reach": [foot_down]}
    act, report = R.animate(f"EX_single_leg_balance_{side}", base, [
        (shift, 30, planted), (hover, 12), (up, 21), (s1, 45, slow), (s2, 60, slow), (s3, 60, slow), (s4, 60, slow),
        (up2, 36, slow), (hover, 21), (shift, 12), (base, 30, planted), (base, 15, {**planted, **slow}),
    ], locks=plant)
    report["props"] = [chair]
    return act, report


def seated_base():
    """Sitting tall on a chair, shins vertical, feet flat; returns (pose, both feet targets)."""
    feet = R.points(FEET)
    sit = R.lock(squat_pose(pelvis_tilt=-4, thigh=88, knee=88), feet)
    targets = {**foot_targets("L", p=sit), **foot_targets("R", p=sit)}
    return sit, targets


def thigh_point(side, frac, lift=0.075, across=0.0):
    """A point on top of a thigh, `frac` of the way from hip to knee, for resting a hand on."""
    s = SIDE_NAME[side]
    hip, knee = R.world_point(f"{s}UpLeg"), R.world_point(f"{s}Leg")
    return hip.lerp(knee, frac) + Vector((across, 0, lift))


def hands_on_thighs(sides_fracs, bone="HandMiddle2"):
    """Reach that rests each hand (fingers) on a thigh. sides_fracs: {hand: (thigh side, frac, across)}.
    A frac given as a string is read from the pose (so hands can slide along the thigh)."""
    reach = []
    for hand, (thigh, frac, across) in sides_fracs.items():
        def target(p, hand=hand, thigh=thigh, frac=frac, across=across):
            R.apply_pose(p)
            f = p.get(frac, 0.5) if isinstance(frac, str) else frac
            return {f"{SIDE_NAME[hand]}{bone}": thigh_point(thigh, f, across=across)}
        reach.append(([(f"arm_{hand}", "flex"), (f"arm_{hand}", "abd"), f"elbow_flex_{hand}"], target))
    return reach


def seated_hamstring_stretch(side="L"):
    """Sitting on the front of a chair with the leg being stretched (side) straight out, heel on the
    floor and toes up. Keeping the back straight, lean forward from the hips until a stretch is felt
    behind the thigh; hold; sit back up. Hands slide down the thigh. 10 s."""
    other = OTHER[side]
    sit, feet = seated_base()
    chair_pose = dict(sit)
    rest = {"arm_L": {"flex": 30, "abd": 4}, "arm_R": {"flex": 30, "abd": 4}, "elbow_flex_L": 40, "elbow_flex_R": 40,
            "forearm_pron_L": 80, "forearm_pron_R": 80}
    start = dict(sit, **rest, label=0.42)
    start.update({f"knee_flex_{side}": 4, f"ankle_plantar_{side}": -12})

    def heel_gap(h):
        q = dict(start, **{f"hip_flex_{side}": h})
        return min(w.z for w in shoe(side, q))

    start[f"hip_flex_{side}"] = bisect(heel_gap, 88, 30)     # straight leg sloping down until the heel touches
    # The pelvis tips forward about the hip joints, which stay on the seat.
    hips = R.points(("LeftUpLeg", "RightUpLeg"), start)
    leg_t = foot_targets(side, p=start)
    tilt = 26
    lean = dict(start, root=[("x", -4 + tilt)], spine_flex=2, neck_flex=-0.4 * tilt, head_flex=-0.5 * tilt, label=0.78)
    reach = [(leg_params(other), {k: v for k, v in feet.items() if k.startswith(SIDE_NAME[other])}),
             (leg_params(side), leg_t)]
    # The hand on the stretched side slides down that thigh; the other rests on its own thigh.
    reach += hands_on_thighs({side: (side, "label", 0.0), other: (other, 0.55, 0.0)})
    start = settle(start, hips, reach)
    lean = settle(lean, hips, reach)
    chair = fit_chair(chair_pose, other)
    hold = {"step": 10}
    act, report = R.animate(f"EX_seated_hamstring_stretch_{side}", start, [
        (start, 15, hold), (lean, 60), (lean, 150, hold), (start, 60), (start, 15, hold),
    ], locks=hips, reach=reach)
    report["props"] = [chair]
    return act, report


def seated_calf_hold():
    """Sitting tall, hands pressing down on the knees, rise onto the balls of both feet and hold the
    heels up (an isometric calf hold); lower slowly. 10 s."""
    sit, feet = seated_base()
    chair = fit_chair(sit)
    hips = R.points(("Hips",), sit)
    hands = {"arm_L": {"flex": 40, "abd": 2}, "arm_R": {"flex": 40, "abd": 2}, "elbow_flex_L": 50, "elbow_flex_R": 50,
             "forearm_pron_L": 85, "forearm_pron_R": 85, "wrist_ext_L": 20, "wrist_ext_R": 20}
    down = dict(sit, **hands)
    up = dict(down, **_sym(ankle_plantar=34))
    tips = R.points(("LeftToeBase", "RightToeBase", "LeftToe_End", "RightToe_End"), sit)
    reach = []
    for sd in ("L", "R"):
        n = SIDE_NAME[sd]
        reach.append(([f"hip_flex_{sd}", f"knee_flex_{sd}", f"toe_ext_{sd}"], {f"{n}ToeBase": tips[f"{n}ToeBase"], f"{n}Toe_End": tips[f"{n}Toe_End"]}))

    # Hands rest on the lower thighs, pressing down; they ride up as the heels rise.
    reach += hands_on_thighs({"L": ("L", 0.6, 0.0), "R": ("R", 0.6, 0.0)})
    down = settle(down, hips, reach)
    up = settle(up, hips, reach)
    hold = {"step": 10}
    act, report = R.animate("EX_seated_calf_hold", down, [
        (down, 15, hold), (up, 30), (up, 180, hold), (down, 45), (down, 30, hold),
    ], locks=hips, reach=reach)
    report["props"] = [chair]
    return act, report


def seated_static_quads(side="L"):
    """Static thigh push in sitting (isometric, patellar tendon level 1). Sitting tall, the sore leg
    (side) straightens part-way (knee about 60 degrees bent) and the other ankle crosses in front of
    it. Push the sore leg forwards against the other leg, which pushes back so neither moves; hold. 12 s."""
    other = OTHER[side]
    sit, feet = seated_base()
    chair = fit_chair(sit)
    hips = R.points(("Hips",), sit)
    seat_hands = {"arm_L": {"flex": 8, "abd": 6}, "arm_R": {"flex": 8, "abd": 6}, "elbow_flex_L": 12, "elbow_flex_R": 12}
    base = dict(sit, **seat_hands)
    s, o = SIDE_NAME[side], SIDE_NAME[other]
    raised = dict(base, **{f"knee_flex_{side}": 62, f"hip_flex_{side}": base[f"hip_flex_{side}"] + 4, f"ankle_plantar_{side}": 5})

    def blocker(p):
        # The back of the other ankle rests across the front of the sore leg's shin, just above its ankle.
        R.apply_pose(p)
        shin = R.world_point(f"{s}Leg").lerp(R.world_point(f"{s}Foot"), 0.86)
        return {f"{o}Foot": shin + Vector((0, -0.075, 0.03))}

    cross = settle(dict(raised, **{f"knee_flex_{other}": 55, f"hip_abd_{other}": -12, f"ankle_plantar_{other}": 10}),
                   hips, [([f"hip_flex_{other}", f"hip_abd_{other}", f"knee_flex_{other}"], blocker)], rounds=3)
    push = dict(cross, **{f"knee_flex_{side}": 58, f"ankle_plantar_{side}": 0})
    block = [([f"hip_flex_{other}", f"hip_abd_{other}", f"knee_flex_{other}"], blocker)]
    push = settle(push, hips, block)
    lifted = dict(raised, **{f"knee_flex_{other}": 70, f"hip_flex_{other}": base[f"hip_flex_{other}"] + 6})
    hold = {"step": 10}
    act, report = R.animate(f"EX_seated_static_quads_{side}", base, [
        (base, 15, hold), (raised, 30), (lifted, 21), (cross, 24), (push, 24), (push, 210, {**hold, "reach": block}),
        (cross, 24, {"reach": block}), (lifted, 21), (raised, 21), (base, 30), (base, 15, hold),
    ], locks=hips, reach=None)
    report["props"] = [chair]
    return act, report


def long_sit(tilt=-10, ankle=12, **extra):
    """Sitting on a mat with both legs out straight, trunk slightly reclined, grounded so the heels
    and buttocks both touch the mat."""
    base = {"root": [("x", tilt)], "neck_flex": 4, "head_flex": 6, **extra}

    def legs(slope):
        return dict(base, **_sym(hip_flex=90 + tilt - slope, knee_flex=2, ankle_plantar=ankle))

    def gap(slope):
        R.apply_pose(legs(slope))
        hips = R.world_point("Hips")
        heels = min(w.z for w in mesh_points(("RH_Shoes",)))
        seat = min(w.z for w in mesh_points(("RH_Pants",), lambda w: abs(w.y - hips.y) < 0.15))
        return heels - seat

    return R.ground(legs(bisect(gap, -6, 20, iters=12)), MAT_TOP)


def towel_arms(flex, elbow, abd=-12):
    """Both hands in front of the body holding the ends of a towel (fists, thumbs up)."""
    return {"arm_L": {"flex": flex, "abd": abd}, "arm_R": {"flex": flex, "abd": abd},
            **_sym(elbow_flex=elbow, forearm_pron=10, wrist_ext=10, grip=75)}


def calf_towel_stretch(side="L"):
    """Sitting with the legs out straight, a towel looped around the ball of one foot (side). Keeping
    the knee straight, pull the towel to draw the toes and foot towards you until a stretch is felt in
    the calf; hold; ease off. 9 s."""
    poses = {
        "easy": towel_arms(52, 55),
        "pull": dict(towel_arms(44, 88), ankle_plantar_L=-14),
    }
    return _towel_build(f"EX_calf_towel_stretch_{side}", side, "ball", poses,
                        [("pull", 45, {}), ("pull", 150, {"step": 10}), ("easy", 45, {}), ("easy", 30, {"step": 10})])


def plantar_fascia_towel_stretch(side="L"):
    """Sitting with the legs out straight, a towel around the toes of one foot (side). Pull the towel
    to bend the toes and foot back towards you until a stretch is felt under the foot; hold. 9 s."""
    poses = {
        "easy": towel_arms(52, 55),
        "pull": dict(towel_arms(44, 86), ankle_plantar_L=-8, toe_ext_L=40),
    }
    return _towel_build(f"EX_plantar_fascia_towel_stretch_{side}", side, "toes", poses,
                        [("pull", 45, {}), ("pull", 150, {"step": 10}), ("easy", 45, {}), ("easy", 30, {"step": 10})])


def static_push_down(side="L"):
    """Static push down (isometric ankle strengthening). Sitting with the legs straight, a towel around
    the ball of one foot (side) held taut. Push the foot down into the towel as if pressing a pedal while
    the hands hold it still; hold; relax. 10 s."""
    poses = {
        "taut": dict(towel_arms(48, 70), ankle_plantar_L=0),
        "push": dict(towel_arms(48, 64), ankle_plantar_L=6),
    }
    return _towel_build(f"EX_static_push_down_{side}", side, "ball", poses,
                        [("push", 24, {}), ("push", 186, {"step": 10}), ("taut", 30, {}), ("taut", 60, {"step": 10})])


def _towel_build(name, side, at, poses, timing):
    """Long-sitting towel exercise, authored for the left foot. Every key is grounded the same way
    (relaxed feet) before its own arm and foot angles are applied, so the body never shifts on the mat."""
    import rh_props as P

    base = long_sit(**towel_arms(52, 55))    # ground with the hands already up on the towel
    keys = {k: _side(dict(base, **v), side) for k, v in poses.items()}
    first = keys[timing[-1][0]]
    hips = R.points(("LeftUpLeg", "RightUpLeg"), first)
    P.clear()
    heel_y = min(w.y for w in mesh_points(("RH_Shoes",), p=first))
    mat = P.mat(center_y=(hips["LeftUpLeg"].y + heel_y) / 2 + 0.05, length=1.6)
    strap = P.strap(foot=SIDE_NAME[side], at=at)
    act, report = R.animate(name, first, [(keys[k], f, o) for k, f, o in timing], locks=hips)
    report["props"] = [mat, strap]
    return act, report


def ankle_circles(side="L"):
    """Sitting with the legs out straight and a rolled towel under the lower calf of one leg (side) so
    the heel is clear of the mat. Draw slow circles with the foot, moving only at the ankle: two
    circles one way, then two the other way. 14 s."""
    import math as m
    import rh_props as P

    s = SIDE_NAME[side]
    base = long_sit()
    hips = R.points(("LeftUpLeg", "RightUpLeg"), base)
    radius = 0.04
    under_y = None

    def lift_gap(h):
        # How far the lower calf sits above the top of the towel roll.
        nonlocal under_y
        p = dict(base, **{f"hip_flex_{side}": base[f"hip_flex_{side}"] + h})
        R.apply_pose(R.lock(p, hips))
        a, k = R.world_point(f"{s}Foot"), R.world_point(f"{s}Leg")
        at = k.lerp(a, 0.72)
        under_y = at.y
        calf = [w for w in mesh_points(("RH_Pants",), lambda w: abs(w.y - at.y) < 0.03 and abs(w.x - at.x) < 0.08)]
        return min(w.z for w in calf) - (MAT_TOP + 2 * radius)

    lift = bisect(lift_gap, 0, 25, iters=14)
    rest = R.lock(dict(base, **{f"hip_flex_{side}": base[f"hip_flex_{side}"] + lift}), hips)
    lift_gap(lift)
    R.apply_pose(rest)
    leg_x = R.world_point(f"{s}Foot").x
    P.clear()
    heel_y = min(w.y for w in mesh_points(("RH_Shoes",), p=base))
    mat = P.mat(center_y=(hips["LeftUpLeg"].y + heel_y) / 2 + 0.05, length=1.6)
    roll = P.roll(x=leg_x, y=under_y, z=MAT_TOP, radius=radius, length=0.2)

    def foot(theta):
        # Circle in (pointing, turning in) space: up = toes towards you, then in, down, out.
        p = dict(rest)
        p[f"ankle_plantar_{side}"] = 8 - 24 * m.cos(theta)
        p[f"ankle_inv_{side}"] = 3 + 16 * m.sin(theta)
        return p

    steps = 8
    moves = [(foot(0), 18)]
    for direction in (1, -1):
        for lap in range(2):
            for i in range(1, steps + 1):
                moves.append((foot(direction * 2 * m.pi * i / steps), 12, {"ease": False, "step": 2}))
        moves.append((foot(0), 12, {"step": 6}))
    moves.append((rest, 18))
    act, report = R.animate(f"EX_ankle_circles_{side}", rest, moves, locks=hips)
    report["props"] = [mat, roll]
    return act, report


def static_quads(side="L"):
    """Static thigh tightening (quads set, patellar tendon level 1). Sitting with the legs out straight
    and a rolled towel under the knee. Tighten the front of the thigh to press the back of the knee
    down into the towel, pulling the toes up, so the heel lifts a little; hold; relax. 9 s."""
    import rh_props as P

    s = SIDE_NAME[side]
    base = long_sit()
    hips = R.points(("LeftUpLeg", "RightUpLeg"), base)
    radius = 0.035

    def rest_for(h):
        return R.lock(dict(base, **{f"hip_flex_{side}": base[f"hip_flex_{side}"] + h, f"knee_flex_{side}": 16,
                                    f"ankle_plantar_{side}": 14}), hips)

    def heel_gap(h):
        return min(w.z for w in shoe(side, rest_for(h))) - MAT_TOP

    rest = rest_for(bisect(heel_gap, 0, 25, iters=14))     # knee resting bent over the towel, heel on the mat
    R.apply_pose(rest)
    knee = R.world_point(f"{s}Leg")
    under = min(w.z for w in mesh_points(("RH_Pants",), lambda w: abs(w.y - knee.y) < 0.03 and abs(w.x - knee.x) < 0.08))
    press = dict(rest, **{f"knee_flex_{side}": 2, f"ankle_plantar_{side}": -12})
    P.clear()
    heel_y = min(w.y for w in mesh_points(("RH_Shoes",), p=base))
    mat = P.mat(center_y=(hips["LeftUpLeg"].y + heel_y) / 2 + 0.05, length=1.6)
    roll = P.roll(x=knee.x, y=knee.y, z=MAT_TOP, radius=round(max((under - MAT_TOP) / 2, radius), 4), length=0.2)
    hold = {"step": 10}
    act, report = R.animate(f"EX_static_quads_{side}", rest, [
        (rest, 15, hold), (press, 30), (press, 150, hold), (rest, 36), (rest, 39, hold),
    ], locks=hips)
    report["props"] = [mat, roll]
    return act, report


def hamstring_doorway_stretch(side="L"):
    """Lying on the back in a doorway: the leg being stretched (side) rests up the wall beside the door
    frame, the other leg lies straight through the doorway. Straighten the raised knee, sliding the
    heel up the wall, until a stretch is felt behind the thigh; hold; bend it again. 10 s."""
    import rh_props as P

    other = OTHER[side]
    s = SIDE_NAME[side]
    flat = R.ground(supine(**_leg(other, **STRAIGHT), **_leg(side, hip_flex=72, knee_flex=2, ankle_plantar=10),
                           arm_L={"flex": -6, "abd": 14}, arm_R={"flex": -6, "abd": 14}), MAT_TOP)
    hips = R.points(("LeftUpLeg", "RightUpLeg"), flat)
    straight = flat
    leg_pts = mesh_points(("RH_Shoes", "RH_Pants"), lambda w: (w.x > 0) == (side == "L") and w.z > 0.25, straight)
    face = min(w.y for w in leg_pts) - 0.002
    R.apply_pose(straight)
    d = R.world_point(f"{s}Foot").y - face             # ankle's distance in front of the wall

    def on_wall(p):
        R.apply_pose(p)
        a = R.world_point(f"{s}Foot")
        return {f"{s}Foot": Vector((a.x, face + d, a.z))}

    reach = [([f"hip_flex_{side}"], on_wall)]
    bent = settle(dict(straight, **{f"knee_flex_{side}": 32, f"ankle_plantar_{side}": 14}), hips, reach)
    P.clear()
    neck = R.points(("Neck",), straight)["Neck"]
    mat = P.mat(center_y=neck.y - 0.55, length=1.9)
    sx = 1 if side == "L" else -1
    wall = P.wall(face_y=face, width=1.0, x=sx * 0.52, height=2.2)
    hold = {"step": 10}
    act, report = R.animate(f"EX_hamstring_doorway_stretch_{side}", bent, [
        (bent, 12, hold), (straight, 60), (straight, 150, hold), (bent, 60), (bent, 18, hold),
    ], locks=hips, reach=reach)
    report["props"] = [mat, wall]
    return act, report


def eccentric_heel_drop(side="L"):
    """Eccentric heel drop, straight knee (Achilles). Standing on the balls of both feet on a step with
    the heels over the edge, hands on a wall. Rise up on both feet, take the other foot off and lower
    the sore side's heel slowly below the step (3 s), then put the other foot back to rise again. 8 s."""
    import rh_props as P

    h = 0.15
    up = Vector((0, 0, h))
    neutral = {**foot_targets("L"), **foot_targets("R")}
    on_step = {b: v + up for b, v in neutral.items()}
    balls = {b: v for b, v in on_step.items() if b.endswith("ToeBase")}
    w, o = side, OTHER[side]
    wn, on = SIDE_NAME[w], SIDE_NAME[o]
    hold_ball = {f"{wn}ToeBase": balls[f"{wn}ToeBase"]}
    other_foot = ([f"hip_flex_{o}", f"knee_flex_{o}"], {f"{on}ToeBase": balls[f"{on}ToeBase"]})
    # As the heel drops the ankle swings ~8 cm behind the ball of the foot and the body follows, so
    # the elbows start bent and straighten as it moves back.
    arms = wall_arms(40, 74, 80)

    def k(**angles):
        return _side(dict(arms, **angles), w)

    # Authored for the left side. Toes stay flat on the step: toe extension follows the foot's angle.
    up2 = R.lock(k(**_sym(ankle_plantar=30, toe_ext=30)), balls)
    contact, face, arm_reach = palms_on_wall(up2)
    lifted = dict(hip_flex_R=22, knee_flex_R=78, ankle_plantar_R=18, hip_abd_L=-4, ankle_inv_L=-4)
    up1 = settle(k(ankle_plantar_L=30, toe_ext_L=30, **lifted), hold_ball, arm_reach)
    down1 = settle(k(ankle_plantar_L=-16, toe_ext_L=-16, **lifted), hold_ball, arm_reach)
    down2 = settle(k(ankle_plantar_L=-16, toe_ext_L=-16, ankle_plantar_R=0, toe_ext_R=0, knee_flex_R=8),
                   hold_ball, [other_foot] + arm_reach, rounds=3)
    up2 = settle(up2, hold_ball, [other_foot] + arm_reach)
    P.clear()
    back_edge = balls[f"{wn}ToeBase"].y + 0.035          # heels hang over the edge
    depth = round(min(0.34, back_edge - face - 0.01), 3)
    step = P.step(h, front_y=back_edge - depth, depth=depth)
    wall = P.wall(face_y=face)
    both = {"reach": [other_foot] + arm_reach}
    act, report = R.animate(f"EX_eccentric_heel_drop_{side}", up2, [
        (up1, 18), (down1, 90), (down1, 6, {"step": 6}), (down2, 24), (up2, 36, both), (up2, 15, {**both, "step": 5}),
    ], locks=hold_ball, reach=arm_reach)
    report["props"] = [step, wall]
    return act, report


def plantar_fascia_loading(side="L"):
    """High-load plantar fascia strengthening (Rathleff). Standing on the sore foot (side) with a rolled
    towel under its toes, the other foot off the floor and hands on a wall. Rise up on the toes over
    3 s, hold 2 s, lower over 3 s. 9.5 s."""
    import rh_props as P

    w, o = side, OTHER[side]
    wn = SIDE_NAME[w]
    toe_up = 38
    arms = wall_arms(70, 40, 75)
    down = _side(dict(arms, toe_ext_L=toe_up, hip_flex_R=4, knee_flex_R=72, ankle_plantar_R=20,
                      hip_abd_L=-4, ankle_inv_L=-4), w)
    ball = foot_targets(w)
    ball = {f"{wn}ToeBase": ball[f"{wn}ToeBase"]}
    down = R.lock(down, ball)
    contact, face, arm_reach = palms_on_wall(down)
    rise = 32
    up = settle(dict(down, **{f"ankle_plantar_{w}": rise, f"toe_ext_{w}": toe_up + rise}), ball, arm_reach)
    # The towel roll sits under the middle of the raised toes, touching them.
    R.apply_pose(down)
    mid = R.world_point(f"{wn}ToeBase").lerp(R.world_point(f"{wn}Toe_End"), 0.55)
    toes = shoe(w, down)
    under = min((v.z for v in toes if abs(v.y - mid.y) < 0.012), default=0.02)
    P.clear()
    roll = P.roll(x=mid.x, y=mid.y, z=0.0, radius=round(max(under, 0.01) / 2, 4), length=0.16)
    wall = P.wall(face_y=face)
    hold = {"step": 6}
    act, report = R.animate(f"EX_plantar_fascia_loading_{side}", down, [
        (down, 15, hold), (up, 90), (up, 60, hold), (down, 90), (down, 30, hold),
    ], locks=ball, reach=arm_reach)
    report["props"] = [roll, wall]
    return act, report


def forward_step_up(side="L"):
    """Forward step-up. Facing a step, step up with the leg being strengthened (side), push through
    that heel to straighten the knee and bring the other foot up; step down with the other leg first,
    lowering slowly, then bring the first foot down. 7 s."""
    import rh_props as P

    w, o = side, OTHER[side]
    wn, on = SIDE_NAME[w], SIDE_NAME[o]
    h = 0.17
    floor = {w: foot_targets(w), o: foot_targets(o)}
    toe_y = min(v.y for v in mesh_points(("RH_Shoes",), p={}))
    heel_y = max(v.y for v in mesh_points(("RH_Shoes",), p={}))
    near = toe_y - 0.07                               # near edge of the step, just past the toes
    dy = (near - 0.03) - heel_y                       # heel lands 3 cm onto the step
    step_t = {s: {b: v + Vector((0, dy, h)) for b, v in floor[s].items()} for s in (w, o)}
    ball = {s: {b: v for b, v in floor[s].items() if b.endswith("ToeBase")} for s in (w, o)}
    lean = lambda t: {"root": [("x", t)], "neck_flex": -0.3 * t, "head_flex": -0.4 * t}

    def k(**angles):
        return _side(angles, w)

    def on_step(t, hip, knee, **other):
        # The stepping foot stays flat on the step: ankle = hip - knee - trunk lean.
        return k(**lean(t), hip_flex_L=hip, knee_flex_L=knee, ankle_plantar_L=hip - knee - t, **other)

    # While the other foot stands on the floor with its leg straight, it stays flat: ankle = -lean.
    stand = R.lock({}, {**floor["L"], **floor["R"]})
    lift_w = k(**lean(5), hip_flex_L=68, knee_flex_L=92, ankle_plantar_L=-4, ankle_plantar_R=-5)
    place_w = settle(k(**lean(10), hip_flex_L=62, knee_flex_L=78, ankle_plantar_L=6, ankle_plantar_R=-10),
                     floor[o], [(leg_params(w), step_t[w])])
    # Double support (one foot on the step, one on the floor): the hips are placed between the feet
    # and both legs are solved, so each foot is exactly on its own surface.
    hips0 = R.points(("Hips",))["Hips"]
    w_y, o_y = step_t[w][f"{wn}Foot"].y, floor[o][f"{on}Foot"].y

    def between(frac_to_step, z, pose, other_reach):
        hip_pt = Vector((hips0.x, o_y + (w_y - o_y) * frac_to_step, z))
        return settle(pose, {"Hips": hip_pt}, [(leg_params(w), step_t[w]), other_reach], rounds=3)

    push = between(0.62, hips0.z + 0.02, on_step(16, 62, 72, ankle_plantar_R=20, toe_ext_R=20),
                   ([f"hip_flex_{o}", f"knee_flex_{o}"], ball[o]))
    rise_w = on_step(8, 24, 22, hip_flex_R=48, knee_flex_R=92, ankle_plantar_R=5)
    top = settle(k(), step_t[w], [(leg_params(o), step_t[o])])
    off_o = on_step(4, 12, 20, hip_flex_R=6, knee_flex_R=62, ankle_plantar_R=-8)
    land_o = between(0.5, hips0.z - 0.06, on_step(8, 48, 62), (leg_params(o), floor[o]))
    off_w = k(**lean(4), hip_flex_L=50, knee_flex_L=82, ankle_plantar_L=-6, ankle_plantar_R=-4)
    on_w = {"locks": step_t[w]}
    on_o = {"locks": floor[o]}
    act, report = R.animate(f"EX_forward_step_up_{side}", stand, [
        (lift_w, 18, on_o), (place_w, 15, on_o),
        (push, 24, {"locks": step_t[w], "reach": [([f"hip_flex_{o}", f"knee_flex_{o}"], ball[o])]}),
        (rise_w, 21, on_w), (top, 18, on_w), (top, 15, {**on_w, "step": 5}),
        (off_o, 18, on_w), (land_o, 27, on_w),
        (off_w, 18, on_o), (stand, 21, on_o), (stand, 18, {"locks": {**floor["L"], **floor["R"]}, "step": 6}),
    ], locks=floor[o])
    P.clear()
    step = P.step(h, front_y=near - 0.42, depth=0.42)
    report["props"] = [step]
    return act, report


def single_leg_decline_squat(side="L"):
    """Single-leg squat on a 25-degree decline board (patellar tendon loading). Standing on the sore leg
    (side) on the board, toes pointing down the slope, the other leg held off the board. Squat slowly
    to about 60 degrees of knee bend (3 s) keeping the knee over the toes, then stand back up (2 s). 7 s."""
    import math as m
    import rh_props as P

    w, o = side, OTHER[side]
    wn = SIDE_NAME[w]
    slope = 25
    arms = {"arm_L": {"flex": 70, "abd": 4}, "arm_R": {"flex": 70, "abd": 4}, **_sym(elbow_flex=12)}
    shift = dict(hip_abd_L=-4, ankle_inv_L=-4)
    free = dict(hip_flex_R=34, knee_flex_R=60, ankle_plantar_R=10)
    top = _side(dict(arms, **shift, **free, ankle_plantar_L=slope), w)
    # Place the board under the foot, then lower the body until the sole rests on the slope.
    sole = shoe(w, top)
    toe_y = min(v.y for v in sole)
    foot_x = sum(v.x for v in sole) / len(sole)
    depth = 0.5
    rise = depth * m.tan(m.radians(slope))
    front = toe_y - 0.06
    board = {"frontY": front, "depth": depth, "rise": rise}
    gap = min(v.z - P.slope_z(board, v.y) for v in sole)
    top["hips"] = tuple(Vector(top.get("hips", (0, 0, 0))) - Vector((0, 0, gap)))
    plant = foot_targets(w, p=top)

    def squat(tilt, thigh, knee):
        hip = thigh + tilt
        # The free foot stays well clear of the floor as the body lowers.
        p = dict(arms, **shift, hip_flex_R=52, knee_flex_R=92, ankle_plantar_R=10,
                 root=[("x", tilt)], hip_flex_L=hip, knee_flex_L=knee, ankle_plantar_L=slope - tilt + hip - knee,
                 neck_flex=-0.4 * tilt, head_flex=-0.5 * tilt)
        p["arm_L"] = {"flex": 70 + tilt, "abd": 4}
        p["arm_R"] = {"flex": 70 + tilt, "abd": 4}
        return _side(p, w)

    bottom = R.lock(squat(16, 46, 60), plant)
    P.clear()
    wedge = P.wedge(front_y=front, depth=depth, rise=rise, width=0.3, x=foot_x)
    hold = {"step": 5}
    act, report = R.animate(f"EX_single_leg_decline_squat_{side}", top, [
        (top, 12, hold), (bottom, 90), (bottom, 12, hold), (top, 60), (top, 36, hold),
    ], locks=plant)
    report["props"] = [wedge]
    return act, report


def heel_to_toe_walking():
    """Heel-to-toe (tandem) walking along a line, arms out for balance: each step puts the heel right
    in front of the other foot's toes. Two steps per loop (3.2 s); the clip travels forwards, and the
    viewer keeps the walker centred."""
    import rh_props as P

    hips0 = R.points(("Hips",))["Hips"]
    neutral = {s: foot_targets(s) for s in ("L", "R")}
    y_n = neutral["L"]["LeftFoot"].y
    sole = shoe("L", {})
    length = max(v.y for v in sole) - min(v.y for v in sole) + 0.005

    def foot_at(side, ankle_y):
        n = SIDE_NAME[side]
        base = neutral[side]
        off = 0.012 if side == "L" else -0.012           # either side of the line, so heel meets toe
        shift = Vector((off - base[f"{n}Foot"].x, ankle_y - base[f"{n}Foot"].y, 0))
        return {b: v + shift for b, v in base.items()}

    arms = {"arm_L": {"flex": 8, "abd": 32}, "arm_R": {"flex": 8, "abd": 32}, **_sym(elbow_flex=18), "neck_flex": 8}

    def flat_feet(p):
        # A foot whose leg is adducted rolls with it; turning the ankle by the same angle keeps it flat.
        for s in ("L", "R"):
            p[f"ankle_inv_{s}"] = p.get(f"hip_abd_{s}", 0.0)
        return p

    def double(front, front_y, back_y):
        back = OTHER[front]
        mid = (front_y + back_y) / 2
        hip_pt = Vector((0.0, mid + (hips0.y - y_n), hips0.z - 0.02))
        feet = {front: foot_at(front, front_y), back: foot_at(back, back_y)}
        p = dict(arms, **{f"hip_flex_{front}": 10, f"hip_flex_{back}": -10, **_sym(hip_abd=-5)})
        p = settle(p, {"Hips": hip_pt}, [(leg_params(s, "hip_abd"), feet[s]) for s in ("L", "R")], rounds=3)
        return flat_feet(p), feet

    def heel_off(ds, stance, swing, swing_feet):
        p = dict(ds)
        p[f"hip_flex_{stance}"] = ds[f"hip_flex_{stance}"] - 3
        p[f"ankle_plantar_{stance}"] = ds[f"ankle_plantar_{stance}"] - 3
        p[f"ankle_plantar_{swing}"] = 18
        p[f"toe_ext_{swing}"] = 18
        # Ball of the foot and the toe tips stay on the floor while the heel lifts.
        n = SIDE_NAME[swing]
        ball = {b: v for b, v in swing_feet.items() if b.endswith("ToeBase")}
        ball.update(R.points((f"{n}Toe_End",), ds))
        return p, ([f"hip_flex_{swing}", f"knee_flex_{swing}", f"hip_abd_{swing}", f"toe_ext_{swing}"], ball)

    def toe_off(ds, off, stance, swing):
        # The knee bends more than the thigh comes forward, so the foot lifts before the leg swings
        # forward (swinging the thigh first would sweep the foot down through the floor); the toes stay
        # bent up as they leave the floor.
        p = dict(ds)
        p[f"hip_flex_{stance}"] = off[f"hip_flex_{stance}"]
        p[f"ankle_plantar_{stance}"] = off[f"ankle_plantar_{stance}"]
        p.update({f"hip_flex_{swing}": off[f"hip_flex_{swing}"] + 10, f"knee_flex_{swing}": 40, f"ankle_plantar_{swing}": 6,
                  f"toe_ext_{swing}": off[f"toe_ext_{swing}"]})
        return p

    def mid_swing(ds, stance, swing):
        p = dict(ds)
        p[f"hip_flex_{stance}"] = ds[f"hip_flex_{stance}"] - 14
        p[f"ankle_plantar_{stance}"] = ds[f"ankle_plantar_{stance}"] - 14
        p.update({f"hip_flex_{swing}": 22, f"knee_flex_{swing}": 46, f"ankle_plantar_{swing}": -14,
                  f"hip_abd_{swing}": 4, f"ankle_inv_{swing}": 0, f"toe_ext_{swing}": 0})
        return p

    def pre_land(ds_next, swing):
        # Foot hovering just above where it lands, toes up, so it comes down heel first.
        p = dict(ds_next)
        for k, d in (("hip_flex", 6), ("knee_flex", 14), ("ankle_plantar", -12)):
            p[f"{k}_{swing}"] = ds_next[f"{k}_{swing}"] + d
        return p

    yL0 = y_n - length / 2
    yR0 = yL0 + length
    yR1 = yL0 - length
    yL1 = yR1 - length
    ds_a, feet_a = double("L", yL0, yR0)
    ds_b, feet_b = double("R", yR1, yL0)
    ds_a2, feet_a2 = double("L", yL1, yR1)
    off_r, ball_r = heel_off(ds_a, "L", "R", feet_a["R"])
    off_r = settle(off_r, feet_a["L"], [ball_r])
    off_l, ball_l = heel_off(ds_b, "R", "L", feet_b["L"])
    off_l = settle(off_l, feet_b["R"], [ball_l])
    on_l, on_r = {"locks": feet_a["L"]}, {"locks": feet_b["R"]}
    act, report = R.animate("EX_heel_to_toe_walking", ds_a, [
        (off_r, 10, {**on_l, "reach": [ball_r]}), (toe_off(ds_a, off_r, "L", "R"), 8, on_l), (mid_swing(ds_a, "L", "R"), 12, on_l),
        (pre_land(ds_b, "R"), 10, on_l), (ds_b, 8, on_l),
        (off_l, 10, {**on_r, "reach": [ball_l]}), (toe_off(ds_b, off_l, "R", "L"), 8, on_r), (mid_swing(ds_b, "R", "L"), 12, on_r),
        (pre_land(ds_a2, "L"), 10, on_r), (ds_a2, 8, on_r),
    ], step=2)
    P.clear()
    report["props"] = [P.line()]
    report["travel"] = round(2 * length, 3)
    return act, report


# ─── Lower back and hip pack (Oct 2026) ──────────────────────────────────────────────────

FEET_POINTS = ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")


def _supine_scene(start):
    """Mat under a supine pose; the neck point that holds the upper body still."""
    import rh_props as P

    neck = R.points(("Neck",), start)
    P.clear()
    return neck, P.mat(center_y=neck["Neck"].y - 0.55)


def knee_rolling():
    """Lying on the back, knees bent and feet flat. Keeping the shoulders on the mat, let both knees
    roll slowly to one side, back to the middle, then over to the other side. 9.5 s."""
    start = hook_lying()
    neck, mat = _supine_scene(start)
    feet = R.points(FEET_POINTS, start)
    shoulders = R.points(("LeftArm", "RightArm"), start)

    def roll(deg):
        # Knees fall to one side together: the pelvis rolls part of the way about the body's long axis,
        # the hips rotate the rest (one turns out, the other in); the chest turns back so the shoulders
        # stay down, and the feet stay on the mat.
        sign = 1 if deg > 0 else -1
        lead, trail = ("L", "R") if deg > 0 else ("R", "L")
        return dict(start, root=[("x", -90), ("y", deg * 0.45)],
                    **{f"hip_ext_rot_{lead}": abs(deg) * 0.9, f"hip_ext_rot_{trail}": -abs(deg) * 0.6})

    reach = _foot_reach(feet, extra=("hip_abd",)) + [(["spine_rot"], shoulders)]
    left, right = settle(roll(36), neck, reach, rounds=3), settle(roll(-36), neck, reach, rounds=3)
    hold = {"step": 6}
    act, report = R.animate("EX_knee_rolling", start, [
        (left, 60), (left, 30, hold), (start, 45), (right, 60), (right, 30, hold), (start, 45), (start, 15, hold),
    ], locks=neck, reach=reach, rounds=2)
    report["props"] = [mat]
    return act, report


def pelvic_rocking():
    """Lying on the back, knees bent. Gently flatten the lower back into the mat by tilting the pelvis,
    then arch it a little; rock slowly between the two. 7 s."""
    start = hook_lying()
    neck, mat = _supine_scene(start)
    feet = R.points(FEET_POINTS, start)

    def tilt(d):
        # d > 0 tucks the pelvis (back flattens); the lumbar spine bends the same amount the other way.
        return dict(start, root=[("x", -90 - d)], spine_flex=d)

    reach = _foot_reach(feet)
    flat, arch = settle(tilt(9), neck, reach), settle(tilt(-8), neck, reach)
    hold = {"step": 6}
    act, report = R.animate("EX_pelvic_rocking", start, [
        (flat, 42), (flat, 24, hold), (arch, 60), (arch, 24, hold), (start, 45), (start, 15, hold),
    ], locks=neck, reach=reach)
    report["props"] = [mat]
    return act, report


def _seated_trunk(sit, tilt, spine):
    """Seated pose with the pelvis rolled by `tilt` and the spine bent by `spine`; eyes stay level."""
    trunk = tilt + spine
    return dict(sit, root=[("x", -4 + tilt)], spine_flex=spine, neck_flex=-0.45 * trunk, head_flex=-0.45 * trunk)


def sitting_pelvic_rocking():
    """Sitting on a firm chair, feet flat. Slowly roll the pelvis back so the lower back slumps a
    little, then roll it forward to sit tall with a small arch. 8 s."""
    sit, feet = seated_base()
    chair = fit_chair(sit)
    hips = R.points(("LeftUpLeg", "RightUpLeg"), sit)
    reach = [(leg_params(s), {k: v for k, v in feet.items() if k.startswith(SIDE_NAME[s])}) for s in ("L", "R")]
    reach += hands_on_thighs({"L": ("L", 0.55, 0.0), "R": ("R", 0.55, 0.0)})
    rest = settle(_seated_trunk(sit, 0, 0), hips, reach)
    slump = settle(_seated_trunk(sit, -12, 16), hips, reach)
    tall = settle(_seated_trunk(sit, 9, -7), hips, reach)
    hold = {"step": 6}
    act, report = R.animate("EX_sitting_pelvic_rocking", rest, [
        (slump, 54), (slump, 24, hold), (tall, 72), (tall, 24, hold), (rest, 45), (rest, 21, hold),
    ], locks=hips, reach=reach)
    report["props"] = [chair]
    return act, report


def forward_bend_sitting():
    """Sitting on a chair with the feet apart, slowly bend forwards and let the hands slide down
    towards the floor; hold, then slowly sit up. 8 s."""
    sit, feet0 = seated_base()
    chair = fit_chair(sit)
    hips = R.points(("LeftUpLeg", "RightUpLeg"), sit)
    feet = {b: v + Vector((0.09 if b.startswith("Left") else -0.09, 0, 0)) for b, v in feet0.items()}
    reach = [(leg_params(s, "hip_abd"), {k: v for k, v in feet.items() if k.startswith(SIDE_NAME[s])}) for s in ("L", "R")]
    hands = {"arm_L": {"flex": 6, "abd": 6}, "arm_R": {"flex": 6, "abd": 6}, **_sym(elbow_flex=12)}
    up = settle(dict(sit, **hands), hips, reach)
    # Arms hang towards the floor: with the trunk bent ~80 degrees they are flexed about as much.
    down = settle(dict(up, root=[("x", 36)], spine_flex=42, neck_flex=16, head_flex=10,
                       arm_L={"flex": 72, "abd": 4}, arm_R={"flex": 72, "abd": 4}), hips, reach)
    hold = {"step": 6}
    act, report = R.animate("EX_forward_bend_sitting", up, [
        (up, 12, hold), (down, 66), (down, 54, hold), (up, 66), (up, 42, hold),
    ], locks=hips, reach=reach)
    report["props"] = [chair]
    return act, report


def childs_pose():
    """Child's pose: from hands and knees, sit back towards the heels with the arms stretched forward
    on the mat and the head relaxed down; hold, then come back up. 9 s."""
    import rh_props as P

    base = four_point_kneel()
    knees, hands, feet = _kneel_contacts(base)
    P.clear()
    mat = P.mat(center_y=-0.05)
    # The shins stay on the mat, so as the knees bend the thighs fold back over them: the shin's
    # angle (pelvis tilt - hip flexion + knee flexion) is held at its hands-and-knees value. The
    # trunk tilt that best keeps the hands on their spots is found by a scan; the arms do the rest.
    trunk = base["root"][0][1]
    shin = {s: trunk - base[f"hip_flex_{s}"] + base[f"knee_flex_{s}"] for s in ("L", "R")}
    # The hands walk forward along the mat as the hips sit back ("label" goes 0 -> 1), and the
    # wrists keep the palms flat.
    palm_names = [f"{n}{b}" for n in ("Left", "Right") for b in ("Hand",) + PALM]
    palms = R.points(palm_names, base)
    reach_forward = 0.14

    def palm_targets(p, names):
        shift = Vector((0, -reach_forward * p.get("label", 0.0), 0))
        return {n: palms[n] + shift for n in names}

    arm_reach = []
    for s in ("L", "R"):
        n = SIDE_NAME[s]
        arm_reach.append(([(f"arm_{s}", "flex"), (f"arm_{s}", "abd"), f"elbow_flex_{s}"],
                          lambda p, n=n: palm_targets(p, [f"{n}Hand"])))
        arm_reach.append(([f"wrist_ext_{s}", f"forearm_pron_{s}", f"wrist_dev_{s}"],
                          lambda p, n=n: palm_targets(p, [f"{n}{b}" for b in PALM])))
    toes = R.points(("LeftToeBase", "RightToeBase"), base)
    foot_reach = [([f"ankle_plantar_{s}"], {f"{SIDE_NAME[s]}ToeBase": toes[f"{SIDE_NAME[s]}ToeBase"]}) for s in ("L", "R")]

    def folded(knee, tilt, spine):
        p = dict(base, root=[("x", tilt)], spine_flex=spine, neck_flex=-10 + spine * 1.1, head_flex=spine * 0.5, label=1.0)
        for s in ("L", "R"):
            p[f"knee_flex_{s}"] = knee
            p[f"hip_flex_{s}"] = tilt - shin[s] + knee
        return settle(p, knees, arm_reach + foot_reach, rounds=1)

    def hand_error(p):
        R.apply_pose(p)
        return R.lock_error(palm_targets(p, ["LeftHand", "RightHand"]))

    knee = 144
    tilt = min(range(int(trunk), int(trunk) + 70, 5), key=lambda t: hand_error(folded(knee, t, 26)))
    tilt = min((tilt + d for d in (-3, -1.5, 0, 1.5, 3)), key=lambda t: hand_error(folded(knee, t, 26)))
    child = folded(knee, tilt, 26)

    def head_gap(neck):
        # Forehead resting on the mat, not sunk into it.
        R.apply_pose(dict(child, neck_flex=neck))
        h = R.world_point("Head")
        return min(w.z for w in mesh_points(("RH_Body1", "RH_Cap", "RH_Mask"), lambda w: (w - h).length < 0.16)) - MAT_TOP

    child = dict(child, neck_flex=bisect(head_gap, child["neck_flex"], -40, iters=12))
    base = dict(base, label=0.0)
    hold = {"step": 6}
    act, report = R.animate("EX_childs_pose", base, [
        (base, 12, hold), (child, 72), (child, 120, hold), (base, 60), (base, 6, hold),
    ], locks=knees, reach=arm_reach + foot_reach)
    report["tilt"] = tilt
    report["props"] = [mat]
    return act, report


def sciatic_nerve_glide(side="L"):
    """Sciatic nerve glide (slider). Sitting slightly slumped, straighten one knee while looking up,
    then bend it again as you look down. Smooth and rhythmic, never held at the end. 3.6 s."""
    other = OTHER[side]
    sit, feet = seated_base()
    chair = fit_chair(sit)
    hips = R.points(("LeftUpLeg", "RightUpLeg"), sit)
    reach = [(leg_params(other), {k: v for k, v in feet.items() if k.startswith(SIDE_NAME[other])})]
    reach += hands_on_thighs({"L": ("L", 0.5, 0.0), "R": ("R", 0.5, 0.0)})
    slump = dict(sit, spine_flex=14)
    down = settle(dict(slump, neck_flex=20, head_flex=14), hips, reach)
    up = settle(dict(slump, neck_flex=-14, head_flex=-10, **{f"knee_flex_{side}": 18, f"ankle_plantar_{side}": -8,
                                                            f"hip_flex_{side}": sit[f"hip_flex_{side}"] + 3}), hips, reach)
    hold = {"step": 6}
    act, report = R.animate(f"EX_sciatic_nerve_glide_{side}", down, [
        (up, 42), (up, 9, hold), (down, 48), (down, 9, hold),
    ], locks=hips, reach=reach)
    report["props"] = [chair]
    return act, report


def femoral_nerve_glide(side="L"):
    """Femoral nerve glide, lying on the side with the sore leg (side) on top. Hold the top ankle, bend
    the knee and take the hip gently back, then return; keep it gentle and rhythmic. 4 s.
    side names the top leg: L lies on the right side."""
    import rh_props as P

    s = SIDE_NAME[side]
    start = side_lying(hip_flex_L=12, knee_flex_L=72, ankle_plantar_L=25, arm_L={"flex": -20, "abd": -10}, elbow_flex_L=20)
    glide = dict(start, hip_flex_L=-14, knee_flex_L=112, ankle_plantar_L=30)
    if side == "R":
        start, glide = R.ground(R.mirror(start), MAT_TOP), R.mirror(glide)
    P.clear()
    mat = P.mat(center_y=0.0, along="x", length=1.9)
    pillow = head_pillow(start)

    def ankle_grip(p):
        R.apply_pose(p)
        a = R.world_point(f"{s}Foot").lerp(R.world_point(f"{s}ToeBase"), 0.45)
        return {f"{s}HandMiddle3": a + Vector((0, 0, 0.035))}     # over the top of the ankle

    reach = [([(f"arm_{side}", "flex"), (f"arm_{side}", "abd"), f"elbow_flex_{side}", "spine_flex"], ankle_grip)]
    start, glide = settle(start, None, reach, rounds=3), settle(glide, None, reach, rounds=3)
    hold = {"step": 6}
    act, report = R.animate(f"EX_femoral_nerve_glide_{side}", start, [
        (glide, 45), (glide, 9, hold), (start, 54), (start, 12, hold),
    ], reach=reach)
    report["props"] = [mat, pillow]
    return act, report


def chair_squat():
    """Chair squat: standing in front of a chair, push the hips back and bend the knees until the
    buttocks lightly touch the seat, then stand straight back up without sitting. 5 s."""
    feet = R.points(FEET)
    stand = {"arm_L": {"flex": 80}, "arm_R": {"flex": 80}}
    touch = R.lock(squat_pose(pelvis_tilt=34, thigh=74, knee=94, arm_flex=80), feet)
    chair = fit_chair(touch)
    hold = {"step": 6}
    act, report = R.animate("EX_chair_squat", stand, [
        (touch, 60), (touch, 9, hold), (stand, 54), (stand, 27, hold),
    ], locks=feet)
    report["props"] = [chair]
    return act, report


def static_hip_pushout():
    """Static hip push-out (gluteal tendinopathy, isometric). Lying on the back, knees bent, a belt
    round the knees. Press the knees gently outwards into the belt without moving; hold; relax. 8.5 s."""
    import rh_props as P

    start = hook_lying()
    neck, mat = _supine_scene(start)
    feet = R.points(FEET_POINTS, start)
    reach = _foot_reach(feet, extra=("hip_abd",))
    press = settle(dict(start, **_sym(hip_ext_rot=5)), neck, reach)
    hold = {"step": 10}
    act, report = R.animate("EX_static_hip_pushout", start, [
        (start, 15, hold), (press, 30), (press, 150, hold), (start, 30), (start, 30, hold),
    ], locks=neck, reach=reach)
    report["props"] = [mat, P.strap(at="knees")]
    return act, report


def pelvic_dips(side="L"):
    """Pelvic dips on a step (gluteal tendinopathy). Standing side-on on a step on the sore leg (side),
    hands on hips, the other leg hanging free. Keeping the standing knee straight, let the other hip
    drop slowly, then lift it back up with the muscles at the side of the standing hip. 5 s."""
    import rh_props as P

    w, wn = side, SIDE_NAME[side]
    h = 0.15
    plant = {b: v + Vector((0, 0, h)) for b, v in foot_targets(w).items()}
    akimbo = {"arm_L": {"flex": 8, "abd": 34}, "arm_R": {"flex": 8, "abd": 34}, **_sym(elbow_flex=100, forearm_pron=40)}
    base = dict(akimbo, knee_flex_R=6)
    level = R.lock(_side(base, side), plant)
    hip = R.points((f"{wn}UpLeg",), level)
    stance = [(leg_params(w, "hip_abd"), plant)]
    # Authored for the left leg standing: the right side of the pelvis drops (rotation about the
    # standing hip), the trunk stays upright and the free leg keeps hanging clear of the step.
    drop = _side(dict(base, root=[("y", -12)], spine_side=9, hip_abd_R=13, knee_flex_R=8), side)
    drop = settle(drop, hip, stance, rounds=3)
    foot_x = plant[f"{wn}Foot"].x
    ball_y = plant[f"{wn}ToeBase"].y
    P.clear()
    step = P.step(h, front_y=round(ball_y - 0.24, 3), depth=0.42, width=0.3, x=round(foot_x + (0.06 if side == "L" else -0.06), 3))
    hold = {"step": 6}
    act, report = R.animate(f"EX_pelvic_dips_{side}", level, [
        (drop, 54), (drop, 12, hold), (level, 54), (level, 30, hold),
    ], locks=hip, reach=stance, rounds=2)
    report["props"] = [step]
    return act, report


def side_lying_hip_lift(side="L"):
    """Side-lying hip lift. Lying on the side, bottom knee bent and top leg (side) straight. Lift the
    top leg slowly, keeping it slightly behind you with the toes pointing forwards; lower. 5 s.
    side names the top leg: L lies on the right side."""
    import rh_props as P

    start = side_lying(hip_flex_L=4, knee_flex_L=3, ankle_plantar_L=12)
    lifted = dict(start, hip_abd_L=32, hip_flex_L=-6)
    if side == "R":
        start, lifted = R.ground(R.mirror(start), MAT_TOP), R.mirror(lifted)
    P.clear()
    mat = P.mat(center_y=0.0, along="x", length=1.9)
    pillow = head_pillow(start)
    hold = {"step": 6}
    act, report = R.animate(f"EX_side_lying_hip_lift_{side}", start, [
        (start, 12, hold), (lifted, 45), (lifted, 24, hold), (start, 54), (start, 15, hold),
    ])
    report["props"] = [mat, pillow]
    return act, report


def buttock_squeeze():
    """Buttock squeeze, lying on the back with the legs straight: squeeze the buttocks together and
    hold, then relax fully. 8 s."""
    start = R.ground(supine(**_sym(**STRAIGHT), arm_L={"flex": -6, "abd": 14}, arm_R={"flex": -6, "abd": 14}), MAT_TOP)
    neck, mat = _supine_scene(start)
    squeeze = dict(start, **_sym(hip_ext_rot=7, hip_flex=-2))
    hold = {"step": 10}
    act, report = R.animate("EX_buttock_squeeze", start, [
        (start, 15, hold), (squeeze, 21), (squeeze, 150, hold), (start, 24), (start, 30, hold),
    ], locks=neck)
    report["props"] = [mat]
    return act, report


def pendulum_leg_swing(side="L"):
    """Pendulum leg swings (hip osteoarthritis). Standing on a step on the other leg with a hand on a
    wall, let the sore leg (side) hang free and swing gently forwards and back. Relaxed, never forced.
    6.5 s. Authored with the left leg standing."""
    import rh_props as P

    w, o = OTHER[side], side
    side = w   # the poses below are authored for the standing leg
    wn = SIDE_NAME[w]
    h = 0.15
    plant = {b: v + Vector((0, 0, h)) for b, v in foot_targets(w).items()}
    shift = dict(hip_abd_L=-4, ankle_inv_L=-4, hip_abd_R=7)

    def leg(hip, knee, ankle):
        return _side(dict(wall_arms(70, 25, 75, sides=("L",)), **shift, hip_flex_R=hip, knee_flex_R=knee,
                          ankle_plantar_R=ankle), side)

    hang = R.lock(leg(0, 12, 8), plant)
    contact, face, arm_reach = palms_on_wall(hang, sides=(w,))
    fwd, back = leg(22, 14, 2), leg(-20, 22, 14)
    foot_x = plant[f"{wn}Foot"].x
    ball_y = plant[f"{wn}ToeBase"].y
    P.clear()
    step = P.step(h, front_y=round(ball_y - 0.24, 3), depth=0.42, width=0.3, x=round(foot_x + (0.06 if side == "L" else -0.06), 3))
    wall = P.wall(face_y=face)
    act, report = R.animate(f"EX_pendulum_leg_swing_{o}", hang, [
        (fwd, 30), (back, 45), (fwd, 45), (back, 45), (hang, 30),
    ], locks=plant, reach=arm_reach)
    report["props"] = [step, wall]
    return act, report


def wall_slide(name, bottom_knee, timing):
    """Back flat against a wall behind, feet forward: slide down by bending the knees, then back up.
    timing: list of ("down" | "up" | "hold", frames)."""
    import rh_props as P

    feet = {**foot_targets("L"), **foot_targets("R")}
    hips0 = R.points(("Hips",))["Hips"]
    hip_y = hips0.y + 0.40                      # hips 40 cm behind the feet
    arms = {"arm_L": {"flex": 14, "abd": 10}, "arm_R": {"flex": 14, "abd": 10}, "elbow_flex_L": 10, "elbow_flex_R": 10}

    def at(z):
        return dict(arms, label=z, **_sym(hip_flex=40, knee_flex=40, ankle_plantar=0))

    def hips_lock(p):
        return {"Hips": Vector((hips0.x, hip_y, p["label"]))}

    reach = _foot_reach(feet)
    # Top: knees softly bent; bottom: found by solving for the knee angle asked for.
    top = settle(at(hips0.z - 0.10), hips_lock, reach, rounds=1)

    def knee_at(z):
        return settle(at(z), hips_lock, reach, rounds=1)["knee_flex_L"] - bottom_knee

    z_bot = bisect(knee_at, hips0.z - 0.10, hips0.z - 0.55, iters=14)
    bottom = settle(at(z_bot), hips_lock, reach, rounds=1)
    R.apply_pose(top)
    torso = mesh_points(("RH_Shirt", "RH_Pants"), lambda w: w.z > 0.45)
    face = max(w.y for w in torso) + 0.002
    P.clear()
    wall = P.wall(face_y=face, behind=True)
    moves = []
    for kind, frames in timing:
        target = bottom if kind in ("down", "hold") else top
        moves.append((target, frames, {"step": 10} if kind == "hold" else {}))
    act, report = R.animate(name, top, moves, locks=hips_lock, reach=reach)
    report["props"] = [wall]
    return act, report


def wall_sit():
    """Wall sit (level 3 isometric): slide down the wall until the knees are bent to about 75 degrees,
    hold, then slide back up. 12 s."""
    return wall_slide("EX_wall_sit", 75, [("down", 60), ("hold", 210), ("up", 60), ("up", 30)])


def wall_squat():
    """Wall squat: slide down the wall to about 70 degrees of knee bend and straight back up. 5 s per rep."""
    return wall_slide("EX_wall_squat", 70, [("down", 60), ("hold", 12), ("up", 60), ("up", 18)])


def calf_stretch(side="L"):
    """Hands on a wall, the leg being stretched (side) back with its heel down. With the back knee
    straight, lean the hips towards the wall to stretch the upper calf (gastrocnemius); hold. Ease
    off, then bend the back knee, heel still down, to stretch the lower calf (soleus); hold. 15.5 s."""
    import rh_props as P

    front = OTHER[side]
    tilt = 8
    back_t = foot_targets(side, (0, 0.22, 0))
    front_t = foot_targets(front, (0, -0.22, 0))

    def stance(hip, knee, arms):
        # Authored with the left leg back. Ankle angle keeps the back foot flat: ankle = hip - knee - tilt,
        # so the back ankle's dorsiflexion is tilt - hip + knee.
        p = {"root": [("x", tilt)], "hip_flex_L": hip, "knee_flex_L": knee, "ankle_plantar_L": hip - knee - tilt,
             "hip_flex_R": 30, "knee_flex_R": 24, "ankle_plantar_R": 6 - tilt,
             "neck_flex": -0.4 * tilt, "head_flex": -0.5 * tilt, **arms}
        return _side(p, side)

    front_reach = [(leg_params(front), front_t)]
    # The upright start is the furthest the body gets from the wall: hands and front foot are placed
    # from it, so leaning in only ever bends the elbows and front knee more.
    start = settle(stance(-5, 0, wall_arms(96 + tilt, 4, 80)), back_t, front_reach)   # 13 deg dorsiflexion
    contact, face, arm_reach = palms_on_wall(start)
    reach = front_reach + arm_reach
    gastroc = settle(stance(-10, 0, wall_arms(100, 40, 70)), back_t, reach)            # 18 deg, knee straight
    soleus = settle(stance(2, 22, wall_arms(100, 40, 70)), back_t, reach)              # 28 deg, knee bent
    P.clear()
    wall = P.wall(face_y=face)
    hold = {"step": 10}
    act, report = R.animate(f"EX_calf_stretch_{side}", start, [
        (gastroc, 60), (gastroc, 120, hold), (start, 45), (soleus, 60), (soleus, 120, hold), (start, 45), (start, 15, hold),
    ], locks=back_t, reach=reach)
    report["props"] = [wall]
    return act, report


# ─── Shoulder and upper back pack (Oct 2026) ─────────────────────────────────────────────

def shoulder_blade_setting():
    """Shoulder blade setting, standing tall with the arms relaxed: gently draw the shoulder blades
    back and down, hold without shrugging, then relax. 6 s."""
    feet = R.points(FEET)
    rest = {}
    set_ = {**_sym(shoulder_protr=-24, shoulder_elev=-8), "spine_flex": -3}
    hold = {"step": 10}
    return R.animate("EX_shoulder_blade_setting", rest, [
        (rest, 12, hold), (set_, 30), (set_, 90, hold), (rest, 30), (rest, 18, hold),
    ], locks=feet)


def arm_side_point(side, frac, out):
    """A point on the outside of the upper arm, `frac` of the way from the elbow to the shoulder,
    `out` metres from the bone towards the front and away from the chest (where a hand pulls it)."""
    n = SIDE_NAME[side]
    elbow, shoulder = R.world_point(f"{n}ForeArm"), R.world_point(f"{n}Arm")
    u = (shoulder - elbow).normalized()
    away = Vector((u.y, -u.x, 0)).normalized()
    if away.y > 0:
        away = -away
    return elbow.lerp(shoulder, frac) + away * out


def cross_body_stretch(side="L"):
    """Cross-body shoulder stretch, standing tall: bring the arm being stretched (side) across the chest
    and with the other hand gently pull it closer at the elbow until a stretch is felt at the back of
    the shoulder; hold; release. 10 s."""
    feet = R.points(FEET)
    s, o = side, OTHER[side]
    on = SIDE_NAME[o]
    rest = {}

    def pose(horiz, helper_flex, helper_horiz, helper_elbow):
        return {f"arm_{s}": {"flex": 92, "horiz": horiz}, f"elbow_flex_{s}": 6, f"grip_{s}": 15,
                f"arm_{o}": {"flex": helper_flex, "horiz": helper_horiz}, f"elbow_flex_{o}": helper_elbow,
                f"forearm_pron_{o}": 70, f"wrist_ext_{o}": 10}

    def hand_on_arm(p):
        R.apply_pose(p)
        return {f"{on}HandMiddle1": arm_side_point(s, 0.18, 0.05)}

    reach = [([(f"arm_{o}", "flex"), (f"arm_{o}", "horiz"), f"elbow_flex_{o}"], hand_on_arm)]
    across = settle(pose(-28, 50, -20, 95), None, reach)
    stretch = settle(pose(-46, 52, -25, 105), None, reach)
    hold = {"step": 10}
    return R.animate(f"EX_cross_body_stretch_{side}", rest, [
        (rest, 9, hold), (across, 45), (stretch, 30, {"reach": reach}), (stretch, 150, {"reach": reach, "step": 10}),
        (across, 30, {"reach": reach}), (rest, 36), (rest, 9, hold),
    ], locks=feet)


def scaption():
    """Scaption, standing tall with a water bottle in each hand, thumbs up: lift both arms forwards and
    slightly out (a V shape) to shoulder height, then lower slowly. 5 s per rep."""
    import rh_props as P

    feet = R.points(FEET)
    hands = _sym(grip=62, forearm_pron=-8)
    down = dict(hands, arm_L={"abd": 2, "plane": 40, "ext_rot": 10}, arm_R={"abd": 2, "plane": 40, "ext_rot": 10})
    up = dict(hands, arm_L={"abd": 90, "plane": 40, "ext_rot": 55}, arm_R={"abd": 90, "plane": 40, "ext_rot": 55})
    hold = {"step": 6}
    act, report = R.animate("EX_scaption", down, [
        (down, 6, hold), (up, 54), (up, 12, hold), (down, 66), (down, 12, hold),
    ], locks=feet)
    report["props"] = [P.bottles()]
    return act, report


def fist_on(hand, point):
    """Reach target that puts the inside of the `hand` fist (rh_props.grip) on a world point. The
    solver moves bone heads, so the knuckle is aimed at the point plus the knuckle-to-grip offset
    in the current pose."""
    import rh_props as P

    n = SIDE_NAME[hand]
    return {f"{n}HandMiddle1": point + (R.world_point(f"{n}HandMiddle1") - P.grip(n))}


def assisted_external_rotation(side="L"):
    """Assisted outward rotation with a stick, sitting. Elbows tucked into the sides and bent to 90
    degrees, palms up, holding a stick across in front. The good arm pushes the stick so the hand of
    the painful arm (side) moves outwards, elbow staying at the side; to a comfortable stretch and
    back. 5 s per rep."""
    import rh_props as P

    s, o = side, OTHER[side]
    sit, feet = seated_base()
    chair = fit_chair(sit)
    hips = R.points(("LeftUpLeg", "RightUpLeg"), sit)
    legs = [(leg_params(x), {k: v for k, v in feet.items() if k.startswith(SIDE_NAME[x])}) for x in ("L", "R")]

    def pose(er):
        return dict(sit, **_sym(elbow_flex=90, forearm_pron=-80, grip=70),
                    **{f"arm_{s}": {"abd": -6, "ext_rot": er}, f"arm_{o}": {"abd": -6, "ext_rot": -0.8 * er}})

    start = pose(0)
    R.apply_pose(start)
    gap = (P.grip(SIDE_NAME[o]) - P.grip(SIDE_NAME[s])).x

    def on_stick(p):
        # The stick stays level and across the body; the good fist keeps its place on it.
        R.apply_pose(p)
        return fist_on(o, P.grip(SIDE_NAME[s]) + Vector((gap, 0, 0)))

    reach = legs + [([(f"arm_{o}", "ext_rot"), (f"arm_{o}", "flex"), (f"arm_{o}", "abd"), f"elbow_flex_{o}"], on_stick)]
    out = settle(pose(45), hips, reach)
    hold = {"step": 6}
    act, report = R.animate(f"EX_assisted_external_rotation_{side}", start, [
        (start, 9, hold), (out, 60), (out, 15, hold), (start, 60), (start, 6, hold),
    ], locks=hips, reach=reach)
    report["props"] = [chair, P.stick(SIDE_NAME[s], 0.8)]
    return act, report


def assisted_abduction(side="L"):
    """Assisted arm lift out to the side with a stick, standing. Both hands hold a stick in front,
    palms up. The good arm pushes the stick so the painful arm (side), elbow straight, rises out to
    the side to a comfortable stretch; lower slowly. 6 s per rep."""
    import rh_props as P

    s, o = side, OTHER[side]
    sx = 1 if s == "L" else -1
    feet = R.points(FEET)
    fists = _sym(grip=70)

    def pose(abd, angle, ext, elbow):
        return dict(fists, label=angle, **{
            f"arm_{s}": {"abd": abd, "plane": 25, "ext_rot": ext}, f"elbow_flex_{s}": elbow, f"forearm_pron_{s}": -75,
            f"arm_{o}": {"flex": 25, "abd": -8}, f"elbow_flex_{o}": 60, f"forearm_pron_{o}": -75})

    start = pose(14, 0, 20, 55)
    R.apply_pose(start)
    gap = (P.grip(SIDE_NAME[o]) - P.grip(SIDE_NAME[s])).length

    def on_stick(p):
        # label: how far the stick dips from the painful fist towards the good one (degrees).
        R.apply_pose(p)
        a = math.radians(p.get("label", 0.0))
        d = Vector((-sx * math.cos(a), -0.15, -math.sin(a))).normalized()
        return fist_on(o, P.grip(SIDE_NAME[s]) + d * gap)

    reach = [([(f"arm_{o}", "flex"), (f"arm_{o}", "abd"), (f"arm_{o}", "horiz"), f"elbow_flex_{o}"], on_stick)]
    start = settle(start, None, reach)
    up = settle(pose(100, 38, 70, 12), None, reach)
    hold = {"step": 6}
    act, report = R.animate(f"EX_assisted_abduction_{side}", start, [
        (start, 9, hold), (up, 66), (up, 18, hold), (start, 72), (start, 15, hold),
    ], locks=feet, reach=reach)
    report["props"] = [P.stick(SIDE_NAME[s], 1.0)]
    return act, report


def _lateral_extent(side, keep):
    """Furthest point of the skin and shirt towards one side (x for the left, -x for the right)."""
    sx = 1 if side == "L" else -1
    pts = mesh_points(("RH_Body1", "RH_Shirt"), keep)
    return max(pts, key=lambda w: w.x * sx)


def static_shoulder_abduction(side="L"):
    """Static shoulder push out to the side (isometric). Standing side-on to a wall, elbow bent to 90
    degrees and the outside of the elbow touching the wall: push the elbow gently into the wall
    without moving; hold; relax. 9 s."""
    import rh_props as P

    s = side
    sx = 1 if s == "L" else -1
    feet = R.points(FEET)
    rest = {f"arm_{s}": {"abd": 8}, f"elbow_flex_{s}": 90, f"grip_{s}": 15}
    R.apply_pose(rest)
    elbow = R.world_point(f"{SIDE_NAME[s]}ForeArm")
    face = _lateral_extent(s, lambda w: (w - elbow).length < 0.07).x
    press = dict(rest, **{f"grip_{s}": 55, f"arm_{s}": {"abd": 8.5}})
    hold = {"step": 10}
    act, report = R.animate(f"EX_static_shoulder_abduction_{side}", rest, [
        (rest, 30, hold), (press, 24), (press, 180, hold), (rest, 24), (rest, 12, hold),
    ], locks=feet)
    report["props"] = [P.side_wall(face + sx * 0.002)]
    return act, report


def static_external_rotation(side="L"):
    """Static outward rotation against a wall (isometric). Standing side-on to a wall, elbow bent to 90
    degrees and tucked into the side, the back of the wrist on the wall: press the wrist gently
    outwards into the wall without moving the arm; hold; relax. 9 s."""
    import rh_props as P

    s = side
    sx = 1 if s == "L" else -1
    feet = R.points(FEET)
    # Turned out a little, so the wrist is further out than the shoulder and can reach the wall.
    rest = {f"arm_{s}": {"abd": -6, "ext_rot": 24}, f"elbow_flex_{s}": 90, f"grip_{s}": 15}
    R.apply_pose(rest)
    wrist = R.world_point(f"{SIDE_NAME[s]}Hand")
    face = _lateral_extent(s, lambda w: (w - wrist).length < 0.05).x
    press = dict(rest, **{f"grip_{s}": 55})
    hold = {"step": 10}
    act, report = R.animate(f"EX_static_external_rotation_{side}", rest, [
        (rest, 30, hold), (press, 24), (press, 180, hold), (rest, 24), (rest, 12, hold),
    ], locks=feet)
    report["props"] = [P.side_wall(face + sx * 0.002)]
    return act, report


def wall_angels():
    """Wall angels: back against a wall, arms bent in a goalpost shape against the wall. Slide the arms
    up the wall as far as is comfortable and back down, keeping the back and arms near the wall. 6 s."""
    import rh_props as P

    feet = R.points(FEET)

    def pose(abd, elbow, horiz):
        return {**_sym(elbow_flex=elbow, forearm_pron=-10), "spine_flex": -2,
                "arm_L": {"abd": abd, "ext_rot": 88, "horiz": horiz}, "arm_R": {"abd": abd, "ext_rot": 88, "horiz": horiz}}

    R.apply_pose({})
    torso = mesh_points(("RH_Shirt", "RH_Pants"), lambda w: w.z > 0.45)
    face = max(w.y for w in torso) + 0.002

    def on_wall(p):
        # Elbows and the backs of the wrists stay just off the wall.
        R.apply_pose(p)
        out = {}
        for n in ("Left", "Right"):
            for b, gap in (("ForeArm", 0.05), ("Hand", 0.035)):
                w = R.world_point(f"{n}{b}")
                out[f"{n}{b}"] = Vector((w.x, face - gap, w.z))
        return out

    reach = [([(f"arm_{x}", "horiz"), (f"arm_{x}", "ext_rot")], on_wall) for x in ("L", "R")]
    low = settle(pose(80, 95, 12), feet, reach)
    high = settle(pose(150, 30, 12), feet, reach)
    hold = {"step": 6}
    act, report = R.animate("EX_wall_angels", low, [
        (low, 9, hold), (high, 75), (high, 9, hold), (low, 75), (low, 12, hold),
    ], locks=feet, reach=reach, rounds=2)
    report["props"] = [P.wall(face_y=face, behind=True)]
    return act, report


BUILDERS = {
    "assisted_external_rotation": assisted_external_rotation,
    "assisted_abduction": assisted_abduction,
    "static_shoulder_abduction": static_shoulder_abduction,
    "static_external_rotation": static_external_rotation,
    "wall_angels": wall_angels,
    "shoulder_blade_setting": shoulder_blade_setting,
    "cross_body_stretch": cross_body_stretch,
    "scaption": scaption,
    "mini_squat": mini_squat,
    "sit_to_stand": sit_to_stand,
    "calf_raise": calf_raise,
    "standing_hip_abduction": standing_hip_abduction,
    "shoulder_flexion": shoulder_flexion,
    "chin_tuck": chin_tuck,
    "seated_knee_extension": seated_knee_extension,
    "wall_push_up": wall_push_up,
    "glute_bridge": glute_bridge,
    "straight_leg_raise": straight_leg_raise,
    "heel_slides": heel_slides,
    "clamshell": clamshell,
    "cat_camel": cat_camel,
    "bird_dog": bird_dog,
    "calf_stretch": calf_stretch,
    "plantar_fascia_wall_stretch": plantar_fascia_wall_stretch,
    "quad_stretch": quad_stretch,
    "single_leg_balance": single_leg_balance,
    "wall_sit": wall_sit,
    "wall_squat": wall_squat,
    "seated_hamstring_stretch": seated_hamstring_stretch,
    "seated_calf_hold": seated_calf_hold,
    "seated_static_quads": seated_static_quads,
    "calf_towel_stretch": calf_towel_stretch,
    "plantar_fascia_towel_stretch": plantar_fascia_towel_stretch,
    "static_push_down": static_push_down,
    "ankle_circles": ankle_circles,
    "hamstring_doorway_stretch": hamstring_doorway_stretch,
    "eccentric_heel_drop": eccentric_heel_drop,
    "plantar_fascia_loading": plantar_fascia_loading,
    "forward_step_up": forward_step_up,
    "single_leg_decline_squat": single_leg_decline_squat,
    "heel_to_toe_walking": heel_to_toe_walking,
    "static_quads": static_quads,
    "knee_rolling": knee_rolling,
    "pelvic_rocking": pelvic_rocking,
    "sitting_pelvic_rocking": sitting_pelvic_rocking,
    "forward_bend_sitting": forward_bend_sitting,
    "childs_pose": childs_pose,
    "sciatic_nerve_glide": sciatic_nerve_glide,
    "femoral_nerve_glide": femoral_nerve_glide,
    "chair_squat": chair_squat,
    "static_hip_pushout": static_hip_pushout,
    "pelvic_dips": pelvic_dips,
    "side_lying_hip_lift": side_lying_hip_lift,
    "buttock_squeeze": buttock_squeeze,
    "pendulum_leg_swing": pendulum_leg_swing,
}
