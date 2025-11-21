#!/bin/bash
# Script để rebuild frontend Docker image với --no-cache

echo "🔄 Rebuilding frontend Docker image (no cache)..."

docker-compose -f docker-compose.prod.yml build --no-cache frontend

echo "✅ Rebuild complete. Restarting services..."
docker-compose -f docker-compose.prod.yml up -d frontend

echo "✅ Frontend đã được rebuild và restart!"
echo "📝 Kiểm tra log: docker-compose -f docker-compose.prod.yml logs -f frontend"

