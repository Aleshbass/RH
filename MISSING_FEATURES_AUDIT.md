# Missing Features Audit - Patient Interaction & Notifications

## Executive Summary

**Patient-Side Exercise Interaction**: ✅ **90% Complete** (Production-Ready)
**Therapist Tracking Dashboard**: ❌ **0% Complete** (Not Started)
**Exercise Templates/Library**: ❌ **0% Complete** (Not Started)
**Notifications System**: ⚠️ **40% Complete** (Partial - Treatment Plans Only)
**Daily Reminders**: ❌ **0% Complete** (Not Started)

---

## ✅ What's Already Production-Ready

### Patient Exercise Interaction (90% Complete)
**File**: `components/dashboard/patient/treatment/PatientTreatmentPlanView.tsx`

#### Implemented Features:
- ✅ Card/list view of exercises
- ✅ Exercise name (clickable)
- ✅ Video link/embedded player (opens in new tab)
- ✅ Description with reps/sets displayed
- ✅ Frequency shown (Daily, Weekly, etc.)
- ✅ "Complete" button with dialog
- ✅ Pain level slider (0-10)
- ✅ Completion notes textarea
- ✅ Completion logging (`logExerciseCompletion` mutation)
- ✅ Completion tracking (green checkmark, green border)
- ✅ Today's exercises filter
- ✅ All exercises view (organized by phase)
- ✅ Progress tracking (% completion)
- ✅ Goals display
- ✅ Recent achievements

#### Missing (10%):
- ❌ Dates assigned display (e.g., "Do this on Mon, Wed, Fri")
  - **Current**: Shows frequency as text ("Daily", "Weekly")
  - **Needed**: Parse frequency and show specific dates
- ❌ Multiple completion tracking per day
  - **Current**: One-time completion per exercise
  - **Needed**: Track multiple completions (e.g., "2/3 sets completed today")

---

## ❌ What's Missing (Not Production-Ready)

### 1. Therapist Tracking Dashboard (0% Complete)

#### Required Features:
- ❌ **Assigned Exercises Per Patient View**
  - Show all patients with active treatment plans
  - List exercises assigned to each patient
  - Filter by patient, date range, or exercise type

- ❌ **Completion Logs Dashboard**
  - Real-time view of patient completions
  - Example: "John Doe completed Bird Dog - 3 sets of 10 reps at 2:30 PM"
  - Show pain levels reported
  - Show completion notes

- ❌ **Adherence/Compliance Metrics**
  - Calculate percentage: (completed exercises / assigned exercises) × 100
  - Weekly adherence rate
  - Monthly adherence rate
  - Trend charts (line graph showing adherence over time)
  - Color-coded indicators:
    - Green: >80% adherence
    - Yellow: 50-80% adherence
    - Red: <50% adherence

- ❌ **Patient Progress Summary Cards**
  - Per-patient card showing:
    - Total exercises assigned
    - Exercises completed this week
    - Adherence percentage
    - Last activity date
    - Alerts for patients who haven't logged activity in 3+ days

#### Implementation Plan:
1. Create `convex/therapistDashboard.ts` with queries:
   - `getPatientExerciseAssignments`
   - `getPatientCompletionLogs`
   - `calculatePatientAdherence`
   - `getPatientProgressSummary`

2. Create `app/dashboard/physiotherapist/patient-progress/page.tsx`
   - Table/grid view of all patients
   - Click patient to see detailed completion logs
   - Charts using Recharts or Chart.js

3. Create `components/dashboard/physiotherapist/PatientProgressDashboard.tsx`
   - Reusable dashboard component
   - Filterable by date range
   - Exportable to PDF/CSV

---

### 2. Exercise Templates & Library (0% Complete)

#### Required Features:
- ❌ **Save Exercise as Template**
  - Button on exercise creation: "Save as Template"
  - Store in `treatmentTemplates` or new `exerciseTemplates` table
  - Include: name, description, videoUrl, sets, reps, frequency, instructions

- ❌ **My Exercise Library (Per Therapist)**
  - Page: `/dashboard/physiotherapist/my-exercise-library`
  - List all templates created by current therapist
  - Search/filter by name, body part, condition
  - Edit/delete templates
  - "Use Template" button → pre-fills exercise form

- ❌ **Shared/Validated Exercise Library**
  - Admin-curated library of validated exercises
  - Marked as `isPublic: true` in database
  - All therapists can access
  - Therapists can "favorite" exercises
  - Usage tracking (`timesAssigned` counter)

#### Implementation Plan:
1. Extend `convex/treatmentTemplates.ts` or create `convex/exerciseTemplates.ts`:
   ```typescript
   export const saveExerciseTemplate = mutation({
     args: {
       name: v.string(),
       description: v.string(),
       videoUrl: v.optional(v.string()),
       sets: v.number(),
       reps: v.number(),
       frequency: v.string(),
       instructions: v.array(v.string()),
       targetMuscles: v.array(v.string()),
       equipment: v.array(v.string()),
       difficulty: v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced")),
       isPublic: v.boolean(),
     },
     handler: async (ctx, args) => {
       const user = await getAuthenticatedUser(ctx);
       return await ctx.db.insert("exerciseTemplates", {
         ...args,
         createdBy: user._id,
         clinicId: user.clinicId,
         timesAssigned: 0,
         createdAt: Date.now(),
       });
     },
   });
   ```

2. Create `app/dashboard/physiotherapist/my-exercise-library/page.tsx`
   - Grid/list view of templates
   - Search bar
   - "Create New Template" button
   - "Use Template" button → opens exercise assignment dialog

3. Add "Save as Template" checkbox to exercise creation forms

---

### 3. Missing Notifications (60% Missing)

#### ✅ Already Implemented:
- Treatment plan created → Patient
- Treatment plan updated → Patient
- Treatment plan status changed → Patient
- Template assigned → Patient

#### ❌ Missing Notifications:

##### A. Account Approved Notification
**Trigger**: Admin approves physiotherapist/clinic owner account
**Recipient**: Physiotherapist/Clinic Owner
**File to Modify**: `convex/accountApproval.ts`

```typescript
// In approveAccount mutation, add:
await ctx.db.insert("notifications", {
  userId: user._id,
  type: "account_approved",
  priority: "high",
  status: "pending",
  payload: {
    title: "Account Approved!",
    body: "Your account has been approved. You can now start managing patients.",
    link: "/dashboard/physiotherapist",
  },
  createdAt: Date.now(),
});
```

##### B. Invitation Accepted Notification
**Trigger**: Patient accepts physiotherapist's invitation
**Recipient**: Physiotherapist
**File to Modify**: `convex/patientInvitations.ts`

```typescript
// In acceptInvitation mutation, add:
await ctx.db.insert("notifications", {
  userId: invitation.physiotherapistId,
  type: "invitation_accepted",
  priority: "high",
  status: "pending",
  payload: {
    title: "Patient Accepted Invitation",
    body: `${patient.firstName} ${patient.lastName} accepted your invitation`,
    data: {
      entityId: String(patient._id),
      entityType: "patient",
    },
    link: `/dashboard/physiotherapist/patients/${patient._id}`,
  },
  createdAt: Date.now(),
});
```

##### C. Invoice Sent Notification
**Trigger**: Physiotherapist sends invoice to patient
**Recipient**: Patient
**File to Modify**: `convex/billing.ts`

```typescript
// In createInvoice or sendInvoice mutation, add:
await ctx.db.insert("notifications", {
  userId: args.patientId,
  type: "invoice_sent",
  priority: "medium",
  status: "pending",
  payload: {
    title: "New Invoice Received",
    body: `Invoice #${invoiceNumber} for ${formatCurrency(args.totalAmount)} has been sent`,
    data: {
      entityId: String(invoiceId),
      entityType: "invoice",
      amount: args.totalAmount,
    },
    link: `/dashboard/patient/invoices/${invoiceId}`,
  },
  createdAt: Date.now(),
});
```

##### D. Invoice Paid Notification
**Trigger**: Patient pays invoice (Paystack webhook)
**Recipient**: Physiotherapist
**File to Modify**: `convex/billing.ts` or webhook handler

```typescript
// In payment success webhook handler, add:
await ctx.db.insert("notifications", {
  userId: invoice.physiotherapistId,
  type: "invoice_paid",
  priority: "high",
  status: "pending",
  payload: {
    title: "Payment Received",
    body: `${patient.firstName} ${patient.lastName} paid invoice #${invoice.invoiceNumber}`,
    data: {
      entityId: String(invoiceId),
      entityType: "invoice",
      amount: invoice.totalAmount,
    },
    link: `/dashboard/physiotherapist/billing`,
  },
  createdAt: Date.now(),
});
```

##### E. Patient Accepts Treatment Plan Notification
**Trigger**: Patient views/accepts treatment plan
**Recipient**: Physiotherapist
**File to Create/Modify**: `convex/treatmentPlans.ts`

```typescript
export const acceptTreatmentPlan = mutation({
  args: { treatmentPlanId: v.id("treatmentPlans") },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.treatmentPlanId);
    if (!plan) throw new Error("Plan not found");
    
    // Update plan status or add acceptedAt timestamp
    await ctx.db.patch(args.treatmentPlanId, {
      acceptedAt: Date.now(),
      status: "active",
    });
    
    // Notify physiotherapist
    await ctx.db.insert("notifications", {
      userId: plan.physiotherapistId,
      type: "treatment_plan_accepted",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Patient Accepted Treatment Plan",
        body: `Your patient accepted the treatment plan: ${plan.title}`,
        data: {
          entityId: String(args.treatmentPlanId),
          entityType: "treatmentPlan",
        },
        link: `/dashboard/physiotherapist/patients/${plan.patientId}/treatment-plan`,
      },
      createdAt: Date.now(),
    });
    
    return { success: true };
  },
});
```

##### F. Patient Completes Exercise Notification
**Trigger**: Patient logs exercise completion
**Recipient**: Physiotherapist
**File to Modify**: `convex/treatmentPlans.ts`

```typescript
// In logExerciseCompletion mutation, add:
const plan = await ctx.db.get(args.treatmentPlanId);
if (!plan) throw new Error("Plan not found");

const patient = await ctx.db.get(plan.patientId);

await ctx.db.insert("notifications", {
  userId: plan.physiotherapistId,
  type: "exercise_completed",
  priority: "low",
  status: "pending",
  payload: {
    title: "Patient Completed Exercise",
    body: `${patient?.firstName} ${patient?.lastName} completed an exercise`,
    data: {
      entityId: String(args.treatmentPlanId),
      entityType: "treatmentPlan",
      exerciseId: args.exerciseId,
    },
    link: `/dashboard/physiotherapist/patients/${plan.patientId}/treatment-plan`,
  },
  createdAt: Date.now(),
});
```

---

### 4. Daily Reminders (0% Complete)

#### Required Features:
- ❌ **Daily Push/Email Reminders for Patients**
  - Scheduled at 8:00 AM daily
  - Content: "You have 3 exercises scheduled today"
  - Link to treatment plan page
  - Only send if patient has active plan with exercises due today

- ❌ **Convex Scheduler Setup**
  - Create `convex/crons.ts`
  - Schedule daily job to check all active plans
  - Send reminders via:
    - In-app notification
    - Email (using Resend/SendGrid)
    - Push notification (if mobile app exists)

#### Implementation Plan:

1. **Create Convex Cron Job**:
```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "send-daily-exercise-reminders",
  { hourUTC: 7, minuteUTC: 0 }, // 8:00 AM WAT (UTC+1)
  internal.reminders.sendDailyExerciseReminders
);

export default crons;
```

2. **Create Reminder Action**:
```typescript
// convex/reminders.ts
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const sendDailyExerciseReminders = internalAction({
  handler: async (ctx) => {
    // Get all active treatment plans
    const activePlans = await ctx.runQuery(internal.treatmentPlans.getAllActivePlans);
    
    for (const plan of activePlans) {
      // Count today's exercises
      const todaysExercises = plan.phases.flatMap(phase => 
        phase.exercises.filter(ex => 
          ex.frequency?.toLowerCase().includes('daily')
        )
      );
      
      if (todaysExercises.length > 0) {
        // Create in-app notification
        await ctx.runMutation(internal.notifications.create, {
          userId: plan.patientId,
          type: "daily_reminder",
          priority: "medium",
          payload: {
            title: "Daily Exercise Reminder",
            body: `You have ${todaysExercises.length} exercises scheduled today`,
            link: "/dashboard/patient/treatment-plans",
          },
        });
        
        // Send email (optional)
        // await ctx.runAction(internal.emails.sendDailyReminder, {
        //   patientId: plan.patientId,
        //   exerciseCount: todaysExercises.length,
        // });
      }
    }
  },
});
```

3. **Deploy Cron**:
```bash
npx convex deploy
```

---

## 📋 Implementation Priority

### Phase 1: Critical Missing Notifications (1-2 days)
1. ✅ Account approved notification
2. ✅ Invitation accepted notification
3. ✅ Invoice sent notification
4. ✅ Invoice paid notification
5. ✅ Patient accepts treatment plan notification
6. ✅ Patient completes exercise notification

### Phase 2: Therapist Tracking Dashboard (3-5 days)
1. Backend queries for completion logs
2. Adherence calculation logic
3. Dashboard UI with charts
4. Patient progress summary cards

### Phase 3: Exercise Templates & Library (2-3 days)
1. Save as template functionality
2. My Exercise Library page
3. Shared library with admin curation
4. Template usage tracking

### Phase 4: Daily Reminders (1-2 days)
1. Convex cron job setup
2. Reminder action implementation
3. Email integration (optional)
4. Push notification integration (if mobile app)

### Phase 5: Polish & Enhancements (1-2 days)
1. Add specific dates to exercise frequency display
2. Multiple completion tracking per day
3. Streak tracking (7-day, 30-day)
4. Gamification (badges, achievements)

---

## 🎯 Estimated Total Implementation Time

- **Phase 1 (Critical Notifications)**: 1-2 days
- **Phase 2 (Therapist Dashboard)**: 3-5 days
- **Phase 3 (Exercise Library)**: 2-3 days
- **Phase 4 (Daily Reminders)**: 1-2 days
- **Phase 5 (Polish)**: 1-2 days

**Total**: 8-14 days (1.5-3 weeks)

---

## 🚀 Quick Wins (Can Be Done Today)

1. **Add Missing Notifications** (2-3 hours)
   - Account approved
   - Invitation accepted
   - Invoice sent/paid
   - Patient accepts plan
   - Patient completes exercise

2. **Add "Accept Plan" Button** (30 minutes)
   - Add button to patient treatment plan view
   - Wire to `acceptTreatmentPlan` mutation
   - Show "Accepted" badge after acceptance

3. **Show Specific Exercise Dates** (1 hour)
   - Parse frequency string
   - Calculate next 7 days of scheduled exercises
   - Display as "Mon, Wed, Fri" or "Every day this week"

---

## 📊 Current vs. Required State

| Feature | Current State | Required State | Gap |
|---------|---------------|----------------|-----|
| Patient Exercise View | ✅ 90% | 100% | 10% (dates, multiple completions) |
| Therapist Dashboard | ❌ 0% | 100% | 100% |
| Exercise Library | ❌ 0% | 100% | 100% |
| Notifications | ⚠️ 40% | 100% | 60% |
| Daily Reminders | ❌ 0% | 100% | 100% |

---

## 🎯 Recommendation

**Start with Phase 1 (Critical Notifications)** - This is the highest ROI with the least effort. It will immediately make the platform feel more complete and professional.

Then proceed to **Phase 2 (Therapist Dashboard)** - This is the most valuable feature for therapists and will significantly improve their ability to track patient progress.

**Phase 3 and 4** can be done in parallel or deferred to a later sprint if time is constrained.

---

**Status**: Ready for Implementation
**Last Updated**: 2025-09-29
**Priority**: High
