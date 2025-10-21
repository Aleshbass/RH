# Test Convex HTTP Endpoint
Write-Host ""
Write-Host "Testing Convex HTTP Endpoint" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Wait for Convex to be ready
Write-Host "Waiting for Convex to deploy..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

$convexUrl = "https://kindly-elk-471.convex.cloud"
$testBody = @{
    reference = "TEST_REFERENCE"
} | ConvertTo-Json

Write-Host "Testing endpoint: $convexUrl/verify-payment" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-WebRequest `
        -Uri "$convexUrl/verify-payment" `
        -Method POST `
        -Body $testBody `
        -ContentType "application/json" `
        -ErrorAction Stop
    
    Write-Host "✅ Endpoint is accessible!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host "Response:" -ForegroundColor Gray
    Write-Host $response.Content -ForegroundColor Gray
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "❌ Endpoint NOT found (404)" -ForegroundColor Red
        Write-Host "   Convex dev might still be starting..." -ForegroundColor Yellow
        Write-Host "   Wait 30 seconds and try again" -ForegroundColor Yellow
    } else {
        Write-Host "✅ Endpoint exists (got response)" -ForegroundColor Green
        Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Gray
        
        if ($_.Exception.Response) {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response:" -ForegroundColor Gray
            Write-Host $responseBody -ForegroundColor Gray
        }
    }
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "If endpoint is ready, test payment now!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
