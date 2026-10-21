/**
 * Rehabify Access (assisted care): the answer options on the application form. Shared by the
 * public form and the admin review screen. Income is asked in bands only. We don't collect
 * documents or exact figures up front: reviewers verify what they need during review.
 */

export const SITUATIONS = [
  { value: "lost_income", label: "I've lost my job or income" },
  { value: "low_income", label: "My income doesn't cover the cost of care" },
  { value: "unemployed", label: "I'm not currently working" },
  { value: "student", label: "I'm a student" },
  { value: "retired", label: "I'm retired or on a pension" },
  { value: "caregiver", label: "I'm applying for someone I care for" },
  { value: "other", label: "Something else" },
] as const;

export const INCOME_BANDS = [
  { value: "none", label: "No regular income" },
  { value: "under_50k", label: "Under ₦50,000 a month" },
  { value: "50k_150k", label: "₦50,000 – ₦150,000 a month" },
  { value: "150k_300k", label: "₦150,000 – ₦300,000 a month" },
  { value: "over_300k", label: "Over ₦300,000 a month" },
  { value: "prefer_not", label: "I'd rather discuss this" },
] as const;

export const FUNDING_OPTIONS = [
  { value: "none", label: "No other funding" },
  { value: "hmo_partial", label: "HMO or insurance covers part of it" },
  { value: "employer_partial", label: "My employer helps with part of it" },
  { value: "family_partial", label: "Family can help with part of it" },
  { value: "unsure", label: "I'm not sure" },
] as const;

export const ACCESS_STATUS_LABELS: Record<string, string> = {
  submitted: "Received",
  under_review: "Being reviewed",
  approved: "Approved",
  declined: "Not approved",
  waitlisted: "On the waiting list",
  withdrawn: "Withdrawn",
};

export const isOption = (options: readonly { value: string }[], value: string) => options.some((o) => o.value === value);
