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
 * @route   PUT /api/hotlines/:id/image
 * @desc    Cập nhật hình ảnh cho hotline
 * @access  Public (có thể thêm auth sau)
 */
router.put('/:id/image', express.json({ limit: '10mb' }), hotlineController.updateImage);

export default router;

