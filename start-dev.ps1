$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Write-Host "Node ready: $(node --version)" -ForegroundColor Green
pnpm dev
