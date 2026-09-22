[CmdletBinding()]
param(
    [switch]$Production,
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

if (-not $env:JOY_TEST_PROVIDER_SEED_SECRET) {
    throw "Set JOY_TEST_PROVIDER_SEED_SECRET in this PowerShell session before running this script."
}

$payload = @{ secret = $env:JOY_TEST_PROVIDER_SEED_SECRET; dryRun = -not $Apply }
# Windows PowerShell strips double quotes while forwarding through npx.cmd.
$argumentsJson = ($payload | ConvertTo-Json -Compress).Replace('"', "'")
$convexArgs = @("convex", "run")
if ($Production) { $convexArgs += "--prod" }
$convexArgs += @("joyTestProviderSeed:seed", $argumentsJson)

Write-Host "Seeding fictional Joy test providers (production=$Production; dryRun=$(-not $Apply))..." -ForegroundColor Cyan
& npx @convexArgs
if ($LASTEXITCODE -ne 0) { throw "Joy test-provider seed failed." }

if ($Apply) {
    Write-Host "Apply complete. Only reserved joy-test-seed provider records were created or updated." -ForegroundColor Green
} else {
    Write-Host "Dry run complete. Rerun with -Apply to write the fictional acceptance-test providers." -ForegroundColor Yellow
}
