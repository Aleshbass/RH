# Resources Management Guide

## Overview
The Resources system allows clinic owners and physiotherapists to manage clinic resources such as equipment, rooms, staff, and vehicles. Resources can be booked, scheduled for maintenance, and tracked for availability.

## How to Access Resources

### For Physiotherapists:
1. Navigate to `/dashboard/physiotherapist/appointments`
2. Click on the **"Resources"** tab (third tab after Appointments and Recurring)
3. You'll see the Resource Dashboard if your clinic has resources set up

### For Clinic Owners:
1. Resources management is available through the clinic dashboard
2. Clinic owners can create, edit, and delete resources
3. They can also view resource utilization and maintenance schedules

## Resource Types

The system supports four main resource types:

1. **Equipment** 🩺
   - Medical devices, therapy equipment
   - Maintenance scheduling available
   - Capacity tracking for shared equipment

2. **Rooms** 🏢
   - Treatment rooms, consultation rooms
   - Location and capacity management
   - Booking availability tracking

3. **Staff** 👥
   - Support staff, specialists
   - Availability scheduling
   - Capacity management

4. **Vehicles** 🚗
   - Mobile therapy units, transport vehicles
   - Maintenance scheduling
   - Location tracking

## Resource Features

### Resource Properties:
- **Name & Description**: Clear identification
- **Category**: Equipment, Room, Staff, or Vehicle
- **Location**: Physical location within clinic
- **Capacity**: How many can use simultaneously
- **Maintenance Schedule**: Automated maintenance tracking
- **Active Status**: Enable/disable resources
- **Booking Integration**: Link with appointment system

### Resource Status Indicators:
- 🟢 **Available**: Ready for use
- 🟡 **In Use**: Currently booked
- 🔴 **Maintenance**: Under maintenance
- ⚫ **Inactive**: Disabled/unavailable

## How to Create Resources

### Prerequisites:
- Must be a clinic owner or have appropriate permissions
- Clinic must be properly set up in the system

### Steps:
1. Go to the Resources tab in appointments dashboard
2. Click **"Add Resource"** button
3. Fill in resource details:
   - Name (required)
   - Type (Equipment/Room/Staff/Vehicle)
   - Description
   - Location
   - Capacity
   - Maintenance schedule (optional)
4. Save the resource

## Resource Booking Integration

### Appointment Creation with Resources:
1. When creating appointments, you can select required resources
2. System checks resource availability for the appointment time
3. Resources are automatically booked when appointment is confirmed
4. Resources are released when appointment is completed/cancelled

### Resource Conflicts:
- System prevents double-booking of resources
- Shows availability status in real-time
- Suggests alternative resources when conflicts occur

## Recurring Series Functionality

### What are Recurring Series?
Recurring series allow you to create multiple appointments that repeat on a schedule (daily, weekly, monthly).

### How to Create Recurring Appointments:
1. Go to `/dashboard/physiotherapist/appointments`
2. Click the **"Recurring"** tab (second tab)
3. Click **"Create Recurring Series"** button
4. Configure:
   - **Patient**: Select patient
   - **Start Date**: When series begins
   - **End Date**: When series ends (or number of occurrences)
   - **Frequency**: Daily, Weekly, Monthly
   - **Days of Week**: For weekly recurring (Mon, Tue, etc.)
   - **Time**: Appointment time
   - **Service Type**: Type of appointment
   - **Resources**: Any required resources

### Managing Recurring Series:
- **Edit Series**: Modify all future appointments in the series
- **Edit Single Instance**: Modify just one appointment
- **Cancel Series**: Cancel all remaining appointments
- **View Series**: See all appointments in the series

### Recurring Series Features:
- **Exception Handling**: Skip holidays or specific dates
- **Resource Integration**: Automatically books resources for each appointment
- **Bulk Operations**: Modify multiple appointments at once
- **Smart Scheduling**: Avoids conflicts with existing appointments

## Troubleshooting

### "No Resources Found"
- Ensure you're logged in as a clinic owner or physiotherapist with clinic access
- Check that your clinic has resources created
- Verify your user profile has the correct clinic association

### Resources Not Showing in Appointments
- Ensure resources are marked as "Active"
- Check resource capacity isn't exceeded
- Verify resource isn't under maintenance during appointment time

### Recurring Appointments Not Creating
- Check that end date is after start date
- Ensure selected time slots don't conflict with existing appointments
- Verify patient is assigned to your care

## Best Practices

### Resource Management:
1. **Regular Maintenance**: Schedule regular maintenance for equipment
2. **Capacity Planning**: Set realistic capacity limits
3. **Clear Naming**: Use descriptive names for easy identification
4. **Location Details**: Include room numbers or specific locations

### Recurring Series:
1. **Plan Ahead**: Create recurring series well in advance
2. **Buffer Time**: Leave gaps between appointments for setup/cleanup
3. **Resource Planning**: Ensure resources are available for entire series
4. **Patient Communication**: Inform patients about recurring appointment schedules

## API Integration

The Resources system integrates with:
- **Appointment System**: Automatic resource booking
- **Notification System**: Maintenance reminders
- **Analytics**: Resource utilization tracking
- **Billing System**: Resource usage billing (if applicable)

## Support

If you encounter issues with the Resources system:
1. Check this guide for common solutions
2. Verify your user permissions and clinic association
3. Contact system administrator for clinic-level issues
4. Report bugs through the system feedback mechanism
