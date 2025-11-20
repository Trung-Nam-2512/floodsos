import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Report from '../models/Report.model.js';

dotenv.config();

async function checkReports() {
  try {
    // Kết nối MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cuu-ho-lu-lut');
    console.log('✅ Đã kết nối MongoDB');

    // Đếm số lượng reports
    const count = await Report.countDocuments();
    console.log(`\n📊 Tổng số reports trong DB: ${count}`);

    if (count > 0) {
      // Lấy 5 reports gần nhất
      const recentReports = await Report.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      console.log('\n📝 5 reports gần nhất:');
      recentReports.forEach((r, i) => {
        console.log(`\n${i + 1}. ID: ${r._id}`);
        console.log(`   Tên: ${r.name || 'N/A'}`);
        console.log(`   SĐT: ${r.phone || 'N/A'}`);
        console.log(`   Vị trí: ${r.location ? `lat: ${r.location.lat}, lng: ${r.location.lng}` : 'N/A'}`);
        console.log(`   Mô tả: ${r.description ? r.description.substring(0, 50) + '...' : 'N/A'}`);
        console.log(`   Created: ${r.createdAt}`);
      });
    } else {
      console.log('\n⚠️  Không có reports nào trong database!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  }
}

checkReports();



