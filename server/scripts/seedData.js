import mongoose from 'mongoose';
import dotenv from 'dotenv';
import RescueRequest from '../models/RescueRequest.model.js';

dotenv.config();

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cuu-ho-lu-lut';

/**
 * Dữ liệu mẫu để seed vào database
 * ĐÃ VÔ HIỆU HÓA - Không seed dữ liệu ảo
 */
const sampleRequests = [];

/**
 * Seed database với dữ liệu mẫu
 * ĐÃ VÔ HIỆU HÓA - Script này không còn seed dữ liệu ảo
 */
const seedData = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('✅ Connected to MongoDB');

        console.log('ℹ️  Seed script đã được vô hiệu hóa. Không seed dữ liệu ảo.');
        console.log('ℹ️  Chỉ sử dụng dữ liệu thực từ API và database.');

        // Không xóa dữ liệu cũ
        // Không insert dữ liệu mới

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

// Vô hiệu hóa seed - comment out để không chạy tự động
// seedData();

