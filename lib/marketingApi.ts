import { makeFunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import type { MarketingAudience, MarketingContent, MarketingSegment } from "@/lib/email/marketing";

export type MarketingOverview = {
  counts: Record<MarketingSegment | "everyone", number>;
  directSentToday: number;
  directDailyLimit: number;
};

export type MarketingCampaign = MarketingContent & {
  _id: Id<"marketingCampaigns">;
  audience: MarketingAudience;
  status: "preparing" | "sending" | "sent" | "partial" | "failed";
  segmentsToSend: string[];
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  lastError?: string;
  createdByName: string;
  createdAt: number;
  sentAt?: number;
  // People counted once each from Resend's webhook (convex/emailEvents.ts); opens are an estimate
  deliveredCount?: number;
  openedCount?: number;
  clickedCount?: number;
  bouncedCount?: number;
  complainedCount?: number;
};

export type MarketingContact = { _id: Id<"marketingContacts">; email: string; name?: string; tags: string[]; createdAt: number };
export type MarketingPerson = { email: string; name: string; role: string };

export type MarketingRecipient = {
  email: string;
  name?: string;
  segment?: string;
  status: "sent" | "pending" | "failed";
  error?: string;
  sentAt?: number;
  userId?: Id<"users">;
  role?: string;
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  bounced: boolean;
  complained: boolean;
};

export type MarketingCampaignDetail = {
  campaign: MarketingCampaign;
  recipients: MarketingRecipient[];
  /** queue: one-to-one sends · saved: group sends · events: older group sends, from Resend's reports only */
  listSource: "queue" | "saved" | "events";
  truncated: boolean;
};

/** Plain references to convex/marketing.ts: the generated `api` type is at TypeScript's depth limit (TS2589). */
export const marketingApi = {
  overview: makeFunctionReference<"query", Record<string, never>, MarketingOverview>("marketing:adminOverview"),
  campaigns: makeFunctionReference<"query", Record<string, never>, MarketingCampaign[]>("marketing:adminListCampaigns"),
  campaignDetail: makeFunctionReference<"query", { campaignId: Id<"marketingCampaigns"> }, MarketingCampaignDetail | null>(
    "marketing:adminCampaignDetail"
  ),
  contacts: makeFunctionReference<"query", Record<string, never>, MarketingContact[]>("marketing:adminListContacts"),
  findPeople: makeFunctionReference<"query", { q: string }, MarketingPerson[]>("marketing:adminFindPeople"),
  addContacts: makeFunctionReference<
    "mutation",
    { contacts: { email: string; name?: string }[]; tags?: string[] },
    { added: number; skipped: number }
  >("marketing:adminAddContacts"),
  removeContact: makeFunctionReference<"mutation", { id: Id<"marketingContacts"> }, { success: boolean }>("marketing:adminRemoveContact"),
  enableOpenTracking: makeFunctionReference<"action", Record<string, never>, { domain: string }>("actions/marketingSend:adminEnableOpenTracking"),
  sendTest: makeFunctionReference<"mutation", MarketingContent, { to: string }>("marketing:adminSendTest"),
  createCampaign: makeFunctionReference<
    "mutation",
    MarketingContent & { audience: MarketingAudience; emails?: string[] },
    { campaignId: Id<"marketingCampaigns">; recipientCount: number }
  >("marketing:adminCreateCampaign"),
};
