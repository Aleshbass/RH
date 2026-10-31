/**
 * One-off: fill names that never reached Convex, which showed as "undefined undefined" in
 * appointments and emails. Sign-up keeps names in Clerk's unsafeMetadata (Clerk's own name
 * fields can be switched off), but neither sync read it, the Clerk webhook used to blank
 * saved names, and clinic clinicians skip the onboarding name step. Run after deploy:
 *
 *   npx convex run userNameBackfill:backfillMissingNames '{"dryRun": true}' --prod
 *   npx convex run userNameBackfill:backfillMissingNames '{"dryRun": false}' --prod
 *
 * Only blank names are filled: from Clerk (its name, then the sign-up metadata), else the name
 * a clinic typed on the invitation the person accepted. Returns counts and user ids only.
 */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const PAGE_SIZE = 200;

type MissingNameRow = { id: Id<"users">; clerkId: string | null; invitedName: string | null };

// Plain references (not in the generated api types until the next codegen)
const ref = {
  list: makeFunctionReference<
    "query",
    { cursor: string | null },
    { rows: MissingNameRow[]; cursor: string; isDone: boolean }
  >("userNameBackfill:listUsersMissingNames"),
  fill: makeFunctionReference<
    "mutation",
    { userId: Id<"users">; firstName?: string; lastName?: string },
    boolean
  >("userNameBackfill:fillMissingName"),
};

const blank = (value?: string) => !value?.trim();
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

export const listUsersMissingNames = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("users").paginate({ cursor: args.cursor, numItems: PAGE_SIZE });
    const rows: MissingNameRow[] = [];
    for (const user of page.page) {
      if (!blank(user.firstName) && !blank(user.lastName)) continue;
      // Placeholder records (Joy, clinic-added patients…) have no Clerk account to ask
      const clerkId = user.clerkId?.startsWith("user_") ? user.clerkId : null;

      let invitedName: string | null = null;
      const email = user.email?.trim();
      if (email) {
        for (const spelling of new Set([email, email.toLowerCase()])) {
          const invites = await ctx.db
            .query("clinicStaffInvitations")
            .withIndex("by_invitee_email", (q) => q.eq("inviteeEmail", spelling))
            .collect();
          invitedName = text(invites.find((invite) => invite.acceptedBy === user._id)?.inviteeName) ?? invitedName;
        }
      }
      if (clerkId || invitedName) rows.push({ id: user._id, clerkId, invitedName });
    }
    return { rows, cursor: page.continueCursor, isDone: page.isDone };
  },
});

export const fillMissingName = internalMutation({
  args: { userId: v.id("users"), firstName: v.optional(v.string()), lastName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return false;
    const patch: { firstName?: string; lastName?: string } = {};
    if (blank(user.firstName) && args.firstName) patch.firstName = args.firstName;
    if (blank(user.lastName) && args.lastName) patch.lastName = args.lastName;
    if (Object.keys(patch).length === 0) return false;
    await ctx.db.patch(user._id, patch);
    return true;
  },
});

export const backfillMissingNames = internalAction({
  args: { dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const secret = process.env.CLERK_SECRET_KEY;
    let cursor: string | null = null;
    let checked = 0;
    let filled = 0;
    let clerkErrors = 0;
    const unresolved: Id<"users">[] = [];

    do {
      const page: { rows: MissingNameRow[]; cursor: string; isDone: boolean } = await ctx.runQuery(ref.list, { cursor });
      for (const row of page.rows) {
        checked++;
        let firstName: string | undefined;
        let lastName: string | undefined;

        if (row.clerkId && secret) {
          const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(row.clerkId)}`, {
            headers: { Authorization: `Bearer ${secret}` },
          });
          if (res.ok) {
            const clerkUser = await res.json();
            firstName = text(clerkUser.first_name) ?? text(clerkUser.unsafe_metadata?.firstName);
            lastName = text(clerkUser.last_name) ?? text(clerkUser.unsafe_metadata?.lastName);
          } else {
            clerkErrors++;
          }
        }
        if (row.invitedName && (!firstName || !lastName)) {
          const [invitedFirst, ...invitedRest] = row.invitedName.split(/\s+/);
          firstName ??= invitedFirst;
          lastName ??= invitedRest.join(" ") || undefined;
        }

        if (!firstName && !lastName) {
          unresolved.push(row.id);
          continue;
        }
        if (args.dryRun || (await ctx.runMutation(ref.fill, { userId: row.id, firstName, lastName }))) filled++;
      }
      cursor = page.isDone ? null : page.cursor;
    } while (cursor);

    return { dryRun: args.dryRun, clerkKeySet: Boolean(secret), checked, filled, clerkErrors, unresolved };
  },
});
