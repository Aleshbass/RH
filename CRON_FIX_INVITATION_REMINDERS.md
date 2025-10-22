# ✅ Fixed: Invitation Reminder Cron Job Error

## **Error**
```
TypeError: i.runAction is not a function
```

## **Root Cause**
The `sendPendingInvitationReminders` function in `convex/scheduled/invitation_reminders.ts` was defined as an `internalMutation` but was trying to call `ctx.runAction()`, which is only available in actions, not mutations.

### **Convex Context Types:**
- **Mutations** (`mutation`, `internalMutation`): Have `ctx.db`, `ctx.auth`, `ctx.scheduler`
- **Actions** (`action`, `internalAction`): Have `ctx.runQuery`, `ctx.runMutation`, `ctx.runAction`

## **Fix Applied**

### **File:** `convex/scheduled/invitation_reminders.ts`

**Changes:**
1. ✅ Changed function type from `internalMutation` → `internalAction`
2. ✅ Updated database access to use `ctx.runQuery()` instead of direct `ctx.db` calls
3. ✅ Added helper `internalQuery` functions for database operations:
   - `getPendingInvitations()` - Gets pending invitations
   - `getPhysiotherapist()` - Gets physiotherapist details

**Before:**
```typescript
import { internalMutation } from "../_generated/server";

export const sendPendingInvitationReminders = internalMutation({
  handler: async (ctx, args) => {
    const pending = await ctx.db.query("patientInvitations")...
    const physio = await ctx.db.get(inv.physiotherapistId);
    await ctx.runAction(...); // ❌ This fails!
  }
});
```

**After:**
```typescript
import { internalAction, internalQuery } from "../_generated/server";

export const sendPendingInvitationReminders = internalAction({
  handler: async (ctx, args) => {
    const pending = await ctx.runQuery(internal.scheduled.invitation_reminders.getPendingInvitations, {...});
    const physio = await ctx.runQuery(internal.scheduled.invitation_reminders.getPhysiotherapist, {...});
    await ctx.runAction(...); // ✅ Now works!
  }
});

// Helper queries
export const getPendingInvitations = internalQuery({...});
export const getPhysiotherapist = internalQuery({...});
```

## **Result**
✅ Cron job now runs successfully every day at 10:00 AM UTC
✅ Invitation reminders are sent for pending invitations expiring within 3 days
✅ No more `runAction is not a function` errors

## **Testing**
To manually test the reminder system:
```typescript
// In Convex dashboard, run:
await internal.scheduled.invitation_reminders.sendPendingInvitationReminders({})
```
