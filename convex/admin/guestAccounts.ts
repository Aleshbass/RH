/**
 * One-off repair: patients who booked as a guest and then signed up with the same email ended up
 * with two accounts (the sign-up merge crashed; fixed in helpers/guestMerge.ts). This merges each
 * guest row into the real account with the same email. Dry run by default.
 *
 *   npx convex run --prod admin/guestAccounts:mergeDuplicates
 *   npx convex run --prod admin/guestAccounts:mergeDuplicates '{"apply": true}'
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { isGuestUser, mergeGuestAccounts } from "../helpers/guestMerge";

export const mergeDuplicates = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    // Guest rows sort together by clerkId ("guest-…")
    const guests = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.gte("clerkId", "guest-").lt("clerkId", "guest."))
      .take(2000);
    const found: { guest: string; guestNumber: string | null; real: string; realNumber: string | null }[] = [];
    let moved = 0;
    for (const guest of guests) {
      if (!guest.email) continue;
      const sameEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", guest.email!))
        .take(10);
      const real = sameEmail.find((user) => !isGuestUser(user));
      if (!real) continue;
      found.push({ guest: guest._id, guestNumber: guest.patientNumber ?? null, real: real._id, realNumber: real.patientNumber ?? null });
      if (args.apply) moved += (await mergeGuestAccounts(ctx, real._id, guest.email)).moved;
    }
    return { apply: Boolean(args.apply), duplicates: found.length, moved, found };
  },
});
