# Clean restart script for RehabifyHealth development server
Write-Host "🧹 Cleaning build cache..." -ForegroundColor Yellow
Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "node_modules/.cache" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "🚀 Starting development server..." -ForegroundColor Green
npm run dev:backend
