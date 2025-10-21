# Auth Query Error Fix

## Issue
Convex queries were throwing authentication errors:
```
ConvexError: You must be logged in to perform this action
```

## Root Cause
Queries `getMyClinicInfo` and `getClinicReports` were calling `getAuthenticatedUser()` which throws an error when user is not authenticated. These queries were being called by components during initial page load, before authentication was complete.

## Solution
Updated both queries to gracefully handle unauthenticated state by:
1. Checking authentication first with `ctx.auth.getUserIdentity()`
2. Returning `null` instead of throwing when not authenticated
3. Manual user lookup instead of using `getAuthenticatedUser()` helper

## Files Modified

### `convex/clinics.ts`

**`getMyClinicInfo` query:**
- Now returns `null` if no identity found
- Manually looks up user by clerk ID
- Returns `null` if user not found or has no clinic

**`getClinicReports` query:**
- Now returns `null` if no identity found  
- Manually looks up user and checks if clinic_owner
- Returns `null` if user not found or wrong role

## Result
✅ No more authentication errors on page load
✅ Components handle `null` gracefully with loading states
✅ Queries only execute when user is authenticated
✅ Better user experience during auth initialization

## Pattern for Future Queries
When creating queries that might be called before auth is complete:

```typescript
export const myQuery = query({
  args: {},
  handler: async (ctx) => {
    // Check auth first
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null; // Graceful handling
    }
    
    // Manual user lookup
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    if (!user) {
      return null;
    }
    
    // Continue with query logic...
  },
});
```

**Use `getAuthenticatedUser()` only when authentication is guaranteed (e.g., mutations, protected routes).**
