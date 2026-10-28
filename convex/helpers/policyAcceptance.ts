/**
 * Records policy and agreement acceptances (append-only: insert only, never patch or delete).
 */
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { POLICIES, type PolicyId } from "../../lib/policies";

/** The documents this person hasn't accepted in their current version (by any channel). */
export async function missingPolicies(ctx: QueryCtx | MutationCtx, userId: Id<"users">, documents: PolicyId[]): Promise<PolicyId[]> {
  const missing: PolicyId[] = [];
  for (const id of documents) {
    const latest = await ctx.db
      .query("policyAcceptances")
      .withIndex("by_user_document", (q) => q.eq("userId", userId).eq("document", id))
      .order("desc")
      .first();
    if (latest?.version !== POLICIES[id].version) missing.push(id);
  }
  return missing;
}

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

/**
 * Like recordPolicyAcceptances, but only for documents this signed-up person hasn't accepted in
 * their current version, so submitting a form twice doesn't add duplicate rows. Returns what it
 * recorded.
 */
export async function recordMissingPolicyAcceptances(
  ctx: MutationCtx,
  input: Omit<Parameters<typeof recordPolicyAcceptances>[1], "user"> & {
    user: Pick<Doc<"users">, "_id" | "firstName" | "lastName" | "email">;
  }
): Promise<PolicyId[]> {
  const documents = await missingPolicies(ctx, input.user._id, input.documents);
  if (documents.length > 0) await recordPolicyAcceptances(ctx, { ...input, documents });
  return documents;
}
