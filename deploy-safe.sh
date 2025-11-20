#!/bin/bash

# Script deploy an toàn - Build image mới trước, sau đó restart container
# Không ảnh hưởng đến production đang chạy

set -e  # Exit on error

COMPOSE_FILE="docker-compose.wrs.yml"
SERVICE="${1:-backend}"  # Mặc định là backend, có thể truyền frontend hoặc all

echo "🚀 Bắt đầu deploy an toàn..."
echo "📦 Service: $SERVICE"
echo ""

# Kiểm tra xem container có đang chạy không
if ! docker-compose -f $COMPOSE_FILE ps | grep -q "Up"; then
    echo "⚠️  Không có container nào đang chạy. Sẽ build và start từ đầu."
    docker-compose -f $COMPOSE_FILE up --build -d
    exit 0
fi

echo "✅ Container đang chạy. Bắt đầu build image mới..."

if [ "$SERVICE" = "backend" ] || [ "$SERVICE" = "all" ]; then
    echo ""
    echo "🔨 Building backend image mới..."
    docker-compose -f $COMPOSE_FILE build backend
    
    echo ""
    echo "🔄 Restarting backend container..."
    docker-compose -f $COMPOSE_FILE up -d --no-deps backend
    
    echo "⏳ Đợi backend health check..."
    sleep 5
    
    # Kiểm tra health
    for i in {1..12}; do
        if docker-compose -f $COMPOSE_FILE ps backend | grep -q "healthy"; then
            echo "✅ Backend đã sẵn sàng!"
            break
        fi
        if [ $i -eq 12 ]; then
            echo "⚠️  Backend chưa healthy sau 60s, nhưng vẫn tiếp tục..."
        fi
        sleep 5
    done
fi

if [ "$SERVICE" = "frontend" ] || [ "$SERVICE" = "all" ]; then
    echo ""
    echo "🔨 Building frontend image mới..."
    docker-compose -f $COMPOSE_FILE build frontend
    
    echo ""
    echo "🔄 Restarting frontend container..."
    docker-compose -f $COMPOSE_FILE up -d --no-deps frontend
    
    echo "✅ Frontend đã được restart!"
fi

echo ""
echo "✨ Deploy hoàn tất!"
echo ""
echo "📊 Trạng thái containers:"
docker-compose -f $COMPOSE_FILE ps

echo ""
echo "📝 Logs (Ctrl+C để dừng):"
echo "   docker-compose -f $COMPOSE_FILE logs -f $SERVICE"

