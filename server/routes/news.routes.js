import express from 'express';
import newsController from '../controllers/news.controller.js';

const router = express.Router();

/**
 * @route   POST /api/news
 * @desc    Tạo tin tức mới
 * @access  Admin (hiện tại chưa có auth, chỉ cần biết URL)
 */
router.post('/', express.json({ limit: '10mb' }), newsController.create);

/**
 * @route   GET /api/news
 * @desc    Lấy danh sách tin tức (có pagination, filter, search)
 * @access  Public
 */
router.get('/', newsController.getAll);

/**
 * @route   GET /api/news/:id
 * @desc    Lấy chi tiết một tin tức
 * @access  Public
 */
router.get('/:id', newsController.getById);

/**
 * @route   PUT /api/news/:id
 * @desc    Cập nhật tin tức
 * @access  Admin
 */
router.put('/:id', express.json({ limit: '10mb' }), newsController.update);

/**
 * @route   DELETE /api/news/:id
 * @desc    Xóa tin tức
 * @access  Admin
 */
router.delete('/:id', newsController.delete);

export default router;


