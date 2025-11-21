import express from 'express';
import hotlineController from '../controllers/hotline.controller.js';

const router = express.Router();

/**
 * @route   GET /api/hotlines
 * @desc    Lấy danh sách hotline cứu hộ
 * @access  Public
 */
router.get('/', hotlineController.getAll);

/**
 * @route   POST /api/hotlines
 * @desc    Tạo hotline mới
 * @access  Public (có thể thêm auth sau)
 */
router.post('/', express.json({ limit: '10mb' }), hotlineController.create);

/**
 * @route   PUT /api/hotlines/:id
 * @desc    Cập nhật hotline
 * @access  Public (có thể thêm auth sau)
 */
router.put('/:id', express.json({ limit: '10mb' }), hotlineController.update);

/**
 * @route   DELETE /api/hotlines/:id
 * @desc    Xóa hotline
 * @access  Public (có thể thêm auth sau)
 */
router.delete('/:id', hotlineController.delete);

/**
 * @route   PUT /api/hotlines/:id/image
 * @desc    Cập nhật hình ảnh cho hotline
 * @access  Public (có thể thêm auth sau)
 */
router.put('/:id/image', express.json({ limit: '10mb' }), hotlineController.updateImage);

/**
 * @route   DELETE /api/hotlines/:id/image
 * @desc    Xóa hình ảnh hotline
 * @access  Public (có thể thêm auth sau)
 */
router.delete('/:id/image', hotlineController.deleteImage);

export default router;

