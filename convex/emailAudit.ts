import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const logEmail = internalMutation({
  args: {
    to: v.string(),
    template: v.string(),
    subject: v.optional(v.string()),
    data: v.optional(v.any()),
    messageId: v.optional(v.string()),
  },
  returns: v.id("emailAuditLogs"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("emailAuditLogs", {
      to: args.to,
      template: args.template,
      subject: args.subject,
      data: args.data,
      messageId: args.messageId,
      createdAt: Date.now(),
    } as any);
    return id as Id<"emailAuditLogs">;
  },
});

export const getLatestByRecipientAndTemplate = internalQuery({
  args: {
    to: v.string(),
    template: v.string(),
  },
  handler: async (ctx, { to, template }) => {
    const results = await ctx.db
      .query("emailAuditLogs")
      .withIndex("by_to", q => q.eq("to", to))
      .order("desc")
      .take(50);

    // Filter by template and return latest
    const found = results.find(r => (r as any).template === template);
    return found || null;
  },
});
