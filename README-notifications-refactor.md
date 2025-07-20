# Notifications System Refactoring

## Overview

The original `convex/notifications.ts` file was 1214 lines long and difficult to maintain. This refactoring breaks it down into smaller, focused modules.

## New Structure

```
convex/
├── notifications.ts          # Main file with re-exports for backward compatibility
└── notifications/
    ├── core.ts              # Basic CRUD operations for notifications
    ├── email.ts             # Email sending functionality
    ├── retry.ts             # Retry queue management and cleanup
    └── service.ts           # High-level service functions with fallback
```

## Module Breakdown

### `core.ts` - Basic Operations

- `create` - Create a new notification
- `getByUserId` - Get notifications for a user
- `getUnreadCount` - Get count of unread notifications
- `markAsRead` - Mark a notification as read
- `markAllAsRead` - Mark all notifications as read
- `deleteNotification` - Delete a notification
- `markEmailSent` - Mark notification email as sent

### `email.ts` - Email Service

- `sendEmail` - Send email via Resend service

### `retry.ts` - Retry Management

- `queueFailedNotification` - Queue failed notifications for retry
- `queueFailedEmail` - Queue failed emails for retry
- `processRetryQueuesWithRateLimit` - Process retry queues with rate limiting
- `cleanupRetryQueues` - Clean up old retry entries
- `getRetryQueueStats` - Get retry queue statistics
- `processSingleNotificationRetry` - Process individual notification retry
- `processSingleEmailRetry` - Process individual email retry

### `service.ts` - High-level Services

- `sendNotificationWithFallback` - Main function with retry and fallback logic
- `processEmailForNotification` - Process email for a specific notification
- `testNotification` - Test notification system
- `scheduleCleanup` - Schedule automatic cleanup
- `performScheduledCleanup` - Internal cleanup function

## Benefits

1. **Maintainability**: Each module has a single responsibility
2. **Readability**: Smaller files are easier to understand
3. **Testability**: Individual modules can be tested in isolation
4. **Reusability**: Functions can be imported from specific modules
5. **Backward Compatibility**: All existing imports continue to work

## Usage

### Import from main file (backward compatible)

```typescript
import { create, sendNotificationWithFallback } from "../convex/notifications";
```

### Import from specific modules (recommended for new code)

```typescript
import { create, markAsRead } from "../convex/notifications/core";
import { sendEmail } from "../convex/notifications/email";
import { getRetryQueueStats } from "../convex/notifications/retry";
```

## Migration Notes

- All existing imports from `convex/notifications` continue to work
- No breaking changes to existing code
- Internal function references have been updated to use the new module structure
- Fixed linter errors related to missing internal functions

## Admin User Setup

To set an admin user, you can use one of these methods:

### Option 1: Using the Node.js script

```bash
cd scripts
node set-admin.js <clerk-user-id> <email> [firstName] [lastName]
```

### Option 2: Using Convex mutations directly

```typescript
// Create a new admin user
await ctx.runMutation(api.users.createAdminUser, {
  clerkId: "user_abc123",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
});

// Or promote an existing user
await ctx.runMutation(api.users.setUserRole, {
  clerkId: "user_abc123",
  role: "admin",
});
```

### Option 3: Using the promotion function (requires existing admin)

```typescript
await ctx.runMutation(api.users.promoteToAdmin, {
  userId: "user-id-to-promote",
  promotedByAdminId: "existing-admin-id",
});
```

The admin user will have access to:

- User Management (`/dashboard/admin/users`)
- Account Approvals (`/dashboard/admin/approvals`)
- System Analytics (`/dashboard/admin/analytics`)
- All regular dashboard features

## Next Steps

1. Consider further breaking down modules if they grow too large
2. Add comprehensive tests for each module
3. Implement monitoring for the retry queues
4. Consider adding rate limiting for notification creation
5. Add metrics and analytics for notification system performance
