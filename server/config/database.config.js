import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

/**
 * Kết nối MongoDB với auto-reconnect và xử lý lỗi tốt hơn
 */
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cuu-ho-lu-lut';

    // Cấu hình connection options để xử lý lỗi tốt hơn
    const options = {
      serverSelectionTimeoutMS: 5000, // Timeout sau 5 giây nếu không kết nối được
      socketTimeoutMS: 45000, // Timeout socket sau 45 giây
      connectTimeoutMS: 10000, // Timeout kết nối sau 10 giây
      maxPoolSize: 10, // Số lượng connection tối đa trong pool
      minPoolSize: 2, // Số lượng connection tối thiểu
      retryWrites: true, // Retry writes nếu connection bị đứt
      retryReads: true, // Retry reads nếu connection bị đứt
    };

    const conn = await mongoose.connect(mongoURI, options);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);

    // Handle connection events
    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️  MongoDB disconnected, Mongoose sẽ tự động reconnect...');
      // Mongoose tự động reconnect, không cần gọi lại connectDB()
    });

    mongoose.connection.on('error', (err) => {
      // Xử lý các loại lỗi khác nhau
      if (err.message.includes('ECONNRESET')) {
        logger.warn('⚠️  MongoDB connection reset (ECONNRESET). Mongoose sẽ tự động reconnect...');
      } else if (err.message.includes('ETIMEDOUT')) {
        logger.warn('⚠️  MongoDB connection timeout. Mongoose sẽ tự động reconnect...');
      } else {
        logger.error('❌ MongoDB connection error:', err.message);
      }
      // Không exit, để Mongoose tự retry
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected successfully');
      logger.info('MongoDB reconnected');
    });

    // Xử lý khi connection bị đóng
    mongoose.connection.on('close', () => {
      logger.warn('⚠️  MongoDB connection closed');
    });

    // Xử lý khi connection được mở lại
    mongoose.connection.on('connected', () => {
      logger.info('✅ MongoDB connected');
    });

    return conn;
  } catch (error) {
    logger.error('❌ MongoDB initial connection failed', error);
    console.error('');
    console.error('💡 Giải pháp:');
    console.error('   1. Đảm bảo MongoDB đang chạy: mongod');
    console.error('   2. Hoặc dùng MongoDB Atlas (cloud): https://www.mongodb.com/cloud/atlas');
    console.error('   3. Cập nhật MONGODB_URI trong .env');
    console.error('   4. Kiểm tra firewall/network nếu dùng remote MongoDB');
    console.error('');

    // Nếu là lỗi ECONNRESET hoặc timeout, thử lại sau 5 giây
    if (error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
      console.error('⚠️  Lỗi kết nối tạm thời. Đang thử lại sau 5 giây...');
      setTimeout(() => {
        connectDB();
      }, 5000);
      return; // Không exit, để retry
    }

    console.error('⚠️  Server sẽ KHÔNG CHẠY nếu không kết nối được MongoDB!');
    console.error('');
    process.exit(1);
  }
};

export default connectDB;

