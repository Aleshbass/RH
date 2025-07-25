"use node";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";



export const completePatientOnboarding = action({
  args: {
    // We can add any specific args needed from the client here.
    // For now, it will get the user from the auth context.
  },
  returns: v.object({
    success: v.boolean(),
    userId: v.id("users"),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("User not authenticated.");
    }
    const { subject: clerkId, name, email } = identity;

    // 1. Sync user data with Clerk using function aliasing
    const storeUserFn: any = api.users.storeUserFromClerk;
    const userId: any = await ctx.runMutation(storeUserFn, {
      clerkId,
      email: email!,
      firstName: name || "New",
      lastName: "User",
    });

    // 2. Send notification to admins using function aliasing
    const createNotificationFn: any = api.notifications.create;
    await ctx.runMutation(createNotificationFn, {
      type: 'onboarding_complete',
      userId,
      priority: 'medium',
      payload: {
        title: 'New Patient Onboarding Complete',
        body: `${name || email} has completed their onboarding.`,
        data: {
          actionUrl: `/admin/users/${userId}`,
          entityType: 'user',
          entityId: userId
        }
      }
    });

    // 3. Send email notification to admin
    try {
      // Get admin users to send notification
      const getAdminsFn: any = api.users.getAllAdmins;
      const admins = await ctx.runQuery(getAdminsFn, {});
      
      if (admins && admins.length > 0) {
        // Send email to the first admin (or you could send to all)
        const adminEmail = admins[0].email;
        if (adminEmail) {
          // @ts-expect-error TS deep instantiation workaround
          await ctx.runAction(internal.actions.emails.sendOnboardingNotificationEmail, {
            adminEmail,
            userName: name || 'New User',
            adminDashboardLink: `/admin/users/${userId}`,
          });
        }
      }
    } catch (error) {
      console.error('Failed to send onboarding notification email:', error);
      // Don't fail the entire onboarding process if email fails
    }
    
    // We can return any data the client might need
    return { success: true, userId };
  },
});

export const completeClinicOwnerOnboarding = action({
  args: {
    clinicName: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    userId: v.id("users"),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("User not authenticated.");
    }
    const { subject: clerkId, name, email } = identity;
    const { clinicName } = args;

    // 1. Sync user data with Clerk
    const storeUserFn: any = api.users.storeUserFromClerk;
    const userId: any = await ctx.runMutation(storeUserFn, {
      clerkId,
      email: email!,
      firstName: name || "Clinic",
      lastName: "Owner",
      role: "clinic_owner",
    });

    // 2. Send notification to admins
    const createNotificationFn: any = api.notifications.create;
    await ctx.runMutation(createNotificationFn, {
      type: 'onboarding_complete',
      userId,
      priority: 'high',
      payload: {
        title: 'New Clinic Owner Onboarding Complete',
        body: `${name || email} from ${clinicName} has completed their clinic owner onboarding.`,
        data: {
          actionUrl: `/admin/users/${userId}`,
          entityType: 'user',
          entityId: userId,
          metadata: {
            clinicName,
            userRole: 'clinic_owner'
          }
        }
      }
    });

    // 3. Send email notification to admin
    try {
      const getAdminsFn: any = api.users.getAllAdmins;
      const admins = await ctx.runQuery(getAdminsFn, {});
      
      if (admins && admins.length > 0) {
        const adminEmail = admins[0].email;
        if (adminEmail) {
          // @ts-expect-error TS deep instantiation workaround
          await ctx.runAction(internal.actions.emails.sendOnboardingNotificationEmail, {
            adminEmail,
            userName: `${name || 'Clinic Owner'} (${clinicName})`,
            adminDashboardLink: `/admin/users/${userId}`,
          });
        }
      }
    } catch (error) {
      console.error('Failed to send clinic owner onboarding notification email:', error);
    }
    
    return { success: true, userId };
  },
});

export const completePhysiotherapistOnboarding = action({
  args: {
    specialization: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    userId: v.id("users"),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("User not authenticated.");
    }
    const { subject: clerkId, name, email } = identity;
    const { specialization } = args;

    // 1. Sync user data with Clerk
    const storeUserFn: any = api.users.storeUserFromClerk;
    const userId: any = await ctx.runMutation(storeUserFn, {
      clerkId,
      email: email!,
      firstName: name || "Independent",
      lastName: "Physiotherapist",
      role: "physiotherapist",
    });

    // 2. Send notification to admins
    const createNotificationFn: any = api.notifications.create;
    await ctx.runMutation(createNotificationFn, {
      type: 'onboarding_complete',
      userId,
      priority: 'high',
      payload: {
        title: 'New Physiotherapist Onboarding Complete',
        body: `${name || email} has completed their independent physiotherapist onboarding${specialization ? ` (${specialization})` : ''}.`,
        data: {
          actionUrl: `/admin/users/${userId}`,
          entityType: 'user',
          entityId: userId,
          metadata: {
            specialization: specialization || '',
            userRole: 'physiotherapist'
          }
        }
      }
    });

    // 3. Send email notification to admin
    try {
      const getAdminsFn: any = api.users.getAllAdmins;
      const admins = await ctx.runQuery(getAdminsFn, {});
      
      if (admins && admins.length > 0) {
        const adminEmail = admins[0].email;
        if (adminEmail) {
          // @ts-expect-error TS deep instantiation workaround
          await ctx.runAction(internal.actions.emails.sendOnboardingNotificationEmail, {
            adminEmail,
            userName: `${name || 'Physiotherapist'}${specialization ? ` (${specialization})` : ''}`,
            adminDashboardLink: `/admin/users/${userId}`,
          });
        }
      }
    } catch (error) {
      console.error('Failed to send physiotherapist onboarding notification email:', error);
    }
    
    return { success: true, userId };
  },
}); 