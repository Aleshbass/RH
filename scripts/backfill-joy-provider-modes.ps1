[CmdletBinding()]
param(
    [switch]$Production,
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

if (-not $env:JOY_PROVIDER_BOOTSTRAP_SECRET) {
    throw "Set JOY_PROVIDER_BOOTSTRAP_SECRET in this PowerShell session before running this script."
}

$cursor = $null
$dryRun = -not $Apply
$batchNumber = 0

do {
    $batchNumber += 1
    $payload = @{ secret = $env:JOY_PROVIDER_BOOTSTRAP_SECRET; dryRun = $dryRun }
    if ($null -ne $cursor) { $payload.cursor = $cursor }
    # Windows PowerShell strips double quotes while forwarding an argument to
    # npx.cmd. Convex accepts JSON5, so use single quotes to preserve strings.
    $argumentsJson = ($payload | ConvertTo-Json -Compress).Replace('"', "'")

    Write-Host "Running Joy provider bootstrap batch $batchNumber (maximum 30 profiles; dryRun=$dryRun)..." -ForegroundColor Cyan
    $convexArgs = @("convex", "run")
    if ($Production) { $convexArgs += "--prod" }
    $convexArgs += @("joyProviderBootstrap:applyBatch", $argumentsJson)
    $output = & npx @convexArgs
    if ($LASTEXITCODE -ne 0) { throw "Convex batch $batchNumber failed." }

    $result = $output | ConvertFrom-Json
    $result.report | ConvertTo-Json -Depth 8
    $cursor = $result.nextCursor
} while (-not $result.isDone)

if ($dryRun) {
    Write-Host "Dry run complete. Review the report, then rerun with -Apply to write only missing service modes and safe mapped tags." -ForegroundColor Yellow
} else {
    Write-Host "Apply run complete. Existing configured service modes were not changed." -ForegroundColor Green
}
