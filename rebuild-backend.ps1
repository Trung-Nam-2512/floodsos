# PowerShell script để rebuild backend Docker image với --no-cache

Write-Host "🔄 Rebuilding backend Docker image (no cache)..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml build --no-cache backend

Write-Host "✅ Rebuild complete. Restarting services..." -ForegroundColor Green
docker-compose -f docker-compose.prod.yml up -d backend

Write-Host "✅ Done! Check logs with: docker-compose -f docker-compose.prod.yml logs -f backend" -ForegroundColor Green

