import { createHash } from "crypto";

/**
 * The single canonical source for the policy that Joy presents to patients.
 *
 * Keep the public page and the service API tied to this content. If any
 * substantive wording changes, publish a new version and effective date; do
 * not overwrite the version a previous patient accepted.
 */
type PolicySection = {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
  readonly table?: { readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] };
  /** Paragraphs shown after the table */
  readonly after?: readonly string[];
};

export const consultationBookingPolicyIntro =
  "This Policy explains how a Rehabify Care appointment is requested, matched, confirmed and delivered, and what you and your Physiotherapist can expect of each other. Joy shows you this Policy and asks you to accept it before you request a booking. It forms part of our Terms of Service and is issued by Rehabify Limited (RC 6989173).";

export const consultationBookingPolicySections: readonly PolicySection[] = [
  {
    title: "1. Purpose and scope",
    paragraphs: [
      "1.1 This Policy applies to Clinical Services booked through Rehabify Care, whether you book through Joy on WhatsApp, our website or our app. The Payment Policy governs prices, cancellations and refunds; this Policy cross-references it where relevant.",
      "1.2 If you are a patient of an Independent Physiotherapist or a Clinic, their own booking terms apply to appointments with them, although sections 2, 6.4 and 13 of this Policy (safety, recording and conduct) apply whenever you use the Platform.",
    ],
  },
  {
    title: "2. Safety first: screening and emergencies",
    paragraphs: [
      "**2.1 Joy is not a clinician.** Joy collects information to route you to an appropriate service and Physiotherapist. Joy does not diagnose, prescribe, replace an examination or provide emergency care.",
      "**2.2 Safety screening.** Before booking, Joy or our care team will ask about symptoms that may need urgent medical attention or that make physiotherapy unsafe without a doctor's review (\"red flags\"). Please answer honestly; this protects you.",
      "**2.3 Emergencies.** If you describe red-flag or urgent symptoms, we will stop the booking and direct you to emergency or doctor-led care. **For any emergency, call 112 or go to the nearest hospital emergency department. Do not wait for a reply from Joy, our team or a Physiotherapist.** If we stop a booking for safety reasons after you have paid, you receive a full refund.",
      "**2.4 Clinical review before booking.** Some cases need a short review by a Physiotherapist before a routine booking can go ahead, for example after recent surgery, a recent fracture, a neurological event, during pregnancy, for complex chronic pain, or for a Child. Where that applies, we will tell you and may suggest the initial recovery consultation.",
      "**2.5 Doctor's clearance.** A Physiotherapist may ask for a referral letter, a surgeon's post-operative instructions, imaging reports or medical clearance before treating you. If they cannot treat you safely without it, they will explain why and what to do next.",
    ],
  },
  {
    title: "3. Choosing the right service",
    paragraphs: [],
    table: {
      head: ["Service", "Best for", "Format"],
      rows: [
        [
          "Initial recovery consultation (15–20 min)",
          "An initial clinician-led conversation: what is likely going on, whether physiotherapy is suitable, what to do next",
          "Video or phone",
        ],
        ["Comprehensive virtual assessment (60 min)", "A full assessment and care plan where a hands-on examination is not essential", "Video"],
        ["Initial home assessment (90 min)", "A full assessment and care plan with hands-on examination, at home", "Home visit"],
        ["Virtual treatment session (30 min)", "Guided exercise, progression and education after an assessment", "Video"],
        ["Home treatment session (60 min)", "Hands-on and exercise-based treatment after an assessment", "Home visit"],
        ["Virtual or home review (45–60 min)", "Measuring progress and updating the care plan", "Video or home visit"],
      ],
    },
    after: [
      "3.1 The initial recovery consultation is optional. You may go straight to a comprehensive assessment.",
      "3.2 Treatment sessions normally follow an assessment by a Rehabify Physiotherapist, or a recent assessment from another registered clinician that your Physiotherapist accepts, so that treatment is based on a proper clinical picture.",
      "3.3 If a Physiotherapist decides during a virtual session that you need an in-person examination, they will tell you and recommend a home assessment or another appropriate option. You are not charged twice for the same assessment unless you agree to a new service.",
    ],
  },
  {
    title: "4. Matching you with a Physiotherapist",
    paragraphs: [
      "**4.1 How we match.** We match you with an approved Network Physiotherapist using the information you give us, the Physiotherapist's recorded competencies and service options, their availability and, for home visits, your city and area. Every Network Physiotherapist holds current MRTB registration and an annual practising licence, which we verify before activation and at each renewal.",
      "**4.2 Your preferences.** You may ask for a Physiotherapist of a particular sex, or who speaks a particular language. We will meet the request where we can and tell you before you pay if we cannot.",
      "**4.3 Home-visit locations.** Home visits require your city and area so we can check whether a Physiotherapist serves your location and calculate the travel charge. Virtual appointments do not need a home address, but we will ask where you are during the session, so help can be sent in an emergency.",
      "**4.4 Changing Physiotherapist.** You may ask to see a different Physiotherapist at any time, without giving a reason. Your records will be available to your new Physiotherapist, so your care continues.",
      "**4.5 No guarantee.** A suggested Physiotherapist or slot is not a confirmed appointment until section 5.3 is satisfied.",
    ],
  },
  {
    title: "5. Booking, payment and confirmation",
    paragraphs: [
      "**5.1 Holding a slot.** When you choose a Physiotherapist and slot, we place a temporary hold while you pay. The hold expires if payment is not completed in time.",
      "**5.2 Payment.** Payments are processed by Paystack. The total shown to you before payment, including any travel charge, is the authoritative amount for that booking. See the Payment Policy.",
      "**5.3 Confirmation.** A booking is confirmed only when (a) Rehabify has verified your payment and (b) the Physiotherapist has accepted the appointment. We will notify you by WhatsApp, email or in-app message when it is confirmed.",
      "**5.4 Physiotherapist response time.** After a paid booking is sent to a Physiotherapist, they have up to 2 hours to accept or decline (and never later than 10 minutes before the appointment starts). If they decline or do not respond, we will show you replacement Physiotherapists and slots. You may choose one, or ask for a full refund.",
      "**5.5 No replacement available.** If no suitable replacement can be arranged, a member of our care team will contact you personally within 1 business day, and you will be entitled to a full refund.",
      "**5.6 Booking for someone else.** You may book for another adult with their agreement, or for a Child as their parent or legal guardian. The Patient's own information must be used for clinical purposes.",
    ],
  },
  {
    title: "6. Consent, chaperones and children",
    paragraphs: [
      "**6.1 Informed consent.** Before assessing or treating you, your Physiotherapist will explain what they propose to do, why, the main benefits, risks and alternatives (including doing nothing), and what it costs if it is not already paid for. You may ask questions, take time to decide and say no. Your consent is recorded in your clinical record.",
      "**6.2 Hands-on care.** Physiotherapy can involve touching, moving or examining parts of your body and may require you to remove some clothing. Your Physiotherapist will explain this first, ask for your consent each time, offer you a cover or suitable clothing, and stop immediately if you ask. You may withdraw consent at any point in a session.",
      "**6.3 Chaperones.** You may have a family member, friend or chaperone present for any session, in person or on screen. If you want Rehabify to arrange a chaperone for a home visit, tell us when you book, and we will try to arrange one.",
      "**6.4 No recording without consent.** Sessions are not recorded by Rehabify. Neither you nor your Physiotherapist may record, photograph or stream a session, or any part of it, without the express consent of everyone present. With your consent, your Physiotherapist may record short exercise clips for your programme; these are stored securely in your clinical record and never used for marketing.",
      "**6.5 Children.** A parent, legal guardian or responsible adult nominated by them must be present for the whole of every session with a Child (anyone under 18), unless the Physiotherapist agrees otherwise in writing for a Child aged 16 or 17 in line with law and professional guidance. The parent or guardian gives consent to treatment, and the Physiotherapist will also explain the care to the Child in a way they understand and take their views into account.",
    ],
  },
  {
    title: "7. Virtual sessions",
    paragraphs: [
      "**7.1 Your link.** For an accepted virtual appointment, Rehabify provides a secure link through its supported video service. Do not share the link with anyone else.",
      "**7.2 What you need.** A smartphone, tablet or computer with a camera, microphone and a stable internet connection; enough clear floor space to move safely; any equipment your Physiotherapist asked you to have; and a private place where you are comfortable discussing your health.",
      "**7.3 Identity and location.** At the start of each session, your Physiotherapist will confirm your identity and the address where you are, so that help can be sent if you become unwell.",
      "**7.4 Safety during exercise.** Only do exercises you feel safe doing. Have a stable chair or support nearby. Stop and tell your Physiotherapist immediately if you feel pain beyond what they described, dizziness, chest discomfort or shortness of breath.",
      "**7.5 Connection problems.** If the connection drops, both of you should try to rejoin for up to 10 minutes. If the session cannot continue, the Payment Policy explains whether it is rebooked free or refunded.",
      "**7.6 Patients outside Nigeria.** Rehabify Care is designed for Patients in Nigeria. If you will be outside Nigeria at the time of a virtual session, tell us before booking; a Physiotherapist may be unable to treat you if their licence does not allow it where you are.",
    ],
  },
  {
    title: "8. Home visits",
    paragraphs: [
      "**8.1 Address.** You must give a complete and accurate address and directions, and tell us of anything the Physiotherapist should know before arriving (for example, gate access, parking, stairs or pets).",
      "**8.2 Identification.** Your Physiotherapist will show Rehabify identification on arrival, and their name and photo will be in your booking confirmation. Do not let anyone in who cannot identify themselves; contact us if in doubt.",
      "**8.3 A safe, suitable space.** Please provide a clean, reasonably private space with enough room to move, secure any animals, and make sure an adult is present if the Patient is a Child.",
      "**8.4 Safety of Physiotherapists.** A Physiotherapist may decline to start, or may end, a home visit if they reasonably believe their safety or the Patient's safety is at risk, including because of threatening behaviour, intoxication, an unsafe environment or the absence of a required adult. They will tell Rehabify promptly. The Payment Policy explains how this affects payment.",
      "**8.5 Travel delays.** Physiotherapists plan for traffic, but delays happen. If your Physiotherapist expects to be more than 15 minutes late, they or we will tell you as soon as possible. If they are more than 30 minutes late without your agreement, you may cancel for a full refund including the travel charge.",
      "**8.6 Equipment.** Your Physiotherapist will bring the portable equipment needed for the session. If you need to buy equipment for your home programme, they will explain your options; you are never required to buy from a particular seller.",
    ],
  },
  {
    title: "9. Lateness, rescheduling and cancellation",
    paragraphs: [
      "9.1 Please arrive on time (or join your virtual session on time). If you are late, the session still ends at the scheduled time so the next Patient is not delayed. If you are more than 15 minutes late without telling us, the session may be treated as a missed appointment.",
      "9.2 You may reschedule or cancel through your account, Joy or hello@myrehabifyhealth.com. Refunds, late-cancellation charges and exceptions are set out in section 4 of the Payment Policy. In short: cancel 24 hours or more before for a full refund; between 2 and 24 hours before, you may reschedule once free within 14 days or take a 50% refund; within 2 hours, or if you do not attend, the session fee is not refunded, except in an emergency or other serious event outside your control.",
      "9.3 If your Physiotherapist must cancel or cannot attend, we will tell you as soon as possible and offer a replacement or a full refund.",
    ],
  },
  {
    title: "10. Your care journey",
    paragraphs: [
      "**10.1 Care plans.** After an assessment, your Physiotherapist will agree goals with you and recommend a care plan, including the type and likely number of sessions, the home programme and when to reassess. The number of sessions is a clinical estimate, not a commitment, and you are free to accept, decline or seek a second opinion.",
      "**10.2 No unnecessary care.** Recommendations are based on clinical need. Rehabify does not set session targets for Physiotherapists or reward them for recommending more sessions or digital services.",
      "**10.3 Reassessment and discharge.** Your Physiotherapist will review your progress and update or end your care plan when your goals are met, when physiotherapy is no longer helping, or when you choose to stop. On discharge, you will receive a short summary and advice on staying well.",
      "**10.4 Referral onward.** If your Physiotherapist thinks you need a doctor or another professional, they will tell you and, with your consent, send a summary to that professional.",
      "**10.5 Keeping your referrer informed.** If a doctor or partner referred you, we will send them progress or discharge updates only with your consent.",
    ],
  },
  {
    title: "11. Between sessions",
    paragraphs: [
      "**11.1 Home programme.** Your Physiotherapist will give you a home programme. The essential instructions are always available to you free of charge (Basic). Flex and Flex Max add interactive demonstrations, progress tracking and Joy support, and are included in some Rehabify Care packages.",
      "**11.2 Contacting your Physiotherapist.** Please use the Platform or Joy to message about your care, so messages form part of your record and reach the right person. Physiotherapists are not expected to respond outside their working hours. Messages are not monitored for emergencies.",
      "**11.3 If you feel worse.** If your symptoms worsen after a session, tell Joy or your Physiotherapist. If it is urgent, follow section 2.3.",
    ],
  },
  {
    title: "12. Your records",
    paragraphs: [
      "Your Physiotherapist keeps a clinical record of each assessment and session in the Platform. You may access and obtain a copy of your record, and ask for it to be corrected or sent to another provider, under our Privacy Policy. We keep records securely for the period described there.",
    ],
  },
  {
    title: "13. Conduct and safeguarding",
    paragraphs: [
      "**13.1 What you can expect of your Physiotherapist.** Courtesy and respect; punctuality; clear explanations in a language and manner you understand; consent before any examination or treatment; privacy and confidentiality; professional boundaries; and no personal, romantic or financial relationship with you.",
      "**13.2 What we ask of you.** Courtesy and respect towards your Physiotherapist and our team; honest information about your health; following agreed safety instructions; and payment through Rehabify for Rehabify Care bookings. Do not pay a Network Physiotherapist directly for a Rehabify Care session or offer them gifts beyond tokens of nominal value.",
      "**13.3 Zero tolerance.** We do not tolerate harassment, abuse, discrimination, violence or sexual misconduct by anyone. Report concerns to us immediately. We may suspend accounts or Physiotherapists while we investigate, and we will report matters to the MRTB, the police or other authorities where the law requires or safety demands.",
      "**13.4 Safeguarding.** If a Physiotherapist has reason to believe a Child or vulnerable adult is at risk of harm, they will follow Rehabify's safeguarding procedure, which may involve sharing information with the relevant authorities as the law permits.",
    ],
  },
  {
    title: "14. Complaints",
    paragraphs: [
      "You can complain through Joy or at hello@myrehabifyhealth.com. We acknowledge complaints within 2 business days and aim to resolve them within 14 business days. Complaints about clinical care are reviewed by a registered physiotherapist on our clinical governance team who was not involved in your care. You may also contact the MRTB about a Physiotherapist's professional conduct, or the Federal Competition and Consumer Protection Commission about consumer matters.",
    ],
  },
  {
    title: "15. Versions and contact",
    paragraphs: [
      "This Policy applies in the version shown to you when you accept it. A later version will be published with a new version number and effective date and shown to you before it applies to a new booking. It does not change bookings already confirmed.",
      "Rehabify Limited · hello@myrehabifyhealth.com · Joy on WhatsApp +234 806 152 5811",
    ],
  },
];

const canonicalPolicyText = [
  consultationBookingPolicyIntro,
  ...consultationBookingPolicySections.map((section) =>
    [
      section.title,
      ...section.paragraphs,
      ...(section.bullets ?? []),
      ...(section.table ? [section.table.head.join(" | "), ...section.table.rows.map((row) => row.join(" | "))] : []),
      ...(section.after ?? []),
    ].join("\n")
  ),
].join("\n\n");

export const consultationBookingPolicy = {
  policy_id: "consultation-booking-policy",
  version: "2026-11-06",
  url: "https://physioaroundme.com/consultation-booking-policy",
  content_sha256: createHash("sha256").update(canonicalPolicyText, "utf8").digest("hex"),
  effective_at: "2026-11-06T00:00:00.000Z",
  acceptance_text: "I accept the Consultation & Booking Policy.",
  language: "en",
  approval_status: "APPROVED" as const,
};
