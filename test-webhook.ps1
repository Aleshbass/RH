$body = @{
    event = "charge.success"
    data = @{
        reference = "VERIFICATION_wh732wgcm7hj9wa4d8576b2r297rj4x8_1759265893937"
        amount = 300000
        status = "success"
        metadata = @{
            custom_fields = @(
                @{
                    variable_name = "transaction_id"
                    value = "wh732wgcm7hj9wa4d8576b2r297rj4x8"
                },
                @{
                    variable_name = "transaction_type"
                    value = "verification_badge"
                }
            )
        }
        customer = @{
            email = "test@example.com"
            first_name = "Test"
        }
    }
} | ConvertTo-Json -Depth 10

Write-Host "Testing Convex webhook..."
Write-Host "URL: https://kindly-elk-471.convex.cloud/paystack-webhook"
Write-Host ""

try {
    $response = Invoke-WebRequest `
        -Uri "https://kindly-elk-471.convex.cloud/paystack-webhook" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -ErrorAction Stop
        
    Write-Host "Success! Response:" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body:" -ForegroundColor Yellow
        Write-Host $responseBody
    }
}
