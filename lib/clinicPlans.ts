/**
 * Clinic software plans. These are the defaults; an admin can change the prices, the lines on
 * each plan card and the included / not-included lists in Admin › Clinic plans (stored in Convex
 * clinicPlanSettings and merged here by mergeClinicPlans). Shown on the website's clinic page, in
 * the admin subscription tab and used for the fee when an admin puts a clinic on a plan.
 * Prices exclude VAT.
 */

export type ClinicPlanId = 'starter' | 'growth' | 'enterprise';

export type ClinicPlan = {
  id: ClinicPlanId;
  name: string;
  /** "₦25,000", or "Custom" for Enterprise */
  price: string;
  priceNote: string;
  /** The lines on the plan card */
  features: string[];
  /** Clinician seats (UNLIMITED_SEATS = unlimited) and patients with Joy recovery support; null = as agreed */
  seatLimit: number | null;
  programmeAllowance: number | null;
  monthlyFeeKobo: number | null;
  featured?: boolean;
};

/** "Unlimited clinician access": large enough never to be reached */
export const UNLIMITED_SEATS = 10_000;

export function isUnlimitedSeats(seatLimit: number | null | undefined) {
  return typeof seatLimit === 'number' && seatLimit >= UNLIMITED_SEATS;
}

export function seatsLabel(seatLimit: number) {
  return isUnlimitedSeats(seatLimit) ? 'unlimited clinicians' : `up to ${seatLimit} clinician${seatLimit === 1 ? '' : 's'}`;
}

export function nairaPrice(kobo: number | null) {
  return kobo === null ? 'Custom' : `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
}

export const DEFAULT_CLINIC_PLANS: ClinicPlan[] = [
  {
    id: 'starter',
    name: 'Clinic Starter',
    price: '₦25,000',
    priceNote: 'per month',
    features: ['Unlimited clinician access', 'Unlimited access to digital recovery support (Joy) for 30 patients'],
    seatLimit: UNLIMITED_SEATS,
    programmeAllowance: 30,
    monthlyFeeKobo: 2_500_000,
  },
  {
    id: 'growth',
    name: 'Clinic Growth',
    price: '₦45,000',
    priceNote: 'per month',
    features: ['Unlimited clinician access', 'Unlimited access to digital recovery support (Joy) for 100 patients'],
    seatLimit: UNLIMITED_SEATS,
    programmeAllowance: 100,
    monthlyFeeKobo: 4_500_000,
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    priceNote: 'per agreement',
    features: ['Clinicians as agreed', 'Digital recovery support (Joy) for patients as agreed'],
    seatLimit: null,
    programmeAllowance: null,
    monthlyFeeKobo: null,
  },
];

/** The defaults; code that can't read Convex (the agreement order form) uses these. */
export const CLINIC_PLANS: ClinicPlan[] = DEFAULT_CLINIC_PLANS;

export const CLINIC_PROGRAMME_OVERAGE_KOBO = 50_000;
// Allowance warnings at 80% and 100% are sent by convex/clinicBilling.ts
export const CLINIC_PROGRAMME_OVERAGE =
  'More patients than your plan covers? Each extra patient is ₦500 a month. We let you know at 80% and 100%.';

export const DEFAULT_CLINIC_PLAN_INCLUDES = [
  'Clinical records with assessment and SOAP templates',
  'Scheduling for in-clinic and virtual sessions',
  'Staff and role-based access',
  'Exercise library and custom exercises',
  // A clinic's patients get their home programme as part of the plan: never charge them for Flex
  'Home programmes and progress tracking for your patients',
  'Invoicing and payment links',
  'Reporting dashboards',
  'Data export',
  'Email support',
];

export const DEFAULT_CLINIC_PLAN_EXCLUDES = ['Flex Max', 'Rehabify Care patient referrals'];

export const CLINIC_PLAN_INCLUDES = DEFAULT_CLINIC_PLAN_INCLUDES;
export const CLINIC_PLAN_EXCLUDES = DEFAULT_CLINIC_PLAN_EXCLUDES;

/** What an admin saved (Convex clinicPlanSettings): per plan, plus the shared lists. */
export type SavedClinicPlans = {
  plans: {
    id: ClinicPlanId;
    name?: string;
    monthlyFeeKobo?: number | null;
    priceNote?: string;
    features?: string[];
    seatLimit?: number | null;
    programmeAllowance?: number | null;
    featured?: boolean;
  }[];
  includes?: string[];
  excludes?: string[];
};

export type ClinicPlanCatalogue = { plans: ClinicPlan[]; includes: string[]; excludes: string[] };

const cleanList = (items: string[] | undefined) => (items ?? []).map((s) => s.trim()).filter(Boolean);

/** Saved edits layered over the defaults. Enterprise always stays "as agreed". */
export function mergeClinicPlans(saved: SavedClinicPlans | null | undefined): ClinicPlanCatalogue {
  const plans = DEFAULT_CLINIC_PLANS.map((plan): ClinicPlan => {
    const edit = saved?.plans.find((p) => p.id === plan.id);
    if (!edit) return plan;
    const enterprise = plan.id === 'enterprise';
    const monthlyFeeKobo = enterprise ? null : edit.monthlyFeeKobo ?? plan.monthlyFeeKobo;
    const features = cleanList(edit.features);
    return {
      ...plan,
      name: edit.name?.trim() || plan.name,
      monthlyFeeKobo,
      price: nairaPrice(monthlyFeeKobo),
      priceNote: edit.priceNote?.trim() || plan.priceNote,
      features: features.length ? features : plan.features,
      seatLimit: enterprise ? null : edit.seatLimit ?? plan.seatLimit,
      programmeAllowance: enterprise ? null : edit.programmeAllowance ?? plan.programmeAllowance,
      featured: edit.featured ?? plan.featured,
    };
  });
  return {
    plans,
    includes: saved?.includes === undefined ? DEFAULT_CLINIC_PLAN_INCLUDES : cleanList(saved.includes),
    excludes: saved?.excludes === undefined ? DEFAULT_CLINIC_PLAN_EXCLUDES : cleanList(saved.excludes),
  };
}
