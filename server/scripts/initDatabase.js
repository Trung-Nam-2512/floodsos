import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootPath = join(__dirname, '..', '..');
dotenv.config({ path: join(rootPath, '.env') });

// Import models
import SafePoint from '../models/SafePoint.model.js';

// Import data
import { safePoints } from '../data/safePoints.data.js';

const mongoURI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/cuu-ho-lu-lut';

/**
 * Initialize database với dữ liệu mẫu
 */
const initDatabase = async () => {
    try {
        console.log('🔄 Đang kết nối MongoDB...');
        await mongoose.connect(mongoURI);
        console.log('✅ Đã kết nối MongoDB');

        // Clear existing data (optional - chỉ khi cần reset)
        // await SafePoint.deleteMany({});
        // await Hotline.deleteMany({});
        // console.log('🗑️  Đã xóa dữ liệu cũ');

        // Seed Safe Points
        console.log('🏠 Đang seed Safe Points...');
        for (const point of safePoints) {
            const existing = await SafePoint.findOne({
                name: point.name,
                lng: point.lng,
                lat: point.lat
            });
            if (!existing) {
                await SafePoint.create(point);
                console.log(`  ✅ Đã thêm safe point: ${point.name}`);
            } else {
                console.log(`  ⏭️  Safe point đã tồn tại: ${point.name}`);
            }
        }

        // Count documents
        const safePointCount = await SafePoint.countDocuments();

        console.log('');
        console.log('✅ Database đã được khởi tạo thành công!');
        console.log(`   🏠 Safe Points: ${safePointCount}`);
        console.log(`   ℹ️  Hotlines được load từ file data (không cần database)`);
        console.log('');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi khởi tạo database:', error);
        process.exit(1);
    }
};

// Chạy init
initDatabase();

