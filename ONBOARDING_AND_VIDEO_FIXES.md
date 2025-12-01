# Onboarding Workflow & Video Call Feature Fixes

## Overview
This document describes the three critical fixes implemented to improve the onboarding workflow and video call functionality.

---

## 🐛 Issues Fixed

### 1. **Missing Admin Email Notifications on Onboarding Completion**
**Problem:** When physiotherapists or clinic owners completed onboarding, admins did not receive email notifications to alert them that someone had submitted an application for review.

**Solution:**
- Enhanced `convex/users.ts` `completeUserProfile` mutation to:
  - Query all admin users when `finalStep=true` and role requires approval
  - Send both in-app notifications and email notifications to all admins
  - Added comprehensive logging for debugging notification delivery
  - Fixed actionUrl path in notifications (removed typo)

**Files Modified:**
- `convex/users.ts` (lines 506-566)

**Key Changes:**
```typescript
// Added detailed logging
console.log(`[completeUserProfile] Notifying ${admins.length} admin(s) about ${roleLabel} onboarding completion for ${displayName}`);

// Enhanced email scheduling with better error handling
if (admin.email) {
  console.log(`[completeUserProfile] Scheduling email to admin ${admin.email} for ${displayName} onboarding approval`);
  await ctx.scheduler.runAfter(0, internal.actions.emails.sendOnboardingNotificationEmail as any, {
    adminEmail: admin.email,
    userName: `${displayName} (${roleLabel})`,
    adminDashboardLink,
    userRole: roleLabel,
    submittedAt: Date.now(),
  });
} else {
  console.warn(`[completeUserProfile] Admin ${admin._id} has no email address, skipping email notification`);
}
```

**Email Template Used:** `ADMIN_APPROVAL_REQUIRED` (already configured in `lib/email/emailService.ts`)

---

### 2. **Manual Google Meet Link Option for Appointments**
**Problem:** Physiotherapists couldn't manually add Google Meet or other external video call links to appointments. The system only supported automatic Stream SDK video calls.

**Solution:**
- Added `manualMeetingLink` field to appointment booking workflow
- Updated `AppointmentBookingModal.tsx` to include a dedicated input field for video meeting links
- Updated appointment payload type to include `manualMeetingLink`
- Backend already supported this field in the schema and `createAppointment` mutation

**Files Modified:**
- `components/appointments/AppointmentBookingModal.tsx`
- `components/calendar/AppointmentModal.tsx` (already had support)
- `convex/appointments.ts` (already had support)
- `convex/schema.ts` (already had the field defined)

**UI Addition:**
```tsx
<div>
  <Label htmlFor="manualMeetingLink" className="text-gray-900 font-semibold text-base flex items-center gap-2">
    <span>📹</span> Video Meeting Link (Optional)
  </Label>
  <Input
    id="manualMeetingLink"
    type="url"
    value={formData.manualMeetingLink}
    onChange={(e) => setFormData(prev => ({ ...prev, manualMeetingLink: e.target.value }))}
    placeholder="e.g., https://meet.google.com/abc-defg-hij"
    className="mt-2 focus:border-brand focus:ring-brand border-gray-300"
  />
  <p className="text-xs text-gray-500 mt-1">Add a Google Meet, Zoom, or other video call link for telehealth appointments</p>
</div>
```

**Supported Link Types:**
- Google Meet
- Zoom
- Microsoft Teams
- Any other video conferencing platform

---

### 3. **Real-time UI Update After Admin Approval**
**Problem:** After an admin approved a physiotherapist or clinic owner account, the user's UI did not immediately update. They remained on the "Pending Approval" page even though their status was "approved".

**Solution:**
- Enhanced `DashboardAuthGuard.tsx` to immediately redirect approved users to their dashboard
- Added check to prevent redirect loops (only redirect if not already on dashboard)
- Improved the approval status check logic

**Files Modified:**
- `components/auth/DashboardAuthGuard.tsx` (lines 96-110)

**Key Changes:**
```typescript
// If approved, redirect to appropriate dashboard immediately
if (approvalStatus.status === 'approved') {
  const dashboardPath = currentUser.role === 'physiotherapist' 
    ? '/dashboard/physiotherapist' 
    : '/dashboard/clinic'
  
  // Only redirect if not already on dashboard
  if (!window.location.pathname.startsWith('/dashboard')) {
    console.log(`[DashboardAuthGuard] User approved, redirecting to ${dashboardPath}`)
    router.replace(dashboardPath)
    return
  }
}
```

**User Experience:**
1. User completes onboarding → sees "Pending Approval" page
2. Admin approves account → approval status changes to "approved"
3. User's browser automatically detects the status change (via Convex real-time queries)
4. `DashboardAuthGuard` useEffect triggers
5. User is immediately redirected to their dashboard
6. User can now access all features

---

## 🧪 Testing Instructions

### Test 1: Admin Email Notification
**Steps:**
1. Create a new physiotherapist or clinic owner account
2. Complete all onboarding steps (step1, step2, step3)
3. On the final step, submit the onboarding form
4. Check admin's email inbox for notification

**Expected Result:**
- Admin receives email with subject: "Action Required: New Onboarding Awaiting Approval"
- Email contains user's name, role, and link to admin approval dashboard
- In-app notification appears in admin's notification center

**Logs to Check:**
```
[completeUserProfile] Notifying X admin(s) about Physiotherapist onboarding completion for [Name]
[completeUserProfile] Scheduling email to admin [email] for [Name] onboarding approval
[completeUserProfile] Admin notifications complete for [Name]
```

### Test 2: Manual Meeting Link
**Steps:**
1. Log in as approved physiotherapist
2. Navigate to Appointments page
3. Click "Book Appointment" or "Create Appointment"
4. Fill in patient and appointment details
5. Locate the "Video Meeting Link (Optional)" field
6. Enter a Google Meet link: `https://meet.google.com/abc-defg-hij`
7. Submit the appointment

**Expected Result:**
- Appointment is created successfully
- `manualMeetingLink` field is saved in the database
- Patient can see the meeting link in their appointment details
- Link is clickable and opens in a new tab

**Database Check:**
```javascript
// In Convex dashboard, check the appointments table
{
  ...
  manualMeetingLink: "https://meet.google.com/abc-defg-hij",
  ...
}
```

### Test 3: Real-time Dashboard Redirect
**Steps:**
1. Create a physiotherapist account and complete onboarding
2. User should see "Pending Approval" page
3. In another browser/tab, log in as admin
4. Navigate to Admin → Users → Pending Approvals
5. Approve the physiotherapist account
6. Switch back to the physiotherapist's browser tab

**Expected Result:**
- Within 1-2 seconds, the physiotherapist's page automatically redirects
- User is sent to `/dashboard/physiotherapist` (or `/dashboard/clinic` for clinic owners)
- User can now access all dashboard features
- No manual page refresh required

**Console Logs:**
```
[DashboardAuthGuard] User approved, redirecting to /dashboard/physiotherapist
```

---

## 📊 Database Schema

### Appointments Table (Relevant Fields)
```typescript
{
  manualMeetingLink: v.optional(v.string()), // New field for manual video links
  appointmentType: v.union(v.literal("in-person"), v.literal("telehealth")),
  // ... other fields
}
```

### Account Approval Status Table
```typescript
{
  status: v.union(
    v.literal("pending_review"),
    v.literal("approved"),
    v.literal("declined")
  ),
  // ... other fields
}
```

---

## 🔄 Workflow Diagrams

### Admin Notification Flow
```
User Completes Onboarding (finalStep=true)
    ↓
completeUserProfile() mutation called
    ↓
Creates accountApprovalStatus (status: "pending_review")
    ↓
Queries all admin users
    ↓
For each admin:
    ├─→ Create in-app notification
    └─→ Schedule email via sendOnboardingNotificationEmail
    ↓
Admin receives notification (email + in-app)
    ↓
Admin reviews and approves/declines
```

### Approval Redirect Flow
```
Admin approves account
    ↓
approvalStatus.status changes to "approved"
    ↓
User's browser detects change (Convex real-time query)
    ↓
DashboardAuthGuard useEffect triggers
    ↓
Check: Is status "approved"? YES
    ↓
Check: Already on dashboard? NO
    ↓
router.replace('/dashboard/physiotherapist')
    ↓
User sees their dashboard
```

---

## 🔍 Debugging Tips

### If admin doesn't receive email:
1. Check Convex logs for: `[completeUserProfile] Scheduling email to admin`
2. Verify `RESEND_API_KEY` is set in environment variables
3. Check if admin user has a valid email address in the database
4. Verify email service is properly configured in `lib/email/emailService.ts`

### If manual meeting link doesn't save:
1. Check browser console for errors
2. Verify the appointment mutation includes `manualMeetingLink` in the payload
3. Check Convex dashboard → appointments table for the saved value
4. Ensure URL format is valid (starts with http:// or https://)

### If redirect doesn't work after approval:
1. Open browser console and check for: `[DashboardAuthGuard] User approved, redirecting to...`
2. Verify `approvalStatus` query is returning the updated status
3. Check Network tab to see if the approval mutation completed successfully
4. Ensure user's `onboarded` field is set to `true`
5. Hard refresh the page (Ctrl+Shift+R) to clear any cached states

---

## 📝 Code Quality Improvements

### Error Handling
- Added try-catch blocks for admin notification emails
- Non-fatal errors don't block onboarding completion
- Detailed error logging for debugging

### Logging
- Added comprehensive logging at key points
- Logs include user names, email addresses, and timestamps
- Easy to trace issues in production

### Type Safety
- Updated TypeScript types for appointment payloads
- Proper optional field handling
- Type-safe form state management

---

## 🚀 Deployment Notes

### Environment Variables Required
```bash
RESEND_API_KEY=re_xxxxx # For email delivery
NEXT_PUBLIC_APP_URL=https://your-domain.com # For email links
FROM_EMAIL=noreply@your-domain.com # Sender email
FROM_NAME=Rehabify Health # Sender name
```

### Database Migrations
No migrations required - all fields already exist in the schema.

### Breaking Changes
None - all changes are backward compatible.

---

## ✅ Checklist for QA

- [ ] Admin receives email when physio completes onboarding
- [ ] Admin receives email when clinic owner completes onboarding
- [ ] Email contains correct user information and approval link
- [ ] In-app notification appears for admin
- [ ] Manual meeting link field appears in appointment booking modal
- [ ] Manual meeting link is saved correctly
- [ ] Meeting link appears in appointment details
- [ ] After approval, user is automatically redirected to dashboard
- [ ] Redirect happens without manual refresh
- [ ] No redirect loops occur
- [ ] Console logs show appropriate messages

---

## 🎯 Success Metrics

**Before Fixes:**
- ❌ Admins had to manually check for new applications
- ❌ No way to add external video links to appointments
- ❌ Users stayed on pending page after approval

**After Fixes:**
- ✅ Admins receive instant email notifications
- ✅ Physios can add Google Meet, Zoom, or any video link
- ✅ Users automatically see their dashboard after approval
- ✅ Improved user experience and workflow efficiency

---

## 📚 Related Documentation

- Email Service: `lib/email/emailService.ts`
- Onboarding Flow: `convex/users.ts` → `completeUserProfile`
- Appointment Schema: `convex/schema.ts`
- Auth Guard: `components/auth/DashboardAuthGuard.tsx`
- Admin Approval: `convex/accountApproval.ts`

---

## 🆘 Support

For issues or questions, check:
1. Convex dashboard logs
2. Browser console errors
3. Network tab for failed requests
4. This documentation file

**Last Updated:** December 2024
**Version:** 1.0.0
