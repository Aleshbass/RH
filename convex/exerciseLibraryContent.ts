/**
 * Clinical content for the Rehabify 3D exercise library: what each exercise is for, plain-English
 * steps a patient can follow, safety notes and default dosage.
 *
 * Each entry's `slug` matches the motion clips built in scripts/exercise-3d (one clip, or a
 * `-left` and `-right` clip when `sided`). `syncLibrary` in exerciseLibrary.ts copies these into
 * the `exercises` table, where admins can edit the text. Every animation still needs sign-off from
 * a licensed physiotherapist before patients see it.
 */

export type LibraryEntry = {
  slug: string;
  name: string;
  sided: boolean;
  position: "standing" | "sitting" | "lying" | "side-lying" | "hands-and-knees" | "at a wall";
  description: string;
  instructions: string[];
  precautions: string[];
  bodyParts: string[];
  targetMuscles: string[];
  conditions: string[];
  equipment: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  defaults: { sets: number; reps: number; holdSeconds?: number; frequency: string };
};

export const LIBRARY: LibraryEntry[] = [
  {
    slug: "mini-squat",
    name: "Mini squat",
    sided: false,
    position: "standing",
    description: "A shallow squat that strengthens the thighs and buttocks without loading the knee deeply.",
    instructions: [
      "Stand with your feet hip-width apart and toes pointing forward.",
      "Reach your arms forward to help your balance.",
      "Push your hips back and bend your knees as if starting to sit down, about a quarter of the way.",
      "Keep your chest up and your knees in line with your second toe.",
      "Push through your heels to stand up tall again.",
    ],
    precautions: ["Stop if you feel sharp knee pain, or pain above 4 out of 10.", "Don't let your knees roll inwards."],
    bodyParts: ["Legs", "Knee", "Hip"],
    targetMuscles: ["Quadriceps", "Gluteus maximus"],
    conditions: ["knee_osteoarthritis", "patellofemoral_pain", "post_surgery", "general_strength"],
    equipment: ["None"],
    difficulty: "beginner",
    defaults: { sets: 3, reps: 10, frequency: "Once a day" },
  },
  {
    slug: "sit-to-stand",
    name: "Sit to stand",
    sided: false,
    position: "sitting",
    description: "Standing up from a chair and sitting back down with control: everyday strength for legs and balance.",
    instructions: [
      "Sit near the front of a firm chair with your feet flat, slightly behind your knees.",
      "Reach your arms forward.",
      "Lean forward so your nose comes over your toes.",
      "Push through both feet to stand up tall.",
      "Reach your hips back and sit down slowly, with control.",
    ],
    precautions: [
      "Use a firm chair that can't roll or slide, with support nearby if your balance is poor.",
      "After a hip replacement, follow the hip precautions your physiotherapist gave you.",
    ],
    bodyParts: ["Legs", "Knee", "Hip"],
    targetMuscles: ["Quadriceps", "Gluteus maximus"],
    conditions: ["knee_osteoarthritis", "hip_osteoarthritis", "falls_prevention", "post_surgery", "deconditioning"],
    equipment: ["Chair"],
    difficulty: "beginner",
    defaults: { sets: 3, reps: 8, frequency: "Once a day" },
  },
  {
    slug: "calf-raise",
    name: "Calf raise",
    sided: false,
    position: "standing",
    description: "Rising onto the balls of the feet to strengthen the calves and Achilles tendon.",
    instructions: [
      "Stand with your feet hip-width apart, holding a counter or wall lightly for balance.",
      "Rise up onto the balls of both feet as high as you can.",
      "Hold for a second at the top.",
      "Lower your heels slowly, taking about three seconds.",
    ],
    precautions: ["Hold on to something steady if your balance is poor."],
    bodyParts: ["Legs", "Ankle"],
    targetMuscles: ["Gastrocnemius", "Soleus"],
    conditions: ["achilles_tendinopathy", "ankle_sprain", "falls_prevention", "general_strength"],
    equipment: ["Wall or counter for balance"],
    difficulty: "beginner",
    defaults: { sets: 3, reps: 12, frequency: "Once a day" },
  },
  {
    slug: "standing-hip-abduction",
    name: "Standing hip abduction",
    sided: true,
    position: "standing",
    description: "Lifting the leg out to the side to strengthen the muscles that keep the pelvis level when you walk.",
    instructions: [
      "Stand tall, holding a chair or counter for support.",
      "Keep your toes pointing forward.",
      "Lift your leg out to the side, a small amount, without leaning your body.",
      "Lower it slowly back to the start.",
    ],
    precautions: ["Keep the movement small and your body upright; leaning sideways means the leg went too far."],
    bodyParts: ["Legs", "Hip"],
    targetMuscles: ["Gluteus medius", "Gluteus minimus"],
    conditions: ["hip_osteoarthritis", "post_surgery", "lateral_hip_pain", "falls_prevention"],
    equipment: ["Chair or counter for support"],
    difficulty: "beginner",
    defaults: { sets: 3, reps: 10, frequency: "Once a day" },
  },
  {
    slug: "shoulder-flexion",
    name: "Shoulder flexion",
    sided: false,
    position: "standing",
    description: "Raising the arms forward and overhead to keep the shoulders moving freely.",
    instructions: [
      "Stand tall with your arms by your sides and thumbs pointing forward.",
      "Keeping your elbows straight, raise both arms forward and up as high as is comfortable.",
      "Lower them slowly.",
    ],
    precautions: [
      "Don't shrug your shoulders up towards your ears.",
      "After shoulder surgery, only lift as high as your surgeon or physiotherapist allows.",
    ],
    bodyParts: ["Shoulders", "Arms"],
    targetMuscles: ["Anterior deltoid", "Rotator cuff"],
    conditions: ["shoulder_stiffness", "frozen_shoulder", "post_surgery", "posture"],
    equipment: ["None"],
    difficulty: "beginner",
    defaults: { sets: 2, reps: 10, frequency: "Twice a day" },
  },
  {
    slug: "chin-tuck",
    name: "Chin tuck",
    sided: false,
    position: "standing",
    description: "Gliding the head straight back to strengthen the deep neck muscles and ease forward-head posture.",
    instructions: [
      "Sit or stand tall, looking straight ahead.",
      "Gently glide your head straight back, as if making a double chin. Keep your eyes level.",
      "Hold for 5 seconds.",
      "Relax back to the start.",
    ],
    precautions: ["Move gently; you should feel a stretch, not pain.", "Don't tip your head down or up."],
    bodyParts: ["Neck"],
    targetMuscles: ["Deep neck flexors"],
    conditions: ["neck_pain", "forward_head_posture", "headache"],
    equipment: ["None"],
    difficulty: "beginner",
    defaults: { sets: 1, reps: 10, holdSeconds: 5, frequency: "3 times a day" },
  },
  {
    slug: "seated-knee-extension",
    name: "Seated knee extension",
    sided: true,
    position: "sitting",
    description: "Straightening the knee while sitting to strengthen the front of the thigh.",
    instructions: [
      "Sit tall at the back of a chair, hands resting by your sides.",
      "Straighten one knee until your leg is out straight.",
      "Pull your toes up towards you and hold for 2 to 3 seconds.",
      "Lower your foot slowly back to the floor.",
    ],
    precautions: ["Keep your thigh resting on the chair and your back tall."],
    bodyParts: ["Legs", "Knee"],
    targetMuscles: ["Quadriceps"],
    conditions: ["knee_osteoarthritis", "post_surgery", "quadriceps_weakness"],
    equipment: ["Chair"],
    difficulty: "beginner",
    defaults: { sets: 3, reps: 10, holdSeconds: 3, frequency: "Twice a day" },
  },
  {
    slug: "wall-push-up",
    name: "Wall push-up",
    sided: false,
    position: "at a wall",
    description: "A gentle push-up against a wall to strengthen the chest, shoulders and arms.",
    instructions: [
      "Stand about an arm's length from a wall.",
      "Place your hands flat on the wall at shoulder height, slightly wider than your shoulders.",
      "Keeping your body straight from head to heels, bend your elbows to bring your chest towards the wall.",
      "Push back to the start.",
    ],
    precautions: ["Keep your body in one straight line; don't let your hips sag.", "Wear shoes that grip the floor."],
    bodyParts: ["Arms", "Shoulders", "Chest"],
    targetMuscles: ["Pectorals", "Triceps", "Serratus anterior"],
    conditions: ["shoulder_rehab", "upper_limb_strength", "deconditioning"],
    equipment: ["Wall"],
    difficulty: "beginner",
    defaults: { sets: 3, reps: 10, frequency: "Once a day" },
  },
  {
    slug: "glute-bridge",
    name: "Glute bridge",
    sided: false,
    position: "lying",
    description: "Lifting the hips from the floor to strengthen the buttocks and support the lower back.",
    instructions: [
      "Lie on your back with your knees bent, feet flat and hip-width apart, arms by your sides.",
      "Tighten your stomach and squeeze your buttocks.",
      "Lift your hips until your shoulders, hips and knees are in one line.",
      "Hold for 2 to 3 seconds, then lower slowly.",
    ],
    precautions: ["Don't arch your lower back at the top; stop the lift when your body is in a straight line."],
    bodyParts: ["Hip", "Back", "Core"],
    targetMuscles: ["Gluteus maximus", "Hamstrings", "Deep abdominals"],
    conditions: ["lower_back_pain", "hip_rehab", "knee_rehab", "glute_weakness"],
    equipment: ["Mat"],
    difficulty: "beginner",
    defaults: { sets: 3, reps: 10, holdSeconds: 3, frequency: "Once a day" },
  },
  {
    slug: "straight-leg-raise",
    name: "Straight leg raise",
    sided: true,
    position: "lying",
    description: "Lifting a straight leg while lying down to strengthen the thigh without bending the knee.",
    instructions: [
      "Lie on your back. Bend your other knee and keep that foot flat.",
      "Tighten the thigh muscle of your straight leg and pull your toes up.",
      "Lift the straight leg to the height of your bent knee.",
      "Hold for 2 seconds, then lower it slowly.",
    ],
    precautions: ["Keep the knee completely straight; if it bends, lower the leg and tighten the thigh again."],
    bodyParts: ["Legs", "Knee", "Hip"],
    targetMuscles: ["Quadriceps", "Hip flexors"],
    conditions: ["post_surgery", "knee_osteoarthritis", "quadriceps_weakness"],
    equipment: ["Mat or bed"],
    difficulty: "beginner",
    defaults: { sets: 3, reps: 10, holdSeconds: 2, frequency: "Twice a day" },
  },
  {
    slug: "heel-slides",
    name: "Heel slides",
    sided: true,
    position: "lying",
    description: "Sliding the heel towards the buttock to bring back knee bend after injury or surgery.",
    instructions: [
      "Lie on your back with your legs straight. A plastic bag under your heel helps it slide.",
      "Slowly slide your heel towards your buttock, bending your knee as far as is comfortable.",
      "Slide it back out until the leg is straight.",
    ],
    precautions: ["Expect a stretch, not sharp pain. Keep your heel on the bed or mat the whole time."],
    bodyParts: ["Legs", "Knee"],
    targetMuscles: ["Hamstrings", "Quadriceps"],
    conditions: ["post_surgery", "knee_stiffness"],
    equipment: ["Mat or bed"],
    difficulty: "beginner",
    defaults: { sets: 2, reps: 10, frequency: "3 times a day" },
  },
  {
    slug: "clamshell",
    name: "Clamshell",
    sided: true,
    position: "side-lying",
    description: "Opening the knees like a clam while lying on your side to strengthen the outer hip.",
    instructions: [
      "Lie on your side with your hips and knees bent and your feet together. Rest your head on a pillow.",
      "Keep your feet touching and your pelvis still; don't roll backwards.",
      "Lift your top knee as far as you can without moving your pelvis.",
      "Lower it slowly.",
    ],
    precautions: ["If your pelvis rolls back, make the movement smaller."],
    bodyParts: ["Hip"],
    targetMuscles: ["Gluteus medius"],
    conditions: ["hip_pain", "patellofemoral_pain", "lower_back_pain"],
    equipment: ["Mat", "Pillow"],
    difficulty: "beginner",
    defaults: { sets: 3, reps: 12, frequency: "Once a day" },
  },
  {
    slug: "cat-camel",
    name: "Cat-camel",
    sided: false,
    position: "hands-and-knees",
    description: "Slowly rounding and arching the back on hands and knees to ease stiffness.",
    instructions: [
      "Get onto your hands and knees, hands under your shoulders and knees under your hips.",
      "Slowly round your back up towards the ceiling, tucking your chin and tail.",
      "Then gently let your back sag, lifting your head and tailbone.",
      "Move slowly and stay within a comfortable range.",
    ],
    precautions: ["Keep the movement slow and gentle; it should ease stiffness, not cause pain."],
    bodyParts: ["Back", "Core"],
    targetMuscles: ["Spinal extensors", "Abdominals"],
    conditions: ["lower_back_pain", "back_stiffness"],
    equipment: ["Mat"],
    difficulty: "beginner",
    defaults: { sets: 1, reps: 10, frequency: "Twice a day" },
  },
  {
    slug: "bird-dog",
    name: "Bird-dog",
    sided: true,
    position: "hands-and-knees",
    description: "Reaching one arm and the opposite leg out while keeping the back still, for core and back strength.",
    instructions: [
      "Get onto your hands and knees, hands under your shoulders and knees under your hips.",
      "Tighten your stomach muscles.",
      "Reach one arm forward and the opposite leg back until both are level with your body.",
      "Hold for 2 to 3 seconds without twisting, then return. Swap sides.",
    ],
    precautions: ["Keep your back flat and your hips level; only lift as high as you can without twisting."],
    bodyParts: ["Back", "Core", "Hip"],
    targetMuscles: ["Erector spinae", "Gluteus maximus", "Deep abdominals"],
    conditions: ["lower_back_pain", "core_stability"],
    equipment: ["Mat"],
    difficulty: "intermediate",
    defaults: { sets: 2, reps: 8, holdSeconds: 3, frequency: "Once a day" },
  },
];

/** Clip id for an exercise slug and side ("L" is the left version). */
export function clipIdFor(slug: string, sided: boolean, side?: "L" | "R" | null) {
  if (!sided) return slug;
  return `${slug}-${side === "R" ? "right" : "left"}`;
}
