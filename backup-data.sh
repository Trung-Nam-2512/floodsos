#!/bin/bash

# Script backup dữ liệu trước khi kéo repo mới
# Sử dụng: bash backup-data.sh

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"

echo "📦 Bắt đầu backup dữ liệu..."
echo ""

# Tạo thư mục backup
mkdir -p "$BACKUP_PATH"

# 1. Backup MongoDB
echo "🗄️  Backup MongoDB..."
if docker ps | grep -q cuuho-mongodb; then
    docker exec cuuho-mongodb mongodump --archive > "$BACKUP_PATH/mongodb_backup.archive"
    echo "   ✅ MongoDB backup: $BACKUP_PATH/mongodb_backup.archive"
else
    echo "   ⚠️  MongoDB container không chạy, bỏ qua backup MongoDB"
fi

# 2. Backup CSV files
echo "📊 Backup CSV files..."
if [ -d "./server/services/data" ]; then
    mkdir -p "$BACKUP_PATH/data"
    cp -r ./server/services/data/* "$BACKUP_PATH/data/" 2>/dev/null || true
    echo "   ✅ CSV files backup: $BACKUP_PATH/data/"
else
    echo "   ⚠️  Thư mục data không tồn tại"
fi

# 3. Backup uploaded images
echo "🖼️  Backup uploaded images..."
if [ -d "./server/uploads" ]; then
    mkdir -p "$BACKUP_PATH/uploads"
    cp -r ./server/uploads/* "$BACKUP_PATH/uploads/" 2>/dev/null || true
    echo "   ✅ Images backup: $BACKUP_PATH/uploads/"
else
    echo "   ⚠️  Thư mục uploads không tồn tại"
fi

# 4. Backup .env (quan trọng!)
echo "🔐 Backup .env file..."
if [ -f "./.env" ]; then
    cp ./.env "$BACKUP_PATH/.env"
    echo "   ✅ .env backup: $BACKUP_PATH/.env"
else
    echo "   ⚠️  File .env không tồn tại"
fi

# Tạo file info
cat > "$BACKUP_PATH/README.txt" << EOF
Backup được tạo vào: $(date)
Thư mục project: $(pwd)

Cách restore:
1. Restore MongoDB:
   docker exec -i cuuho-mongodb mongorestore --archive < mongodb_backup.archive

2. Restore files:
   cp -r data/* /path/to/project/server/services/data/
   cp -r uploads/* /path/to/project/server/uploads/

3. Restore .env:
   cp .env /path/to/project/.env
EOF

echo ""
echo "✨ Backup hoàn tất!"
echo "📁 Vị trí: $BACKUP_PATH"
echo ""
echo "💡 Lưu ý: Named volume 'mongodb_data' không cần backup riêng,"
echo "   Docker sẽ tự động giữ lại khi rebuild container."
echo ""

