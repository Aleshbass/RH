# Analytics Dashboard - Data Source Analysis

**Date:** 2025-09-30 12:50 PM  
**Issue:** Mixed real and dummy data on analytics page  
**Status:** Verified - Data is partially hardcoded

---

## 🔍 Verification Results

### **1. getOwnerAnalytics - HARDCODED DUMMY DATA ❌**

**Location:** `convex/clinics.ts` lines 1863-1913

**Status:** Contains MOCK DATA with comment: `// Mock analytics data - replace with actual business logic`

**Hardcoded Values:**
```typescript
return {
  revenue: {
    total: 2500000,
    thisMonth: 450000,
    lastMonth: 380000,
    growth: 18.4
  },
  staff: {
    total: 12,
    active: 10,
    utilization: 78.5,
    newThisMonth: 2
  },
  appointments: {
    total: 324,
    completed: 298,
    cancelled: 18,
    noShows: 8,
    completionRate: 92.0
  },
  telehealth: {
    totalMinutes: 14520,  // 242 hours
    sessionsCount: 156,
    averageSessionLength: 93,
    growth: 24.7
  },
  patients: {
    total: 186,
    active: 142,
    newThisMonth: 23,
    retention: 85.2
  }
};
```

**This explains:**
- ✅ 242h telehealth (14520 / 60)
- ✅ 156 sessions
- ✅ 24.7% growth
- ✅ 186 total patients
- ✅ 142 active patients
- ✅ 23 new this month
- ✅ 85.2% retention
- ✅ 5 new staff (wait, shows 2 in code but 5 on page?)

---

### **2. getClinicRevenue - REAL DATA ✅**

**Location:** `convex/clinics.ts` lines 709-806

**Status:** Fetches REAL data from invoices

**Logic:**
```typescript
// Gets actual invoices from database
const allInvoices = await ctx.db
  .query("invoices")
  .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
  .collect();

// Calculates real revenue
const thisMonthRevenue = thisMonthInvoices
  .filter(invoice => invoice.status === "paid")
  .reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0);
```

**This explains:**
- ❌ ₦0 total revenue (no paid invoices)
- ❌ ₦0 this month (no paid invoices)
- ❌ ₦0 last month (no paid invoices)
- ❌ No change growth (0% because no data)

---

### **3. getStaffMetrics - PARTIALLY REAL ⚠️**

**Location:** `convex/clinics.ts` lines 1399-1455

**Status:** Fetches REAL user data but has flawed logic

**Issues:**
```typescript
// Gets ALL physiotherapists, not clinic-specific!
const physiotherapists = await ctx.db
  .query("users")
  .filter((q) => q.eq(q.field("role"), "physiotherapist"))
  .collect();  // ❌ Not filtered by clinic!
```

**This explains:**
- ❌ Shows wrong staff count (all platform physios)
- ❌ 0% utilization (calculation issue)
- ⚠️ "5 new this month" (likely counting all platform physios created this month, not clinic-specific)

---

### **4. getClinicAppointmentStats - REAL DATA ✅**

**Location:** `convex/clinics.ts` lines 1330-1394

**Status:** Fetches REAL appointments by clinic

**Logic:**
```typescript
const thisMonthAppointments = await ctx.db
  .query("appointments")
  .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
  .filter((q) => q.gte(q.field("startTime"), startOfMonth.getTime()))
  .collect();

const completed = thisMonthAppointments.filter(apt => apt.status === 'completed').length;
const noShows = thisMonthAppointments.filter(apt => apt.status === 'no_show').length;
```

**This explains:**
- ❌ 0 total appointments (no appointments in database)
- ❌ 0 completed (no completed appointments)
- ❌ 0% completion rate (can't calculate with 0 data)

---

## 📊 Data Source Summary

| Metric | Source | Status | Issue |
|--------|--------|--------|-------|
| **Total Revenue** | `getClinicRevenue` | ✅ Real | No invoices in DB |
| **Revenue Growth** | `getClinicRevenue` | ✅ Real | No invoices in DB |
| **Active Staff** | `getStaffMetrics` | ❌ Broken | Queries all physios, not clinic-specific |
| **Staff Utilization** | `getStaffMetrics` | ❌ Broken | Wrong calculation |
| **New Staff** | `getStaffMetrics` | ❌ Broken | Counts all platform staff |
| **Total Appointments** | `getClinicAppointmentStats` | ✅ Real | No appointments in DB |
| **Completed Appointments** | `getClinicAppointmentStats` | ✅ Real | No appointments in DB |
| **Completion Rate** | `getClinicAppointmentStats` | ✅ Real | No appointments in DB |
| **No-shows** | `getClinicAppointmentStats` | ✅ Real | No appointments in DB |
| **Telehealth (242h)** | `getOwnerAnalytics` | ❌ HARDCODED | Mock data (14520 mins) |
| **156 Sessions** | `getOwnerAnalytics` | ❌ HARDCODED | Mock data |
| **24.7% Growth** | `getOwnerAnalytics` | ❌ HARDCODED | Mock data |
| **186 Total Patients** | `getOwnerAnalytics` | ❌ HARDCODED | Mock data |
| **142 Active Patients** | `getOwnerAnalytics` | ❌ HARDCODED | Mock data |
| **23 New Patients** | `getOwnerAnalytics` | ❌ HARDCODED | Mock data |
| **85.2% Retention** | `getOwnerAnalytics` | ❌ HARDCODED | Mock data |

---

## 🐛 Critical Issues

### **Issue #1: getOwnerAnalytics Returns Mock Data**

**Problem:** Function explicitly returns hardcoded values with comment:
```typescript
// Mock analytics data - replace with actual business logic
```

**Impact:**
- Patient metrics (186, 142, 23, 85.2%) are fake
- Telehealth data (242h, 156 sessions) is fake
- Misleading analytics dashboard

**Fix Required:** Replace mock data with real database queries

---

### **Issue #2: getStaffMetrics is Clinic-Agnostic**

**Problem:** Queries ALL physiotherapists in the system, not filtered by clinic:
```typescript
const physiotherapists = await ctx.db
  .query("users")
  .filter((q) => q.eq(q.field("role"), "physiotherapist"))
  .collect();  // ❌ No clinic filter!
```

**Impact:**
- Shows wrong staff count
- Utilization calculation is meaningless
- "New this month" counts platform-wide, not clinic-specific

**Fix Required:** Query `physiotherapistProfiles` by `clinicId`:
```typescript
const physiotherapistProfiles = await ctx.db
  .query("physiotherapistProfiles")
  .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
  .collect();
```

---

### **Issue #3: No Real Data Exists**

**Problem:** Database appears empty for:
- No paid invoices → ₦0 revenue
- No appointments → 0 completion rate
- No clinic-specific staff calculation

**Impact:** Can't verify if queries work with real data

---

## ✅ What's Working Correctly

**These queries are correctly implemented:**
- ✅ `getClinicRevenue` - Real invoice queries (just no data)
- ✅ `getClinicAppointmentStats` - Real appointment queries (just no data)

---

## 🔧 Required Fixes

### **Priority 1: Replace Mock Data in getOwnerAnalytics**

**Current (WRONG):**
```typescript
export const getOwnerAnalytics = query({
  handler: async (ctx) => {
    // Mock analytics data - replace with actual business logic
    return {
      revenue: { total: 2500000, ... },
      staff: { total: 12, ... },
      // etc.
    };
  },
});
```

**Should Be:**
```typescript
export const getOwnerAnalytics = query({
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    await ensureIsClinicOwner(ctx, user);

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (!clinic) return null;

    // Get REAL patient data
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const physiotherapistIds = physiotherapistProfiles.map(p => p.userId);

    // Get REAL patient relationships
    const patientRelationships = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physioId))
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect()
      )
    );

    const allPatients = patientRelationships.flat();
    const uniquePatients = Array.from(new Set(allPatients.map(r => r.patientId)));

    // Get REAL telehealth sessions
    const videoSessions = await ctx.db
      .query("videoSessions")
      .filter((q) => q.eq(q.field("clinicId"), clinic._id))
      .collect();

    // Calculate REAL metrics
    return {
      patients: {
        total: uniquePatients.length,
        active: allPatients.filter(r => r.status === 'active').length,
        // ... calculate real values
      },
      telehealth: {
        sessionsCount: videoSessions.length,
        // ... calculate real values
      },
      // etc.
    };
  },
});
```

---

### **Priority 2: Fix getStaffMetrics Clinic Filter**

**Current (WRONG):**
```typescript
const physiotherapists = await ctx.db
  .query("users")
  .filter((q) => q.eq(q.field("role"), "physiotherapist"))
  .collect();  // ❌ Gets ALL physios
```

**Should Be:**
```typescript
const physiotherapistProfiles = await ctx.db
  .query("physiotherapistProfiles")
  .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
  .collect();

const physiotherapistIds = physiotherapistProfiles.map(p => p.userId);

const physiotherapists = await Promise.all(
  physiotherapistIds.map(id => ctx.db.get(id))
);
```

---

## 🎯 Verdict: NOT Production Ready ❌

**Why:**
1. ❌ `getOwnerAnalytics` returns **hardcoded mock data**
2. ❌ `getStaffMetrics` queries **wrong scope** (all platform staff)
3. ⚠️ No real data to test with

**The dashboard shows a mix of:**
- Real zeros (revenue, appointments) = correct queries, no data
- Fake numbers (patients, telehealth) = hardcoded mock values
- Wrong scope (staff) = broken query logic

**To be production-ready:**
1. Replace all mock data with real queries
2. Fix staff metrics to be clinic-specific
3. Test with real data (invoices, appointments, patients)

---

**Last Updated:** 2025-09-30 12:50 PM  
**Status:** ⚠️ Not Production Ready - Mock Data Found
