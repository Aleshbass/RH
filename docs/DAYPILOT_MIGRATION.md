# DayPilot Migration Guide

## Migration Overview

**Objective**: Replace FullCalendar with DayPilot Lite for enhanced multi-provider scheduling, resource management, and telehealth-focused appointment management.

**Date**: January 2025  
**Status**: In Progress

---

## Current System Analysis

### Appointment Creation Flows

#### 1. **Provider-Initiated Appointment** (Physiotherapist creates for patient)
**Entry Points**:
- `components/calendar/AppointmentModal.tsx` (opened from calendar date click)
- `components/appointments/AppointmentBookingModal.tsx` (telehealth-focused, gradient UI)

**Backend Flow**:
```
User clicks date/time slot on calendar
  ↓
AppointmentModal opens
  ↓
User fills form (patient, service, time, notes)
  ↓
Calls: api.appointments.createAppointment
  ↓
Backend: Creates appointment record
  ↓
Backend: Creates notifications (patient + provider)
  ↓
Backend: Sends emails:
  - sendAppointmentScheduledEmail → patient
  - (Optional) Creates Google Calendar event if integration enabled
```

**Email Triggers**:
- `sendAppointmentScheduledEmail` → Patient confirmation
- Notifications created for both patient and provider

#### 2. **Patient-Initiated Appointment Request**
**Entry Points**:
- `components/patient/AppointmentBookingModal.tsx` (patient portal)

**Backend Flow**:
```
Patient selects physiotherapist and available time slot
  ↓
Calls: api.appointments.getAvailableTimeSlots (get free slots)
  ↓
Patient selects slot
  ↓
Calls: api.appointments.requestAppointment
  ↓
Backend: Creates appointment with status "scheduled"
  ↓
Backend: Creates notifications
  ↓
Backend: Sends emails:
  - sendAppointmentRequestedEmail → physiotherapist
  - sendAppointmentScheduledEmail → patient
```

**Email Triggers**:
- `sendAppointmentRequestedEmail` → Physiotherapist notification
- `sendAppointmentScheduledEmail` → Patient confirmation

#### 3. **Marketplace Booking** (Public booking)
**Entry Point**: `convex/marketplace/booking.ts`

**Backend Flow**:
```
Public user books through marketplace
  ↓
Calls: marketplace.createMarketplaceBooking
  ↓
Backend: Creates appointment
  ↓
Backend: Sends email:
  - sendAppointmentScheduledEmail → patient
```

### Appointment Update Flows

#### 1. **Drag-and-Drop Reschedule** (Calendar interaction)
**Entry Points**:
- `components/calendar/DragDropTooltipCalendar.tsx`
- `components/calendar/EnhancedAppointmentCalendar.tsx`

**Backend Flow**:
```
User drags appointment to new time
  ↓
onEventDrop handler fires
  ↓
Calls: api.appointments.updateAppointmentFields
  ↓
Backend: Updates startTime/endTime
  ↓
Backend: Checks for conflicts
  ↓
Backend: Sends emails:
  - sendAppointmentRescheduledProviderEmail
  - sendAppointmentRescheduledPatientEmail
```

#### 2. **Resize Appointment** (Change duration)
**Entry Points**:
- Calendar resize handlers

**Backend Flow**:
```
User resizes appointment
  ↓
onEventResize handler fires
  ↓
Calls: api.appointments.updateAppointmentFields
  ↓
Backend: Updates endTime
  ↓
Backend: Sends reschedule emails
```

#### 3. **Manual Property Updates** (Pin, Priority, Color)
**Entry Points**:
- Calendar event click → property modals

**Backend Flow**:
```
User updates pin/priority/color
  ↓
Calls: api.appointments.updateAppointmentFields
  ↓
Backend: Updates isPinned/priority/colorCode
  ↓
No emails sent (minor updates)
```

### Recurring Appointments Flow

**Entry Points**:
- `components/appointments/RecurringAppointmentModal.tsx`
- `components/appointments/RecurringSeriesManager.tsx`

**Backend Flow**:
```
User creates recurring series
  ↓
Calls: api.recurringAppointments.createRecurringSeries
  ↓
Backend: Creates recurringSeries record
  ↓
Backend: Generates individual appointment instances
  ↓
Backend: Sends emails for each instance
```

**Edit Flow** (Single Instance vs Series):
```
User edits recurring appointment
  ↓
System prompts: "Edit this instance" or "Edit series"
  ↓
If instance: api.recurringAppointments.updateSeriesAppointment
If series: api.recurringAppointments.updateRecurringSeries
  ↓
Backend: Updates instance or regenerates series
```

### Resource Management Flow

**Entry Points**:
- `hooks/useResourceManagement.ts`
- `components/appointments/AppointmentBookingModal.tsx` (resource selection)

**Backend Flow**:
```
User selects resources (rooms, equipment, staff)
  ↓
Calls: api.resourceManagement.checkResourceAvailability
  ↓
Backend: Checks operating hours, maintenance, conflicts
  ↓
User confirms
  ↓
Calls: api.appointments.createAppointment (with selectedResources)
  ↓
Calls: api.resourceManagement.bookResource
  ↓
Backend: Creates appointment + resource booking
```

### Google Calendar Integration Flow

**Entry Points**:
- OAuth setup (one-time): `convex/calendar/oauth.ts`
- Sync trigger: `convex/calendar/sync.ts`

**Backend Flow**:
```
User connects Google Calendar
  ↓
OAuth flow: generateAuthUrl → exchangeCode → storeCredentials
  ↓
System creates calendar watch webhook
  ↓
When appointment created:
  ↓
Calls: api.calendar.service.createCalendarEvent
  ↓
Backend: Creates Google Calendar event
  ↓
Stores googleEventId in calendarEvents table
  ↓
When Google Calendar changes:
  ↓
Webhook fires: convex/calendar/webhook.ts
  ↓
Triggers sync: api.calendar.sync.syncCalendarEvents
  ↓
Backend: Syncs changes bidirectionally
```

**⚠️ Known Issue**: `sync.ts` uses non-existent fields (`title`, `description`) instead of schema fields (`serviceType`, `notesForPatient`, `notesForTherapist`). This must be fixed.

---

## Email System Architecture

### Email Actions (Convex Scheduler)

All emails are sent asynchronously via `ctx.scheduler.runAfter(0, ...)`:

1. **sendAppointmentScheduledEmail**
   - **Recipient**: Patient
   - **Trigger**: Appointment created/confirmed
   - **Data**: patientName, physiotherapistName, appointmentDate, appointmentTime, clinicName, clinicAddress, calendarLink, rescheduleLink

2. **sendAppointmentRequestedEmail**
   - **Recipient**: Physiotherapist
   - **Trigger**: Patient requests appointment
   - **Data**: patientName, physiotherapistName, appointmentDate, appointmentTime, clinicName, viewLink, approveLink

3. **sendAppointmentRescheduledPatientEmail**
   - **Recipient**: Patient
   - **Trigger**: Appointment time changed
   - **Data**: oldTime, newTime, patientName, physiotherapistName, clinicName

4. **sendAppointmentRescheduledProviderEmail**
   - **Recipient**: Physiotherapist
   - **Trigger**: Appointment time changed
   - **Data**: oldTime, newTime, patientName, physiotherapistName

5. **sendAppointmentCanceledProviderEmail**
   - **Recipient**: Physiotherapist
   - **Trigger**: Patient cancels appointment
   - **Data**: patientName, cancellationReason, appointmentDate

6. **sendAppointmentReminderEmail**
   - **Recipient**: Patient + Physiotherapist
   - **Trigger**: Scheduled reminder (24h before)
   - **Data**: appointmentDate, appointmentTime, clinicName

### Email Service Configuration

**Provider**: Resend (via `lib/email/emailService.ts`)  
**Templates**: React Email components  
**Domain**: From environment variables  

---

## DayPilot Migration Strategy

### Why DayPilot Lite?

1. **Multi-Provider Resource View**: Display multiple physiotherapists side-by-side (Scheduler component)
2. **Time-Slot Precision**: Fixed 60px cell height, 15/30/60-minute intervals
3. **Resource Timeline**: Support for rooms, equipment, staff scheduling
4. **Business Hours**: Built-in non-business background and blocked events
5. **Telehealth Focus**: Better support for virtual appointment metadata (video links, tags)
6. **Drag-Drop Native**: Robust move/resize events with conflict detection

### Components to Build

#### 1. **DayPilotCalendar** (Single Provider View)
**File**: `components/calendar/DayPilotCalendar.tsx`

**Props**:
```typescript
interface DayPilotCalendarProps {
  appointments: AppointmentData[]
  viewMode: 'day' | 'week'
  currentDate: Date
  onCreateAppointment: (start: number, end: number) => void
  onAppointmentClick: (appointment: AppointmentData) => void
  onAppointmentUpdate: (id: string, updates: { startTime: number; endTime: number }) => void
  businessHoursStart?: number // default: 9
  businessHoursEnd?: number // default: 17
  cellDuration?: number // default: 30 minutes
  cellHeight?: number // default: 60px
}
```

**Features**:
- Day/Week views
- 60px time slots
- Pastel status colors
- Priority left-border indicators
- Telehealth/in-person badges
- Drag-drop rescheduling
- Resize to change duration
- Click to view/edit
- Tooltips on hover

#### 2. **DayPilotScheduler** (Multi-Provider Resource View)
**File**: `components/calendar/DayPilotScheduler.tsx`

**Props**:
```typescript
interface DayPilotSchedulerProps {
  providers: Provider[]
  appointments: AppointmentData[]
  viewMode: 'day' | 'week'
  currentDate: Date
  onCreateAppointment: (providerId: string, start: number, end: number) => void
  onAppointmentClick: (appointment: AppointmentData) => void
  onAppointmentUpdate: (id: string, updates: { startTime: number; endTime: number; physiotherapistId?: string }) => void
  resources?: Resource[] // rooms, equipment
  showResources?: boolean
}
```

**Features**:
- Multi-row layout (one row per provider)
- Drag appointments between providers (reassign)
- Resource conflict indicators
- Color-coded availability zones
- Bulk scheduling tools

#### 3. **DayPilot Adapter**
**File**: `lib/calendar/dayPilotAdapter.ts`

**Functions**:
```typescript
// Convert appointments to DayPilot events
function appointmentsToDayPilotEvents(appointments: AppointmentData[]): DayPilotEvent[]

// Convert providers to DayPilot resources
function providersToDayPilotResources(providers: Provider[]): DayPilotResource[]

// Get status color (pastel)
function getStatusColor(status: AppointmentStatus): string

// Get priority border color
function getPriorityColor(priority: Priority): string

// Format telehealth badge
function getTelehealthBadge(type: 'in-person' | 'telehealth'): string
```

### Page Migration Plan

#### Phase 1: Single Provider Calendar
**File**: `app/dashboard/physiotherapist/calendar/page.tsx`

**Before** (FullCalendar):
```tsx
<EnhancedAppointmentCalendar
  appointments={calendarAppointments}
  onCreateAppointment={handleCreateAppointment}
  onAppointmentClick={handleAppointmentClick}
  onAppointmentUpdate={handleAppointmentUpdate}
  viewMode={viewMode}
  currentDate={currentWeek}
/>
```

**After** (DayPilot):
```tsx
<DayPilotCalendar
  appointments={calendarAppointments}
  onCreateAppointment={handleCreateAppointment}
  onAppointmentClick={handleAppointmentClick}
  onAppointmentUpdate={handleAppointmentUpdate}
  viewMode={viewMode}
  currentDate={currentWeek}
  businessHoursStart={9}
  businessHoursEnd={17}
  cellDuration={30}
  cellHeight={60}
/>
```

**Handlers** (No changes required):
- `handleCreateAppointment` → calls `api.appointments.createAppointment`
- `handleAppointmentClick` → opens modal
- `handleAppointmentUpdate` → calls `api.appointments.updateAppointmentFields`

#### Phase 2: Appointments Page
**File**: `app/dashboard/physiotherapist/appointments/page.tsx`

**Migration**: Same as Phase 1 (uses same calendar component)

#### Phase 3: Multi-Provider View (NEW)
**File**: `app/dashboard/clinic/scheduler/page.tsx` (create new)

**Backend Query** (NEW):
```typescript
// convex/appointments.ts
export const getClinicPhysiotherapists = query({
  args: { clinicId: v.id("clinics") },
  handler: async (ctx, args) => {
    // Get all physiotherapists in clinic
    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", args.clinicId))
      .collect()
    
    // Get user details
    const physiotherapists = await Promise.all(
      profiles.map(async (profile) => {
        const user = await ctx.db.get(profile.userId)
        return {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          imageUrl: user.imageUrl,
          specializations: profile.specializations,
        }
      })
    )
    
    return physiotherapists
  }
})
```

**Component**:
```tsx
<DayPilotScheduler
  providers={clinicPhysiotherapists}
  appointments={allClinicAppointments}
  onCreateAppointment={handleCreateAppointment}
  onAppointmentClick={handleAppointmentClick}
  onAppointmentUpdate={handleAppointmentUpdate}
  viewMode="week"
  currentDate={currentWeek}
  showResources={true}
/>
```

---

## Design System Mapping

### Status Colors (Pastel)

```typescript
const statusColors = {
  scheduled: '#E3F2FD',      // Light blue
  confirmed: '#E8F5E9',      // Light green
  completed: '#F3E5F5',      // Light purple
  cancelled_by_patient: '#FFEBEE',  // Light red
  cancelled_by_therapist: '#FFF3E0', // Light orange
  no_show: '#ECEFF1'         // Light gray
}
```

### Priority Indicators (Left Border)

```typescript
const priorityColors = {
  urgent: '#D32F2F',   // Red
  high: '#F57C00',     // Orange
  medium: '#1976D2',   // Blue
  low: '#388E3C'       // Green
}
```

### Time Slot Styling

```css
.daypilot-cell {
  height: 60px !important;
  border: 1px solid #E0E0E0;
  border-radius: 4px;
}

.daypilot-header {
  text-transform: uppercase;
  font-weight: 600;
  font-size: 12px;
  color: #616161;
}

.daypilot-event {
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 8px;
}

.daypilot-event-telehealth::after {
  content: "📹";
  position: absolute;
  top: 4px;
  right: 4px;
}
```

---

## Recurring Appointments Enhancement

### Current State
- Backend fully supports series, exceptions, update modes
- UI lacks prompts on drag-drop edits

### Enhancement: Edit Scope Dialog

**File**: `components/calendar/RecurringEditDialog.tsx` (NEW)

```tsx
interface RecurringEditDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (mode: 'instance' | 'series' | 'this-and-future') => void
  appointmentDate: Date
}

// Dialog prompts:
// - Edit only this appointment
// - Edit this and future appointments
// - Edit all appointments in the series
```

**Integration**:
```tsx
// In DayPilotCalendar onEventMove handler
if (appointment.isRecurring) {
  setRecurringEditDialog({ open: true, appointment, newTime })
} else {
  await updateAppointment(appointment.id, { startTime: newTime })
}
```

---

## Testing Plan

### Unit Tests
- [ ] Adapter functions (appointments → events, providers → resources)
- [ ] Status/priority color mappings
- [ ] Recurring logic (edit scope detection)

### Integration Tests
- [ ] Create appointment → email sent
- [ ] Drag-drop reschedule → email sent
- [ ] Patient request → dual emails sent
- [ ] Recurring create → multiple emails sent
- [ ] Resource conflict detection
- [ ] Google Calendar sync (both directions)

### Manual QA Checklist
- [ ] Drag appointment to new time (non-recurring)
- [ ] Drag recurring appointment → prompt appears
- [ ] Resize appointment duration
- [ ] Click appointment → details modal opens
- [ ] Create appointment from empty slot
- [ ] Pin/unpin appointment
- [ ] Change priority
- [ ] Change color code
- [ ] Filter by status
- [ ] Switch day/week views
- [ ] Multi-provider view (reassign between providers)
- [ ] Resource booking conflict prevention
- [ ] Telehealth badge displays correctly
- [ ] Email received (check inbox)
- [ ] Google Calendar event created (if integration enabled)
- [ ] Notification created in-app

---

## Rollback Strategy

### Feature Flag Approach

**Environment Variable**: `NEXT_PUBLIC_USE_DAYPILOT`

**Implementation**:
```tsx
// app/dashboard/physiotherapist/calendar/page.tsx
const useDayPilot = process.env.NEXT_PUBLIC_USE_DAYPILOT === 'true'

return useDayPilot ? (
  <DayPilotCalendar {...props} />
) : (
  <EnhancedAppointmentCalendar {...props} />
)
```

**Rollback Steps**:
1. Set `NEXT_PUBLIC_USE_DAYPILOT=false` in `.env.local`
2. Redeploy
3. Monitor for 24 hours
4. If stable, remove FullCalendar dependencies

---

## Implementation Timeline

### Week 1: Foundation
- [x] Document flows and email triggers
- [ ] Install DayPilot Lite
- [ ] Create adapter utilities
- [ ] Build DayPilotCalendar component
- [ ] Build RecurringEditDialog component

### Week 2: Migration
- [ ] Add getClinicPhysiotherapists query
- [ ] Migrate physiotherapist/calendar/page.tsx
- [ ] Migrate physiotherapist/appointments/page.tsx
- [ ] Build DayPilotScheduler component
- [ ] Create clinic/scheduler/page.tsx

### Week 3: Enhancement & QA
- [ ] Fix convex/calendar/sync.ts field mismatches
- [ ] Add buffer-time conflict detection
- [ ] Run integration tests
- [ ] Manual QA (all flows)
- [ ] Performance testing

### Week 4: Cleanup & Launch
- [ ] Feature flag rollout (25% → 50% → 100%)
- [ ] Monitor error rates and email delivery
- [ ] Remove FullCalendar dependencies
- [ ] Update documentation

---

## Dependencies

### Install
```bash
pnpm add @daypilot/daypilot-lite-react
```

### Remove (After migration complete)
```bash
pnpm remove @fullcalendar/core @fullcalendar/daygrid @fullcalendar/interaction @fullcalendar/list @fullcalendar/react @fullcalendar/timegrid react-big-calendar @types/react-big-calendar
```

---

## Known Issues & Fixes

### 1. **Google Calendar Sync Field Mismatch**
**File**: `convex/calendar/sync.ts`  
**Issue**: Uses `title`, `description` fields that don't exist in appointments schema  
**Fix**: Change to `serviceType`, `notesForPatient`, `notesForTherapist`

**Before**:
```typescript
const appointmentId = await ctx.db.insert("appointments", {
  title: googleEvent.summary,
  description: googleEvent.description,
  // ...
})
```

**After**:
```typescript
const appointmentId = await ctx.db.insert("appointments", {
  serviceType: googleEvent.summary || "General Consultation",
  notesForTherapist: googleEvent.description,
  // ...
})
```

### 2. **Buffer Time Not Enforced**
**Issue**: Conflict detection only checks direct overlaps, no buffer between appointments  
**Fix**: Add configurable buffer minutes (default: 15) to conflict checks

**Implementation**:
```typescript
// In createAppointment and updateAppointmentFields
const BUFFER_MINUTES = 15
const bufferMs = BUFFER_MINUTES * 60 * 1000
const effectiveStartTime = args.startTime - bufferMs
const effectiveEndTime = args.endTime + bufferMs

const conflicts = await ctx.db
  .query("appointments")
  .filter((q) => 
    q.or(
      q.and(q.lt(q.field("startTime"), effectiveEndTime), q.gt(q.field("endTime"), effectiveStartTime))
    )
  )
  .collect()
```

---

## Success Metrics

### Pre-Migration Baseline
- Appointment creation rate: [measure]
- Drag-drop usage: [measure]
- Email delivery rate: [measure]
- Average time to schedule: [measure]

### Post-Migration Targets
- Zero regression in email delivery (100%)
- <2% increase in error rates
- Maintain or improve scheduling speed
- 95%+ user satisfaction (survey)
- Multi-provider scheduling enabled (new feature)

---

## Support & Documentation

### Developer Resources
- DayPilot Lite Docs: https://doc.daypilot.org/calendar/
- DayPilot Scheduler Docs: https://doc.daypilot.org/scheduler/
- React Integration Guide: https://doc.daypilot.org/calendar/react/

### Team Training
- [ ] Demo session: DayPilot components
- [ ] Code review: Adapter utilities
- [ ] QA walkthrough: Testing checklist
- [ ] Support guide: Troubleshooting common issues

---

**Last Updated**: January 21, 2025  
**Owner**: Development Team  
**Status**: Phase 1 - Documentation Complete
