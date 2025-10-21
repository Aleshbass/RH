# DayPilot Migration - QA Testing Checklist

## ✅ Pre-Testing Setup

- [ ] Run `pnpm install` to sync dependencies
- [ ] Start dev server: `pnpm dev` or `npx convex dev`
- [ ] Clear browser cache
- [ ] Open browser console to monitor errors

---

## 🧪 Critical User Flows

### 1. Appointment Creation
- [ ] Navigate to `/dashboard/physiotherapist/calendar`
- [ ] Click empty time slot on calendar
- [ ] Verify AppointmentModal opens with correct date/time
- [ ] Fill appointment details and save
- [ ] **Expected**: Appointment appears on calendar with correct styling
- [ ] **Expected**: Patient receives appointment email
- [ ] **Expected**: Provider receives appointment email
- [ ] Check browser console for errors

### 2. Drag-and-Drop Reschedule
- [ ] Drag an existing appointment to new time slot
- [ ] **Expected**: Toast shows "Appointment rescheduled successfully"
- [ ] **Expected**: Appointment moves to new time
- [ ] **Expected**: Patient receives reschedule email with old/new times
- [ ] **Expected**: Provider receives reschedule email
- [ ] Verify no console errors
- [ ] Refresh page and confirm appointment persisted at new time

### 3. Resize Duration
- [ ] Hover over appointment bottom edge (cursor changes to resize)
- [ ] Drag to extend/reduce duration
- [ ] **Expected**: Toast shows "Appointment duration updated"
- [ ] **Expected**: Patient receives reschedule email
- [ ] **Expected**: Provider receives reschedule email
- [ ] Verify new duration persisted

### 4. Recurring Appointment Edit
- [ ] Create recurring series (via "New Recurring Series" button)
- [ ] Try to drag/resize a recurring appointment
- [ ] **Expected**: RecurringEditDialog appears with 3 options:
  - This appointment only
  - This and future appointments
  - All appointments in series
- [ ] Select "This appointment only"
- [ ] **Expected**: Only that instance moves
- [ ] **Expected**: Reschedule emails sent
- [ ] Select "Cancel" - verify appointment reverts

### 5. Appointment Click
- [ ] Click on an appointment
- [ ] **Expected**: SessionLogModal or details modal opens
- [ ] Verify patient info displayed correctly
- [ ] Close modal and try again with different appointment

### 6. View Mode Toggle
- [ ] Toggle between Week and Day views
- [ ] **Expected**: Calendar updates smoothly
- [ ] **Expected**: All appointments visible in both views
- [ ] Navigate to previous/next week
- [ ] **Expected**: Appointments load correctly

### 7. Status Filter
- [ ] Go to `/dashboard/physiotherapist/appointments`
- [ ] Filter by "Scheduled", "Confirmed", "Completed"
- [ ] **Expected**: Calendar shows only matching appointments
- [ ] **Expected**: Appointment cards styled with correct pastel colors:
  - Scheduled: Blue (#E3F2FD)
  - Confirmed: Green (#E8F5E9)
  - Consultation: Yellow (#FFF9C4)

### 8. Appointments Page Calendar View
- [ ] Navigate to `/dashboard/physiotherapist/appointments`
- [ ] Switch to "Calendar" view
- [ ] Verify DayPilotCalendar renders
- [ ] Try drag/resize - same behavior as main calendar
- [ ] Switch to "List" view - verify cards display

---

## 🎨 Design System Validation

### Visual Checks
- [ ] **Time slots**: 60px height
- [ ] **Rounded corners**: 8px border-radius on appointments
- [ ] **Subtle shadows**: Box shadow on hover increases
- [ ] **Uppercase headers**: Day labels in uppercase
- [ ] **Pastel colors**: Status colors match design system
- [ ] **Telehealth badge**: 📹 appears on telehealth appointments
- [ ] **In-person badge**: 🏥 appears on in-person appointments
- [ ] **Pinned indicator**: 📌 shows for pinned appointments
- [ ] **Recurring indicator**: 🔄 shows for recurring appointments
- [ ] **Priority bar**: Left border color matches priority:
  - Low: Gray
  - Medium: Yellow
  - High: Orange
  - Urgent: Red

### Responsiveness
- [ ] Test on mobile (< 768px width)
- [ ] Test on tablet (768px - 1024px)
- [ ] Test on desktop (> 1024px)
- [ ] Verify modals are fully responsive
- [ ] Verify buttons stack on mobile, inline on desktop

---

## 📧 Email Delivery Validation

### Appointment Created
- [ ] Create appointment
- [ ] Check patient email inbox
- [ ] Check provider email inbox
- [ ] Verify email contains:
  - Patient/provider name
  - Appointment date/time
  - Service type
  - Clinic address
  - Calendar link

### Appointment Rescheduled
- [ ] Drag appointment to new time
- [ ] Check both inboxes
- [ ] Verify email contains:
  - **Old date/time** (with strikethrough or label)
  - **New date/time**
  - Reason for reschedule (if provided)
  - Updated calendar link

### Appointment Cancelled
- [ ] Cancel an appointment
- [ ] Verify cancellation emails sent
- [ ] Verify emails contain cancellation reason

---

## 🔄 Google Calendar Sync

### OAuth Flow
- [ ] Navigate to calendar settings
- [ ] Click "Connect Google Calendar"
- [ ] Complete OAuth flow
- [ ] **Expected**: "Connected" status displays

### Sync Events
- [ ] Create appointment in app
- [ ] Check Google Calendar
- [ ] **Expected**: Event appears in Google Calendar
- [ ] Update appointment in app
- [ ] **Expected**: Google Calendar event updates
- [ ] Delete appointment in app
- [ ] **Expected**: Google Calendar event deleted

### Webhook Validation
- [ ] Trigger sync from Google Calendar
- [ ] Verify webhook `/api/webhooks/health` is accessible
- [ ] Check Convex logs for sync activity

---

## 🐛 Error Handling

### Invalid Time Slots
- [ ] Try to create appointment outside business hours (before 9am or after 5pm)
- [ ] **Expected**: Toast error "Outside business hours"
- [ ] Try to drag appointment to past date
- [ ] **Expected**: Toast error "Cannot schedule in the past"
- [ ] Try to resize to < 15 minutes
- [ ] **Expected**: Toast error "Minimum duration is 15 minutes"

### Conflict Detection
- [ ] Create overlapping appointment
- [ ] **Expected**: Conflict warning or prevention
- [ ] Try to drag onto existing appointment
- [ ] **Expected**: Overlap prevented or warning shown

### Network Errors
- [ ] Disconnect network
- [ ] Try to reschedule appointment
- [ ] **Expected**: Toast error "Failed to reschedule appointment"
- [ ] Reconnect network
- [ ] Retry - verify works

---

## 📱 Multi-Provider Scheduler (Optional)

If you implement the clinic scheduler page:
- [ ] Navigate to multi-provider view
- [ ] Verify all providers listed as resources
- [ ] Drag appointment between providers
- [ ] **Expected**: Reassignment succeeds with toast
- [ ] **Expected**: Emails sent to old and new provider
- [ ] Verify appointments grouped by provider

---

## 🔍 Browser Console Checks

During all tests, monitor console for:
- ❌ No React errors
- ❌ No DayPilot errors
- ❌ No Convex mutation errors
- ❌ No 404s for missing components
- ❌ No hydration mismatches

---

## 📊 Performance Validation

### Load Times
- [ ] Calendar page loads in < 2 seconds
- [ ] Appointments page loads in < 2 seconds
- [ ] Drag/resize feels smooth (no lag)
- [ ] View mode toggle instant

### Bundle Size
- [ ] Run `npm run build`
- [ ] Check bundle size report
- [ ] **Expected**: Smaller than before migration (~120KB savings)
- [ ] Verify no FullCalendar chunks in build output

---

## ✅ Regression Tests

### Existing Features Still Work
- [ ] Session log creation/editing
- [ ] Patient profile viewing
- [ ] Resource booking (rooms, equipment)
- [ ] Recurring series management
- [ ] Appointment status changes
- [ ] Patient search and selection
- [ ] Notes/comments on appointments
- [ ] Telehealth link generation

---

## 🚀 Final Checks Before Prod

- [ ] All QA items above passed
- [ ] No console errors in dev
- [ ] `pnpm build` succeeds with no errors
- [ ] Staging deploy successful
- [ ] QA on staging environment
- [ ] Backup production database
- [ ] Deploy to production
- [ ] Smoke test in production
- [ ] Monitor error logs for 24 hours

---

## 📝 Known Limitations

### Recurring Edit Scope
Currently, the RecurringEditDialog only supports:
- ✅ "This appointment only" - fully functional
- ⚠️ "This and future" - shows dialog but uses single instance logic (TODO)
- ⚠️ "All in series" - shows dialog but uses single instance logic (TODO)

**Future work**: Wire up `api.recurringAppointments.updateRecurringSeries` for full scope support.

### Multi-Provider Reassignment
- ✅ DayPilotScheduler component built
- ⚠️ No dedicated clinic scheduler page yet (optional enhancement)

---

## 📞 Troubleshooting

### Calendar Not Rendering
1. Check browser console for errors
2. Verify DayPilot dependency installed: `pnpm list @daypilot/daypilot-lite-react`
3. Clear browser cache
4. Restart dev server

### Drag/Resize Not Working
1. Verify `onAppointmentReschedule` prop passed correctly
2. Check `rescheduleAppointment` mutation exists in Convex
3. Verify no console errors during drag

### Emails Not Sending
1. Check `.env.local` for `RESEND_API_KEY`
2. Verify email actions deployed to Convex
3. Check Convex scheduler logs
4. Verify patient/provider have valid emails

### Google Calendar Not Syncing
1. Check OAuth credentials in `.env.local`
2. Verify webhook URL accessible
3. Check `calendarWatchChannels` table in Convex dashboard
4. Verify Google Calendar API enabled in Google Cloud Console

---

**QA Sign-off**: _________________________  
**Date**: _________________________  
**Notes**: _________________________
