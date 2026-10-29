/**
 * How to do each test and outcome measure, shown in the note itself so physios never leave
 * Rehabify to look one up. Keyed `${kind}:${key}` to match convex/helpers/clinicalMeasures.ts.
 *
 * Videos play in the app (YouTube's privacy-enhanced player), so each one has to be a single
 * video id, not a search. Each clip was checked on 28 Oct 2026 (its title, its channel, and that
 * YouTube lets it play inside other sites); most are Physiotutors, the comment names the channel.
 *
 * Wording drafted from standard technique; to be checked by Rehabify's clinical lead (Mary)
 * before it's relied on.
 */

export type Guide = {
  /** How to do it, step by step in one or two sentences */
  how: string
  /** What a positive test, or the result, means */
  positive?: string
  /** A safety point to check first */
  caution?: string
  /** YouTube video id of a demonstration */
  youtubeId?: string
  /** The official form, for licensed questionnaires we can't reproduce */
  form?: { label: string; url: string }
}

export const GUIDES: Record<string, Guide> = {
  // ── Special tests ──────────────────────────────────────────────────────────
  'special_test:spurling': {
    how: 'Patient seated. Extend, side-bend and rotate the neck towards the painful side, then press gently down through the top of the head.',
    positive: 'Reproduces the patient’s arm pain or pins and needles (not just neck pain).',
    youtubeId: '3ZSNdv0o0yk', // Physiotutors
  },
  'special_test:cervical_distraction': {
    how: 'Patient supine or seated. Cradle the head under the chin and the back of the skull and gently lift it, taking some weight off the neck.',
    positive: 'Arm symptoms ease or go away while the neck is distracted.',
    youtubeId: 'uLdzgd5snmw', // Physiotutors
  },
  'special_test:ulnt1': {
    how: 'Patient supine. In order: depress the shoulder girdle, abduct the shoulder to about 110°, extend the wrist and fingers, supinate the forearm, externally rotate the shoulder, then extend the elbow. Side-bend the neck towards and away to differentiate.',
    positive: 'Reproduces the patient’s symptoms, they change with neck side-bending, and the range differs from the other side.',
    youtubeId: 'rir6x6Iiqc4', // Physiotutors, all upper limb tension tests
  },
  'special_test:slr': {
    how: 'Patient supine. Keeping the knee straight, slowly lift the leg by the heel until symptoms come on, and note the angle (record it to chart it across visits). Add ankle dorsiflexion or neck flexion to sensitise.',
    positive: 'Reproduces the patient’s leg pain below the knee, usually between about 30° and 70°, and dorsiflexion makes it worse.',
    youtubeId: 'LdAD9GNv8FI', // Physiotutors
  },
  'special_test:slump': {
    how: 'Patient sits on the edge of the bed, hands behind the back. Slump the trunk, flex the neck, straighten one knee, then dorsiflex the ankle. Release the neck flexion and ask what changes.',
    positive: 'Reproduces the patient’s symptoms and they ease when the neck comes out of flexion.',
    youtubeId: 'HFGfP84uwEo', // Physiotutors
  },
  'special_test:femoral_nerve_stretch': {
    how: 'Patient prone. Bend the knee to bring the heel towards the buttock; add a little hip extension if needed.',
    positive: 'Reproduces the patient’s pain in the front of the thigh on that side (upper lumbar nerve root).',
    youtubeId: '4VxKyPRq6HA', // Physiotutors, prone knee bend
  },
  'special_test:hawkins_kennedy': {
    how: 'Patient seated or standing. Raise the arm forward to 90° with the elbow bent to 90°, then passively rotate the shoulder inwards.',
    positive: 'Reproduces the patient’s shoulder pain.',
    youtubeId: 'X9YiuvQJVJc', // Physiotutors
  },
  'special_test:neer': {
    how: 'Stabilise the shoulder blade, turn the arm in (thumb down) and passively raise it forward to full elevation.',
    positive: 'Shoulder pain towards the end of the range.',
    youtubeId: 'nNyax0iocZo', // Physiotutors
  },
  'special_test:empty_can': {
    how: 'Arm raised to 90° in the plane of the shoulder blade (about 30° forward), turned in with the thumb pointing down. The patient holds as you press down on the forearm. Compare both sides.',
    positive: 'Pain or weakness compared with the other side (supraspinatus).',
    youtubeId: 'DeO50UTxwoo', // Physiotutors
  },
  'special_test:er_lag': {
    how: 'Patient seated, elbow bent to 90°, arm slightly away from the body. Passively rotate the shoulder out to just short of full range, support the elbow, let go of the wrist and ask the patient to hold the position.',
    positive: 'The arm drifts back inwards (a lag), pointing to an infraspinatus or supraspinatus tear.',
    youtubeId: 'JPsLBYjldGI', // Physiotutors
  },
  'special_test:apprehension_relocation': {
    how: 'Patient supine. Abduct the shoulder to 90° and slowly rotate it outwards. Then press backwards on the front of the shoulder (relocation) and rotate further.',
    positive: 'The patient feels the shoulder might come out (apprehension), and it eases with the relocation pressure.',
    youtubeId: 'jZ29dAXKA5M', // Physiotutors
  },
  'special_test:cozens': {
    how: 'Elbow bent, forearm turned palm down, fist made. The patient lifts the wrist back against your resistance while you feel the outside of the elbow.',
    positive: 'Pain at the lateral epicondyle.',
    youtubeId: '8K7jzDIUpLI', // Physiotutors
  },
  'special_test:mills': {
    how: 'Feel the outside of the elbow while you passively turn the forearm palm down, bend the wrist and straighten the elbow.',
    positive: 'Pain at the lateral epicondyle.',
    youtubeId: 'r_HB-wUXcAQ', // Physiotutors
  },
  'special_test:phalen': {
    how: 'The patient holds both wrists fully bent, backs of the hands together, for up to 60 seconds.',
    positive: 'Tingling or numbness in the thumb, index and middle fingers.',
    youtubeId: 'rQJNrkq7tIs', // Physiotutors
  },
  'special_test:tinel_wrist': {
    how: 'Tap over the median nerve at the front of the wrist (carpal tunnel).',
    positive: 'Tingling into the thumb, index and middle fingers.',
    youtubeId: 'U8cPjPeZgFw', // Physiotutors
  },
  'special_test:finkelstein': {
    how: 'The patient tucks the thumb into the palm and makes a fist; you gently move the wrist towards the little finger side.',
    positive: 'Sharp pain over the thumb side of the wrist (radial styloid).',
    youtubeId: '8WBVXBx34W0', // Physiotutors
  },
  'special_test:faber': {
    how: 'Patient supine. Rest the test-side foot on the other knee (figure 4), steady the opposite side of the pelvis and gently press the bent knee down.',
    positive: 'Groin pain points to the hip; pain at the back of the pelvis points to the sacroiliac joint. Note if the knee sits much higher than the other side.',
    youtubeId: '89Qiht82zmg', // Physiotutors
  },
  'special_test:fadir': {
    how: 'Patient supine. Bend the hip and knee to 90°, then bring the knee across the body and rotate the hip inwards.',
    positive: 'Reproduces the patient’s groin or front-of-hip pain.',
    youtubeId: 'PqgPWRqmQ_A', // The Physio Channel
  },
  'special_test:thomas': {
    how: 'Patient sits at the end of the bed, then rolls back hugging one knee to the chest so the lower back flattens. The other leg hangs freely.',
    positive: 'The hanging thigh lifts off the bed (tight hip flexors); if the knee straightens, rectus femoris is tight.',
    youtubeId: 'NMDd-4NspHs', // Physiotutors
  },
  'special_test:trendelenburg': {
    how: 'The patient stands on the test leg and lifts the other foot off the floor for up to 30 seconds.',
    positive: 'The pelvis drops on the lifted side, or the trunk leans over the standing leg (weak hip abductors on the standing side).',
    youtubeId: '0rcczDEWDqU', // Physiotutors
  },
  'special_test:lachman': {
    how: 'Patient supine, knee bent 20–30°. Steady the thigh with one hand and draw the top of the shin forward with the other. Compare both knees.',
    positive: 'More forward movement than the other knee, or a soft end feel (ACL).',
    youtubeId: 'JFkbKNNa7xQ',
  },
  'special_test:anterior_drawer_knee': {
    how: 'Patient supine, hip bent to 45° and knee to 90°, foot steadied. Hold the top of the shin with both hands and draw it forward.',
    positive: 'More forward glide than the other knee, or a soft end feel (ACL).',
    youtubeId: 'IdnBKv38EEQ', // Physiotutors
  },
  'special_test:posterior_drawer_knee': {
    how: 'Same position as the anterior drawer. Look for a sag first, then push the top of the shin backwards.',
    positive: 'More backward glide than the other knee (PCL).',
    youtubeId: 'wDIGll5wzZs', // Physiotutors
  },
  'special_test:mcmurray': {
    how: 'Patient supine. Fully bend the knee, rotate the shin (out for the medial meniscus, in for the lateral) and straighten the knee while feeling the joint line.',
    positive: 'A painful click or clunk at the joint line.',
    youtubeId: 'lwDFPAyGGgI', // Physiotutors
  },
  'special_test:thessaly': {
    how: 'The patient stands on the test leg with the knee bent 20°, holding your hands for balance, and twists the body in and out three times. Test the good knee first.',
    positive: 'Pain at the joint line, or a feeling of locking or catching.',
    youtubeId: 'ebraZ4jM36A', // Physiotutors
  },
  'special_test:valgus_stress': {
    how: 'Patient supine. Push the knee inwards while you move the ankle outwards, first with the knee straight, then bent to 30°.',
    positive: 'Pain or more gapping on the inside of the knee than the other side (MCL). Gapping with the knee straight suggests a bigger injury.',
    youtubeId: 'GSFbttpxCuQ', // Physiotutors
  },
  'special_test:varus_stress': {
    how: 'Patient supine. Push the knee outwards while you move the ankle inwards, first with the knee straight, then bent to 30°.',
    positive: 'Pain or more gapping on the outside of the knee than the other side (LCL).',
    youtubeId: 'sg1gk6QKARw', // Physiotutors
  },
  'special_test:patellar_apprehension': {
    how: 'Patient supine, knee relaxed and slightly bent (20–30°). Gently push the kneecap outwards.',
    positive: 'The patient looks worried or tightens the thigh to stop the movement (patellar instability).',
    youtubeId: '4TnCQppTy1g', // Physiotutors
  },
  'special_test:anterior_drawer_ankle': {
    how: 'Ankle slightly pointed (10–20° plantarflexion). Steady the lower leg and draw the heel forward. Compare both sides.',
    positive: 'More forward movement than the other side, sometimes with a dimple at the front of the ankle (ATFL).',
    youtubeId: 'vAcBEYZKcto', // Physiotutors
  },
  'special_test:talar_tilt': {
    how: 'Ankle at 90°. Steady the lower leg and tilt the heel inwards. Compare both sides.',
    positive: 'More tilt than the other side (calcaneofibular ligament).',
    youtubeId: 'UHNbm6Z3XK4', // Physiotutors
  },
  'special_test:thompson': {
    how: 'Patient prone with the feet over the end of the bed (or kneeling on a chair). Squeeze the calf.',
    positive: 'The foot doesn’t point down when the calf is squeezed, suggesting an Achilles rupture. Refer for urgent review.',
    youtubeId: 'z-7cJ7LpCqY', // Physiotutors
  },
  'special_test:windlass': {
    how: 'Patient standing (or seated). Lift the big toe up as far as it goes, holding the rest of the foot steady.',
    positive: 'Reproduces the patient’s pain under the heel (plantar heel pain).',
    youtubeId: 'fg0PtnoAzSs', // Physiotutors
  },
  'special_test:dix_hallpike': {
    how: 'Patient long-sitting. Turn the head 45° to the test side, then lie them back quickly so the head hangs about 20° below the bed. Hold for at least 30 seconds and watch the eyes.',
    positive: 'Vertigo with up-beating, twisting nystagmus: posterior canal BPPV on the lower side.',
    caution: 'Check the neck and for vascular symptoms first. Use a modified position if neck movement is limited.',
    youtubeId: '7wMvTUPaNPo', // Physiotutors
  },
  'special_test:supine_roll': {
    how: 'Patient supine with the head raised about 30°. Turn the head quickly 90° to one side and watch the eyes, return to the middle, then turn to the other side.',
    positive: 'Side-to-side nystagmus with vertigo (horizontal canal BPPV). The stronger side helps find the affected ear.',
    caution: 'Check the neck and for vascular symptoms first.',
    youtubeId: 'XSXwlUUpkow', // Physiotutors
  },

  // ── Functional tests ───────────────────────────────────────────────────────
  'functional:tug': {
    how: 'Patient sits in a chair with arms. On “go” they stand, walk 3 metres at their normal pace, turn, walk back and sit down. Time from “go” until they’re seated. Their usual walking aid is allowed.',
    youtubeId: 'grrYoBucNPE',
  },
  'functional:sit_to_stand_5x': {
    how: 'Patient sits with arms folded and back against the chair. Time five full stands as fast as they safely can. Stop the clock the same way every visit and note if they had to use their arms.',
    youtubeId: 'PiSqEEw_BjM', // PaulPotterPT
  },
  'functional:chair_stand_30s': {
    how: 'Patient sits with arms folded. Count how many full stands they do in 30 seconds. If they’re more than halfway up at 30 seconds, count it.',
    youtubeId: 'O1BXw0abQLs', // Physiotutors
  },
  'functional:ten_metre_walk': {
    how: 'Patient walks 10 metres at their comfortable (or fast) speed. Time the middle 6 metres, leaving 2 metres to speed up and 2 to slow down. Enter the time: the speed is worked out for you. Use the same pace every visit.',
    positive: 'A change of about 0.1 m/s is meaningful. Under about 0.8 m/s usually means limited walking outside the home.',
    youtubeId: 'gYR7rBfVddY', // ReQuest Physical Therapy
  },
  'functional:six_minute_walk': {
    how: 'Patient walks as far as they can in 6 minutes up and down a flat, marked walkway, turning at cones. They can rest, but the clock keeps running. Record the distance in metres.',
    caution: 'Check vital signs before and after, and stop if they have chest pain or marked breathlessness.',
    youtubeId: 'Y4HyVv0Ll6s', // Dr. Galatea Strong, PT, DPT
  },
  'functional:single_leg_stance': {
    how: 'Patient stands on one leg with hands on hips and eyes open. Time until the lifted foot touches down, the standing foot moves or the hands come off the hips. Use the same maximum time every visit.',
    youtubeId: 'A9pi7_JRgwQ', // Physiotutors
  },
  'functional:functional_reach': {
    how: 'Patient stands side-on to a wall, feet hip width apart, arm raised forward to 90° with a closed fist. Mark the knuckles, ask them to reach forward as far as they can without stepping, and mark again. Record the difference in cm.',
    youtubeId: '_aJqJzt-U2s', // independent channel, check
  },
  'functional:nine_hole_peg': {
    how: 'Patient sits at a table and, using one hand, puts the nine pegs into the holes one at a time and then takes them out, as quickly as they can. Time each hand.',
    youtubeId: 'JaGX-ji9eMA', // Occupational Therapy Projects
  },

  // ── Pain and outcome measures ──────────────────────────────────────────────
  'pain:nprs': {
    how: 'Ask: “On a scale of 0 to 10, where 0 is no pain and 10 is the worst pain imaginable, how bad is your pain?” Say when: right now, at rest, on movement or at its worst in the last 24 hours.',
    positive: 'A change of about 2 points is meaningful to most patients.',
  },
  'psfs:psfs': {
    how: 'Ask the patient to name up to five activities they find hard or can’t do because of this problem. They score each from 0 (unable to do it) to 10 (able to do it as before). At later visits, score the same activities again.',
    positive: 'A change of about 2 points in the average is meaningful.',
  },
  'outcome:mskhq': {
    how: 'The patient answers the 14 questions on the official form about the last two weeks. Each scores 0–4; enter the total (0–56). Higher is better.',
    form: {
      label: 'Official form and licence',
      // Oxford University Innovation's page (sample form, scoring guide, licence request). Its PDFs
      // move when the site changes (the old /wp-content/ link went 404); this page address redirects.
      url: 'https://innovation.ox.ac.uk/licence-details/arthritis-uk-musculoskeletal-health-questionnaire-msk-hq',
    },
  },
  'outcome:lefs': {
    how: 'The patient scores 20 everyday activities (from getting in and out of the bath to running and hopping) from 0 (extreme difficulty or unable) to 4 (no difficulty) on the form. Enter the total (0–80). Higher is better.',
    positive: 'A change of about 9 points is meaningful.',
  },
  'outcome:spadi': {
    how: 'The patient marks 5 pain and 8 disability items about the last week, each 0–10, on the form. Add each part, divide by the most it could score (leaving out items they didn’t answer) and enter the total as a percentage. Lower is better.',
    positive: 'A change of about 8 to 13 points is meaningful.',
  },
  'outcome:dhi': {
    how: 'The patient answers 25 questions about how dizziness affects them: yes (4), sometimes (2) or no (0). Enter the total (0–100). Lower is better.',
    positive: 'Roughly: 16–34 mild, 36–52 moderate, 54 or more severe. A change of 18 points is a real change.',
  },
  'outcome:berg': {
    how: 'Score the 14 balance tasks (sitting, standing, transfers, reaching, turning, stepping) from 0 to 4 each and enter the total (0–56).',
    positive: 'A total under 45 suggests a higher risk of falls.',
    youtubeId: 'RxGxE7cWctc', // Physiotutors
  },
  'outcome:mas': {
    how: 'Move the limb through its full range in about one second and grade the resistance: 0 none; 1 a catch and release, or slight resistance at the end of range; 1+ a catch then slight resistance through less than half the range; 2 more resistance through most of the range but it moves easily; 3 considerable resistance, hard to move; 4 rigid.',
    youtubeId: 'AnVxtzt4sJA', // Physio Classroom
  },
  'outcome:custom': {
    how: 'Record any number you track, such as a hop distance or a plank time. Use the same name and unit every visit so it shows as one line on the progress chart.',
  },
}

export const guideFor = (kind: string, key: string): Guide | undefined => GUIDES[`${kind}:${key}`]

/** What each Oxford (MMT) grade means. */
export const MMT_MEANINGS: Record<string, string> = {
  '0': 'No contraction',
  '1': 'Flicker of contraction, no movement',
  '2': 'Moves with gravity taken away',
  '3': 'Moves against gravity',
  '4-': 'Against gravity and slight resistance',
  '4': 'Against gravity and moderate resistance',
  '4+': 'Against gravity and strong resistance',
  '5': 'Normal strength',
}
