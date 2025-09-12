# Resend Email Configuration Guide

## Overview
This guide will help you set up Resend email service for sending patient invitation emails in RehabifyHealth.

## Prerequisites
1. A Resend account (sign up at https://resend.com)
2. Access to your Convex dashboard
3. A verified domain (optional, can use resend.dev for testing)

## Step 1: Create Resend Account and Get API Key

1. Go to https://resend.com and sign up for an account
2. Once logged in, navigate to **API Keys** in the dashboard
3. Click **Create API Key**
4. Give it a name like "RehabifyHealth Production"
5. Copy the API key (it starts with `re_`)

## Step 2: Add API Key to Convex Environment Variables

### Method 1: Via Convex Dashboard (Recommended)
1. Go to your Convex dashboard: https://dashboard.convex.dev
2. Select your project
3. Navigate to **Settings** → **Environment Variables**
4. Add the following variables:
   - `RESEND_API_KEY`: Your Resend API key (e.g., `re_xxxxxxxxxxxxx`)
   - `FROM_EMAIL`: Your sending email (default: `onboarding@resend.dev`)
   - `FROM_NAME`: Your sender name (default: `Rehabify Health`)
   - `NEXT_PUBLIC_APP_URL`: Your app URL (e.g., `https://your-app.vercel.app`)

### Method 2: Via Convex CLI
```bash
npx convex env set RESEND_API_KEY "re_your_api_key_here"
npx convex env set FROM_EMAIL "noreply@yourdomain.com"
npx convex env set FROM_NAME "Rehabify Health"
npx convex env set NEXT_PUBLIC_APP_URL "https://your-app.vercel.app"
```

## Step 3: Verify Domain (Optional but Recommended for Production)

1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Add the DNS records shown to your domain provider
5. Wait for verification (usually takes a few minutes)
6. Update `FROM_EMAIL` to use your verified domain

## Step 4: Test Email Sending

Run the test script to verify everything is working:

```bash
# Test with a real email address
node scripts/test-email-invitation.js your-email@example.com
```

## Step 5: Monitor Email Delivery

1. Check Resend dashboard for email logs: https://resend.com/emails
2. Monitor Convex logs for any errors
3. Check recipient's inbox and spam folder

## Troubleshooting

### Emails Not Being Sent

1. **Check Convex Logs**
   - Look for `[EMAIL ACTION]` entries
   - Check for `RESEND_API_KEY not found` errors

2. **Verify API Key**
   - Ensure the API key is correctly set in Convex environment
   - Check that the key hasn't expired or been revoked

3. **Check Resend Dashboard**
   - Go to https://resend.com/emails
   - Look for failed emails and error messages

4. **Common Issues**
   - **API Key not found**: The environment variable isn't set in Convex
   - **Invalid API Key**: The key is incorrect or expired
   - **Domain not verified**: Using a custom domain that isn't verified
   - **Rate limits**: Free tier has limits (100 emails/day)

### Testing in Development

For local development, you can use the test email domain:
- FROM_EMAIL: `onboarding@resend.dev`
- This doesn't require domain verification

### Email Going to Spam

1. Use a verified domain
2. Ensure proper SPF, DKIM, and DMARC records
3. Avoid spam trigger words in content
4. Include unsubscribe links (for marketing emails)

## Email Templates

The patient invitation email includes:
- Personalized greeting with patient name
- Physiotherapist name who sent the invitation
- Clear invitation code
- Direct link to accept invitation
- Expiration date
- Professional HTML formatting

## Production Checklist

- [ ] Resend account created
- [ ] API key generated
- [ ] API key added to Convex environment variables
- [ ] Domain verified (for production)
- [ ] FROM_EMAIL configured
- [ ] FROM_NAME configured
- [ ] NEXT_PUBLIC_APP_URL configured
- [ ] Test email sent successfully
- [ ] Monitoring set up in Resend dashboard

## Support

- Resend Documentation: https://resend.com/docs
- Resend Support: support@resend.com
- Convex Documentation: https://docs.convex.dev
