// ⚠️ QUAN TRỌNG: Load .env TRƯỚC KHI import bất kỳ file nào sử dụng process.env
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables NGAY LẬP TỨC
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootPath = join(__dirname, '..');
const envPath = join(rootPath, '.env');
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
    console.warn('⚠️  Không tìm thấy file .env ở root:', envPath);
    console.warn('   Thử load từ thư mục hiện tại...');
    // Fallback: thử load từ server/
    dotenv.config({ path: './.env' });
} else {
    console.log('✅ Đã load file .env từ:', envPath);
}

// Bây giờ mới import các file khác (sau khi đã load .env)
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import connectDB from './config/database.config.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';
import { startDataFetching } from './services/thuydienevn.service.js';

// Debug: Log để kiểm tra OPENAI_API_KEY
// if (process.env.OPENAI_API_KEY) {
//     console.log('✅ OPENAI_API_KEY đã được load từ .env (length:', process.env.OPENAI_API_KEY.length, ')');
// } else {
//     console.warn('⚠️  OPENAI_API_KEY không được tìm thấy trong .env');
//     console.warn('   Vui lòng tạo file .env trong thư mục root với nội dung:');
//     console.warn('   OPENAI_API_KEY=sk-your_key_here');
// }

// Validate environment variables
const requiredEnvVars = ['MONGODB_URI'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('❌ Thiếu environment variables bắt buộc:');
    missingVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    console.error('');
    console.error('💡 Vui lòng tạo file .env trong thư mục root với các biến trên.');
    process.exit(1);
}

// Kết nối database
connectDB();

// Khởi động service fetch dữ liệu thủy điện EVN định kỳ
let thuydienService = null;
try {
    thuydienService = startDataFetching();
} catch (error) {
    logger.error('Lỗi khi khởi động service thủy điện EVN:', error);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Promise Rejection', err);
    // Trong production, không exit ngay, chỉ log và có thể gửi alert
    if (process.env.NODE_ENV === 'production') {
        // TODO: Có thể gửi alert lên monitoring service
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', err);
    // Exit sau khi log để tránh undefined state
    process.exit(1);
});

// Graceful shutdown - Dừng service thủy điện khi server shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    if (thuydienService && thuydienService.stop) {
        thuydienService.stop();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    if (thuydienService && thuydienService.stop) {
        thuydienService.stop();
    }
    process.exit(0);
});

const app = express();
const PORT = process.env.PORT || 5000;

// ====================
// MIDDLEWARE
// ====================
// Trust proxy - Cần thiết khi chạy sau Nginx reverse proxy
// Chỉ trust 1 hop (Nginx) để tránh bypass rate limiting
// Trong Docker, chỉ có 1 proxy là Nginx frontend container
app.set('trust proxy', 1);

// CORS configuration - Dev: tắt CORS, Production: restrict
const isDevelopment = process.env.NODE_ENV !== 'production';

if (isDevelopment) {
    // Dev mode: Tắt CORS hoàn toàn (cho phép tất cả origins)
    console.log('🔓 Dev mode: CORS đã được tắt (cho phép tất cả origins)');
    app.use(cors({
        origin: true, // Cho phép tất cả origins
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));
} else {
    // Production mode: Chỉ cho phép FRONTEND_URL
    const frontendUrls = process.env.FRONTEND_URL
        ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
        : ['https://wrs.edu.vn'];

    // Tự động thêm http:// và https:// cho mỗi domain
    const allowedOrigins = new Set();
    frontendUrls.forEach(url => {
        // Thêm https:// nếu chưa có
        if (url.startsWith('http://')) {
            allowedOrigins.add(url);
            allowedOrigins.add(url.replace('http://', 'https://'));
        } else if (url.startsWith('https://')) {
            allowedOrigins.add(url);
            allowedOrigins.add(url.replace('https://', 'http://'));
        } else {
            // Nếu không có protocol, thêm cả http và https
            allowedOrigins.add(`http://${url}`);
            allowedOrigins.add(`https://${url}`);
        }
    });

    console.log('🔒 Production mode: CORS chỉ cho phép:', Array.from(allowedOrigins));
    app.use(cors({
        origin: (origin, callback) => {
            // Cho phép requests không có origin (mobile apps, Postman, same-origin requests, Docker internal)
            if (!origin) {
                return callback(null, true);
            }

            // Kiểm tra xem origin có trong danh sách cho phép không
            if (allowedOrigins.has(origin)) {
                return callback(null, true);
            }

            // Log để debug (chỉ trong development hoặc khi cần)
            if (process.env.DEBUG_CORS === 'true') {
                console.log('⚠️  CORS blocked origin:', origin);
                console.log('   Allowed origins:', Array.from(allowedOrigins));
            }

            callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));
}

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting - ĐÃ TẮT (server mạnh, không cần limit)
// const limiter = rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 phút
//     max: 400, // Tối đa 400 requests mỗi IP trong 15 phút
//     message: {
//         success: false,
//         message: 'Quá nhiều requests từ IP này, vui lòng thử lại sau 15 phút.'
//     },
//     standardHeaders: true, // Trả về rate limit info trong headers (RateLimit-*)
//     legacyHeaders: false, // Không dùng X-RateLimit-* headers
//     // Trust proxy đã được set ở app level (trust proxy: 1)
//     // Tắt validation warning vì đã cấu hình đúng (chỉ trust 1 hop)
//     validate: {
//         trustProxy: false // Tắt validation vì đã cấu hình đúng ở app level
//     },
//     skip: (req) => {
//         // Skip rate limiting cho health check endpoint
//         return req.path === '/api/health';
//     },
//     handler: (req, res) => {
//         res.status(429).json({
//             success: false,
//             message: 'Quá nhiều requests từ IP này, vui lòng thử lại sau 15 phút.',
//             retryAfter: Math.ceil(15 * 60) // seconds
//         });
//     }
// });

// Áp dụng rate limiting cho tất cả API routes (trừ health check)
// app.use('/api/', limiter);

// Serve static files (hình ảnh)
app.use('/uploads', express.static('uploads'));

// ====================
// ROUTES
// ====================
app.use('/api', routes);

// ====================
// ERROR HANDLERS
// ====================
app.use(notFoundHandler);
app.use(errorHandler);

// ====================
// START SERVER
// ====================
app.listen(PORT, () => {
    console.log('');
    console.log(' ===================================');
    console.log(' CỨU HỘ LŨ LỤT MIỀN TRUNG 2025');
    console.log('===================================');
    console.log('');
    console.log(`Server: http://localhost:${PORT}`);
    console.log(` Database: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/cuu-ho-lu-lut'}`);
    console.log('');
    console.log('Public API:');
    console.log(` Hotlines: GET  ${PORT}/api/hotlines`);
    console.log(`   Điểm trú ẩn:  GET  ${PORT}/api/safe-points`);
    console.log(`   Khu vực ngập: GET  ${PORT}/api/flood-areas`);
    console.log(`   Báo cáo:      POST ${PORT}/api/report`);
    console.log(`   AI Cầu cứu:   POST ${PORT}/api/ai-report`);
    console.log(`   Danh sách:    GET  ${PORT}/api/rescue-requests?page=1&limit=20&urgency=...&status=...&search=...`);
    console.log(`   Thủy điện:    GET  ${PORT}/api/thuydien`);
    console.log(`     - Latest:   GET  ${PORT}/api/thuydien/latest`);
    console.log(`     - By slug:  GET  ${PORT}/api/thuydien/:slug/latest`);
    console.log(`     - By date:  GET  ${PORT}/api/thuydien/:slug/date/:date`);
    console.log(`     - By range: GET  ${PORT}/api/thuydien/:slug/range?start=YYYY-MM-DD&end=YYYY-MM-DD`);
    console.log('');

    console.log('');
    console.log('Admin API:');
    console.log(`Thống kê:        GET  ${PORT}/api/rescue-requests/admin/stats`);
    console.log(` Update status:  PUT  ${PORT}/api/rescue-requests/:id/status`);
    console.log(` Export CSV:      GET  ${PORT}/api/admin/export-csv`);
    console.log(` Export Excel:    GET  ${PORT}/api/admin/export-excel`);
    console.log(` Health check:    GET  ${PORT}/api/health`);
    console.log('');
    console.log('Server sẵn sàng phục vụ!');
    console.log('');
});
