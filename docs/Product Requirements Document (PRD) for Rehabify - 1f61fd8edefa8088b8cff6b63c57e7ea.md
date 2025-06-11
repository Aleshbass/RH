# Product Requirements Document (PRD) for Rehabify - Health

Created by: Zeenat Oladepo
Created time: May 17, 2025 11:06 AM

# Document control

- Product Name: Rehabify Health
- Version: 1.0
- Document Owner: Oladepo Zeenat (Product Manager)
- Last Updated: 17th of May
- Contributors:
    - Ademola Abass : CEO/ Co- founder
    - Mary : CEO/ Co-founder
    - Software Development Team : Paul/ Emmanuella
    - UX/UI Design Team : Banjo Femi / Nifemi
    - Customer Support Team -
    - Marketing Team -

# **Product Overview**

### Product vision 💡

Rehabify Health is a comprehensive digital platform designed to transform rehabilitation care across Africa by providing secure, efficient, and user-friendly tools for physiotherapists, clinics, and patients. 

Our goal is to integrate digital health solutions into primary care, making physiotherapy more accessible, personalized, and efficient.

### Target users 👫

- Primary Users:
    - Physiotherapists (Private Practice and Facility-Based)
    - Clinic Owners (Managing Multiple Physiotherapists)
- Secondary Users:
    - Patients (Receiving Therapy and Tracking Progress)
    - Patient Families (Monitoring Patient Progress)

### Core problem solved : ✅

- Fragmented and inaccessible rehabilitation care.
- Difficulty in tracking patient compliance with exercise programs.
- Disorganized patient management for physiotherapists.
- Limited visibility and credibility for physiotherapists.
- Inconsistent patient outcomes and progress tracking.

# **Product Goals and Objectives📌**

**Short-Term Goals (0-6 Months)**

- Launch MVP of Rehabify Health by June 2025.
- Onboard 300 physiotherapists.
- Secure 100 paying users (B2B or B2C).
- Integrate automated physiotherapist onboarding.
- Conduct user feedback sessions with PTs and patients.

**Mid-Term Goals (6-12 Months)**

- Achieve 2,000+ active users.
- Enhance AI-powered triage for clinical care.
- Expand CPD (Continuing Professional Development) features.

**Long-Term Goals (12-24 Months)**

- Grow to 5,000+ active users.
- Launch a full mobile app for therapists and patients.
- Expand to other African countries.

**Key Metrics (we would know our goal is been met if) ; 📊**

- **User Acquisition**: Number of physiotherapists and patients onboarded.
- **User Retention**: Active users (monthly logins, patient sessions).
- **Revenue**: Subscription earnings (physiotherapists, clinics), in-app purchases.
- **User Engagement**: Treatment logs, exercise usage, CPD interactions.
- **Customer Satisfaction**: Average survey rating (4.5/5 or higher).

# **Product Scope 📋**

### Core features

1. **Physiotherapist Board** 
- Add, view, edit patients details,
- Session logs (text, voice notes, exercise prescriptions).
- Track patients exercise/ treatment progress.
- Structured treatment plans with timelines and milestones.
- CPD access and progress tracking.
1. **Billing and invoicing** 
- Generate, send, track payments.
- Automated payment reminders.
- Invoice sharing via email or patient portal.
1. **Referral management** 
- Create, send and track referrals to other healthcare providers.
- Secure PDF export with patient history.
1. **Patient Portal:**
- View and track assigned exercises.
- Send text messages to PTs.
- Monitor progress reports and therapist notes.
- Family access for progress sharing (with permissions).
1. **Clinic Management:**
- Manage physiotherapists (onboard, assign patients).
- Track PT working hours and leave management.
- Generate and manage patient records securely.
1. **Multilingual Support:**
- Language options (English, Yoruba, Igbo, Hausa).
- Voice-to-text for notes in multiple languages.
- Automated translation for exercise instructions.
1. **Outcome Tracking and Surveys**
- Track patient outcomes and satisfaction with surveys.
- Generate reports for clinics.
1. **Integration Tools:**
- Calendar sync, wearable data, and secure file storage.
1. **Notes Template Library:**
- Quick-fill templates for various conditions.

**Additional Core Features:** 

**Notifications and Reminders:**

- Automated reminders for patients (exercise sessions, appointments).
- Customizable notifications for physiotherapists (upcoming sessions).

**Reports and Analytics:**

- Patient progress reports (visual charts, progress maps).
- Clinic-level reports (patient recovery trends, financial insights).

# Users stories ✍🏾

**User story 1:** 

- As a Physiotherapist, I want to:
    - Easily onboard my patients.
    - Assign exercises and track their progress.
    - Generate session notes (text or voice).
- Acceptance Criteria:
    - Can add, view, and manage patients.
    - Can create and edit treatment logs.
    - Can assign and monitor exercises.

**User Story 2:** 

- As a Clinic Owner, I want to:
    - Manage my physiotherapists and their patient assignments.
    - Track therapist working hours and leave.
    - Ensure compliance with patient data security.
- Acceptance Criteria:
    - Can add and remove physiotherapists.
    - Can view and manage therapist performance.

**User Story 3:**

- As a Patient, I want to:
    - View my exercise program and track my progress.
    - Communicate with my therapist.
    - Grant family members access to view my progress.
- Acceptance Criteria:
    - Can access exercise instructions.
    - Can monitor progress.
    - Can manage family access permissions.

# Features workflow

**Home / Dashboard**

**Feature Description:**

Provides an overview of the day-to-day clinic operations and quick access to key actions.

**Workflow:**

1. Physiotherapist/Clinic Owner logs in to the Rehabify Health platform.
2. The Dashboard displays:
    - Welcome Header: Personalized greeting (e.g., Good Morning, PT Peace).
    - Date and Time: Auto-updated.
    - Today’s Appointments: List of upcoming appointments (name, time, service type, status) with action buttons (Check-In, Reschedule, Cancel).
    - Quick Actions:
        - Add New Appointment.
        - Add New Patient.
        - View Calendar.
        - Create CPD Log.
    - Clinic Performance Metrics:
        - Number of patients seen this week/month.
        - Revenue summary (if applicable).
        - Appointment completion rate.
    - Notifications & Reminders:
        - License/CPD renewal reminders.
        - Unread messages or updates.
        - Upcoming patient follow-ups.
    - Recent Activities: Summary of recent appointments, notes added, or CPD courses completed.

**Profile Management Workflow**

**Feature Description:**

Manage user’s personal and professional account details.

**Workflow:**

1. Users access the “Profile” section.
2. They can:
    - Edit personal information (name, contact, profile picture).
    - Update professional details (qualifications, CPD Points Summary).
    - Adjust account settings (password, notifications).
    - Set availability & schedule (working hours, holidays).
    - Manage security (2FA, data export, deactivate account).

**Patient Management Workflow**

**Feature Description:**

This feature allows physiotherapists to manage patient profiles, track progress, and log treatment sessions.

**Workflow:**

1. Physiotherapist logs in to the Rehabify Health platform.
2. They navigate to the “Patient Management” section.
3. They can:
    - Add new patients (inputting patient details).
    - View existing patient profiles.
    - Edit patient information if necessary.

**Patient Profile View:**

- Basic Info: Name, age, gender, contact, referral source.
- Medical History: Detailed health history.
- Treatment Plan: Customizable plans per patient.
- Appointment History: List of past and upcoming sessions.
- Session Notes:  Text, voice, or exercise prescriptions.
- Exercises Assigned: Track exercise completion and progress.
- Documents/Attachments: Upload X-rays, PDFs, prescriptions.
- Billing History: Payment records for each patient.

**Session Management:**

1. For each patient, the physiotherapist can:
    - Create and log session notes (text, voice, or exercise prescriptions).
    - Track patient exercise progress and update milestones.
    - Monitor patient compliance.
2. All changes are saved securely, accessible only to the assigned therapist.

**Appointments Workflow**

**Feature Description:**

Manage and track all appointments.

**Workflow:**

1. Physiotherapist/Clinic Owner navigates to the “Appointments” section.
2. They can:
    - View Calendar (Week/Day) with color-coded time slots (booked, canceled, completed).
    - Use filters (Today, This Week, Past, Status) to sort appointments.
    - View appointment details (patient info, service type, duration, notes).
3. Appointment actions:
    - Reschedule.
    - Cancel.
    - Mark as Completed.

**Create Appointment Modal:**

- Patient selection.
- Service selection.
- Therapist assignment.
- Date/time selection.
- Notes section.

**Billing and Invoicing Workflow**

**Feature Description:**

Allows physiotherapists or clinics to generate, send, and track payments.

**Workflow:**

1. Physiotherapist/Clinic Owner accesses the “Billing & Invoicing” section.
2. They select the patient they want to bill.
3. Create a new invoice by:
    - Specifying services rendered (session fees, special treatments).
    - Adding discounts (if applicable).
    - Setting payment due dates.
4. The system auto-generates the invoice and sends it to the patient (via email or patient portal).
5. Patients receive the invoice and can make payments (via integrated payment gateways).
6. Payments are tracked, and automated reminders are sent for unpaid invoices.
7. Physiotherapists can view paid/unpaid invoices in the dashboard.

**CPD Courses Workflow**

**Feature Description:**

Tracks the continuing professional development of physiotherapists.

**Workflow:**

1. Physiotherapists access the “CPD Courses” section.
2. They can:
    - Browse Course Library (Manual Therapy, Sports Rehab, etc.).
    - Use filters (Free, Paid, Accredited, In Progress, Completed).
    - View course details (Title, Provider, Duration, CPD Points, Status).
3. Enroll in a course and track progress.
4. Upload certificates or proof of completion.
5. The CPD Log tracks total CPD hours completed.
6. Reminders are sent for CPD deadlines or missing requirements.

**Exercise Management Workflow**

**Feature Description:**

Assign and manage rehabilitation exercises for patients.

**Workflow:**

1. Physiotherapist navigates to the “Exercise” section.
2. They can:
    - Browse the Exercise Library (filtered by body part, condition, equipment).
    - View exercise details (title, image/GIF, description, reps/sets).
3. Create an Exercise Plan for a patient:
    - Select patient.
    - Add exercises.
    - Specify frequency, duration, and instructions.
    - Add notes for the patient.
4. Send the plan to the patient (via email or in-app).
5. Patient Exercise History:
    - Track assigned plans.
    - Monitor completion status.
    - Provide feedback.

**Referral Management Workflow**

**Feature Description:**

Enables physiotherapists to securely refer patients to other healthcare providers.

**Workflow:**

1. The physiotherapist selects a patient and accesses the “Referral Management” section.
2. Complete a referral form with:
    - Patient details.
    - Referral reason.
    - Receiving healthcare provider details.
3. The system auto-generates a secure referral document (PDF) with the patient’s history.
4. The referral is sent digitally to the selected provider.
5. The status of the referral (sent, viewed, acknowledged) is tracked in the dashboard.

**Patient Portal Workflow**

**Feature Description:**

The Patient Portal allows patients to view assigned exercises, monitor their progress, and communicate with their physiotherapists.

**Workflow:**

1. Patients log in using secure credentials.
2. They can:
    - View assigned exercises (text, video).
    - Track progress (completion status, feedback).
    - Communicate with their therapist via secure chat.
3. Family members with permission can also access patient progress.

**Clinic Management Workflow**

**Feature Description:**

Enables clinic owners to manage multiple physiotherapists and their patients.

**Workflow:**

1. Clinic Owner accesses the “Clinic Management” section.
2. They can:
    - Add or remove physiotherapists.
    - Assign patients to physiotherapists.
    - Monitor therapist working hours and leave.
    - Generate and manage secure patient records.
3. The system provides insights into therapist performance and patient outcomes.

# Features requirements 📝

**Patient/Profile Management**

- Frontend: Therapist dashboard for patient management.
- Backend: Secure patient data storage and retrieval.
- User-friendly dashboard with clear navigation.
- Team: Frontend (Paul, Emmanuella), Backend (James, Nifemi), UX/UI (Banjo Femi).
- Deadline:

**Billing and Invoicing**

- Frontend: Simple invoicing form, view sent bills.
- Backend: Automated reminders, receipt generation.
- Team: Frontend, Backend.
- Deadline:

**Referral Management**

- Frontend: Form for creating and sending referrals.
- Backend: Track referral status (sent, acknowledged).
- Team: Frontend, Backend.
- Deadline:

**Family Progress Sharing**

- Frontend: Family portal with permission settings.
- Backend: Auto-generated progress summaries.
- Team: Frontend, Backend.
- Deadline:

**Multilingual Support**

- Frontend: Language selection for therapist notes.
- Backend: Voice-to-text in multiple languages.
- ? :  Implement voice-to-text AI model.
- Team : frontend, backend.

# Features prioritization

Using Moscow, this features would be prioritized base on “Must have, should have, could have and would have. 

1. 

# Non functional requirements 🪄

- Security: Data encryption, secure login, secure payments.
- Performance: Load time under 2 seconds for all dashboards.
- Scalability: Support for 5,000+ active users.
- Accessibility: Responsive design for mobile and desktop.

# Technical specifications 👩🏾‍💻

- Frontend: React.js (Responsive UI), Tailwind CSS.
- Backend: Node.js, Express.js, Firebase for secure data storage.
- Database: Firestore (Cloud), Encrypted user data.
- ??: Voice-to-text model (Google Cloud), Multilingual translation.

# Release plan ✈️

- Alpha Version:  (Internal Testing).
- Beta Version:  (Limited User Testing).
- Official Launch: June 2025.

# Assumptions

- Users (physiotherapists, patients, clinic owners) are familiar with basic mobile app navigation and digital tools.
- Clinics and therapists have access to stable internet connections to access Rehabify Health.
- Patients will understand and follow exercise instructions provided by their therapists.
- The AI-powered multilingual support can accurately translate medical and rehabilitation terms.
- Physiotherapists are willing to use the app for patient management, and patients will engage with the patient portal.

# Dependencies

- Integration with Google for multilingual support and voice-to-text transcription.
- Secure data storage on ?.
- Payment processing through a secure gateway (maybe  Paystack, Flutterwave).
- Access to CPD content through recognized providers.

# Constraints

- **Technical Constraints:** The app must maintain fast performance even with 5,000+ active users, which requires efficient data handling and optimization.
- **Security Constraints:** All patient data must comply with local data protection laws (e.g., NDPR in Nigeria) and be securely encrypted.
- **Resource Constraints:** The development team’s capacity is limited, making it essential to prioritize core features for the MVP.
- **Budget Constraints:** The project must stay within the allocated budget, which may limit the extent of advanced AI features.
- **Timeline Constraints:** Rehabify Health is expected to launch in June 2025, leaving a fixed timeline for development and testing.

# Risk Management and solutions

- Risk: Low user adoption.
    
    Solution: Conduct pre-launch user testing and collect feedback.
    
- Risk: Data breach or security issues.
    
    Solution: Ensure end-to-end encryption, implement secure login.
    
- Risk: Poor user experience on the platform.

        Solution : Involve UX/UI designers in user research, conduct usability testing, and collect user feedback for continuous improvements.

# Communication and updates 🤳🏾

- Weekly Standup Meetings: (Day and Time)
- Progress Review: End of every week.
- Dedicated WhatsApp group: rehabify tech
- Reporting: Product Manager will provide weekly updates to CTO.

# Approval✅

- Prepared by: Oladepo Zeenat (Product Manager)
- Reviewed by: Ademola Abass / Miss Mary
- Approved by: