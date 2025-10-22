# Set Vercel Environment Variables Helper Script

# CONVEX_DEPLOYMENT
$convexDeployment = "prod:adept-horse-443"
$convexDeployment | vercel env add CONVEX_DEPLOYMENT production --force

# NEXT_PUBLIC_CONVEX_URL
$convexUrl = "https://adept-horse-443.convex.cloud"
$convexUrl | vercel env add NEXT_PUBLIC_CONVEX_URL production --force

# CALENDAR_WEBHOOK_URL
$webhookUrl = "https://adept-horse-443.convex.cloud/api/webhooks/google-calendar"
$webhookUrl | vercel env add CALENDAR_WEBHOOK_URL production --force

Write-Host "Environment variables updated successfully!" -ForegroundColor Green
