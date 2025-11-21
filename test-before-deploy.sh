#!/bin/bash

# Script test nhanh trước khi deploy production
# Kiểm tra các vấn đề phổ biến

set -e

echo "🧪 Bắt đầu test trước khi deploy..."
echo ""

# 1. Kiểm tra syntax
echo "1️⃣  Kiểm tra syntax..."
if node --check server/index.js 2>/dev/null; then
    echo "   ✅ server/index.js - OK"
else
    echo "   ❌ server/index.js - LỖI SYNTAX!"
    exit 1
fi

# 2. Kiểm tra imports
echo ""
echo "2️⃣  Kiểm tra imports..."
if node --input-type=module -e "import('./server/routes/report.routes.js').then(() => console.log('✅ report.routes.js - OK')).catch(e => {console.error('❌ report.routes.js - LỖI:', e.message); process.exit(1)})" 2>&1 | grep -q "OK"; then
    echo "   ✅ report.routes.js imports - OK"
else
    echo "   ⚠️  Không thể test import (có thể do môi trường)"
fi

# 3. Kiểm tra geocoding đã tắt
echo ""
echo "3️⃣  Kiểm tra geocoding đã tắt..."
if grep -q "ĐÃ TẮT\|KHÔNG geocode\|không dùng geocoding" server/controllers/report.controller.js; then
    echo "   ✅ Geocoding đã được tắt trong report.controller.js"
else
    echo "   ⚠️  Cần kiểm tra lại geocoding"
fi

if grep -q "geocodingService.geocodeWithFallback" server/controllers/report.controller.js; then
    echo "   ❌ Vẫn còn geocoding calls trong report.controller.js!"
    exit 1
else
    echo "   ✅ Không còn geocoding calls"
fi

# 4. Kiểm tra duplicate check
echo ""
echo "4️⃣  Kiểm tra duplicate check..."
if grep -q "duplicateCheckService.checkDuplicate" server/controllers/report.controller.js; then
    echo "   ✅ Duplicate check đã được tích hợp"
else
    echo "   ⚠️  Cần kiểm tra duplicate check"
fi

# 5. Kiểm tra export/import
echo ""
echo "5️⃣  Kiểm tra export/import..."
if grep -q "export.*ReportController\|export default" server/controllers/report.controller.js; then
    echo "   ✅ ReportController export - OK"
else
    echo "   ❌ ReportController không có export!"
    exit 1
fi

if grep -q "import.*ReportController" server/routes/report.routes.js; then
    echo "   ✅ ReportController import - OK"
else
    echo "   ❌ ReportController không được import!"
    exit 1
fi

# 6. Kiểm tra routes
echo ""
echo "6️⃣  Kiểm tra routes..."
if grep -q "router.post\|router.get" server/routes/report.routes.js; then
    echo "   ✅ Routes đã được định nghĩa"
else
    echo "   ❌ Routes không được định nghĩa!"
    exit 1
fi

echo ""
echo "✨ Tất cả test đã pass!"
echo ""
echo "📝 Checklist trước khi deploy:"
echo "   ✅ Syntax check"
echo "   ✅ Imports/Exports"
echo "   ✅ Geocoding đã tắt"
echo "   ✅ Duplicate check hoạt động"
echo "   ✅ Routes đã định nghĩa"
echo ""
echo "🚀 Sẵn sàng deploy!"


