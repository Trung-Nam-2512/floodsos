import express from 'express';
import safePointController from '../controllers/safePoint.controller.js';

const router = express.Router();

/**
 * @route   GET /api/safe-points
 * @desc    Lấy danh sách điểm trú ẩn / đội cứu hộ
 * @access  Public
 */
router.get('/', safePointController.getAll);

/**
 * @route   GET /api/safe-points/:id
 * @desc    Lấy thông tin một điểm trú ẩn theo ID
 * @access  Public
 */
router.get('/:id', safePointController.getById);

/**
 * @route   POST /api/safe-points
 * @desc    Tạo điểm trú ẩn / đội cứu hộ mới
 * @access  Public (có thể thêm authentication sau)
 */
router.post('/', safePointController.create);

/**
 * @route   PUT /api/safe-points/:id
 * @desc    Cập nhật điểm trú ẩn / đội cứu hộ
 * @access  Public (có thể thêm authentication sau)
 */
router.put('/:id', safePointController.update);

/**
 * @route   DELETE /api/safe-points/:id
 * @desc    Xóa điểm trú ẩn / đội cứu hộ
 * @access  Public (có thể thêm authentication sau)
 */
router.delete('/:id', safePointController.delete);

export default router;
