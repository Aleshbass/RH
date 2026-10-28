/**
 * Clinic software plans (company business model, October 2026). Shown on the website's clinic
 * page; clinics will also see their plan in their account once subscriptions are billed.
 * Prices exclude VAT.
 */

export type ClinicPlan = {
  id: 'starter' | 'growth' | 'enterprise';
  name: string;
  price: string;
  priceNote: string;
  seats: string;
  programmes: string;
  /** Clinician seats and active patient programme allowance (null = as agreed) */
  seatLimit: number | null;
  programmeAllowance: number | null;
  monthlyFeeKobo: number | null;
  featured?: boolean;
};

export const CLINIC_PLANS: ClinicPlan[] = [
  {
    id: 'starter',
    name: 'Clinic Starter',
    price: '₦25,000',
    priceNote: 'per month',
    seats: 'Up to 3 clinicians',
    programmes: '30 active patient programmes',
    seatLimit: 3,
    programmeAllowance: 30,
    monthlyFeeKobo: 2_500_000,
  },
  {
    id: 'growth',
    name: 'Clinic Growth',
    price: '₦60,000',
    priceNote: 'per month',
    seats: 'Up to 10 clinicians',
    programmes: '100 active patient programmes',
    seatLimit: 10,
    programmeAllowance: 100,
    monthlyFeeKobo: 6_000_000,
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    priceNote: 'per agreement',
    seats: 'Clinicians as agreed',
    programmes: 'Patient programmes as agreed',
    seatLimit: null,
    programmeAllowance: null,
    monthlyFeeKobo: null,
  },
];

export const CLINIC_PROGRAMME_OVERAGE_KOBO = 50_000;
// Allowance warnings at 80% and 100% are sent by convex/clinicBilling.ts
export const CLINIC_PROGRAMME_OVERAGE =
  'Over your allowance? Each extra active patient programme is ₦500 a month. We let you know at 80% and 100%.';

export const CLINIC_PLAN_INCLUDES = [
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

export const CLINIC_PLAN_EXCLUDES = ['Joy (our WhatsApp assistant)', 'Flex Max', 'Rehabify Care patient referrals'];
