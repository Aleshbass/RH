# 🔍 Calendar Appointments Not Showing - Debug & Fix

**Date**: January 21, 2025  
**Issue**: Appointments created successfully but not appearing on React Big Calendar  
**Status**: Debug logging added + Auto-refresh implemented

---

## 🐛 Problem Description

**Symptoms**:
- ✅ Appointments created successfully (emails sent)
- ✅ Database stores appointments correctly
- ❌ Calendar shows "0 appointments today"
- ❌ No colored blocks appearing on calendar
- ❌ Calendar stays empty after booking

**User Quote**:
> "after booking and appointments it still shows in the react big calender 0 appointments today but I have booked up to 3 different appointments"

---

## 🔧 Fixes Applied

### **1. Added Debug Logging**

**Location**: `/app/dashboard/physiotherapist/appointments/page.tsx` (lines 197-200)

```typescript
// Debug: Log appointments data
console.log('📅 Total appointments from query:', appointments?.length || 0);
console.log('📅 Filtered appointments:', filteredAppointments.length);
console.log('📅 Sample appointment:', filteredAppointments[0]);
```

**Purpose**: Check if appointments are being fetched from Convex

---

### **2. Fixed Variable Scope**

**Issue**: `merged` variable was defined in try block but used in catch block

**Fix**: Moved variable outside try-catch

```typescript
// Before (BROKEN):
try {
  const merged = { ...appointmentData };
  // ...
} catch (error) {
  const startTime = merged.startTime; // ❌ merged not in scope
}

// After (FIXED):
const merged = { ...appointmentData };
try {
  // ...
} catch (error) {
  const startTime = merged.startTime; // ✅ merged in scope
}
```

---

### **3. Added Delayed Refetch**

**Problem**: Convex might not have propagated the new appointment immediately

**Solution**: Double refetch with delay

```typescript
// Immediate refetch
setReloadKey((k) => k + 1);

// Delayed refetch after 1 second
setTimeout(() => {
  setReloadKey((k) => k + 1);
  console.log('🔄 Forced calendar refresh after appointment creation');
}, 1000);
```

**Why**: Gives Convex time to propagate changes across all subscriptions

---

### **4. Added isRecurring Field**

**Issue**: TypeScript error about missing `isRecurring` property

**Fix**: Added to `AppointmentLike` type

```typescript
type AppointmentLike = {
  _id: string;
  // ... other fields
  isPinned?: boolean;
  isRecurring?: boolean; // ✅ ADDED
  colorCode?: string;
};
```

---

## 🧪 Debugging Steps

### **Step 1: Check Browser Console**

After creating an appointment, look for these logs:

```javascript
📅 Total appointments from query: 3
📅 Filtered appointments: 3
📅 Sample appointment: { _id: 'abc123', startTime: ..., patient: {...} }
🔄 Forced calendar refresh after appointment creation
```

**If you see**:
- `Total appointments: 0` → Query not fetching data
- `Filtered appointments: 0` → Filters hiding appointments
- `Sample appointment: undefined` → No appointments exist

---

### **Step 2: Check Convex Dashboard**

1. Open: https://dashboard.convex.dev/d/kindly-elk-471
2. Go to "Data" tab
3. Click "appointments" table
4. Verify your 3 appointments exist
5. Check their `startTime` and `endTime` values
6. Verify `physiotherapistId` matches your user ID

---

### **Step 3: Check Filters**

In the UI, verify:
- Status filter: "All Status" (not filtering out appointments)
- Priority filter: "All Priorities"
- Type filter: "All Types"
- Pinned toggle: OFF (showing all, not just pinned)
- Search box: EMPTY

---

### **Step 4: Check Date Range**

React Big Calendar shows:
- **Week view**: Current week (Monday to Sunday)
- **Day view**: Today only

**Problem**: If appointments are for different weeks/days, they won't show

**Solution**: Use navigation arrows to check other weeks

---

## 🎨 Expected Visual Result

Once working, you should see:

```
┌─────────────────────────────────────────┐
│  MONDAY   TUESDAY   WEDNESDAY  THURSDAY │
├─────────────────────────────────────────┤
│ 9 AM                                     │
│ 10 AM  [Patient A]                      │
│ 11 AM  [Therapy  ]                      │
│ 12 PM                                    │
│ 1 PM               [Patient B]          │
│ 2 PM               [Session  ]          │
│ 3 PM                          [Patient C]│
└─────────────────────────────────────────┘
```

**Colored blocks** based on status:
- **Scheduled** (Blue): `#E3F2FD`
- **Confirmed** (Green): `#E8F5E9`
- **Consultation** (Yellow): `#FFF9C4`

---

## 🔍 Common Issues & Solutions

### **Issue 1: Appointments in Wrong Week**

**Symptom**: Calendar empty but appointments exist in database

**Cause**: Appointments created for different week

**Solution**:
1. Click left/right arrows to navigate weeks
2. Or switch to Month view (if we add it)
3. Check appointment dates in Convex dashboard

---

### **Issue 2: Query Not Fetching**

**Symptom**: Console shows `Total appointments: undefined`

**Cause**: Query hasn't loaded yet or failed

**Solution**:
```typescript
// Check if query is loading
if (appointments === undefined) {
  console.log('⏳ Appointments still loading...');
}

// Check if query returned empty array
if (appointments?.length === 0) {
  console.log('📭 Query succeeded but no appointments found');
}
```

---

### **Issue 3: Filters Hiding Appointments**

**Symptom**: `Total appointments: 3` but `Filtered appointments: 0`

**Cause**: Filters are too restrictive

**Solution**:
```typescript
// Click "Clear Filters" button
// Or manually check each filter:
- searchTerm: ''
- statusFilter: 'all'
- priorityFilter: 'all'
- typeFilter: 'all'
- showPinnedOnly: false
```

---

### **Issue 4: Wrong Date Format**

**Symptom**: Appointments exist but not rendering

**Cause**: `startTime`/`endTime` not in correct format

**Expected Format**:
```typescript
startTime: 1729522800000  // Unix timestamp in milliseconds
endTime: 1729526400000    // Unix timestamp in milliseconds
```

**Conversion**:
```typescript
new Date(appointment.startTime) // Must be valid Date object
```

---

## 📊 Data Flow Check

### **1. Appointment Created**
```
User fills modal → Click "Book"
↓
handleCreateAppointmentWithResources()
↓
Convex createAppointment mutation
↓
✅ Appointment stored in database
✅ Email sent
```

### **2. Query Refetch**
```
setReloadKey(k => k + 1)  // Change query param
↓
useQuery() detects change
↓
Refetch from Convex
↓
appointments array updated
```

### **3. Filter & Transform**
```
appointments (raw from Convex)
↓
filteredAppointments (after filters)
↓
Mapped to AppointmentData format
↓
Passed to AppointmentCalendar
```

### **4. Calendar Render**
```
AppointmentCalendar receives appointments
↓
useMemo converts to CalendarEvent[]
↓
React Big Calendar renders events
↓
✅ Colored blocks appear
```

---

## 🎯 Next Steps

### **For You (User)**:

1. **Open browser console** (F12)
2. **Create a new appointment**
3. **Watch for these logs**:
   ```
   ✅ Appointment created: abc123
   📅 Total appointments from query: X
   📅 Filtered appointments: Y
   🔄 Forced calendar refresh
   ```
4. **Check if number increases** after creation
5. **Navigate between weeks** using arrows
6. **Clear all filters** to ensure nothing hidden

### **If Still Not Working**:

1. **Screenshot the console logs** and share
2. **Check Convex dashboard** - share screenshot of appointments table
3. **Check if appointments are for current week**
4. **Try switching between Week/Day views**

---

## 🔧 Manual Fixes (If Needed)

### **Force Hard Refresh**:
```typescript
// In browser console:
window.location.reload();

// Or hard refresh:
Ctrl + Shift + R (Windows)
Cmd + Shift + R (Mac)
```

### **Clear Filters Programmatically**:
```typescript
// In browser console:
localStorage.clear();
window.location.reload();
```

### **Check Convex Connection**:
```typescript
// In browser console:
console.log(window.__CONVEX_CLIENT__);
```

---

## 📸 Expected Console Output

### **After Creating Appointment**:
```
✅ Appointment created: jd7abc123xyz
📅 Total appointments from query: 1
📅 Filtered appointments: 1
📅 Sample appointment: {
  _id: 'jd7abc123xyz',
  startTime: 1729522800000,
  endTime: 1729526400000,
  patient: {
    firstName: 'John',
    lastName: 'Doe'
  },
  serviceType: 'Physical Therapy',
  status: 'scheduled'
}
🔄 Forced calendar refresh after appointment creation
```

### **After Second Appointment**:
```
✅ Appointment created: jd7def456uvw
📅 Total appointments from query: 2
📅 Filtered appointments: 2
📅 Sample appointment: { ... }
🔄 Forced calendar refresh after appointment creation
```

---

## ✅ Success Indicators

You'll know it's working when:

1. ✅ Console shows increasing appointment count
2. ✅ Colored blocks appear on calendar
3. ✅ Can click appointments to see details
4. ✅ Can drag appointments to reschedule
5. ✅ Header shows "X appointments today"
6. ✅ Status colors match:
   - Blue = Scheduled
   - Green = Confirmed
   - Yellow = Consultation

---

## 🚨 If Nothing Works

**Last Resort Debugging**:

```typescript
// Add this temporarily in appointments page.tsx:
useEffect(() => {
  console.log('🔍 DEBUG - Appointments changed:', {
    total: appointments?.length,
    filtered: filteredAppointments.length,
    sample: filteredAppointments[0],
    filters: {
      search: searchTerm,
      status: statusFilter,
      priority: priorityFilter,
      type: typeFilter,
      pinnedOnly: showPinnedOnly
    }
  });
}, [appointments, filteredAppointments]);
```

This will log every time appointments data changes.

---

**Status**: Debug tools deployed ✅  
**Next**: Check browser console after creating appointment  
**Goal**: See colored appointment blocks on calendar like Google Calendar  

---

**Implemented by**: Cascade AI  
**Date**: January 21, 2025  
**Issue Tracker**: Calendar not showing appointments despite successful creation
