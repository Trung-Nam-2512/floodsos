import { hotlines } from '../data/hotlines.data.js';
import { saveBase64Image } from '../config/upload.config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const hotlinesDataPath = path.join(__dirname, '../data/hotlines.data.js');

/**
 * Helper function: Lưu hotlines vào file
 */
const saveHotlinesToFile = () => {
    try {
        const hotlinesString = `/**
 * Dữ liệu hotline cứu hộ khẩn cấp
 * Hỗ trợ hiển thị bằng hình ảnh
 * imageUrl: Đường dẫn tới hình ảnh hotline (có thể là local path hoặc external URL)
 * imageTitle: Tiêu đề do user tự định nghĩa
 * Nếu không có imageUrl, sẽ fallback về hiển thị dạng bảng
 */
export const hotlines = ${JSON.stringify(hotlines, null, 2)};
`;
        fs.writeFileSync(hotlinesDataPath, hotlinesString, 'utf8');
        console.log('✅ Đã lưu hotlines vào file');
    } catch (error) {
        console.error('Lỗi lưu hotlines vào file:', error);
        throw error;
    }
};

/**
 * Controller xử lý hotlines
 */
class HotlineController {
    /**
     * Lấy danh sách hotline
     * GET /api/hotlines
     */
    getAll(req, res) {
        try {
            res.json({ success: true, data: hotlines });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách hotline',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật imageUrl cho hotline
     * PUT /api/hotlines/:id/image
     */
    async updateImage(req, res) {
        try {
            const { id } = req.params;
            const { imageBase64, imageUrl, imageTitle } = req.body;

            // Tìm hotline
            const hotlineIndex = hotlines.findIndex(h => h.id === parseInt(id));
            if (hotlineIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy hotline'
                });
            }

            let finalImageUrl = imageUrl;

            // Nếu có base64, lưu file
            if (imageBase64) {
                try {
                    // Tạo thư mục hotlines nếu chưa có
                    const hotlinesDir = path.join(__dirname, '../uploads/hotlines');
                    if (!fs.existsSync(hotlinesDir)) {
                        fs.mkdirSync(hotlinesDir, { recursive: true });
                    }

                    // Parse và lưu base64
                    const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
                    if (!matches) {
                        return res.status(400).json({
                            success: false,
                            message: 'Định dạng hình ảnh không hợp lệ'
                        });
                    }

                    const imageType = matches[1];
                    const imageData = matches[2];
                    const buffer = Buffer.from(imageData, 'base64');

                    // Tạo tên file
                    const filename = `hotline-${id}-${Date.now()}.${imageType}`;
                    const filepath = path.join(hotlinesDir, filename);

                    // Xóa file cũ nếu có
                    const oldImageUrl = hotlines[hotlineIndex].imageUrl;
                    if (oldImageUrl && oldImageUrl.startsWith('/uploads/hotlines/')) {
                        const oldFilePath = path.join(__dirname, '..', oldImageUrl);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    }

                    // Lưu file mới
                    fs.writeFileSync(filepath, buffer);
                    finalImageUrl = `/uploads/hotlines/${filename}`;
                } catch (uploadError) {
                    console.error('Lỗi lưu hình ảnh:', uploadError);
                    return res.status(500).json({
                        success: false,
                        message: 'Lỗi khi lưu hình ảnh',
                        error: uploadError.message
                    });
                }
            }

            // Cập nhật hotline
            hotlines[hotlineIndex].imageUrl = finalImageUrl;
            if (imageTitle) {
                hotlines[hotlineIndex].imageTitle = imageTitle;
            }

            // Lưu vào file (đơn giản - ghi đè toàn bộ)
            saveHotlinesToFile();

            res.json({
                success: true,
                message: 'Đã cập nhật hình ảnh hotline',
                data: hotlines[hotlineIndex]
            });
        } catch (error) {
            console.error('Lỗi cập nhật hình ảnh hotline:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật hình ảnh hotline',
                error: error.message
            });
        }
    }

}

export default new HotlineController();

