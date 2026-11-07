import { v } from "convex/values";

/**
 * Writes made on a phone without internet arrive later, sometimes more than once (a retry after
 * a lost answer). Each carries the id the phone gave it, so it's saved once, and the time it was
 * made, so it's dated when it happened rather than when it arrived (lib/offline/outbox.ts).
 */
export const offlineWriteArgs = {
  clientId: v.optional(v.string()),
  occurredAt: v.optional(v.number()),
};

/** As long as a phone keeps offline data (lib/offline/vault.ts): older times are brought forward. */
export const OFFLINE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** The phone's id for the write, if it looks like one (random, 8-64 URL-safe characters). */
export function cleanClientId(clientId: string | undefined): string | undefined {
  return clientId && /^[A-Za-z0-9_-]{8,64}$/.test(clientId) ? clientId : undefined;
}

/**
 * When it happened, as the phone says, kept within sense: never in the future (a phone clock
 * that's ahead) and never more than 14 days back. Without a time, it happened now.
 */
export function whenItHappened(occurredAt: number | undefined, now: number): number {
  if (occurredAt === undefined || !Number.isFinite(occurredAt)) return now;
  return Math.min(now, Math.max(now - OFFLINE_MAX_AGE_MS, Math.round(occurredAt)));
}

/** True when it reached us well after it happened (said so in alerts: "logged offline"). */
export function arrivedLate(at: number, now: number) {
  return now - at > 60 * 60 * 1000;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 2 Nov" in Lagos time (UTC+1, no daylight saving), without relying on Intl time zone data. */
export function lagosDayLabel(ms: number) {
  const d = new Date(ms + 3_600_000);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
