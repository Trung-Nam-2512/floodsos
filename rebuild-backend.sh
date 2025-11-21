#!/bin/bash
# Script để rebuild backend Docker image với --no-cache

echo "🔄 Rebuilding backend Docker image (no cache)..."
docker-compose -f docker-compose.prod.yml build --no-cache backend

echo "✅ Rebuild complete. Restarting services..."
docker-compose -f docker-compose.prod.yml up -d backend

echo "✅ Done! Check logs with: docker-compose -f docker-compose.prod.yml logs -f backend"

