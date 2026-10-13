/**
 * Shared secret for Next.js server routes that call Convex on behalf of an external system
 * (AwaDoc and MediLoan webhooks, payment initialisation). Browsers never see it.
 * CONVEX_SERVER_SECRET (32+ characters) must hold the same value in Convex and Vercel.
 */
import { ConvexError } from "convex/values";
import { ensureUserRole } from "../auth";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when `provided` matches CONVEX_SERVER_SECRET. */
export function isServerCaller(provided: string | undefined): boolean {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || expected.length < 32 || !provided) return false;
  return constantTimeEqual(provided, expected);
}

/** Throws unless the call comes from our Next.js server (holds CONVEX_SERVER_SECRET). */
export function assertServerCaller(provided: string | undefined): void {
  if (!isServerCaller(provided)) throw new ConvexError("Not authorised.");
}

/** Allows our Next.js server (secret) or a signed-in admin (dashboard pages). */
export async function assertServerOrAdmin(ctx: any, provided: string | undefined): Promise<void> {
  if (isServerCaller(provided)) return;
  await ensureUserRole(ctx, ["admin"]);
}
