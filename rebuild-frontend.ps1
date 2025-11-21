# PowerShell script để rebuild frontend Docker image với --no-cache

Write-Host "🔄 Rebuilding frontend Docker image (no cache)..." -ForegroundColor Yellow

docker-compose -f docker-compose.prod.yml build --no-cache frontend

Write-Host "✅ Rebuild complete. Restarting services..." -ForegroundColor Green
docker-compose -f docker-compose.prod.yml up -d frontend

Write-Host "✅ Frontend đã được rebuild và restart!" -ForegroundColor Green
Write-Host "📝 Kiểm tra log: docker-compose -f docker-compose.prod.yml logs -f frontend" -ForegroundColor Cyan

