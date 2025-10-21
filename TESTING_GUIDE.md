# 🧪 Reminder System Testing Guide

## Quick Start

### Option 1: Web UI (Recommended)
1. Navigate to: `http://localhost:3001/dashboard/admin/test-reminders`
2. Click "Check Data Availability" to see what test data exists
3. Click "Run All Tests" to test all reminder systems
4. Or click individual test buttons for specific systems

### Option 2: Convex Dashboard
1. Go to your Convex dashboard: https://dashboard.convex.dev
2. Select your project
3. Go to "Functions" tab
4. Find and run these functions:

**Check Data First:**
```
api.test_reminders.checkTestData()
```

**Run All Tests:**
```
api.test_reminders.testAllReminders()
```

**Individual Tests:**
```
api.test_reminders.testExerciseReminders()
api.test_reminders.testInvoiceReminders()
api.test_reminders.testAppointmentReminders()
```

---

## 📋 Test Checklist

### Before Testing:
- [ ] Convex functions deployed (`npx convex deploy`)
- [ ] Database has some test data
- [ ] Notification system is working

### Test Data Requirements:

#### For Exercise Reminders:
- [ ] At least one active treatment plan (status = "active")
- [ ] Plan has exercises with frequency containing "daily"

#### For Invoice Reminders:
- [ ] At least one unpaid invoice (status = "sent")
- [ ] Invoice due date is in the past OR created 3+ days ago

#### For Appointment Reminders:
- [ ] At least one upcoming appointment (status = "scheduled" or "confirmed")
- [ ] Appointment start time is 24 hours from now OR 2 hours from now

---

## 🎯 Expected Results

### If No Test Data Exists:
```json
{
  "success": true,
  "remindersSent": 0,
  "remindersSkipped": 0,
  "totalUnpaid": 0
}
```
**This is OK!** It means the system works but has no data to process.

### If Test Data Exists:
```json
{
  "success": true,
  "remindersSent": 5,
  "remindersSkipped": 2,
  "totalUnpaid": 7
}
```
**This is GREAT!** It means reminders were sent successfully.

### If There's an Error:
```json
{
  "error": "Function not found: internal.reminders.sendDailyExerciseReminders"
}
```
**Action**: Deploy Convex functions: `npx convex deploy`

---

## 🔍 What Each Test Does

### 1. Exercise Reminders Test
- Queries all active treatment plans
- Counts daily exercises per plan
- Checks if < 3 reminders sent today
- Creates notification if conditions met
- Returns count of reminders sent

### 2. Invoice Reminders Test
- Queries unpaid invoices (status = "sent")
- Filters by due date (past or 3+ days old)
- Checks if < 3 reminders sent per invoice
- Creates notification with overdue info
- Returns count of reminders sent

### 3. Appointment Reminders Test
- Queries upcoming appointments (next 24-48 hours)
- Checks if within reminder windows (24h or 2h before)
- Checks if < 2 reminders sent per person
- Creates notifications for patient AND physiotherapist
- Returns count of reminders sent

### 4. Query Functions Test
- Tests all query functions work
- Returns counts of available data
- Verifies database access

---

## 🐛 Troubleshooting

### Problem: "Function not found" error
**Solution**: 
```bash
npx convex deploy
```

### Problem: All tests return 0 reminders sent
**Solution**: This is normal if no test data exists. Create some test data:
1. Active treatment plan with daily exercises
2. Unpaid invoice with past due date
3. Appointment 24 hours from now

### Problem: Tests pass but no notifications appear
**Solution**: Check:
1. Notification system is working (check other notifications)
2. User IDs are valid
3. Check Convex logs for errors

### Problem: Too many reminders sent
**Solution**: This shouldn't happen due to safeguards, but if it does:
1. Check deduplication windows
2. Check count limits in code
3. Review console logs

---

## 📊 Interpreting Results

### Data Check Results:
```
Active Plans: 5
Unpaid Invoices: 3
Upcoming Appointments: 2
```
**Meaning**: You have test data available for all systems.

### Test Results:
```
✅ Exercise Reminders: PASSED
   Result: { remindersSent: 5, remindersSkipped: 0 }

✅ Invoice Reminders: PASSED
   Result: { remindersSent: 3, remindersSkipped: 0 }

✅ Appointment Reminders: PASSED
   Result: { remindersSent: 4, remindersSkipped: 0 }
```
**Meaning**: All systems working perfectly!

---

## 🎓 Creating Test Data

### Create Test Treatment Plan:
```typescript
// In Convex dashboard or via mutation
{
  patientId: "...",
  physiotherapistId: "...",
  title: "Test Plan",
  status: "active",
  phases: [{
    name: "Phase 1",
    order: 1,
    exercises: [{
      exerciseId: "test-1",
      name: "Test Exercise",
      sets: 3,
      reps: 10,
      frequency: "Daily"
    }]
  }],
  startDate: Date.now(),
  goals: [],
  reviewInterval: 7
}
```

### Create Test Invoice:
```typescript
{
  patientId: "...",
  physiotherapistId: "...",
  invoiceNumber: "TEST-001",
  status: "sent",
  totalAmount: 5000000, // ₦50,000 in kobo
  dueDate: Date.now() - (5 * 24 * 60 * 60 * 1000), // 5 days ago
  items: [],
  createdAt: Date.now()
}
```

### Create Test Appointment:
```typescript
{
  patientId: "...",
  physiotherapistId: "...",
  status: "scheduled",
  appointmentType: "consultation",
  startTime: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
  endTime: Date.now() + (25 * 60 * 60 * 1000),
  createdAt: Date.now()
}
```

---

## ✅ Success Criteria

### All Tests Should:
- ✅ Execute without errors
- ✅ Return success: true
- ✅ Show correct counts
- ✅ Create notifications (if data exists)
- ✅ Respect count limits
- ✅ Not create duplicates

### System is Ready When:
- ✅ All 4 tests pass
- ✅ Notifications appear in database
- ✅ Console logs show no errors
- ✅ Counts match expectations
- ✅ Deduplication works (run twice, should skip on second run)

---

## 🚀 Next Steps After Testing

1. **If All Tests Pass**:
   - ✅ System is production-ready
   - Deploy to production
   - Monitor cron job execution
   - Check notification delivery

2. **If Some Tests Fail**:
   - Review error messages
   - Check database schema
   - Verify function exports
   - Re-deploy Convex functions

3. **Monitor in Production**:
   - Check Convex logs daily
   - Monitor notification counts
   - Track user engagement
   - Adjust timing if needed

---

## 📞 Support

If tests fail consistently:
1. Check Convex dashboard logs
2. Verify all files are deployed
3. Ensure database schema matches
4. Review function exports in `convex/_generated/api.ts`

---

**Last Updated**: 2025-09-29  
**Version**: 1.0.0
