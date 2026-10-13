import { ConvexError } from "convex/values";
import { QueryCtx, ActionCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// Who may read or change a user's Google Calendar connection.
//
// A calendar belongs to the signed-in user. The UI always passes the signed-in
// user's id, so a userId argument from anyone else is ignored rather than
// trusted. Admins may name another user (support), except where noted.
// ─────────────────────────────────────────────────────────────────────────────

async function findUserByClerkId(ctx: QueryCtx, clerkId: string): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();
}

/** The signed-in user, or null when signed out or not registered yet. */
export async function getCallerOrNull(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await findUserByClerkId(ctx, identity.subject);
}

/** The signed-in user, or a ConvexError. */
export async function requireCaller(ctx: QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("You must be logged in to perform this action");
  }
  const user = await findUserByClerkId(ctx, identity.subject);
  if (!user) {
    throw new ConvexError("User not found. Please complete registration");
  }
  return user;
}

/** Whose calendar to use: the caller's own, or (admins only) the user they named. */
export function calendarUserFor(caller: Doc<"users">, requestedUserId?: Id<"users"> | null): Id<"users"> {
  if (requestedUserId && caller.role === "admin") return requestedUserId;
  return caller._id;
}

export type ResolveCalendarCallerArgs = {
  clerkId: string;
  requestedUserId?: Id<"users">;
  allowAdminOverride: boolean;
  appointmentId?: Id<"appointments">;
};

/**
 * Handler of the internal query calendar/oauth:resolveCalendarCaller, used by actions
 * (which cannot read the database). Resolves the caller from their Clerk subject and
 * returns whose calendar to use. With an appointment, that user must be the
 * appointment's patient or physiotherapist (admins excepted).
 */
export async function resolveCalendarCallerHandler(
  ctx: QueryCtx,
  args: ResolveCalendarCallerArgs
): Promise<{ userId: Id<"users"> }> {
  const caller = await findUserByClerkId(ctx, args.clerkId);
  if (!caller) {
    throw new ConvexError("User not found. Please complete registration");
  }
  const userId = args.allowAdminOverride ? calendarUserFor(caller, args.requestedUserId) : caller._id;

  if (args.appointmentId) {
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new ConvexError("Appointment not found");
    }
    const isParticipant = appointment.patientId === userId || appointment.physiotherapistId === userId;
    if (!isParticipant && caller.role !== "admin") {
      throw new ConvexError("You don't have access to this appointment");
    }
  }

  return { userId };
}

/** Action-side guard: the signed-in caller, resolved to whose calendar the action may use. */
export async function requireCalendarUserInAction(
  ctx: ActionCtx,
  options: Omit<ResolveCalendarCallerArgs, "clerkId">
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("You must be logged in to perform this action");
  }
  const result: { userId: Id<"users"> } = await ctx.runQuery(internal.calendar.oauth.resolveCalendarCaller, {
    clerkId: identity.subject,
    requestedUserId: options.requestedUserId,
    allowAdminOverride: options.allowAdminOverride,
    appointmentId: options.appointmentId,
  });
  return result.userId;
}
