/**
 * Script migration: Thay đổi "CẦN HỖ TRỢ" thành "CẦN CỨU TRỢ"
 * Chạy script này để cập nhật dữ liệu cũ trong database
 */

import mongoose from 'mongoose';
import RescueRequest from '../models/RescueRequest.model.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hotrokhancap';

async function migrateUrgency() {
    try {
        console.log('🔄 Đang kết nối MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Đã kết nối MongoDB');

        // Tìm tất cả documents có urgency = "CẦN HỖ TRỢ"
        const oldRequests = await RescueRequest.find({ urgency: 'CẦN HỖ TRỢ' });
        console.log(`📊 Tìm thấy ${oldRequests.length} documents cần cập nhật`);

        if (oldRequests.length > 0) {
            // Cập nhật tất cả
            const result = await RescueRequest.updateMany(
                { urgency: 'CẦN HỖ TRỢ' },
                { $set: { urgency: 'CẦN CỨU TRỢ' } }
            );
            console.log(`✅ Đã cập nhật ${result.modifiedCount} documents`);
        } else {
            console.log('ℹ️  Không có documents nào cần cập nhật');
        }

        // Kiểm tra lại
        const remaining = await RescueRequest.find({ urgency: 'CẦN HỖ TRỢ' });
        if (remaining.length > 0) {
            console.log(`⚠️  Còn ${remaining.length} documents chưa được cập nhật`);
        } else {
            console.log('✅ Tất cả documents đã được cập nhật thành công!');
        }

        await mongoose.disconnect();
        console.log('✅ Đã đóng kết nối MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi migration:', error);
        process.exit(1);
    }
}

migrateUrgency();


