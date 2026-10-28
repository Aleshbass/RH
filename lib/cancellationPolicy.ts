/**
 * Payment Policy 4.3 and the business model's payout rules, for a Rehabify Care booking the
 * PATIENT cancels (times are from the appointment's start):
 * - 24 hours or more before: full refund (session and travel), or a free reschedule; no payout.
 * - 2 to 24 hours before: a free reschedule once within 14 days, or a 50% refund of the session
 *   fee plus the travel charge (the physio hasn't set off); the physio is paid 50%.
 * - Less than 2 hours before, or a no-show: no refund; the physio is paid in full, travel too.
 * The physio cancelling always means a full refund (or another physio) and no payout.
 */
const HOUR = 60 * 60 * 1000;

export type CancelTier = 'early' | 'late' | 'very_late';

export function patientCancelTier(sessionStart: number, now: number): CancelTier {
  const hours = (sessionStart - now) / HOUR;
  if (hours >= 24) return 'early';
  if (hours >= 2) return 'late';
  return 'very_late';
}

export type CancelMoney = {
  /** What the patient paid in total, and the travel part of it */
  paidKobo: number;
  travelKobo: number;
  /** The physio's fixed payout and their share of travel */
  payoutKobo: number;
  travelShareKobo: number;
};

export type CancelOutcome = { tier: CancelTier; refundKobo: number; physioPayoutKobo: number; canReschedule: boolean };

export function patientCancelOutcome(money: CancelMoney, tier: CancelTier, rescheduleUsed: boolean): CancelOutcome {
  const sessionKobo = Math.max(0, money.paidKobo - money.travelKobo);
  if (tier === 'early') return { tier, refundKobo: money.paidKobo, physioPayoutKobo: 0, canReschedule: true };
  if (tier === 'late') {
    return {
      tier,
      refundKobo: Math.round(sessionKobo / 2) + money.travelKobo,
      physioPayoutKobo: Math.round(money.payoutKobo / 2),
      canReschedule: !rescheduleUsed,
    };
  }
  return { tier, refundKobo: 0, physioPayoutKobo: money.payoutKobo + money.travelShareKobo, canReschedule: false };
}
