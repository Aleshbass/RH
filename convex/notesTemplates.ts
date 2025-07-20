import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './auth';

/**
 * Create a new notes template
 */
export const createTemplate = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    category: v.optional(v.string()),
    scope: v.union(v.literal("system"), v.literal("clinic"), v.literal("user_physio")),
    clinicId: v.optional(v.id("clinics")),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    
    return await ctx.db.insert("notesTemplates", {
      title: args.title,
      content: args.content,
      category: args.category,
      scope: args.scope,
      createdByUserId: user._id,
      clinicId: args.clinicId,
      tags: args.tags || [],
    });
  },
});

/**
 * Get templates by scope and clinic/user
 */
export const getTemplates = query({
  args: {
    scope: v.union(v.literal("system"), v.literal("clinic"), v.literal("user_physio")),
    clinicId: v.optional(v.id("clinics")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    
    let templates;
    if (args.scope === "system") {
      templates = await ctx.db
        .query("notesTemplates")
        .filter(q => q.eq(q.field("scope"), "system"))
        .collect();
    } else if (args.scope === "clinic" && args.clinicId) {
      templates = await ctx.db
        .query("notesTemplates")
        .withIndex("by_scope_and_clinic_id")
        .filter(q => 
          q.and(
            q.eq(q.field("scope"), "clinic"),
            q.eq(q.field("clinicId"), args.clinicId)
          )
        )
        .collect();
    } else {
      templates = await ctx.db
        .query("notesTemplates")
        .withIndex("by_scope_and_created_by_user_id")
        .filter(q => 
          q.and(
            q.eq(q.field("scope"), "user_physio"),
            q.eq(q.field("createdByUserId"), user._id)
          )
        )
        .collect();
    }
    
    return templates;
  },
});

/**
 * Update an existing template
 */
export const updateTemplate = mutation({
  args: {
    templateId: v.id("notesTemplates"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    
    // Check if user has permission to edit
    if (template.scope === "user_physio" && template.createdByUserId !== user._id) {
      throw new Error("Not authorized to edit this template");
    }
    
    // For clinic templates, we should check if user is clinic admin (to be implemented)
    
    return await ctx.db.patch(args.templateId, {
      ...(args.title && { title: args.title }),
      ...(args.content && { content: args.content }),
      ...(args.category && { category: args.category }),
      ...(args.tags && { tags: args.tags }),
    });
  },
});

/**
 * Delete a template
 */
export const deleteTemplate = mutation({
  args: {
    templateId: v.id("notesTemplates"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    
    // Check if user has permission to delete
    if (template.scope === "user_physio" && template.createdByUserId !== user._id) {
      throw new Error("Not authorized to delete this template");
    }
    
    // For clinic templates, we should check if user is clinic admin (to be implemented)
    
    await ctx.db.delete(args.templateId);
    return { success: true };
  },
}); 