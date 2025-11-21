import Hotline from '../models/Hotline.model.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Controller xử lý hotlines
 */
class HotlineController {
    /**
     * Lấy danh sách hotline
     * GET /api/hotlines
     */
    async getAll(req, res) {
        try {
            const hotlines = await Hotline.find().sort({ createdAt: -1 });
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
     * Tạo hotline mới
     * POST /api/hotlines
     */
    async create(req, res) {
        try {
            const { province, unit, phone, note, imageBase64, imageTitle } = req.body;

            if (!province || !unit || !phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng điền đầy đủ thông tin: Tỉnh/Thành phố, Đơn vị, Số điện thoại'
                });
            }

            let imageUrl = null;

            // Nếu có base64, lưu file
            if (imageBase64) {
                try {
                    const hotlinesDir = path.join(__dirname, '../uploads/hotlines');
                    if (!fs.existsSync(hotlinesDir)) {
                        fs.mkdirSync(hotlinesDir, { recursive: true });
                    }

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

                    const filename = `hotline-${Date.now()}.${imageType}`;
                    const filepath = path.join(hotlinesDir, filename);

                    fs.writeFileSync(filepath, buffer);
                    imageUrl = `/uploads/hotlines/${filename}`;
                } catch (uploadError) {
                    console.error('Lỗi lưu hình ảnh:', uploadError);
                    return res.status(500).json({
                        success: false,
                        message: 'Lỗi khi lưu hình ảnh',
                        error: uploadError.message
                    });
                }
            }

            const hotline = new Hotline({
                province,
                unit,
                phone,
                note: note || '',
                imageUrl,
                imageTitle: imageTitle || unit
            });

            await hotline.save();

            res.json({
                success: true,
                message: 'Đã tạo hotline thành công',
                data: hotline
            });
        } catch (error) {
            console.error('Lỗi tạo hotline:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo hotline',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật hotline
     * PUT /api/hotlines/:id
     */
    async update(req, res) {
        try {
            const { id } = req.params;
            const { province, unit, phone, note, imageBase64, imageTitle } = req.body;

            const hotline = await Hotline.findById(id);
            if (!hotline) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy hotline'
                });
            }

            // Cập nhật thông tin cơ bản
            if (province) hotline.province = province;
            if (unit) hotline.unit = unit;
            if (phone) hotline.phone = phone;
            if (note !== undefined) hotline.note = note;
            if (imageTitle) hotline.imageTitle = imageTitle;

            // Nếu có base64 mới, lưu file
            if (imageBase64) {
                try {
                    const hotlinesDir = path.join(__dirname, '../uploads/hotlines');
                    if (!fs.existsSync(hotlinesDir)) {
                        fs.mkdirSync(hotlinesDir, { recursive: true });
                    }

                    const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
                    if (!matches) {
                        return res.status(400).json({
                            success: false,
                            message: 'Định dạng hình ảnh không hợp lệ'
                        });
                    }

                    // Xóa file cũ nếu có
                    if (hotline.imageUrl && hotline.imageUrl.startsWith('/uploads/hotlines/')) {
                        const oldFilePath = path.join(__dirname, '..', hotline.imageUrl);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    }

                    const imageType = matches[1];
                    const imageData = matches[2];
                    const buffer = Buffer.from(imageData, 'base64');

                    const filename = `hotline-${id}-${Date.now()}.${imageType}`;
                    const filepath = path.join(hotlinesDir, filename);

                    fs.writeFileSync(filepath, buffer);
                    hotline.imageUrl = `/uploads/hotlines/${filename}`;
                } catch (uploadError) {
                    console.error('Lỗi lưu hình ảnh:', uploadError);
                    return res.status(500).json({
                        success: false,
                        message: 'Lỗi khi lưu hình ảnh',
                        error: uploadError.message
                    });
                }
            }

            await hotline.save();

            res.json({
                success: true,
                message: 'Đã cập nhật hotline thành công',
                data: hotline
            });
        } catch (error) {
            console.error('Lỗi cập nhật hotline:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật hotline',
                error: error.message
            });
        }
    }

    /**
     * Xóa hotline
     * DELETE /api/hotlines/:id
     */
    async delete(req, res) {
        try {
            const { id } = req.params;

            const hotline = await Hotline.findById(id);
            if (!hotline) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy hotline'
                });
            }

            // Xóa file hình ảnh nếu có
            if (hotline.imageUrl && hotline.imageUrl.startsWith('/uploads/hotlines/')) {
                try {
                    const filePath = path.join(__dirname, '..', hotline.imageUrl);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️  Đã xóa hình ảnh hotline: ${filePath}`);
                    }
                } catch (deleteError) {
                    console.warn('⚠️  Không thể xóa file hình ảnh:', deleteError);
                }
            }

            await Hotline.findByIdAndDelete(id);

            res.json({
                success: true,
                message: 'Đã xóa hotline thành công'
            });
        } catch (error) {
            console.error('Lỗi xóa hotline:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa hotline',
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

            const hotline = await Hotline.findById(id);
            if (!hotline) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy hotline'
                });
            }

            let finalImageUrl = imageUrl || hotline.imageUrl;

            // Nếu có base64, lưu file
            if (imageBase64) {
                try {
                    const hotlinesDir = path.join(__dirname, '../uploads/hotlines');
                    if (!fs.existsSync(hotlinesDir)) {
                        fs.mkdirSync(hotlinesDir, { recursive: true });
                    }

                    const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
                    if (!matches) {
                        return res.status(400).json({
                            success: false,
                            message: 'Định dạng hình ảnh không hợp lệ'
                        });
                    }

                    // Xóa file cũ nếu có
                    if (hotline.imageUrl && hotline.imageUrl.startsWith('/uploads/hotlines/')) {
                        const oldFilePath = path.join(__dirname, '..', hotline.imageUrl);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    }

                    const imageType = matches[1];
                    const imageData = matches[2];
                    const buffer = Buffer.from(imageData, 'base64');

                    const filename = `hotline-${id}-${Date.now()}.${imageType}`;
                    const filepath = path.join(hotlinesDir, filename);

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
            hotline.imageUrl = finalImageUrl;
            if (imageTitle) {
                hotline.imageTitle = imageTitle;
            }

            await hotline.save();

            res.json({
                success: true,
                message: 'Đã cập nhật hình ảnh hotline',
                data: hotline
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

    /**
     * Xóa hình ảnh hotline
     * DELETE /api/hotlines/:id/image
     */
    async deleteImage(req, res) {
        try {
            const { id } = req.params;

            const hotline = await Hotline.findById(id);
            if (!hotline) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy hotline'
                });
            }

            // Kiểm tra xem có ảnh không
            if (!hotline.imageUrl) {
                return res.status(400).json({
                    success: false,
                    message: 'Hotline này chưa có hình ảnh để xóa'
                });
            }

            // Xóa file trên server nếu là local file
            if (hotline.imageUrl.startsWith('/uploads/hotlines/')) {
                try {
                    const filePath = path.join(__dirname, '..', hotline.imageUrl);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️  Đã xóa hình ảnh hotline: ${filePath}`);
                    }
                } catch (deleteError) {
                    console.warn('⚠️  Không thể xóa file hình ảnh:', deleteError);
                }
            }

            // Xóa imageUrl và imageTitle trong hotline
            hotline.imageUrl = null;
            hotline.imageTitle = null;

            await hotline.save();

            res.json({
                success: true,
                message: 'Đã xóa hình ảnh hotline thành công',
                data: hotline
            });
        } catch (error) {
            console.error('Lỗi xóa hình ảnh hotline:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa hình ảnh hotline',
                error: error.message
            });
        }
    }

}

export default new HotlineController();

