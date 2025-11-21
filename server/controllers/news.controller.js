import News from '../models/News.model.js';
import { saveBase64Image } from '../config/upload.config.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Controller xử lý tin tức
 */
class NewsController {
    /**
     * Tạo tin tức mới
     * POST /api/news
     */
    async create(req, res) {
        try {
            const { title, content, imageBase64, sourceUrl, category, author } = req.body;

            // Validate
            if (!title || title.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Tiêu đề không được để trống'
                });
            }

            if (!content || content.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Nội dung không được để trống'
                });
            }

            if (!category || !['thông báo khẩn', 'hướng dẫn', 'cập nhật tình hình'].includes(category)) {
                return res.status(400).json({
                    success: false,
                    message: 'Phân loại không hợp lệ. Phải là: thông báo khẩn, hướng dẫn, hoặc cập nhật tình hình'
                });
            }

            // Lưu hình ảnh nếu có
            let imagePath = null;
            if (imageBase64) {
                try {
                    if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
                        console.warn('⚠️  Base64 string không hợp lệ hoặc quá ngắn');
                    } else {
                        // Lưu vào thư mục uploads/news/
                        const newsImagePath = saveBase64Image(imageBase64, 'news');
                        imagePath = newsImagePath;
                        console.log('✅ Lưu hình ảnh tin tức thành công:', imagePath);
                    }
                } catch (uploadError) {
                    logger.error('Lỗi lưu hình ảnh tin tức', uploadError, req);
                }
            }

            const newsData = {
                title: title.trim(),
                content: content.trim(),
                imagePath: imagePath,
                sourceUrl: sourceUrl && sourceUrl.trim() ? sourceUrl.trim() : null,
                category: category,
                author: author && author.trim() ? author.trim() : 'Admin',
                status: 'published'
            };

            const newNews = await News.create(newsData);
            console.log('✅ Đã tạo tin tức mới:', newNews._id);

            res.json({
                success: true,
                message: 'Đã đăng tin tức thành công',
                data: newNews
            });
        } catch (error) {
            logger.error('Lỗi tạo tin tức', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo tin tức',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh sách tin tức
     * GET /api/news?page=1&limit=20&category=thông báo khẩn&search=Phú Yên
     */
    async getAll(req, res) {
        try {
            // Pagination
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;

            // Filter & Search
            const category = req.query.category;
            const searchText = req.query.search || '';

            let query = { status: 'published' }; // Chỉ lấy tin đã publish

            if (category && ['thông báo khẩn', 'hướng dẫn', 'cập nhật tình hình'].includes(category)) {
                query.category = category;
            }

            if (searchText) {
                const searchWords = searchText.trim().split(/\s+/).filter(word => word.length > 0);

                if (searchWords.length > 1) {
                    query.$and = searchWords.map(word => ({
                        $or: [
                            { title: { $regex: word, $options: 'i' } },
                            { content: { $regex: word, $options: 'i' } },
                            { author: { $regex: word, $options: 'i' } }
                        ]
                    }));
                } else {
                    query.$or = [
                        { title: { $regex: searchText, $options: 'i' } },
                        { content: { $regex: searchText, $options: 'i' } },
                        { author: { $regex: searchText, $options: 'i' } }
                    ];
                }
            }

            // Fetch với sort mới nhất trước
            const [news, total] = await Promise.all([
                News.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                News.countDocuments(query)
            ]);

            res.json({
                success: true,
                data: news,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            logger.error('Lỗi khi lấy danh sách tin tức', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách tin tức',
                error: error.message
            });
        }
    }

    /**
     * Lấy chi tiết một tin tức
     * GET /api/news/:id
     */
    async getById(req, res) {
        try {
            const { id } = req.params;

            const news = await News.findById(id);

            if (!news) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy tin tức'
                });
            }

            // Tăng lượt xem
            news.views += 1;
            await news.save();

            res.json({
                success: true,
                data: news
            });
        } catch (error) {
            logger.error('Lỗi khi lấy chi tiết tin tức', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy chi tiết tin tức',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật tin tức
     * PUT /api/news/:id
     */
    async update(req, res) {
        try {
            const { id } = req.params;
            const { title, content, imageBase64, sourceUrl, category, author } = req.body;

            const news = await News.findById(id);

            if (!news) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy tin tức'
                });
            }

            // Build update data
            const updateData = {};

            if (title !== undefined) updateData.title = title.trim();
            if (content !== undefined) updateData.content = content.trim();
            if (sourceUrl !== undefined) updateData.sourceUrl = sourceUrl && sourceUrl.trim() ? sourceUrl.trim() : null;
            if (category !== undefined) {
                if (!['thông báo khẩn', 'hướng dẫn', 'cập nhật tình hình'].includes(category)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Phân loại không hợp lệ'
                    });
                }
                updateData.category = category;
            }
            if (author !== undefined) updateData.author = author.trim();

            // Xử lý hình ảnh mới
            if (imageBase64) {
                try {
                    // Xóa ảnh cũ nếu có
                    if (news.imagePath) {
                        const oldImagePath = path.join(__dirname, '..', news.imagePath);
                        if (fs.existsSync(oldImagePath)) {
                            fs.unlinkSync(oldImagePath);
                            console.log(`🗑️  Đã xóa hình ảnh cũ: ${oldImagePath}`);
                        }
                    }

                    // Lưu ảnh mới
                    if (typeof imageBase64 === 'string' && imageBase64.length >= 100) {
                        const newsImagePath = saveBase64Image(imageBase64, 'news');
                        updateData.imagePath = newsImagePath;
                        console.log('✅ Đã cập nhật hình ảnh tin tức:', updateData.imagePath);
                    }
                } catch (uploadError) {
                    logger.error('Lỗi cập nhật hình ảnh tin tức', uploadError, req);
                }
            }

            const updatedNews = await News.findByIdAndUpdate(
                id,
                updateData,
                { new: true, runValidators: true }
            );

            console.log(`✅ Đã cập nhật tin tức: ${id}`);

            res.json({
                success: true,
                message: 'Đã cập nhật tin tức thành công',
                data: updatedNews
            });
        } catch (error) {
            logger.error('Lỗi khi cập nhật tin tức', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật tin tức',
                error: error.message
            });
        }
    }

    /**
     * Xóa tin tức
     * DELETE /api/news/:id
     */
    async delete(req, res) {
        try {
            const { id } = req.params;

            const news = await News.findById(id);

            if (!news) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy tin tức'
                });
            }

            // Xóa hình ảnh nếu có
            if (news.imagePath) {
                try {
                    const imagePath = path.join(__dirname, '..', news.imagePath);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                        console.log(`🗑️  Đã xóa hình ảnh tin tức: ${imagePath}`);
                    }
                } catch (imgError) {
                    console.warn('⚠️  Không thể xóa hình ảnh:', imgError);
                }
            }

            await News.findByIdAndDelete(id);

            console.log(`✅ Đã xóa tin tức: ${id}`);

            res.json({
                success: true,
                message: 'Đã xóa tin tức thành công',
                data: { id }
            });
        } catch (error) {
            logger.error('Lỗi khi xóa tin tức', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa tin tức',
                error: error.message
            });
        }
    }
}

export default new NewsController();


