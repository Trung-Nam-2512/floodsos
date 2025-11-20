#!/bin/bash

# Script helper để chạy Docker Compose dễ dàng

echo "🚀 CỨU HỘ LŨ LỤT - DOCKER DEPLOY"
echo "=================================="
echo ""

# Kiểm tra Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker chưa được cài đặt!"
    echo "   Cài đặt: curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh"
    exit 1
fi

# Kiểm tra Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose chưa được cài đặt!"
    exit 1
fi

# Kiểm tra file .env
if [ ! -f .env ]; then
    echo "⚠️  File .env chưa tồn tại!"
    echo "   Tạo file .env từ env.example..."
    if [ -f env.example ]; then
        cp env.example .env
        echo "✅ Đã tạo file .env từ env.example"
        echo "   ⚠️  Vui lòng chỉnh sửa file .env với các giá trị thực tế!"
        read -p "   Nhấn Enter để tiếp tục sau khi đã chỉnh sửa .env..."
    else
        echo "❌ Không tìm thấy env.example"
        exit 1
    fi
fi

# Menu chọn
echo "Chọn phương án deploy:"
echo "1) Docker Compose với MongoDB local (tất cả trong Docker)"
echo "2) Docker Compose với MongoDB Atlas (production - khuyến nghị)"
echo "3) Stop và xóa containers"
echo "4) Xem logs"
echo "5) Rebuild containers"
read -p "Chọn (1-5): " choice

case $choice in
    1)
        echo ""
        echo "🐳 Đang chạy Docker Compose với MongoDB local..."
        docker-compose up -d
        echo ""
        echo "✅ Đã khởi động!"
        echo "   Frontend: http://localhost:3000"
        echo "   Backend:  http://localhost:5000"
        echo ""
        echo "Xem logs: docker-compose logs -f"
        ;;
    2)
        echo ""
        echo "🐳 Đang chạy Docker Compose với MongoDB Atlas..."
        docker-compose -f docker-compose.prod.yml up -d
        echo ""
        echo "✅ Đã khởi động!"
        echo "   Frontend: http://localhost:3000"
        echo "   Backend:  http://localhost:5000"
        echo ""
        echo "Xem logs: docker-compose -f docker-compose.prod.yml logs -f"
        ;;
    3)
        echo ""
        echo "🛑 Đang dừng và xóa containers..."
        docker-compose down
        docker-compose -f docker-compose.prod.yml down
        echo "✅ Đã dừng!"
        ;;
    4)
        echo ""
        echo "📋 Logs (Ctrl+C để thoát):"
        docker-compose logs -f
        ;;
    5)
        echo ""
        echo "🔨 Đang rebuild containers..."
        docker-compose up -d --build
        echo "✅ Đã rebuild!"
        ;;
    *)
        echo "❌ Lựa chọn không hợp lệ!"
        exit 1
        ;;
esac

