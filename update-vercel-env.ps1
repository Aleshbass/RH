# Update Vercel Environment Variables for Production
# This script updates the Convex configuration to use production deployment

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Updating Vercel Environment Variables" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if Vercel CLI is installed
Write-Host "Checking Vercel CLI installation..." -ForegroundColor Yellow
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue

if (-not $vercelInstalled) {
    Write-Host "✗ Vercel CLI not found. Installing..." -ForegroundColor Red
    npm install -g vercel
    Write-Host "✓ Vercel CLI installed" -ForegroundColor Green
    Write-Host ""
}

Write-Host "✓ Vercel CLI ready" -ForegroundColor Green
Write-Host ""

# Login check
Write-Host "Make sure you're logged in to Vercel..." -ForegroundColor Yellow
Write-Host "If not logged in, run: vercel login" -ForegroundColor Gray
Write-Host ""

# Link project (if not already linked)
Write-Host "Linking to Vercel project..." -ForegroundColor Yellow
vercel link --yes

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Updating Environment Variables" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Update CONVEX_DEPLOYMENT
Write-Host "1. Updating CONVEX_DEPLOYMENT..." -ForegroundColor Yellow
vercel env rm CONVEX_DEPLOYMENT production --yes 2>$null
vercel env add CONVEX_DEPLOYMENT production --force
# You'll need to paste: prod:adept-horse-443

Write-Host ""

# Update NEXT_PUBLIC_CONVEX_URL
Write-Host "2. Updating NEXT_PUBLIC_CONVEX_URL..." -ForegroundColor Yellow
vercel env rm NEXT_PUBLIC_CONVEX_URL production --yes 2>$null
vercel env add NEXT_PUBLIC_CONVEX_URL production --force
# You'll need to paste: https://adept-horse-443.convex.cloud

Write-Host ""

# Update CALENDAR_WEBHOOK_URL
Write-Host "3. Updating CALENDAR_WEBHOOK_URL..." -ForegroundColor Yellow
vercel env rm CALENDAR_WEBHOOK_URL production --yes 2>$null
vercel env add CALENDAR_WEBHOOK_URL production --force
# You'll need to paste: https://adept-horse-443.convex.cloud/api/webhooks/google-calendar

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Redeploying Application" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Triggering production deployment..." -ForegroundColor Yellow
vercel --prod

Write-Host ""
Write-Host "✓ Done!" -ForegroundColor Green
Write-Host ""
Write-Host "Verify at: https://rehabifyhealth.com" -ForegroundColor Cyan
Write-Host "Check Convex dashboard: https://dashboard.convex.dev" -ForegroundColor Cyan
Write-Host ""
