# Google Calendar & Meet Integration Setup Guide

## Overview
Complete Google Calendar and Google Meet integration for RehabifyHealth with OAuth 2.0, real-time sync, and clean TypeScript implementation.

## Setup Instructions

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable Google Calendar API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Calendar API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - `http://localhost:3000/api/auth/google/callback` (development)
     - `https://your-domain.com/api/auth/google/callback` (production)
   - Copy Client ID and Client Secret

### 2. Environment Configuration

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
# Google Calendar Integration
GOOGLE_CLIENT_ID=your_actual_client_id
GOOGLE_CLIENT_SECRET=your_actual_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Webhook Configuration
WEBHOOK_SECRET=your_webhook_secret
CALENDAR_WEBHOOK_URL=https://your-domain.com/api/webhooks/google-calendar
```

### 3. Database Schema

The integration uses these Convex tables:

- `googleCalendarCredentials` - OAuth tokens and user credentials
- `calendarEvents` - Links between appointments and Google Calendar events
- `calendarPreferences` - User calendar preferences
- `oauthState` - OAuth state management
- `calendarWatchChannels` - Webhook channel management

### 4. Installation & Dependencies

```bash
npm install @googleapis/calendar google-auth-library
```

### 5. API Endpoints

#### OAuth Flow
- `POST /api/auth/google` - Generate OAuth URL
- `GET /api/auth/google/callback` - OAuth callback handler

#### Calendar Management
- `GET /api/calendars` - Get user's calendars
- `POST /api/calendars/events` - Create calendar event
- `PUT /api/calendars/events/:id` - Update calendar event
- `DELETE /api/calendars/events/:id` - Delete calendar event

#### Webhooks
- `POST /api/webhooks/google-calendar` - Google Calendar webhook
- `GET /api/webhooks/health` - Webhook health check

### 6. Frontend Components

#### Calendar Integration Component
```tsx
import { CalendarIntegration } from '@/components/calendar/CalendarIntegration';

<CalendarIntegration userId={userId} />
```

#### Appointment Calendar Sync
```tsx
import { AppointmentCalendarSync } from '@/components/calendar/AppointmentCalendarSync';

<AppointmentCalendarSync
  appointmentId={appointmentId}
  patientEmail="patient@example.com"
  patientName="John Doe"
  physiotherapistEmail="therapist@example.com"
  physiotherapistName="Dr. Smith"
  startTime={new Date('2024-01-15T10:00:00')}
  endTime={new Date('2024-01-15T11:00:00')}
  type="Initial Consultation"
  notes="First session assessment"
/>
```

### 7. Usage Examples

#### Create Appointment with Calendar Sync
```typescript
const result = await createAppointmentWithCalendar({
  patientId: "user_123",
  physiotherapistId: "user_456",
  startTime: Date.now(),
  endTime: Date.now() + 3600000, // 1 hour later
  type: "Follow-up Session",
  notes: "Progress evaluation",
  createCalendarEvent: true,
  createMeetLink: true,
});
```

#### Sync Calendar Events
```typescript
const syncResult = await syncCalendarEvents({
  userId: "user_123",
  calendarId: "primary",
  syncDirection: "bidirectional",
  conflictResolution: "manual",
});
```

### 8. Security Features

- OAuth 2.0 with offline access
- Token refresh automation
- Webhook signature verification
- Secure token storage with encryption
- Minimal required scopes
- User consent management

### 9. Error Handling

- Automatic token refresh on expiry
- Graceful degradation on API failures
- Comprehensive error logging
- User-friendly error messages

### 10. Testing

```bash
# Run integration tests
npm run test:calendar

# Test OAuth flow
npm run test:oauth

# Test webhook handling
npm run test:webhooks
```

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI"**
   - Ensure redirect URI matches exactly in Google Console
   - Check for trailing slashes

2. **"Token refresh failed"**
   - Verify refresh token is stored correctly
   - Check if user revoked access

3. **"Calendar not found"**
   - Ensure user has granted calendar access
   - Check OAuth scopes

4. **Webhook not receiving events**
   - Verify webhook URL is accessible
   - Check SSL certificate (required for production)

### Debug Commands

```bash
# Check OAuth flow
convex dev logs --filter="oauth"

# Check calendar sync
convex dev logs --filter="calendar"

# Check webhook handling
convex dev logs --filter="webhook"
```

## Production Checklist

- [ ] Set up production Google OAuth credentials
- [ ] Configure production webhook URL
- [ ] Set up SSL certificate
- [ ] Configure rate limiting
- [ ] Set up error monitoring
- [ ] Configure backup and recovery
- [ ] Set up monitoring and alerts
- [ ] Test end-to-end flow
- [ ] Document API changes
- [ ] Update user documentation
