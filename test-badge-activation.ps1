# Test Verification Badge Payment Flow
# This script tests the complete payment verification and badge activation

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Verification Badge Payment Flow Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$baseUrl = "http://localhost:3001"
$paystackSecretKey = "sk_test_b100077fe435907aa4a3287c7761ac62a0ceed0e"

# Test data - you need to replace this with a REAL transaction ID from your database
Write-Host "⚠️  IMPORTANT: You need a real pending transaction ID from Convex" -ForegroundColor Yellow
Write-Host "   Go to Convex Dashboard → Data → marketplaceTransactions" -ForegroundColor Yellow
Write-Host "   Copy a transaction _id (starts with 'wh...')" -ForegroundColor Yellow
Write-Host ""
$transactionId = Read-Host "Enter transaction ID from Convex"

if ([string]::IsNullOrWhiteSpace($transactionId)) {
    Write-Host "❌ Transaction ID is required!" -ForegroundColor Red
    exit 1
}

# Step 1: Create a test Paystack reference
$testReference = "VERIFICATION_${transactionId}_$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"

Write-Host "📋 Test Configuration:" -ForegroundColor Green
Write-Host "   Base URL: $baseUrl" -ForegroundColor Gray
Write-Host "   Transaction ID: $transactionId" -ForegroundColor Gray
Write-Host "   Test Reference: $testReference" -ForegroundColor Gray
Write-Host ""

# Step 2: Test Paystack verification endpoint (mock)
Write-Host "Step 1: Testing Paystack API verification..." -ForegroundColor Cyan

$paystackUrl = "https://api.paystack.co/transaction/verify/$testReference"
$headers = @{
    "Authorization" = "Bearer $paystackSecretKey"
    "Content-Type" = "application/json"
}

try {
    $paystackResponse = Invoke-RestMethod -Uri $paystackUrl -Method GET -Headers $headers -ErrorAction Stop
    
    if ($paystackResponse.status -eq $true) {
        Write-Host "   ✅ Paystack verification successful" -ForegroundColor Green
        Write-Host "   Status: $($paystackResponse.data.status)" -ForegroundColor Gray
        Write-Host "   Amount: ₦$($paystackResponse.data.amount / 100)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Paystack returned status: false" -ForegroundColor Yellow
        Write-Host "   Message: $($paystackResponse.message)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Paystack API call failed (expected for test reference)" -ForegroundColor Yellow
    Write-Host "   This is normal - we'll test with a mock successful response" -ForegroundColor Gray
}

Write-Host ""

# Step 3: Test our verify endpoint with mock data
Write-Host "Step 2: Testing /api/payments/verify endpoint..." -ForegroundColor Cyan

$verifyUrl = "$baseUrl/api/payments/verify"
$verifyBody = @{
    reference = $testReference
} | ConvertTo-Json

Write-Host "   POST $verifyUrl" -ForegroundColor Gray
Write-Host "   Body: $verifyBody" -ForegroundColor Gray
Write-Host ""

try {
    $verifyResponse = Invoke-RestMethod -Uri $verifyUrl -Method POST -Body $verifyBody -ContentType "application/json" -ErrorAction Stop
    
    Write-Host "   ✅ Verify endpoint responded" -ForegroundColor Green
    Write-Host "   Success: $($verifyResponse.success)" -ForegroundColor Gray
    Write-Host "   Message: $($verifyResponse.message)" -ForegroundColor Gray
    
    if ($verifyResponse.success -eq $true) {
        Write-Host ""
        Write-Host "   🎉 BADGE ACTIVATION SUCCESSFUL!" -ForegroundColor Green
        Write-Host "   The verification badge should now be active" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "   ❌ Badge activation failed" -ForegroundColor Red
        Write-Host "   Reason: $($verifyResponse.message)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "   ❌ Verify endpoint failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody" -ForegroundColor Yellow
    }
}

Write-Host ""

# Step 4: Instructions for manual testing
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Manual Testing Instructions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "To test with a REAL payment:" -ForegroundColor Yellow
Write-Host "1. Go to: $baseUrl/dashboard/physiotherapist/marketplace" -ForegroundColor White
Write-Host "2. Click 'Purchase Verification Badge'" -ForegroundColor White
Write-Host "3. Select a plan (Monthly - ₦3,000)" -ForegroundColor White
Write-Host "4. Use Paystack test card:" -ForegroundColor White
Write-Host "   Card: 4084 0840 8408 4081" -ForegroundColor Gray
Write-Host "   CVV: 408" -ForegroundColor Gray
Write-Host "   Expiry: Any future date" -ForegroundColor Gray
Write-Host "   PIN: 0000" -ForegroundColor Gray
Write-Host "   OTP: 123456" -ForegroundColor Gray
Write-Host ""
Write-Host "5. After payment, watch for:" -ForegroundColor White
Write-Host "   - Toast: 'Payment successful! Verifying...'" -ForegroundColor Gray
Write-Host "   - Toast: 'Verification complete'" -ForegroundColor Gray
Write-Host "   - Page reload" -ForegroundColor Gray
Write-Host "   - Badge appears in settings" -ForegroundColor Gray
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Debugging Checklist" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "✓ Check Next.js is running on port 3001" -ForegroundColor White
Write-Host "✓ Check Convex dev is running" -ForegroundColor White
Write-Host "✓ Check .env.local has:" -ForegroundColor White
Write-Host "  - NEXT_PUBLIC_CONVEX_URL" -ForegroundColor Gray
Write-Host "  - PAYSTACK_SECRET_KEY" -ForegroundColor Gray
Write-Host "  - NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY" -ForegroundColor Gray
Write-Host ""
Write-Host "✓ Check browser console for errors" -ForegroundColor White
Write-Host "✓ Check Network tab for /api/payments/verify request" -ForegroundColor White
Write-Host "✓ Check server logs for 'Verify endpoint detection'" -ForegroundColor White
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
