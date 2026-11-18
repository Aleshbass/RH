"use node";

/**
 * Operator only (CLI with the deploy key): remove the Clerk logins of purged test patients.
 * Only logins on the private patient address (…@patients.physioaroundme.com) are touched, so a
 * real person's own sign-in can't be deleted by mistake.
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";

const PATIENT_LOGIN = /@patients\.physioaroundme\.com$/i;

export const deleteClerkLoginsInternal = internalAction({
  args: { clerkIds: v.array(v.string()) },
  handler: async (_ctx, args) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");
    const { createClerkClient } = await import("@clerk/backend");
    const clerk = createClerkClient({ secretKey });
    const results: { clerkId: string; result: string }[] = [];
    for (const clerkId of args.clerkIds.slice(0, 50)) {
      try {
        const user = await clerk.users.getUser(clerkId);
        const emails = user.emailAddresses.map((e) => e.emailAddress);
        if (emails.length === 0 || !emails.every((e) => PATIENT_LOGIN.test(e))) {
          results.push({ clerkId, result: "skipped: not a private patient login" });
          continue;
        }
        await clerk.users.deleteUser(clerkId);
        results.push({ clerkId, result: "deleted" });
      } catch (error) {
        const code = (error as { errors?: { code?: string }[] })?.errors?.[0]?.code ?? "error";
        results.push({ clerkId, result: code });
      }
    }
    return results;
  },
});
