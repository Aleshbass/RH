# Stream Video Setup Guide for RehabifyHealth

## Quick Setup (Required for Video Calls to Work)

### 1. Get Your Stream API Keys

1. Go to https://getstream.io/
2. Sign up for a free account or log in
3. Create a new app or select existing one
4. Go to your Dashboard → Your App → Settings
5. Copy your credentials:
   - **API Key** (public)
   - **API Secret** (private)

### 2. Update Environment Variables

Replace the placeholder values in your `.env.local` file:

```env
# Stream Video SDK Configuration
STREAM_API_KEY=your_actual_api_key_here        # Backend (Convex)
STREAM_SECRET=your_actual_secret_here          # Backend (Convex) 
NEXT_PUBLIC_STREAM_API_KEY=your_actual_api_key_here  # Frontend (same as STREAM_API_KEY)
```

**Example with real values:**
```env
STREAM_API_KEY=mmhfdzb5evj2
STREAM_SECRET=fb3h6kq8...your_secret...
NEXT_PUBLIC_STREAM_API_KEY=mmhfdzb5evj2
```

### 3. Deploy Convex Functions

After updating the environment variables, deploy to Convex:

```bash
npx convex deploy
```

### 4. Restart Your Development Server

```bash
npm run dev
```

## How Video Calls Work

1. **Create a Call**: Click "Create New Call" button
2. **Share Link**: The call URL is automatically generated and copied to clipboard
3. **Join Call**: Participants can join using the shared link
4. **Features Available**:
   - Video on/off
   - Microphone mute/unmute
   - Screen sharing
   - Multiple participants
   - Call recording (if enabled)

## Troubleshooting

### Video UI Not Showing?
- Check browser console for errors
- Ensure Stream API keys are correctly set
- Clear browser cache and cookies
- Try incognito/private browsing mode

### "Unauthorized" Error?
- Verify your Stream API keys are correct
- Check that both backend and frontend keys match
- Ensure Convex functions are deployed

### Call Not Connecting?
- Check internet connection
- Allow camera/microphone permissions
- Disable VPN if using one
- Try a different browser (Chrome/Edge recommended)

## Testing Video Calls

1. Open two browser windows (one incognito)
2. Log in as physiotherapist in one window
3. Create a new call
4. Copy the call link
5. Log in as patient in the other window
6. Paste and navigate to the call link
7. Both participants should see each other

## Daily.co Migration Status

Daily.co has been replaced with Stream Video SDK. The old Daily.co configuration can be removed from `.env.local`:

```env
# Remove these lines (no longer needed):
NEXT_PUBLIC_DAILY_DOMAIN=rehabifyhealth.daily.co
DAILY_API_KEY=752ce9963bb2b0c7c1e6b1945163911aad71373540c4ddfd67e84d8f61cf2928
```

## Support

For Stream Video SDK documentation: https://getstream.io/video/docs/
For issues specific to RehabifyHealth: Check the console logs and ensure all setup steps are completed.
