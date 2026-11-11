/**
 * How a patient signs in, and the invite status chip on the physio and clinic patient lists
 * (patientJoin.ts). Kept free of heavy imports so list queries can use it.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isPlaceholderUser } from "./whatsappLink";
import { isJoyLoginEmail } from "../../lib/auth/joyLoginEmail";

type Ctx = QueryCtx | MutationCtx;

/**
 * - placeholder: added by a physio or clinic, no login yet (a join link sets one up)
 * - pin: phone + PIN (a new link chooses a new PIN)
 * - rehabify_login: a login Rehabify made for them (Joy), on a private address: a link adds a PIN
 * - own_account: they signed up with their own email or Google; they sign in with that
 */
export type AccountKind = "placeholder" | "pin" | "rehabify_login" | "own_account";

export type JoinStatus = "not_invited" | "invited" | "joined" | "programme_started";

export type PatientJoinState = { status: JoinStatus; canSendLink: boolean; sentAt: number | null; openedAt: number | null };

export async function pinLoginOf(ctx: Ctx, userId: Id<"users">) {
  return await ctx.db.query("patientPinLogins").withIndex("by_user", (q) => q.eq("userId", userId)).first();
}

export async function accountKind(ctx: Ctx, patient: Doc<"users">): Promise<AccountKind> {
  if (isPlaceholderUser(patient)) return "placeholder";
  if (await pinLoginOf(ctx, patient._id)) return "pin";
  if (isJoyLoginEmail(patient.email)) return "rehabify_login";
  return "own_account";
}

/**
 * Not invited · Invited · Joined · Programme started. `canSendLink` is false only for patients
 * who sign in with their own email or Google.
 */
export async function patientJoinStatus(ctx: Ctx, patient: Doc<"users">): Promise<PatientJoinState> {
  const kind = await accountKind(ctx, patient);
  if (kind === "placeholder") {
    const link = await ctx.db
      .query("patientJoinLinks")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .order("desc")
      .first();
    return {
      status: link ? "invited" : "not_invited",
      canSendLink: true,
      // Only when someone tapped Send (or copied the message); a link made but not sent doesn't count
      sentAt: link?.sentAt ?? null,
      openedAt: link?.openedAt ?? null,
    };
  }
  const tick = await ctx.db
    .query("exerciseProgramTicks")
    .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
    .first();
  return { status: tick ? "programme_started" : "joined", canSendLink: kind !== "own_account", sentAt: null, openedAt: null };
}

/** A real email for display: never the private login address. */
export function shownEmail(email: string | undefined | null) {
  return email && !isJoyLoginEmail(email) ? email : undefined;
}
