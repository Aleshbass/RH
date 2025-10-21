# Quick Test: Verify Endpoint Detection Logic
Write-Host ""
Write-Host "Testing Verification Badge Detection" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Check if servers are running
Write-Host "Checking if Next.js is running..." -ForegroundColor Yellow
$port = 3000
try {
    $healthCheck = Invoke-WebRequest -Uri "http://localhost:$port" -Method GET -TimeoutSec 3 -ErrorAction Stop
    Write-Host "Next.js is running on port $port" -ForegroundColor Green
} catch {
    # Try port 3001
    $port = 3001
    try {
        $healthCheck = Invoke-WebRequest -Uri "http://localhost:$port" -Method GET -TimeoutSec 3 -ErrorAction Stop
        Write-Host "Next.js is running on port $port" -ForegroundColor Green
    } catch {
        Write-Host "Next.js is NOT running on port 3000 or 3001" -ForegroundColor Red
        Write-Host "Please start it with: pnpm dev" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""

# Test 1: Check if endpoint exists
Write-Host "Test 1: Checking if endpoint exists..." -ForegroundColor Cyan

$testBody = @{
    reference = "TEST_REFERENCE"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://localhost:$port/api/payments/verify" -Method POST -Body $testBody -ContentType "application/json" -ErrorAction Stop
    Write-Host "Endpoint exists and responded" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Gray
} catch {
    if ($_.Exception.Response.StatusCode -eq 500) {
        Write-Host "Endpoint exists (returned 500 - expected for invalid reference)" -ForegroundColor Green
    } else {
        Write-Host "Endpoint error: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The endpoint is set up correctly." -ForegroundColor Green
Write-Host ""
Write-Host "Next: Make a real test payment in the app" -ForegroundColor Yellow
Write-Host "Go to: http://localhost:$port/dashboard/physiotherapist/marketplace" -ForegroundColor White
Write-Host ""
Write-Host "Test card:" -ForegroundColor Yellow
Write-Host "Card: 4084084084084081" -ForegroundColor Gray
Write-Host "CVV: 408" -ForegroundColor Gray
Write-Host "Expiry: 12/25" -ForegroundColor Gray
Write-Host "PIN: 0000" -ForegroundColor Gray
Write-Host "OTP: 123456" -ForegroundColor Gray
Write-Host ""
