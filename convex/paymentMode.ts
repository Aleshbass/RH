import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Whether Paystack runs on test keys, so payment pages can say that no real money moves.
 * Only the yes/no leaves the server, never the key.
 */
export const getPaymentMode = query({
  args: {},
  returns: v.object({ testMode: v.boolean() }),
  handler: async () => ({
    testMode: (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_"),
  }),
});
