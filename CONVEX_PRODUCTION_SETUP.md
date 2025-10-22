# Convex Production Setup Guide

## Problem
Production deployment is using development Convex instance, causing all production users to be saved in development database.

## Solution Steps

### 1. Create Production Convex Deployment

Run this command in your project directory:

```bash
npx convex deploy --prod
```

This will:
- Create a new production deployment
- Give you a production deployment URL (e.g., `https://your-app-name-123.convex.cloud`)
- Deploy all your Convex functions to production

### 2. Get Your Production Deployment Details

After running the deploy command, note:
- **Production Deployment Name**: `prod:your-deployment-name-xxx`
- **Production URL**: `https://your-deployment-name-xxx.convex.cloud`

### 3. Update Vercel Environment Variables

Go to your Vercel project settings → Environment Variables and update:

**Production Environment Only:**
```env
CONVEX_DEPLOYMENT=prod:your-deployment-name-xxx
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name-xxx.convex.cloud
```

**IMPORTANT:** 
- Set these for **Production** environment only
- Keep your .env.local file unchanged (it's for local development)
- Do NOT commit production credentials to git

### 4. Update Other Convex-Related Environment Variables

Also update these in Vercel production environment:

```env
# Calendar Webhook URL (update with production Convex URL)
CALENDAR_WEBHOOK_URL=https://your-deployment-name-xxx.convex.cloud/api/webhooks/google-calendar

# Any other webhooks pointing to Convex
```

### 5. Redeploy Your Application

After updating environment variables in Vercel:
1. Go to Deployments tab
2. Click the "..." menu on the latest deployment
3. Click "Redeploy"

OR trigger a new deployment by pushing to your main branch.

### 6. Verify Production Configuration

After redeployment, check:

```bash
# Visit your production site and open browser console
console.log(process.env.NEXT_PUBLIC_CONVEX_URL)
# Should show: https://your-deployment-name-xxx.convex.cloud (production URL)
```

## Data Migration (If Needed)

If you have existing users in development that need to be moved to production:

### Option 1: Manual Migration (Recommended for small datasets)
1. Export data from development deployment
2. Import to production deployment

### Option 2: Script Migration (For larger datasets)
1. Create a migration script using Convex mutations
2. Run it once against production deployment

### Option 3: Start Fresh
If you're early in deployment, you can start with an empty production database and have users re-register.

## Verification Checklist

After setup, verify:

- [ ] Production site uses production Convex URL
- [ ] New user registrations appear in production Convex dashboard
- [ ] Development site still uses development Convex URL
- [ ] Calendar webhooks point to production Convex
- [ ] All Convex functions deployed to production

## Common Issues

### Issue: "Deployment not found"
**Solution:** Make sure you're logged into Convex CLI:
```bash
npx convex login
```

### Issue: Functions not working in production
**Solution:** Ensure all functions are deployed:
```bash
npx convex deploy --prod --typecheck disable
```

### Issue: Environment variables not updating
**Solution:** After changing Vercel environment variables, you MUST redeploy for changes to take effect.

## Development vs Production

| Environment | CONVEX_DEPLOYMENT | URL |
|-------------|-------------------|-----|
| Development (local) | `dev:kindly-elk-471` | `https://kindly-elk-471.convex.cloud` |
| Production (Vercel) | `prod:your-prod-xxx` | `https://your-prod-xxx.convex.cloud` |

Keep .env.local for development, set production vars in Vercel only.
