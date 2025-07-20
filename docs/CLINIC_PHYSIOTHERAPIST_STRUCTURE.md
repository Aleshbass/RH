# Clinic-Physiotherapist Dashboard Structure

## Overview

The current physiotherapist dashboard is designed for **independent physiotherapists**. For physiotherapists working under a clinic, we need a different structure that includes:

1. **Clinic-level oversight and management**
2. **Shared resources and patients**
3. **Clinic policies and procedures**
4. **Team collaboration features**

## Database Schema Updates

### Current Structure (Independent)

```typescript
physiotherapistProfiles: {
  userId: Id<"users">,
  clinicId: optional(Id<"clinics">), // Currently optional
  specializations: optional(array(string)),
  // ... other fields
}
```

### Enhanced Structure (Clinic-based)

```typescript
physiotherapistProfiles: {
  userId: Id<"users">,
  clinicId: Id<"clinics">, // Required for clinic-based physios
  employmentType: "employee" | "contractor" | "independent",
  role: "physiotherapist" | "senior_physiotherapist" | "lead_physiotherapist",
  permissions: {
    canManagePatients: boolean,
    canViewAllPatients: boolean,
    canModifySchedule: boolean,
    canAccessReports: boolean,
  },
  workingHours: {
    monday: { start: string, end: string, available: boolean },
    tuesday: { start: string, end: string, available: boolean },
    // ... other days
  },
  clinicSpecificSettings: {
    roomAssignments: array(string),
    equipmentAccess: array(string),
    specialtyAreas: array(string),
  }
}
```

## Dashboard Types

### 1. Independent Physiotherapist Dashboard

- **Current implementation** ✅
- Full control over patients, schedule, and settings
- Direct patient invitations
- Personal branding and customization

### 2. Clinic-Based Physiotherapist Dashboard

- **Needs implementation** 🔄
- Clinic branding and policies
- Shared patient pool (with permissions)
- Clinic-managed scheduling
- Team collaboration features
- Clinic resource management

### 3. Clinic Owner Dashboard

- **Needs enhancement** 🔄
- Manage physiotherapists
- Oversee all appointments and patients
- Clinic-wide analytics and reporting
- Resource and room management
- Staff scheduling and assignments

## Implementation Strategy

### Phase 1: Determine Dashboard Type

```typescript
// In dashboard routing logic
const getDashboardType = (user, physiotherapistProfile) => {
  if (!physiotherapistProfile.clinicId) {
    return "independent";
  }

  if (user.role === "clinic_owner") {
    return "clinic_owner";
  }

  return "clinic_physiotherapist";
};
```

### Phase 2: Conditional Dashboard Components

```
app/dashboard/
├── physiotherapist/           # Independent physios
├── clinic-physiotherapist/   # Clinic-based physios
└── clinic-owner/             # Clinic owners
```

### Phase 3: Shared vs Restricted Features

#### Independent Physiotherapist Features:

- ✅ Full patient management
- ✅ Personal scheduling
- ✅ Direct patient invitations
- ✅ Personal analytics
- ✅ Custom branding

#### Clinic-Based Physiotherapist Features:

- 🔄 Clinic patient pool access (with permissions)
- 🔄 Clinic-managed scheduling
- 🔄 Team patient handoffs
- 🔄 Clinic resource booking
- 🔄 Standardized treatment protocols
- 🔄 Clinic branding

#### Clinic Owner Features:

- 🔄 Staff management
- 🔄 All patient oversight
- 🔄 Clinic-wide scheduling
- 🔄 Resource management
- 🔄 Performance analytics
- 🔄 Billing and revenue management

## Key Differences

### Patient Management

| Feature             | Independent  | Clinic-Based      | Clinic Owner    |
| ------------------- | ------------ | ----------------- | --------------- |
| Patient Invitations | Direct       | Through clinic    | Manage all      |
| Patient Access      | Own patients | Assigned + shared | All patients    |
| Patient Transfer    | N/A          | To colleagues     | Assign/reassign |

### Scheduling

| Feature          | Independent | Clinic-Based  | Clinic Owner     |
| ---------------- | ----------- | ------------- | ---------------- |
| Calendar Control | Full        | Restricted    | Full oversight   |
| Room Booking     | N/A         | Required      | Manage rooms     |
| Resource Access  | Personal    | Clinic shared | Manage resources |

### Analytics & Reporting

| Feature          | Independent | Clinic-Based | Clinic Owner    |
| ---------------- | ----------- | ------------ | --------------- |
| Personal Stats   | Full access | Own stats    | All staff stats |
| Clinic Analytics | N/A         | Limited view | Full access     |
| Revenue Reports  | Personal    | N/A          | Clinic-wide     |

## Next Steps

1. **Update Convex Schema** - Add clinic relationship fields
2. **Create Clinic Dashboard Components** - New component structure
3. **Implement Permission System** - Role-based access control
4. **Add Team Collaboration Features** - Patient handoffs, shared notes
5. **Resource Management System** - Rooms, equipment, schedules
6. **Clinic Branding System** - Consistent clinic identity

## File Structure for Clinic-Based System

```
components/dashboard/
├── shared/                    # Common components
├── independent/              # Independent physio components
│   ├── PhysiotherapistDashboard.tsx
│   ├── PatientManagement.tsx
│   └── PersonalScheduling.tsx
├── clinic-physiotherapist/   # Clinic-based physio components
│   ├── ClinicPhysioDashboard.tsx
│   ├── SharedPatientPool.tsx
│   ├── TeamCollaboration.tsx
│   ├── ClinicScheduling.tsx
│   └── ResourceBooking.tsx
└── clinic-owner/            # Clinic owner components
    ├── ClinicOwnerDashboard.tsx
    ├── StaffManagement.tsx
    ├── ClinicAnalytics.tsx
    ├── ResourceManagement.tsx
    └── PatientOversight.tsx
```

This structure allows for:

- **Clear separation** between independent and clinic-based workflows
- **Shared components** for common functionality
- **Scalable architecture** for future clinic features
- **Role-based access control** at the component level
