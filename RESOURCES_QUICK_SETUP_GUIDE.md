# 🛠️ Resources - Quick Setup Guide

## What Are Resources?

Resources are **clinic assets** you can book for appointments:
- **Equipment**: Therapy devices, medical tools (e.g., Ultrasound Machine, TENS Unit)
- **Rooms**: Treatment rooms, consultation areas (e.g., Treatment Room 1, Massage Room)
- **Staff**: Support personnel (e.g., Assistant Therapist, Receptionist)
- **Vehicles**: Mobile units, transport (e.g., Mobile Therapy Van)

---

## Why You're Seeing "No resources found"

✅ **This is normal!** You haven't added any resources yet. It's the empty state.

---

## 🚀 How to Add Your First Resource (2 minutes)

### Quick Steps:
1. **Go to Appointments page**
2. **Click "Resources" tab** (third tab)
3. **Click "Add Resource" button** (top right)
4. **Fill in the form**:
   - Name
   - Type (Equipment/Room/Staff/Vehicle)
   - Description
   - Location
   - Capacity (optional)
   - Working hours
   - Maintenance schedule (optional)
5. **Click "Create Resource"**
6. **Done!** Resource appears in the table

---

## 📋 Example Resources to Add

### Example 1: Treatment Room
```
Name: Treatment Room 1
Type: Room
Category: General Treatment
Description: Main treatment room with therapy table
Location: Ground Floor, Room 101
Capacity: 2 (1 therapist, 1 patient)
Working Hours: 8:00 AM - 6:00 PM, Mon-Fri
Status: Active
```

### Example 2: Ultrasound Machine
```
Name: Ultrasound Therapy Device
Type: Equipment
Category: Therapeutic Equipment
Description: Professional ultrasound machine for deep tissue therapy
Location: Equipment Room
Maintenance: Monthly calibration
Status: Active
```

### Example 3: Massage Room
```
Name: Massage Therapy Room
Type: Room
Category: Massage
Description: Private room with massage table and ambient lighting
Location: Second Floor, Room 205
Capacity: 3 (1 therapist, 1 patient, 1 observer)
Working Hours: 9:00 AM - 8:00 PM, Mon-Sat
Status: Active
```

### Example 4: TENS Unit
```
Name: TENS Pain Relief Unit
Type: Equipment
Category: Pain Management
Description: Portable TENS unit for pain management therapy
Location: Mobile (carried by therapist)
Maintenance: Battery check weekly
Status: Active
```

### Example 5: Hydrotherapy Pool
```
Name: Hydrotherapy Pool
Type: Equipment
Category: Hydrotherapy
Description: Heated pool for aquatic therapy sessions
Location: Hydrotherapy Wing
Capacity: 4 patients simultaneously
Working Hours: 7:00 AM - 7:00 PM, Daily
Maintenance: Daily water quality check
Status: Active
```

---

## 🎯 Recommended Starting Set

For a typical physiotherapy clinic, start with:

### Basic Setup (5 resources):
1. **Treatment Room 1** (Room)
2. **Treatment Room 2** (Room)
3. **Ultrasound Machine** (Equipment)
4. **Exercise Mats** (Equipment)
5. **Reception Area** (Room)

### Medium Setup (10 resources):
Add to basic:
6. **Massage Table** (Equipment)
7. **TENS Unit** (Equipment)
8. **Consultation Room** (Room)
9. **Gym Equipment Area** (Room)
10. **Wheelchair** (Equipment)

### Full Setup (15+ resources):
Add specialized equipment and staff:
11. **Electrotherapy Device** (Equipment)
12. **Parallel Bars** (Equipment)
13. **Treadmill** (Equipment)
14. **Assistant Therapist** (Staff)
15. **Mobile Therapy Van** (Vehicle)

---

## 📊 What You'll See After Adding Resources

### Statistics Dashboard
```
┌─────────────────────────────────────────────┐
│ Total Resources: 5                          │
│ Equipment: 2                                │
│ Rooms: 3                                    │
│ Staff: 0                                    │
│ Active: 5                                   │
└─────────────────────────────────────────────┘
```

### Resources Table
```
┌──────────────────────────────────────────────────────────────┐
│ Resource              │ Type      │ Location      │ Status   │
├──────────────────────────────────────────────────────────────┤
│ 🏥 Treatment Room 1   │ Room      │ Ground Floor  │ Active   │
│ 🏥 Treatment Room 2   │ Room      │ Ground Floor  │ Active   │
│ 🩺 Ultrasound Machine │ Equipment │ Equip Room    │ Active   │
│ 🧘 Exercise Mats      │ Equipment │ Gym Area      │ Active   │
│ 🏢 Reception Area     │ Room      │ Entrance      │ Active   │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔗 How Resources Work with Appointments

### In Appointment Booking Modal:

When creating an appointment:
1. **Select patient, date, time**
2. **Scroll to "Required Resources" section**
3. **See all available resources** for that time slot
4. **Select resources** by clicking on them
   - Green badge = Available
   - Red badge = Unavailable (already booked)
5. **Book appointment** with resources

### Automatic Features:
✅ **Availability checking**: System checks if resource is free
✅ **Conflict detection**: Warns if resource is double-booked
✅ **Visual indicators**: Color-coded availability status
✅ **Capacity tracking**: Respects resource capacity limits
✅ **Working hours**: Only shows resources during their working hours

---

## 🛠️ Resource Management Features

### What You Can Do:
- ✅ **Add/Edit/Delete** resources
- ✅ **Filter** by type (Equipment/Room/Staff/Vehicle)
- ✅ **Filter** by status (Active/Inactive)
- ✅ **Search** by name, description, category, location
- ✅ **View bookings** for each resource
- ✅ **Set working hours** and maintenance schedules
- ✅ **Track capacity** for rooms and equipment
- ✅ **Monitor status** (available, in use, maintenance, inactive)

### Actions Menu (three dots):
- **Edit**: Modify resource details
- **View Schedule**: See all bookings for this resource
- **Delete**: Remove resource (only if no active bookings)

---

## 📝 Resource Fields Explained

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| **Name** | ✅ Yes | Resource name | "Ultrasound Machine #1" |
| **Type** | ✅ Yes | Category | Equipment, Room, Staff, Vehicle |
| **Category** | Optional | Sub-category | "Therapeutic Equipment" |
| **Description** | Optional | Details | "Professional ultrasound device" |
| **Location** | Optional | Physical location | "Ground Floor, Room 101" |
| **Capacity** | Optional | Max simultaneous users | 2 |
| **Working Hours** | Optional | Availability | "Mon-Fri 8am-6pm" |
| **Maintenance** | Optional | Service schedule | "Monthly calibration" |
| **Status** | ✅ Yes | Active/Inactive | Active |

---

## 🎨 Resource Status Colors

Resources have different statuses shown with color-coded badges:

- **🟢 Available** (Green): Free to book
- **🟡 In Use** (Yellow): Currently booked
- **🟠 Maintenance** (Orange): Under maintenance
- **🔴 Inactive** (Red): Not available for booking
- **⚪ Unavailable** (Gray): Outside working hours

---

## 🧪 Testing Resource Booking

### Test Flow:
1. **Add 2 resources**:
   - "Treatment Room 1"
   - "Ultrasound Machine"

2. **Create an appointment**:
   - Go to "Appointments" tab
   - Click "New Appointment"
   - Select patient, date, time
   - Scroll to "Required Resources"
   - Select both resources
   - Book appointment

3. **Try double-booking**:
   - Create another appointment for same time
   - Try to select "Treatment Room 1"
   - Should show "Unavailable" with red badge
   - Should display conflict warning

4. **Verify in Resources tab**:
   - Go to "Resources" tab
   - Click three-dot menu → "View Schedule"
   - See the booked appointment

---

## 🚨 Common Issues & Solutions

### Issue: "No resources available for selected time"

**Causes**:
- All resources are booked for that time
- Resources are outside working hours
- No resources added yet

**Solution**:
- Add more resources, OR
- Select different time slot, OR
- Extend resource working hours

### Issue: Can't delete resource

**Cause**: Resource has active bookings

**Solution**:
- Cancel all appointments using that resource first, OR
- Mark resource as "Inactive" instead of deleting

### Issue: Resource not showing in appointment modal

**Causes**:
- Resource is marked as "Inactive"
- Time is outside resource working hours
- Resource is already booked

**Solution**:
- Check resource status
- Verify working hours
- Choose different time

---

## 💡 Pro Tips

### Naming Convention:
Use clear, consistent names:
- ✅ "Treatment Room 1", "Treatment Room 2"
- ✅ "Ultrasound Machine #1", "Ultrasound Machine #2"
- ❌ "TR1", "US1" (too cryptic)

### Location Format:
Be specific:
- ✅ "Ground Floor, Room 101"
- ✅ "Second Floor, East Wing, Room 205"
- ❌ "Downstairs" (too vague)

### Description Tips:
Include key details:
- Equipment: Brand, model, capabilities
- Rooms: Size, features, accessibility
- Staff: Specialization, availability
- Vehicles: Type, capacity, route

### Capacity Guidelines:
- **Treatment Rooms**: Usually 2-3 (therapist + patient + observer)
- **Consultation Rooms**: Usually 2-4
- **Equipment**: Usually 1 (single-user devices)
- **Gym Areas**: Higher capacity (5-10)

---

## 🎯 Quick Start Checklist

- [ ] Navigate to Appointments → Resources tab
- [ ] Click "Add Resource" button
- [ ] Add Treatment Room 1 (Type: Room)
- [ ] Add Treatment Room 2 (Type: Room)
- [ ] Add Ultrasound Machine (Type: Equipment)
- [ ] Verify resources appear in table
- [ ] Check statistics dashboard updates
- [ ] Try filtering by type
- [ ] Try searching by name
- [ ] Create appointment and select resources
- [ ] Verify conflict detection works

---

## 📈 Next Steps

1. **Start small**: Add 3-5 core resources
2. **Test booking**: Create appointment with resources
3. **Expand gradually**: Add more as needed
4. **Monitor usage**: Track which resources are most used
5. **Optimize**: Adjust working hours based on demand

---

**The Resources feature is fully functional** - you just need to add your first resource! Click "Add Resource" to get started. 🚀
