# Staff Invitation System - Complete Flow Guide

**Date:** 2025-09-30  
**Status:** ✅ Both Email Invitation & Create Profile Working

---

## 📧 Method 1: Email Invitation (Working ✅)

### **Step-by-Step Flow**

#### **1. Clinic Owner Sends Invitation**
**Location:** `/dashboard/clinic/staff` → "Invite Physiotherapist" button

**What happens:**
- Modal opens with two tabs: "Email Invitation" | "Create Profile"
- Owner fills in:
  - ✅ Email (required)
  - ✅ Full Name (optional)
  - ✅ Personal Message (optional)
- Clicks **"Send Email Invitation"**

**Backend:**
```typescript
api.actions.clinics.inviteClinicStaff.createClinicStaffInvitationWithNotification
```

**Actions performed:**
1. ✅ Creates invitation in `clinicStaffInvitations` table
2. ✅ Generates unique invitation code (e.g., `UD7MNSI8`)
3. ✅ Sends email via Resend API
4. ✅ Creates in-house notification for clinic owner
5. ✅ Sets expiry (30 days from now)

**Email sent to invitee:**
```
From: Rehabify Health <noreply@rehabifyhealth.com>
Subject: You've been invited to join [Clinic Name] on Rehabify Health

Content:
- QR code (240x240px)
- "Accept Invitation" button
- Invitation code
- Direct link: https://rehabifyhealth.com/staff-invite/UD7MNSI8
- Expiry date
- Personal message (if provided)
```

---

#### **2. Invitee Receives Email**

**Three ways to accept:**
1. 📱 **Scan QR code** → Opens invitation page
2. 🔘 **Click "Accept Invitation" button** → Opens invitation page
3. 🔗 **Click direct link** → Opens invitation page

**All routes lead to:** `https://rehabifyhealth.com/staff-invite/[CODE]`

---

#### **3. Invitation Acceptance Page**
**File:** `app/staff-invite/[code]/page.tsx`

**What invitee sees:**

```
┌─────────────────────────────────────────┐
│         Staff Invitation                │
│   You've been invited to join a         │
│         clinic team                      │
├─────────────────────────────────────────┤
│ Clinic: [Clinic Name]                   │
│ Role: Physiotherapist                   │
│ Email: [their email]                    │
│ Expires: [date]                         │
│                                          │
│ Personal Message:                        │
│ [Message from owner if provided]        │
│                                          │
│ Invited by: [Owner Name]                │
├─────────────────────────────────────────┤
│ [Accept Invitation] [Decline]           │
└─────────────────────────────────────────┘
```

**States handled:**
- ⏳ **Loading** → Shows skeleton
- ❌ **Invalid code** → "Invalid Invitation"
- ⏰ **Expired** → "Invitation Expired"
- ✅ **Already accepted** → "Already Accepted" + "Go to Dashboard"
- ❌ **Already declined** → "Invitation Declined"
- 🔓 **Not signed in** → Shows "Sign In" | "Sign Up" buttons with redirect
- ✅ **Valid & signed in** → Shows "Accept" | "Decline" buttons

---

#### **4. Invitee Clicks "Accept Invitation"**

**If NOT signed in:**
1. Shows: "You need to sign in or create an account"
2. Buttons: **"Sign In"** | **"Sign Up"**
3. Both preserve `redirect_url=/staff-invite/[CODE]`
4. After auth, returns to invitation page

**If signed in:**
1. Clicks **"Accept Invitation"**
2. Button shows: "Accepting..." with spinner

**Backend action:**
```typescript
api.actions.clinics.staffInvitationActions.acceptStaffInvitationWithNotification
```

**What happens:**
1. ✅ Updates invitation status to `"accepted"`
2. ✅ Links user to clinic in `clinicStaff` table
3. ✅ Sets user role to `"physiotherapist"` or `"lead_physiotherapist"`
4. ✅ Sets user status to `"active"`
5. ✅ Sends welcome email to invitee
6. ✅ Sends acceptance notification email to clinic owner
7. ✅ Creates in-house notification for clinic owner

**Welcome email to invitee:**
```
From: Rehabify Health <noreply@rehabifyhealth.com>
Subject: Your Rehabify Health Account is Approved!

Content:
- "Great news! Your account has been approved"
- Role: Physiotherapist
- Clinic: [Clinic Name]
- "Log In to Your Account" button
- Link: https://rehabifyhealth.com/dashboard/physiotherapist
```

**Acceptance email to clinic owner:**
```
From: Rehabify Health <noreply@rehabifyhealth.com>
Subject: Staff Invitation Accepted

Content:
- "[Name] has accepted your invitation to join [Clinic]"
- "View Staff" button
- Link: https://rehabifyhealth.com/dashboard/clinic/staff
```

---

#### **5. Redirect After Acceptance**

**Success toast:**
```
✅ Invitation accepted successfully! Welcome to the team.
```

**Auto-redirect (after 2 seconds):**
- If role = `physiotherapist` → `/dashboard/physiotherapist`
- If role = `lead_physiotherapist` → `/dashboard/physiotherapist`
- Else → `/dashboard`

**New staff member can now:**
- ✅ Access physiotherapist dashboard
- ✅ View assigned clinic
- ✅ Manage patients
- ✅ Create treatment plans
- ✅ Schedule appointments
- ✅ Video calls with patients

---

#### **6. Decline Flow (If Invitee Clicks "Decline")**

**Backend action:**
```typescript
api.actions.clinics.staffInvitationActions.declineStaffInvitationWithNotification
```

**What happens:**
1. ✅ Updates invitation status to `"declined"`
2. ✅ Sends decline notification email to clinic owner
3. ✅ Creates in-house notification for clinic owner

**Decline email to clinic owner:**
```
From: Rehabify Health <noreply@rehabifyhealth.com>
Subject: Staff Invitation Declined

Content:
- "[Name] has declined your invitation to join [Clinic]"
- "You can send a new invite from your staff dashboard"
- "Go to Staff" button
```

**Page shows:**
```
❌ Invitation Declined
This invitation has been declined.
```

---

## 👤 Method 2: Create Profile (Working ✅)

### **Step-by-Step Flow**

#### **1. Clinic Owner Creates Profile Directly**
**Location:** `/dashboard/clinic/staff` → "Invite Physiotherapist" → **"Create Profile"** tab

**What happens:**
- Owner fills in:
  - ✅ Email (required)
  - ✅ Full Name (required)
  - ✅ Phone Number (optional)
  - ✅ License Number (optional)
  - ✅ Specialization (optional)
- Clicks **"Create & Send Invite"**

**Note:** Currently, this uses the email invitation method but includes profile details in the message. True direct creation (without invitation acceptance) can be enabled via `createStaffDirectWithWelcome` action.

**Backend:**
```typescript
// Currently uses:
api.actions.clinics.inviteClinicStaff.createClinicStaffInvitationWithNotification

// Can be upgraded to:
api.actions.clinics.staffInvitationActions.createStaffDirectWithWelcome
```

**Current behavior:**
1. ✅ Creates invitation (same as email method)
2. ✅ Sends email with profile details in message:
   ```
   Welcome! We're creating your profile with the following details:
   - License: [License Number]
   - Specialization: [Specialization]
   ```
3. ✅ Invitee still needs to accept invitation

**Potential upgrade (direct creation):**
1. ✅ Creates user account immediately
2. ✅ Sets role to physiotherapist
3. ✅ Sets status to active
4. ✅ Links to clinic
5. ✅ Sends activation email
6. ✅ No acceptance required

---

## 🔄 Complete System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    CLINIC OWNER                             │
│                                                              │
│  /dashboard/clinic/staff → "Invite Physiotherapist"        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │   Choose Method         │
         ├─────────────────────────┤
         │ 1. Email Invitation     │
         │ 2. Create Profile       │
         └──────┬──────────────┬───┘
                │              │
      ┌─────────▼───┐    ┌────▼──────────┐
      │ Email Invite│    │ Create Profile │
      │  + Message  │    │  + Details     │
      └─────────┬───┘    └────┬───────────┘
                │              │
                ▼              ▼
         ┌──────────────────────────┐
         │  Backend Action          │
         │  - Create Invitation     │
         │  - Send Email via Resend │
         │  - Create Notification   │
         └──────────┬───────────────┘
                    │
                    ▼
         ┌──────────────────────────┐
         │   Invitee Receives Email │
         │   - QR Code              │
         │   - Accept Button        │
         │   - Direct Link          │
         └──────────┬───────────────┘
                    │
                    ▼
         ┌──────────────────────────┐
         │  /staff-invite/[CODE]    │
         │  - Show invitation       │
         │  - Check auth status     │
         └──────────┬───────────────┘
                    │
          ┌─────────▼──────────┐
          │  Signed In?        │
          │  YES ←─┐  NO       │
          └──┬──────┘  └───┬───┘
             │             │
             │      ┌──────▼────────┐
             │      │ Sign In/Up    │
             │      │ (redirect_url)│
             │      └──────┬────────┘
             │             │
             └─────────────┘
                    │
                    ▼
         ┌──────────────────────────┐
         │  Click "Accept"          │
         │  - Update DB             │
         │  - Send welcome email    │
         │  - Notify owner          │
         └──────────┬───────────────┘
                    │
                    ▼
         ┌──────────────────────────┐
         │  Redirect to Dashboard   │
         │  /dashboard/physiotherapist│
         └──────────────────────────┘
```

---

## ✅ System Status

| Feature | Status | Notes |
|---------|--------|-------|
| Email Invitation Creation | ✅ Working | Resend API sending |
| QR Code Generation | ✅ Working | 240x240px in emails |
| Invitation Link | ✅ Working | Production domain |
| Acceptance Page | ✅ Working | All states handled |
| Auth Check | ✅ Working | Redirect preserved |
| Accept Action | ✅ Working | Updates DB + emails |
| Welcome Email | ✅ Working | Sent to invitee |
| Owner Notification | ✅ Working | Email + in-house |
| Decline Action | ✅ Working | Notifies owner |
| Create Profile Tab | ✅ Working | Uses invitation flow |
| Direct Creation (future) | 🔄 Available | Can be enabled |

---

## 🎯 Key Features

### **Email System**
- ✅ Sends via Resend API
- ✅ Beautiful HTML templates
- ✅ QR codes for mobile
- ✅ Production links (no localhost)
- ✅ From: `noreply@rehabifyhealth.com`

### **Security**
- ✅ Unique invitation codes
- ✅ 30-day expiry
- ✅ Status tracking (pending/accepted/declined)
- ✅ Auth required before acceptance
- ✅ One-time use invitations

### **User Experience**
- ✅ Multiple acceptance methods (QR/button/link)
- ✅ Clear invitation details
- ✅ Personal messages supported
- ✅ Redirect preservation for auth
- ✅ Success/error toasts
- ✅ Auto-redirect to dashboard

### **Notifications**
- ✅ In-house notifications for owner
- ✅ Email notifications for both parties
- ✅ Acceptance notifications
- ✅ Decline notifications
- ✅ Clickable notification links

---

## 🔍 Debugging & Monitoring

### **Check Email Delivery**
```bash
npx convex logs --watch | grep "CLINIC EMAIL"
```

**Expected:**
```
[CLINIC EMAIL] Sending staff invitation email to: user@example.com
[CLINIC EMAIL] Email sent successfully!
[CLINIC EMAIL] Message ID: xxxxxxxx
```

### **Check Resend Dashboard**
1. https://resend.com/emails
2. Search by email or message ID
3. View delivery status
4. Check for bounces

### **Test Invitation Flow**
1. Send invitation from `/dashboard/clinic/staff`
2. Check email in inbox (and spam)
3. Click link/QR/button
4. Verify acceptance page loads
5. Accept invitation
6. Verify redirect to `/dashboard/physiotherapist`
7. Check clinic owner receives acceptance email

---

## 📝 Summary

**Both invitation methods are working!**

### **Email Invitation (Recommended)**
- ✅ Sends beautiful email with QR code
- ✅ Invitee accepts at their convenience
- ✅ Preserves auth flow
- ✅ Both parties notified
- ✅ Production-ready

### **Create Profile**
- ✅ Currently uses invitation flow with pre-filled details
- ✅ Can be upgraded to instant creation
- ✅ Good for in-person onboarding

**All systems operational! 🎉**

---

**Last Updated:** 2025-09-30  
**Status:** ✅ Email System Fixed & Tested
