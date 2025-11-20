import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ⚠️ QUAN TRỌNG: Load .env NGAY LẬP TỨC trước khi đọc process.env
// (Đảm bảo hoạt động ngay cả khi được import từ bất kỳ đâu)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootPath = join(__dirname, '..', '..'); // Từ server/config/ lên root
const envPath = join(rootPath, '.env');

// Chỉ load nếu chưa được load (tránh load nhiều lần)
if (!process.env.OPENAI_API_KEY) {
    const envResult = dotenv.config({ path: envPath });
    if (envResult.error) {
        // Fallback: thử load từ server/
        dotenv.config({ path: join(__dirname, '..', '.env') });
    }
}

// Lấy API key từ process.env
const apiKey = process.env.OPENAI_API_KEY || '';

// Debug: Log để kiểm tra API key có được load không
if (!apiKey || apiKey.length === 0) {
    console.warn('⚠️  OPENAI_API_KEY không được tìm thấy trong process.env');
    console.warn('   Kiểm tra file .env có tồn tại và có OPENAI_API_KEY không?');
    console.warn('   File .env phải ở thư mục root');
    console.warn('   Giá trị hiện tại:', process.env.OPENAI_API_KEY);
} else {
    // Chỉ log length, không log toàn bộ key vì lý do bảo mật
    const maskedKey = apiKey.substring(0, 7) + '...' + apiKey.substring(apiKey.length - 4);
    console.log('✅ OPENAI_API_KEY đã được load:', maskedKey, '(length:', apiKey.length, ')');
}

/**
 * Cấu hình và khởi tạo OpenAI client
 */
const openai = new OpenAI({
    apiKey: apiKey
});

// Export cả apiKey để kiểm tra
openai.apiKey = apiKey;

export default openai;

