# Convex Production Setup Script
# This script helps you create and configure a production Convex deployment

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Convex Production Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Creating Production Deployment..." -ForegroundColor Yellow
Write-Host "Running: npx convex deploy --prod" -ForegroundColor Gray
Write-Host ""

# Create production deployment
npx convex deploy --prod

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Production deployment created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "NEXT STEPS - MANUAL ACTION REQUIRED" -ForegroundColor Yellow
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Check the output above for your production deployment details" -ForegroundColor White
    Write-Host "   Look for: 'prod:xxxxx' and the production URL" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Update Vercel Environment Variables:" -ForegroundColor White
    Write-Host "   a. Go to: https://vercel.com/your-project/settings/environment-variables" -ForegroundColor Gray
    Write-Host "   b. Update these variables for PRODUCTION environment only:" -ForegroundColor Gray
    Write-Host ""
    Write-Host "      CONVEX_DEPLOYMENT=prod:your-deployment-name" -ForegroundColor Cyan
    Write-Host "      NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud" -ForegroundColor Cyan
    Write-Host "      CALENDAR_WEBHOOK_URL=https://your-deployment-name.convex.cloud/api/webhooks/google-calendar" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "3. Redeploy your application on Vercel" -ForegroundColor White
    Write-Host "   Go to Deployments tab and click 'Redeploy'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "4. Verify the setup:" -ForegroundColor White
    Write-Host "   - Visit your production site" -ForegroundColor Gray
    Write-Host "   - Register a test user" -ForegroundColor Gray
    Write-Host "   - Check Convex dashboard (convex.dev) to confirm user is in production database" -ForegroundColor Gray
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "NOTE: Your local development (.env.local) will continue using the development deployment." -ForegroundColor Yellow
    Write-Host "This is correct - only production (Vercel) should use the production deployment." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "✗ Failed to create production deployment" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "1. Not logged in to Convex CLI - Run: npx convex login" -ForegroundColor Gray
    Write-Host "2. Network issues - Check your internet connection" -ForegroundColor Gray
    Write-Host "3. Project not initialized - Make sure you're in the project root" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Try running: npx convex login" -ForegroundColor Cyan
    Write-Host "Then run this script again." -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "For detailed instructions, see: CONVEX_PRODUCTION_SETUP.md" -ForegroundColor Cyan
Write-Host ""
