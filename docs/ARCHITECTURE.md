# Rehabify Health Platform Architecture

## System Overview

Rehabify Health is a comprehensive digital platform designed to transform rehabilitation care across Africa. The platform provides secure, efficient, and user-friendly tools for physiotherapists, clinics, and patients.

This document outlines the technical architecture of the Rehabify Health platform, detailing the technologies, system components, and their interactions.

## Architecture Principles

- **Security First**: Patient data security and privacy are paramount
- **Scalability**: Architecture designed to handle growing user base (5,000+ active users)
- **Performance**: Fast response times (<2s load time for all dashboards)
- **Maintainability**: Clean, modular code with comprehensive documentation
- **Accessibility**: Responsive design for all device types

## System Architecture

Rehabify Health follows a modern client-server architecture with real-time capabilities:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  Client Apps    │◄───►│  Backend API     │◄───►│  Data Storage   │
│  (Web, Mobile)  │     │  & Services      │     │  & Processing   │
│                 │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Key Components

1. **Client Applications**
   - Web Application (Next.js)
   - Mobile App (future phase)

2. **Backend Services**
   - Authentication & Authorization (Clerk)
   - API Layer (Nextjs api)
   - Real-time Database (Convex)
   - Storage Services (for documents, images, etc.)
   - Background Jobs (notifications, reminders)
   - Analytics Engine

3. **External Integrations**
   - Payment Processing (Paystack)
   - Calendar Integration
   - Voice-to-Text Transcription (Google Cloud)
   - Multilingual Translation Services

## Technology Stack

### Frontend
- **Framework**: React.js
- **Styling**: Tailwind CSS + Shadcn ui + Accerternity UI
- **State Management**: Zustand + React Context API + React Query
- **Real-time Updates**: Convex SDK
- **Authentication**: Clerk Next SDK
- **Data Visualization**: Recharts/Chart.js
- **Form Handling**: React Hook Form Or Tanstack Form
- **Testing**: Jest, React Testing Library

### Backend
- **API Framework**: Nextjs api on Node.js
- **Real-time Database**: Convex
- **Authentication**: Clerk
- **File Storage**: Convex File Storage
- **Background Jobs**: Convex Functions
- **AI Services**: Google Cloud (Voice-to-Text, Translation)

### DevOps
- **Version Control**: Git
- **CI/CD**: GitHub Actions
- **Hosting**: Vercel (Frontend), Convex (Backend)
- **Monitoring**: Sentry, LogRocket
- **Analytics**: Google Analytics + Posthog

## Authentication & Authorization

### Authentication Provider: Clerk

Clerk provides secure, feature-rich authentication including:
- Email/password login
- Two-factor authentication
- Session management
- Security alerts
- User profile management

### Role-Based Access Control (RBAC)

The system implements four distinct roles with specific permissions:

1. **Physiotherapist**
   - Manage assigned patients
   - Create/edit treatment logs
   - Prescribe exercises
   - Generate invoices
   - Create referrals
   - Access CPD resources

2. **Clinic Owner**
   - All Physiotherapist permissions
   - Manage physiotherapists
   - View clinic-wide analytics
   - Manage clinic settings
   - Access financial reports

3. **Patient**
   - View assigned exercises
   - Track personal progress
   - Communicate with physiotherapist
   - View invoices and make payments
   - Grant access to family members

4. **Family Member**
   - View authorized patient progress
   - View exercise schedule
   - Limited communication with physiotherapist

### Authorization Flow

```
┌──────────┐    ┌────────┐    ┌─────────────┐    ┌──────────────┐
│  User    │───►│  Clerk │───►│ Role Check  │───►│ Permission   │
│  Request │    │  Auth  │    │ Middleware  │    │ Granted/Denied│
└──────────┘    └────────┘    └─────────────┘    └──────────────┘
```

## Database Schema

Convex will be used as the real-time database. Below is the high-level data model:

### Core Collections

1. **Users**
   - Base user information (synced with Clerk)
   - Role (physiotherapist, clinic_owner, patient, family)
   - Profile details
   - Preferences

2. **Clinics**
   - Name, location, contact information
   - Owner ID
   - Physiotherapists (references)
   - Patients (references)
   - Business details

3. **Physiotherapists**
   - User reference
   - Clinic reference
   - Specializations
   - Working hours
   - CPD information
   - Patients (references)

4. **Patients**
   - User reference
   - Medical history
   - Assigned physiotherapist(s)
   - Family members (references)
   - Treatment plans
   - Progress records

5. **Sessions**
   - Patient reference
   - Physiotherapist reference
   - Date and time
   - Session notes (text, voice)
   - Exercises prescribed
   - Billing information

6. **Exercises**
   - Name, description
   - Media (images, videos)
   - Target body parts
   - Instructions (multilingual)
   - Difficulty level

7. **ExercisePrescriptions**
   - Patient reference
   - Physiotherapist reference
   - Exercises (references)
   - Schedule
   - Completion status
   - Progress notes

8. **Invoices**
   - Patient reference
   - Clinic reference
   - Services rendered
   - Amount
   - Status (paid, pending)
   - Payment details

9. **Referrals**
   - Patient reference
   - Referring physiotherapist
   - Receiving provider
   - Reason
   - Status
   - Attachments

10. **CPDCourses**
    - Title, provider
    - Duration, CPD points
    - Content references
    - Enrolled physiotherapists

11. **Appointments**
    - Patient reference
    - Physiotherapist reference
    - Date and time
    - Status
    - Notes

### Relationships

- A **Clinic** has many **Physiotherapists**
- A **Physiotherapist** belongs to one or more **Clinics**
- A **Physiotherapist** has many **Patients**
- A **Patient** has one or more **Physiotherapists**
- A **Patient** has many **Sessions**
- A **Patient** has many **ExercisePrescriptions**
- A **Patient** has many **Invoices**
- A **Patient** has many **Referrals**

## API Design

The API will be built using Convex functions, which provide type-safe interfaces for data access. The key API modules will include:

### Authentication API
- User registration, login, logout
- Password reset
- Profile management
- Session management

### Patient Management API
- Create, read, update, delete patients
- Manage medical history
- Track treatment progress
- Manage family access

### Session Management API
- Create and log session notes
- Voice-to-text conversion
- Multilingual support
- Attachment handling

### Exercise Management API
- Browse exercise library
- Create exercise prescriptions
- Track patient progress
- Generate reports

### Billing API
- Generate invoices
- Process payments
- Send payment reminders
- Generate financial reports

### Appointment API
- Schedule appointments
- Send reminders
- Manage cancellations
- Track attendance

### Clinic Management API
- Manage physiotherapists
- Track working hours
- Generate clinic-wide reports

### CPD API
- Browse courses
- Track progress
- Generate certificates
- Log CPD hours

## Real-time Features

Leveraging Convex's real-time capabilities, the following features will be implemented:

- Live updates on patient exercise completion
- Real-time chat between patients and physiotherapists
- Instant notifications for appointments and reminders
- Live updates on invoice status
- Real-time session logs

## Appointments tool
- Simplybook.me

## Security Implementation

### Data Protection
- End-to-end encryption for sensitive data
- Data isolation between clinics
- Role-based access controls
- Regular security audits

### Compliance
- Adherence to Nigerian Data Protection Regulation (NDPR)
- HIPAA-inspired security practices
- Data retention policies
- User consent management

### Application Security
- Input validation
- Protection against common web vulnerabilities
- Rate limiting
- Audit logging

## Deployment Architecture

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│            │     │            │     │            │
│  Vercel    │◄───►│  Convex    │◄───►│  External  │
│ (Frontend) │     │ (Backend)  │     │  Services  │
│            │     │            │     │            │
└────────────┘     └────────────┘     └────────────┘
```

- **Frontend**: Deployed on Vercel for global CDN and edge performance
- **Backend**: Hosted on Convex's managed platform
- **Authentication**: Clerk's secure authentication infrastructure
- **File Storage**: Convex file storage with appropriate access controls

## Scalability Considerations

### Database Scalability
- Efficient data modeling
- Strategic indexing
- Query optimization
- Data partitioning strategies

### Application Scalability
- Stateless architecture
- Component-based design
- Code splitting
- Lazy loading

### Infrastructure Scalability
- Leveraging Convex's built-in scaling capabilities
- CDN for static assets
- Optimized API requests
- Efficient caching strategies

## Monitoring and Analytics

- **Error Tracking**: Sentry for real-time error monitoring
- **Performance Monitoring**: LogRocket for user experience insights
- **Usage Analytics**: Google Analytics for user behavior
- **Health Checks**: Regular API and service health monitoring
- **Custom Dashboards**: Internal metrics for development team

## Development Workflow

1. Feature planning and specification
2. Design and architecture review
3. Development in feature branches
4. Automated testing
5. Code review
6. Staging deployment
7. QA testing
8. Production deployment

## Future Extensibility

The architecture is designed to accommodate future enhancements:

- Mobile application development
- AI-powered triage and recommendations
- Integration with wearable devices
- Expanded multilingual support
- Advanced analytics and reporting
- Telehealth capabilities

## Technical Debt Management

- Regular code refactoring sessions
- Quarterly architecture reviews
- Deprecation strategy for outdated features
- Documentation updates with each major release

## Conclusion

This architecture provides a robust foundation for the Rehabify Health platform, balancing immediate needs with future scalability. The use of Convex for real-time capabilities and Clerk for authentication provides a modern, secure infrastructure while enabling the rich feature set required by physiotherapists, clinics, and patients.
