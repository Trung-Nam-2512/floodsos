import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

/**
 * Kết nối MongoDB với auto-reconnect
 */
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cuu-ho-lu-lut';
    
    const conn = await mongoose.connect(mongoURI, {
      // Mongoose 6+ không cần các options này nữa (deprecated)
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);

    // Handle connection events
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected, attempting reconnect...');
      // Mongoose tự động reconnect, không cần gọi lại connectDB()
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error', err);
      // Không exit, để Mongoose tự retry
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    logger.error('MongoDB initial connection failed', error);
    console.error('');
    console.error('💡 Giải pháp:');
    console.error('   1. Đảm bảo MongoDB đang chạy: mongod');
    console.error('   2. Hoặc dùng MongoDB Atlas (cloud): https://www.mongodb.com/cloud/atlas');
    console.error('   3. Cập nhật MONGODB_URI trong .env');
    console.error('');
    console.error('⚠️  Server sẽ KHÔNG CHẠY nếu không kết nối được MongoDB!');
    console.error('');
    process.exit(1);
  }
};

export default connectDB;

