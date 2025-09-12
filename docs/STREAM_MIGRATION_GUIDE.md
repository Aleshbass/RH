# Stream Video SDK Migration Guide

## Overview
This guide documents the migration from Daily.co to Stream Video SDK for RehabifyHealth's video calling functionality.

## Migration Status
- ✅ Stream SDK installed
- ✅ Convex backend functions created for Stream token generation
- ✅ Stream video components created (StreamVideoCall, JoinCallButton)
- ✅ Video call manager updated (StreamVideoCallManager)
- ✅ Dashboard integrations updated
- ✅ Schema updated to support Stream
- ⚠️ Environment variables need to be configured with actual Stream credentials

## Environment Variables Required

Add these to your `.env.local` file:

```env
# Stream Video SDK Configuration
STREAM_API_KEY=your_actual_stream_api_key
STREAM_SECRET=your_actual_stream_secret
NEXT_PUBLIC_STREAM_API_KEY=your_actual_stream_api_key
```

Get your Stream credentials from: https://getstream.io/dashboard/

## Key Components

### 1. Backend (Convex)
- **`convex/stream.ts`**: Handles Stream token generation and call management
  - `getStreamToken`: Generates secure tokens for users
  - `createStreamCall`: Creates/joins Stream calls
  - `endStreamCall`: Ends calls and updates metadata
  - `getCallMetadata`: Retrieves call information
  - `getUserStreamCalls`: Gets user's call history

### 2. Frontend Components
- **`components/video/StreamVideoCall.tsx`**: Main video call component using Stream SDK
- **`components/video/JoinCallButton.tsx`**: Reusable button to create/join calls
- **`components/video/StreamVideoCallManager.tsx`**: Complete call management UI
- **`app/video-call/[callId]/page.tsx`**: Dedicated video call page

### 3. Dashboard Integration
Updated pages to use Stream components:
- `app/dashboard/physiotherapist/video-calls/page.tsx`
- `app/dashboard/patient/video-calls/page.tsx`
- `app/dashboard/clinic/video-calls/page.tsx`

## Features Implemented

### Core Features
- ✅ 1-on-1 video calls between physiotherapists and patients
- ✅ Group calls support (multiple participants)
- ✅ Screen sharing
- ✅ Microphone/camera toggle
- ✅ Call recording capability (configurable)
- ✅ Secure token-based authentication via Convex
- ✅ Clerk user integration (same ID, name, image)
- ✅ Call metadata storage in Convex
- ✅ Call history tracking

### Security
- All Stream tokens generated server-side in Convex
- User authentication via Clerk
- Token expiration (24 hours default)
- Role-based access (host/participant)

## Migration Steps for Existing Calls

### Phase 1: Parallel Operation (Current)
Both Daily.co and Stream are available. New calls use Stream by default.

### Phase 2: Data Migration
```javascript
// Script to migrate existing Daily.co calls to Stream format
// Run this in Convex dashboard or as a migration script

const migrateCalls = async (ctx) => {
  const calls = await ctx.db.query("videoCalls").collect();
  
  for (const call of calls) {
    if (call.platform === "daily" && !call.streamCallId) {
      await ctx.db.patch(call._id, {
        platform: "stream",
        streamCallId: call.roomId, // Use existing roomId as Stream callId
        streamCallType: "default",
      });
    }
  }
};
```

### Phase 3: Remove Daily.co Code
1. Remove Daily.co dependencies:
   ```bash
   pnpm remove @daily-co/daily-js @daily-co/daily-react
   ```

2. Delete Daily.co specific files:
   - `components/video/VideoCall.tsx` (old Daily.co component)
   - `components/video/VideoCallManager.tsx` (old manager)
   - `lib/daily/dailyService.ts`

3. Remove Daily.co environment variables from `.env.local`

4. Clean up Convex functions:
   - Remove Daily.co specific mutations from `convex/videoCalls.ts`
   - Remove Daily.co fields from schema

## Testing Checklist

### Basic Functionality
- [ ] Create new video call
- [ ] Join existing call
- [ ] Toggle camera/microphone
- [ ] Screen sharing works
- [ ] Leave/end call properly
- [ ] Call history displays correctly

### Integration Tests
- [ ] Physiotherapist can start call with patient
- [ ] Patient can join scheduled call
- [ ] Clinic owner can monitor active calls
- [ ] Call metadata saved to Convex
- [ ] Proper redirect after call ends

### Edge Cases
- [ ] Rejoin call after refresh
- [ ] Handle network disconnection
- [ ] Multiple participants in group call
- [ ] Call expiration after max duration

## Troubleshooting

### Common Issues

1. **"Stream credentials not configured"**
   - Ensure STREAM_API_KEY and STREAM_SECRET are set in Convex environment variables
   - Check NEXT_PUBLIC_STREAM_API_KEY is set in .env.local

2. **"User ID mismatch"**
   - Verify Clerk user ID matches the one being passed to Stream
   - Check user is properly authenticated

3. **Call not connecting**
   - Verify Stream API key is correct
   - Check browser permissions for camera/microphone
   - Ensure HTTPS in production

4. **TypeScript errors**
   - Files use @ts-nocheck to avoid deep instantiation issues
   - This is intentional per user requirements

## Production Deployment

1. Set Stream production credentials in Vercel/deployment environment
2. Update NEXT_PUBLIC_APP_URL to production domain
3. Configure Stream webhook endpoints if using recordings
4. Set up Stream analytics dashboard for monitoring

## Support Resources

- Stream Video Docs: https://getstream.io/video/docs/
- Stream React SDK: https://getstream.io/video/docs/react/
- Stream Dashboard: https://getstream.io/dashboard/
- RehabifyHealth Support: support@rehabifyhealth.com

## Rollback Plan

If issues arise, you can temporarily revert to Daily.co:
1. Change import statements back to old components
2. Restore Daily.co environment variables
3. Update dashboard pages to use VideoCallManager instead of StreamVideoCallManager

## Next Steps

1. **Get Stream Credentials**: Sign up at https://getstream.io/
2. **Update Environment Variables**: Add your Stream API keys
3. **Test Integration**: Run through the testing checklist
4. **Monitor**: Use Stream dashboard to monitor call quality and usage
5. **Optimize**: Configure recording, transcription, and other advanced features as needed
