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
};

export const consultationBookingPolicySections: readonly PolicySection[] = [
  {
    title: "1. Purpose of this policy",
    paragraphs: [
      "This Consultation & Booking Policy explains how Rehabify helps you request physiotherapy consultations through Joy, our WhatsApp assistant, and the Rehabify platform.",
      "Joy collects information to help route you to an appropriate physiotherapist. Joy does not diagnose medical conditions, replace an examination by a qualified clinician, or provide emergency care.",
    ],
  },
  {
    title: "2. Safety and clinical review",
    paragraphs: [
      "If the information you share suggests an emergency or urgent medical problem, we may direct you to emergency or medical care instead of continuing with a physiotherapy booking.",
      "Some cases may require a short specialist physiotherapy review before a routine booking can proceed. Where this option is available, it is a five-minute review priced at ₦6,000 and is not a substitute for emergency or doctor-led care.",
    ],
  },
  {
    title: "3. Matching and service options",
    paragraphs: [
      "Rehabify matches you with an approved physiotherapist using the information you provide, the therapist's configured service options, availability, and, for home visits, your city and area.",
    ],
    bullets: [
      "Home visits require your city and area so that we can check whether a therapist serves that location.",
      "Clinic and online appointments may be available without a home address.",
      "A suggested therapist or slot is not a confirmed appointment until the steps in section 4 are complete.",
    ],
  },
  {
    title: "4. Booking, payment, and confirmation",
    paragraphs: [
      "When you select a therapist and an available slot, Rehabify may place a temporary hold while you complete payment. A hold can expire if payment is not completed in time.",
      "Payments are processed by Paystack. The total amount and any applicable charges shown to you before payment are the authoritative amount for that booking.",
      "Payment alone does not confirm an appointment. A booking is confirmed only after Rehabify has verified the payment and the allocated physiotherapist has accepted the appointment. We will notify you of the resulting status.",
    ],
  },
  {
    title: "5. Provider response, replacements, and refunds",
    paragraphs: [
      "After a paid booking is sent to a physiotherapist, they have up to five hours to accept or decline it. If they decline or do not respond, Rehabify may show replacement therapists and their available slots for you to choose from.",
      "If a suitable replacement cannot be arranged, your case is sent to the Rehabify care team for manual contact and the applicable refund process. Patient-requested cancellations and refunds are handled under the Payment Policy.",
    ],
  },
  {
    title: "6. Online consultations",
    paragraphs: [
      "For an accepted online appointment, Rehabify provides a secure appointment link through its supported video service. Do not share this link with anyone else. The physiotherapist remains responsible for the clinical care provided during the session.",
    ],
  },
  {
    title: "7. Your information and consent",
    paragraphs: [
      "By asking us to match or book a consultation, you confirm that the information you provide is accurate to the best of your knowledge. You allow Rehabify to use the necessary contact, location, booking, and health information to arrange your care and communicate with the selected physiotherapist.",
      "We handle personal information in accordance with our Privacy Policy. You can choose not to proceed with a booking at any time before payment is verified.",
    ],
  },
  {
    title: "8. Changes and contact",
    paragraphs: [
      "This policy applies to the version displayed to you when you accept it. A later update will be published with a new version and effective date and will be presented before it applies to a new booking.",
      "For booking, payment, or policy questions, contact Rehabify at support@physioaroundme.com.",
    ],
  },
];

const canonicalPolicyText = consultationBookingPolicySections
  .map((section) => [section.title, ...section.paragraphs, ...(section.bullets ?? [])].join("\n"))
  .join("\n\n");

export const consultationBookingPolicy = {
  policy_id: "consultation-booking-policy",
  version: "2026-09-22",
  url: "https://physioaroundme.com/consultation-booking-policy",
  content_sha256: createHash("sha256").update(canonicalPolicyText, "utf8").digest("hex"),
  effective_at: "2026-09-22T00:00:00.000Z",
  acceptance_text: "I accept the Consultation & Booking Policy.",
  language: "en",
  approval_status: "APPROVED" as const,
};
