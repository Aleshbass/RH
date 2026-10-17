"""Rehabify starter exercise pack, authored as clinical joint angles on RH_Rig.

Each builder makes one looping action named EX_<slug> (one repetition, starting and
ending in the same pose) and returns its report from rh_pose.animate. Angles are in
degrees; see rh_pose.JOINTS for the sign conventions. Every clip still needs sign-off
from a licensed physiotherapist before patients see it.
"""

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


def fit_chair(sit):
    """Place the chair under a seated pose: seat top at the buttocks, front edge behind the knees."""
    import bpy
    import rh_props as P

    R.apply_pose(sit)
    knee, hip = R.world_point("LeftLeg"), R.world_point("LeftUpLeg")
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
    quad = {"root": [("x", 90)], **_sym(hip_flex=90, knee_flex=90, ankle_plantar=70, forearm_pron=90, wrist_ext=85),
            "arm_L": {"flex": 90, "abd": -10}, "arm_R": {"flex": 90, "abd": -10}, "neck_flex": -10}
    quad = R.ground(quad, MAT_TOP)
    hands = R.points(("LeftHand", "RightHand"), quad)
    kn = R.points(("LeftLeg", "RightLeg"), quad)
    knee_t = {b: v.__class__((v.x, v.y, v.z - 0.065)) for b, v in kn.items()}
    for _ in range(4):
        quad = R.lock(quad, hands)
        quad = R.solve(quad, [("root", "x"), "hip_flex_L", "hip_flex_R"], knee_t, iters=20)
    return quad


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


BUILDERS = {
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
}
