/**
 * How a clinic's online payment is shared. Pure functions, shared by the backend,
 * the Paystack split and the billing screens so every number matches.
 *
 * The numbers are set by Rehabify admins (Admin → Clinic fees, stored in the
 * `clinicFeeSettings` table); DEFAULT_CLINIC_FEE_CONFIG is used until an admin saves.
 *
 * Model for a payment made online through Paystack:
 *   1. Paystack's card fee comes off the top: a percentage + a flat fee (the flat fee is
 *      waived on small payments), capped.
 *   2. What's left is split: the clinic's share (e.g. 80%) and Rehabify's share (e.g. 20%).
 *   3. Stamp duty (EMTL) is charged on the payout from Rehabify/Paystack to the clinic's
 *      bank: a flat amount when that payout is at or above a threshold. It comes out of the
 *      clinic's share, so the clinic receives its share minus stamp duty.
 * Cash, transfer and POS payments recorded by the clinic carry no fees: the clinic keeps 100%.
 *
 * Each invoice stores the amounts worked out when it was created, so changing the
 * settings never alters invoices already sent.
 */

export type ClinicFeeConfig = {
  /** Clinic's share of the payment after the Paystack fee, in percent (Rehabify gets the rest) */
  clinicSharePercent: number;
  paystackPercent: number;
  paystackFlatKobo: number;
  /** The flat fee is not charged on payments below this */
  paystackFlatWaivedBelowKobo: number;
  paystackFeeCapKobo: number;
  /** Stamp duty on the clinic's payout */
  stampDutyKobo: number;
  /** Payouts at or above this pay stamp duty */
  stampDutyFromKobo: number;
};

/** Paystack's published local card rates and the ₦50 EMTL, with an 80/20 split. */
export const DEFAULT_CLINIC_FEE_CONFIG: ClinicFeeConfig = {
  clinicSharePercent: 80,
  paystackPercent: 1.5,
  paystackFlatKobo: 10_000, // ₦100
  paystackFlatWaivedBelowKobo: 250_000, // ₦2,500
  paystackFeeCapKobo: 200_000, // ₦2,000
  stampDutyKobo: 5_000, // ₦50
  stampDutyFromKobo: 1_000_000, // ₦10,000
};

/** Fill any missing or invalid value with the default. */
export function normalizeClinicFeeConfig(config?: Partial<ClinicFeeConfig> | null): ClinicFeeConfig {
  const pick = (key: keyof ClinicFeeConfig) => {
    const value = config?.[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : DEFAULT_CLINIC_FEE_CONFIG[key];
  };
  return {
    clinicSharePercent: Math.min(100, pick("clinicSharePercent")),
    paystackPercent: pick("paystackPercent"),
    paystackFlatKobo: pick("paystackFlatKobo"),
    paystackFlatWaivedBelowKobo: pick("paystackFlatWaivedBelowKobo"),
    paystackFeeCapKobo: pick("paystackFeeCapKobo"),
    stampDutyKobo: pick("stampDutyKobo"),
    stampDutyFromKobo: pick("stampDutyFromKobo"),
  };
}

export type ClinicPaymentSplit = {
  totalKobo: number;
  paystackFeeKobo: number;
  /** total minus the Paystack fee: the amount that is shared */
  netKobo: number;
  rehabifyKobo: number;
  /** clinic's share before stamp duty: what Paystack settles to the clinic's subaccount */
  clinicShareKobo: number;
  /** stamp duty on the payout to the clinic's bank */
  stampDutyKobo: number;
  /** what lands in the clinic's bank */
  clinicKobo: number;
  /** the percentages used */
  clinicSharePercent: number;
  rehabifySharePercent: number;
};

export function paystackFeeKobo(totalKobo: number, config: ClinicFeeConfig = DEFAULT_CLINIC_FEE_CONFIG): number {
  const percentPart = Math.round((totalKobo * config.paystackPercent) / 100);
  const flatPart = totalKobo >= config.paystackFlatWaivedBelowKobo ? config.paystackFlatKobo : 0;
  return Math.min(percentPart + flatPart, config.paystackFeeCapKobo, totalKobo);
}

/** Stamp duty on a payout of this size. */
export function stampDutyKobo(payoutKobo: number, config: ClinicFeeConfig = DEFAULT_CLINIC_FEE_CONFIG): number {
  return payoutKobo > 0 && payoutKobo >= config.stampDutyFromKobo ? Math.min(config.stampDutyKobo, payoutKobo) : 0;
}

/** The split for a payment made online through Paystack. */
export function clinicPaymentSplit(
  totalKobo: number,
  config: ClinicFeeConfig = DEFAULT_CLINIC_FEE_CONFIG
): ClinicPaymentSplit {
  const total = Math.max(0, Math.round(totalKobo));
  const paystack = paystackFeeKobo(total, config);
  const net = Math.max(0, total - paystack);
  const clinicShare = Math.round((net * config.clinicSharePercent) / 100);
  const stamp = stampDutyKobo(clinicShare, config);
  return {
    totalKobo: total,
    paystackFeeKobo: paystack,
    netKobo: net,
    rehabifyKobo: net - clinicShare,
    clinicShareKobo: clinicShare,
    stampDutyKobo: stamp,
    clinicKobo: clinicShare - stamp,
    clinicSharePercent: config.clinicSharePercent,
    rehabifySharePercent: Math.round((100 - config.clinicSharePercent) * 100) / 100,
  };
}
