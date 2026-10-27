/**
 * Records policy and agreement acceptances (append-only: insert only, never patch or delete).
 */
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { POLICIES, type PolicyId } from "../../lib/policies";

/**
 * Checks the versions the person was shown are the current ones, then stores one row per
 * document. Throws if anything is missing or out of date, so they see the latest wording first.
 */
export async function recordPolicyAcceptances(
  ctx: MutationCtx,
  input: {
    user: Pick<Doc<"users">, "_id" | "firstName" | "lastName" | "email"> | null;
    name?: string;
    email?: string;
    documents: PolicyId[];
    accepted: Record<string, string> | undefined;
    channel: "web" | "app" | "whatsapp";
    contextType?: string;
    contextId?: string;
  }
) {
  for (const id of input.documents) {
    if (input.accepted?.[id] !== POLICIES[id].version) {
      throw new ConvexError(`Please read and accept the latest ${POLICIES[id].title} to continue.`);
    }
  }
  const name =
    [input.user?.firstName, input.user?.lastName].filter(Boolean).join(" ").trim() || input.name?.trim() || "Unknown";
  const email = (input.user?.email ?? input.email)?.toLowerCase();
  const now = Date.now();
  for (const id of input.documents) {
    await ctx.db.insert("policyAcceptances", {
      userId: input.user?._id,
      name: name.slice(0, 160),
      email,
      document: id,
      version: POLICIES[id].version,
      channel: input.channel,
      contextType: input.contextType,
      contextId: input.contextId,
      acceptedAt: now,
    });
  }
}
