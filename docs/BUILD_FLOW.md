# Rehabify Health - MVP Build Flow

This document outlines the development plan for the Rehabify Health MVP.
The goal is to build core functionalities iteratively, allowing for testing and feedback.

## Guiding Principles
- **Iterative Development**: Build features in small, testable increments.
- **User-Centric**: Prioritize features based on core user needs for the MVP.
- **Backend First (for core logic), then Frontend UI**: Ensure backend functions are solid before building complex UIs. Simple UIs can be built in parallel with backend logic for a feature.
- **Regular Check-ins**: Review progress and adjust plan as needed.

## Phase 1: Foundation & User Onboarding (Current - Approx. Weeks 1-2)

**Focus**: Setting up the project, basic user authentication, and profile completion.

*   **Backend (Convex):**
    *   [x] Database Schema Design (`convex/schema.ts`)
    *   [x] Clerk Integration & User Sync (`convex/users.ts` - `internalCreateUser`)
    *   [x] User Profile Completion Logic (`convex/users.ts` - `completeUserProfile`)
    *   [ ] **Next**: Implement authorization helpers (e.g., `ensureUserRole(ctx, allowedRoles)` or `getAuthenticatedUser(ctx)` that throws if not found) in a `convex/auth.ts` or `convex/utils.ts` file.
*   **Frontend (React/Next.js):**
    *   [ ] **Next**: Basic Project Setup (Next.js, Tailwind CSS, Convex Client, Clerk Provider).
    *   [ ] **Next**: Landing Page (Static - Header, Hero Section, Footer).
    *   [ ] Clerk Sign-Up & Sign-In Pages integration (largely provided by Clerk components).
    *   [ ] User Onboarding UI (Forms for `completeUserProfile` based on role selection).
    *   [ ] Basic Dashboard Layout (Navbar, Sidebar placeholder after login).

## Phase 2: Clinic Owner Core Workflow (Approx. Weeks 3-4)

**Focus**: Enabling clinic owners to set up and manage their clinics.

*   **Backend (Convex):**
    *   [ ] **Task**: Clinic Creation Mutation (e.g., `convex/clinics.ts` - `createClinic`).
        *   Ensures user is an onboarded `clinic_owner`.
        *   Creates a clinic and links it to the `ownerId` in the `clinics` table.
    *   [ ] **Task**: Mutation to Update Clinic Details.
    *   [ ] **Task**: Query to Get Clinic(s) for an Authenticated Owner.
    *   [ ] **Task**: Mutation for Clinic Owner to Invite/Add Physiotherapist to their Clinic.
*   **Frontend (React/Next.js):**
    *   [ ] **Task**: Clinic Creation Form (post-onboarding for clinic owners).
    *   [ ] **Task**: Clinic Settings/Details Update Form.
    *   [ ] **Task**: Clinic Owner Dashboard (Basic): 
        *   Display clinic information.
        *   List physiotherapists (placeholder initially).
        *   UI to invite/add physiotherapists.

## Phase 3: Physiotherapist Core Workflow (Approx. Weeks 5-7)

**Focus**: Enabling physiotherapists to manage patients, appointments, and basic session notes.

*   **Backend (Convex):**
    *   [ ] **Task**: Patient Management:
        *   Mutation to Add a New Patient (by physio, linked to their clinic).
        *   Query to List Patients for a Physio/Clinic.
    *   [ ] **Task**: Appointment Scheduling (Basic):
        *   Mutation to Create an Appointment.
        *   Query to List Appointments (for physio, patient, clinic).
        *   Mutation to Update/Cancel Appointment status.
    *   [ ] **Task**: Session Logging (Basic):
        *   Mutation to Create a Session Log (linked to an appointment).
        *   Query to View Session Logs.
*   **Frontend (React/Next.js):**
    *   [ ] **Task**: Physiotherapist Dashboard:
        *   List of their patients.
        *   Calendar/List view for their appointments.
    *   [ ] **Task**: Patient Creation/Management Form.
    *   [ ] **Task**: Appointment Creation/Management Form.
    *   [ ] **Task**: Session Log Creation/View Form.

## Phase 4: Patient Core Workflow (Approx. Weeks 8-9)

**Focus**: Enabling patients to view their information and engage with their treatment.

*   **Backend (Convex):**
    *   [ ] **Task**: Treatment Plan (Simplified for MVP - focus on prescribed exercises):
        *   Mutation to Create/Update a Patient's Treatment Plan (by physio).
        *   Query for Patient to View Their Treatment Plan & Prescribed Exercises.
    *   [ ] **Task**: Exercise Progress Tracking (Simplified):
        *   Mutation for Patient to Log Exercise Completion/Feedback.
*   **Frontend (React/Next.js):**
    *   [ ] **Task**: Patient Dashboard:
        *   View upcoming appointments.
        *   View prescribed exercises from their treatment plan.
    *   [ ] **Task**: UI to Log Exercise Progress (simple form).

## Phase 5: MVP Polish & Essential Extras (Approx. Weeks 10-12)

**Focus**: Notifications, basic communication, file handling, and refining existing features.

*   **Backend (Convex):**
    *   [ ] **Task**: Basic Notifications (e.g., appointment reminders, new messages).
    *   [ ] **Task**: Secure Messaging (Simplified: Patient-Physio chat for a start).
    *   [ ] **Task**: File Uploads (e.g., for session log attachments - using Convex file storage).
*   **Frontend (React/Next.js):**
    *   [ ] **Task**: UI for Notifications.
    *   [ ] **Task**: Basic Messaging Interface.
    *   [ ] **Task**: UI for File Uploads where relevant.
*   **General:**
    *   [ ] **Task**: Enhanced Error Handling (frontend and backend).
    *   [ ] **Task**: Testing Strategy Implementation (Unit tests for critical functions, basic E2E flow tests).
    *   [ ] **Task**: Review and Refine UI/UX based on initial core flows.

## Post-MVP Considerations (Future Phases)
- Advanced Billing & Invoicing System
- Comprehensive Referrals Workflow
- Surveys & Outcome Tracking Features
- Admin Panel for System Management
- AI-Powered Features (Triage, Exercise Recommendations)
- Multilingual Support


system where physios can share links to patients, patients can come and review them and rate them and each physio has it general average score base on what they are rated even clinic owners admins can track their ratings. when they are rated to some high avaerage they can either request for verification badge or pay for it
---

This plan provides a structured approach. We can adjust timelines and priorities as we progress. 
**Immediate Next Steps (after this planning):**
1.  **Frontend**: Start basic project setup (Next.js, Tailwind, Convex Client, Clerk) if not done.
2.  **Frontend**: Implement the static Landing Page (Header, Hero, Footer).
3.  **Backend**: Implement authorization helpers (e.g., `ensureUserRole`).
4.  **Backend**: Begin Clinic Creation mutation for clinic owners.
