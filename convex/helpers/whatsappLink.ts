import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizePhone } from "./partnerShared";
import { isJoyLoginEmail } from "../../lib/auth/joyLoginEmail";

/**
 * Linking a WhatsApp number (Joy) to a Rehabify website account. Joy may only attach its records
 * to a website account once the owner has confirmed with a code emailed to that account
 * (joyOperations patient_link_request / patient_link_confirm). A matching phone number alone is
 * not proof: website phone numbers are typed in, never verified.
 */

export const JOY_PLACEHOLDER_PREFIX = "joy-whatsapp:";

// Records created for a patient before they had their own login (see users.ts)
const PLACEHOLDER_PREFIXES = ["clinic_patient_", "rehabify_ref_", JOY_PLACEHOLDER_PREFIX, "managed_"];

export const LINK_CODE_TTL_MS = 15 * 60_000;
export const LINK_CODE_MAX_ATTEMPTS = 5;
export const LINK_REQUESTS_PER_HOUR = 3;

export const isPlaceholderUser = (user: Doc<"users">) =>
  PLACEHOLDER_PREFIXES.some((prefix) => user.clerkId.startsWith(prefix));

/** The spellings one number may be stored under: as given, +234…, 234… and 0…. */
export function phoneSpellings(raw: string): string[] {
  const trimmed = raw.trim();
  const e164 = normalizePhone(trimmed);
  if (!e164) return [trimmed];
  return [...new Set([trimmed, e164, e164.slice(1), e164.startsWith("+234") ? `0${e164.slice(4)}` : e164])];
}

/** Patient records whose stored phone number is any spelling of `raw`. */
export async function patientsByPhone(ctx: QueryCtx | MutationCtx, raw: string): Promise<Doc<"users">[]> {
  const found = new Map<string, Doc<"users">>();
  for (const phone of phoneSpellings(raw)) {
    const rows = await ctx.db.query("users").withIndex("by_phone_number", (q) => q.eq("phoneNumber", phone)).collect();
    for (const row of rows) if (row.role === "patient") found.set(row._id, row);
  }
  return [...found.values()];
}

/**
 * A website account counts as linked once its owner confirmed the emailed code, or when it
 * already holds Joy bookings (it was linked by phone before this consent step existed).
 */
export async function isWhatsAppLinked(ctx: QueryCtx | MutationCtx, user: Doc<"users">): Promise<boolean> {
  if (user.whatsappLinkedAt) return true;
  const bookings = await ctx.db.query("marketplaceBookings").withIndex("by_patient", (q) => q.eq("patientId", user._id)).collect();
  return bookings.some((booking) => booking.sourceSystem === "joy_ai");
}

/** The account's own email, if it is a real mailbox we can send a code to. */
export function linkableEmail(user: Doc<"users">): string | null {
  const email = user.email?.trim().toLowerCase();
  return email && email.includes("@") && !isJoyLoginEmail(email) ? email : null;
}

/** "ad***@g***.com": enough for the owner to recognise, not enough to reveal it. */
export function emailHint(email: string): string {
  const [local, domain = ""] = email.split("@");
  const [host, ...rest] = domain.split(".");
  const tld = rest.length ? `.${rest.join(".")}` : "";
  return `${local.slice(0, 2)}***@${host.slice(0, 1)}***${tld}`;
}

export function sixDigitCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return value.toString().padStart(6, "0");
}

export async function hashLinkCode(userId: string, code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`whatsapp-link:${userId}:${code}`));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
