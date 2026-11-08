/**
 * Who someone is signing up as, chosen in the header's "Get started" menu, on the sign-up
 * page or inferred from the page they came from. It travels as `?as=<intent>` through
 * sign-up (email and Google alike, inside the redirect) to /role-selection, which sets the
 * role and opens the right onboarding without asking again.
 */
export type SignupIntent = "patient" | "physiotherapist" | "clinic_owner" | "doctor" | "family" | "partner";

type IntentDetails = {
  /** Header menu label. */
  menuLabel: string;
  /** Short chip label on the sign-up page. */
  chip: string;
  description: string;
  /** Sign-up page heading and subtitle. */
  title: string;
  subtitle: string;
};

export const SIGNUP_INTENTS: Record<SignupIntent, IntentDetails> = {
  patient: {
    menuLabel: "I'm a patient",
    chip: "Patient",
    description: "Book a physio and follow your recovery",
    title: "Create your patient account",
    subtitle: "Book physiotherapy and follow your recovery in one place.",
  },
  physiotherapist: {
    menuLabel: "I'm a physiotherapist",
    chip: "Physio",
    description: "Get patients and run your practice",
    title: "Join as a physiotherapist",
    subtitle: "Get matched with patients and manage your practice.",
  },
  clinic_owner: {
    menuLabel: "I run a clinic",
    chip: "Clinic",
    description: "Your team, patients and payments together",
    title: "Register your clinic",
    subtitle: "Bring your team, patients and payments into one place.",
  },
  doctor: {
    menuLabel: "Referring doctor",
    chip: "Doctor",
    description: "Refer patients and follow their progress",
    title: "Join as a referring doctor",
    subtitle: "Refer patients for physio and see how they're doing.",
  },
  family: {
    menuLabel: "Family / caregiver",
    chip: "Caregiver",
    description: "Arrange care for someone you look after",
    title: "Arrange care for a loved one",
    subtitle: "Book physio for a family member and follow their recovery.",
  },
  partner: {
    menuLabel: "Partner organisation",
    chip: "Partner",
    description: "HMOs, insurers and employers",
    title: "Apply for partner access",
    subtitle: "Create your account, then tell us about your organisation.",
  },
};

/** Shown first; the rest sit under "More" or a divider. */
export const PRIMARY_INTENTS: SignupIntent[] = ["patient", "physiotherapist", "clinic_owner"];
export const SECONDARY_INTENTS: SignupIntent[] = ["doctor", "family", "partner"];
/**
 * The header's "Get started" list: people getting care. Professionals sign up from their own
 * page (For professionals) so they read why to join first; the sign-up page still offers every role.
 */
export const HEADER_INTENTS: SignupIntent[] = ["patient", "family"];

const ALIASES: Record<string, SignupIntent> = {
  patient: "patient",
  physio: "physiotherapist",
  physiotherapist: "physiotherapist",
  clinic: "clinic_owner",
  clinic_owner: "clinic_owner",
  doctor: "doctor",
  referring_doctor: "doctor",
  family: "family",
  family_member: "family",
  caregiver: "family",
  carer: "family",
  partner: "partner",
};

export function parseIntent(value: string | null | undefined): SignupIntent | null {
  return (value && ALIASES[value.trim().toLowerCase()]) || null;
}

/** The account role an intent creates. Family members and caregivers get their own (care circle) account. */
export function roleForIntent(intent: SignupIntent): "patient" | "physiotherapist" | "clinic_owner" | "doctor" | "family_member" | null {
  if (intent === "family") return "family_member";
  if (intent === "partner") return null;
  return intent;
}

/** First onboarding page once the role is set. */
export function onboardingPathFor(intent: SignupIntent): string {
  switch (intent) {
    case "patient":
      return "/patient/step1";
    case "family":
      // The family portal asks who they care for (or opens their invite)
      return "/dashboard/family";
    case "physiotherapist":
      return "/physiotherapist";
    case "clinic_owner":
      return "/clinic-owner";
    case "doctor":
      return "/doctor";
    case "partner":
      return "/partners/portal";
  }
}

/** Where "Get started" sends a signed-out visitor. Partners have their own sign-up. */
export function signUpHrefFor(intent: SignupIntent): string {
  return intent === "partner" ? "/partners/sign-up" : `/sign-up?as=${intent}`;
}

/** Where sign-up continues to; role-selection applies the intent and moves on. */
export function afterSignUpPathFor(intent: SignupIntent | null): string {
  return intent ? `/role-selection?as=${intent}` : "/role-selection";
}

const PATH_INTENTS: [RegExp, SignupIntent][] = [
  // A clinic or physio invited them: they join as a patient, nothing else to choose
  [/^\/patient-invite(\/|$)/, "patient"],
  // Someone invited them to help with a relative's care
  [/^\/care-invite(\/|$)/, "family"],
  [/^\/platform\/doctors(\/|$)/, "doctor"],
  [/^\/(platform\/clinics|clinic-owner)(\/|$)/, "clinic_owner"],
  [/^\/(platform\/physiotherapists|physiotherapist|payout-policy|physio-register)(\/|$)/, "physiotherapist"],
  [/^\/platform\/family(\/|$)/, "family"],
  [/^\/(partners|partnerships)(\/|$)/, "partner"],
  [/^\/(platform\/patients|get-care|find-a-physio|find-my-physio|pricing|rehabify-access|meet-joy|recovery-clinic)(\/|$)/, "patient"],
];

/** The option to suggest on this page, if the page says who it's for. */
export function intentForPath(pathname: string | null | undefined): SignupIntent | null {
  if (!pathname) return null;
  return PATH_INTENTS.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

const STORAGE_KEY = "rh_signup_intent";
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

/** Remembers the visitor's choice so a later sign-up (even via "Sign in" with Google) starts from it. */
export function rememberIntent(intent: SignupIntent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ intent, at: Date.now() }));
  } catch {
    // Storage blocked: the choice still travels in the URL
  }
}

export function readRememberedIntent(): SignupIntent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { intent, at } = JSON.parse(raw) as { intent?: string; at?: number };
    if (!at || Date.now() - at > REMEMBER_MS) return null;
    return parseIntent(intent);
  } catch {
    return null;
  }
}

export function forgetIntent() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear
  }
}
