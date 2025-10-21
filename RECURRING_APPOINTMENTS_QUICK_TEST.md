# 🔄 Recurring Appointments - Quick Test Guide

## Why You're Seeing "No recurring appointment series found"

✅ **This is normal!** You haven't created any recurring series yet. The message is an **empty state** to guide you.

---

## 🚀 How to Create Your First Recurring Series

### Step 1: Navigate to Appointments Page
```
http://localhost:3000/dashboard/physiotherapist/appointments
```

### Step 2: Click "New Recurring Series" Button
- Look for the button next to "New Appointment"
- Icon: 🔄 Repeat

### Step 3: Fill in the Recurring Appointment Modal

**Required Fields**:
1. **Patient**: Select a patient from dropdown
2. **Service Type**: Choose service (e.g., Physiotherapy)
3. **Duration**: Select duration (30, 60, 90 minutes)
4. **Start Date**: When the series should begin
5. **Start Time**: Time of day for appointments
6. **Recurrence Pattern**:
   - **Frequency**: Daily, Weekly, or Monthly
   - **Interval**: Every X days/weeks/months
   - **Days of Week** (for weekly): Select which days
7. **End Condition**:
   - **End Date**: When series should stop, OR
   - **Max Occurrences**: Number of appointments to create

**Optional Fields**:
- Series Name: e.g., "John's Weekly PT Sessions"
- Description: e.g., "Post-surgery rehabilitation program"
- Priority: Low, Medium, High, Urgent
- Notes for Patient
- Notes for Therapist

### Step 4: Submit
- Click "Create Recurring Series"
- Wait for success toast notification
- Navigate to "Recurring Series" tab

---

## 📋 Example Test Cases

### Test Case 1: Weekly Sessions
```
Patient: John Doe
Service: Physiotherapy
Duration: 60 minutes
Start Date: 2025-10-02 (next day)
Start Time: 10:00 AM
Frequency: Weekly
Interval: 1 (every week)
Days of Week: Tuesday, Thursday
Max Occurrences: 8 (4 weeks)
```

**Expected Result**: 8 appointments created (2 per week for 4 weeks)

### Test Case 2: Bi-Weekly Sessions
```
Patient: Jane Smith
Service: Massage Therapy
Duration: 90 minutes
Start Date: 2025-10-03
Start Time: 2:00 PM
Frequency: Weekly
Interval: 2 (every 2 weeks)
Days of Week: Friday
End Date: 2025-12-31
```

**Expected Result**: Appointments every 2 weeks on Friday until Dec 31

### Test Case 3: Daily Rehabilitation
```
Patient: Mike Johnson
Service: Assessment
Duration: 30 minutes
Start Date: 2025-10-02
Start Time: 9:00 AM
Frequency: Daily
Interval: 1 (every day)
Max Occurrences: 10
```

**Expected Result**: 10 consecutive daily appointments

---

## 🔍 What to Verify After Creating

### In "Recurring Series" Tab
✅ Series card appears with:
- Series name and description
- Status badge (Active/Inactive)
- Priority badge (if set)
- Service type and duration
- Recurrence pattern description
- Statistics:
  - Upcoming appointments count
  - Completed appointments count
  - Cancelled appointments count

### In "Appointments" Tab
✅ Individual appointments appear in calendar
✅ Each appointment shows:
- Patient name
- Service type
- Date and time
- Status (scheduled)

### Series Card Actions
✅ "Edit" button opens edit modal
✅ "Delete" button opens deletion options:
- Delete all appointments in series
- Delete from specific date forward

---

## 🐛 Troubleshooting

### Issue: "No recurring appointment series found" persists after creation

**Possible Causes**:
1. **Query filtering by wrong user**: Check that `currentUser._id` matches the logged-in physiotherapist
2. **Role mismatch**: Verify `role='physiotherapist'` is correct
3. **Creation failed silently**: Check browser console for errors

**Debug Steps**:
```typescript
// Add to RecurringSeriesManager component
console.log('UserId:', userId);
console.log('Role:', role);
console.log('Recurring Series:', recurringSeries);
```

### Issue: Modal doesn't open

**Check**:
- Button is not disabled
- No JavaScript errors in console
- Modal state is managed correctly

### Issue: Creation succeeds but no appointments appear

**Check**:
- Appointment instances are actually created (check database)
- Calendar date range includes the created appointments
- Status filter isn't hiding the appointments

---

## 📊 Expected Empty State vs Populated State

### Empty State (What you're seeing now)
```
┌──────────────────────────────────────┐
│ 🔄 No recurring appointment series   │
│    found                             │
│                                      │
│ Recurring series help you schedule  │
│ regular appointments automatically   │
│                                      │
│ Benefits:                            │
│ • Schedule weekly/monthly in bulk    │
│ • Auto-book resources               │
│ • Manage series or individual apts  │
│ • Perfect for ongoing therapy       │
│                                      │
│ Click "Create Recurring Series"     │
│ above to get started                │
└──────────────────────────────────────┘
```

### Populated State (After creating series)
```
┌──────────────────────────────────────┐
│ ✓ Active Series (1)                 │
│                                      │
│ ┌────────────────────────────────┐  │
│ │ 🔄 John's Weekly PT Sessions   │  │
│ │ Post-surgery rehabilitation     │  │
│ │                                 │  │
│ │ 📅 Physiotherapy • 60 min      │  │
│ │                                 │  │
│ │ Recurrence: Weekly on Tuesday   │  │
│ │ and Thursday for 8 occurrences │  │
│ │                                 │  │
│ │ 📊 Stats:                       │  │
│ │   Upcoming: 6                   │  │
│ │   Completed: 2                  │  │
│ │   Cancelled: 0                  │  │
│ │                                 │  │
│ │ [Edit]  [Delete]                │  │
│ └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

## ✅ Success Checklist

After creating your first recurring series, verify:

- [ ] Series card appears in "Recurring Series" tab
- [ ] Series name and description are correct
- [ ] Recurrence pattern description matches what you set
- [ ] Upcoming count shows number of future appointments
- [ ] Individual appointments appear in calendar
- [ ] Edit button opens edit modal
- [ ] Delete button shows confirmation dialog
- [ ] Appointments are properly scheduled on correct days/times

---

## 🎯 Quick Command to Test

1. Go to: `http://localhost:3000/dashboard/physiotherapist/appointments`
2. Click: "New Recurring Series" button
3. Fill in:
   - Patient: (select any)
   - Service: Physiotherapy
   - Duration: 60 min
   - Start: Tomorrow at 10:00 AM
   - Frequency: Weekly
   - Days: Monday
   - Max: 4 occurrences
4. Submit
5. Check "Recurring Series" tab
6. Verify 4 Monday appointments appear in calendar

---

## 📝 Notes

- **Empty state is intentional**: It helps users understand what recurring series are for
- **Creation is async**: May take a moment for series to appear
- **Refresh if needed**: Sometimes a manual refresh helps
- **Check console**: Look for any error messages if creation fails

The recurring appointments feature is **fully functional** - you just need to create your first series! 🚀
