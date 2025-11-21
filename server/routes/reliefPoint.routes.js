import express from 'express';
import reliefPointController from '../controllers/reliefPoint.controller.js';

const router = express.Router();

/**
 * @route   GET /api/relief-points
 * @desc    Lấy danh sách điểm tiếp nhận cứu trợ
 * @access  Public
 */
router.get('/', reliefPointController.getAll);

/**
 * @route   GET /api/relief-points/admin/stats
 * @desc    Lấy thống kê điểm tiếp nhận cứu trợ
 * @access  Public (có thể thêm authentication sau)
 */
router.get('/admin/stats', reliefPointController.getStats);

/**
 * @route   GET /api/relief-points/:id
 * @desc    Lấy thông tin một điểm tiếp nhận cứu trợ theo ID
 * @access  Public
 */
router.get('/:id', reliefPointController.getById);

/**
 * @route   POST /api/relief-points
 * @desc    Tạo điểm tiếp nhận cứu trợ mới
 * @access  Public (có thể thêm authentication sau)
 */
router.post('/', reliefPointController.create);

/**
 * @route   PUT /api/relief-points/:id
 * @desc    Cập nhật điểm tiếp nhận cứu trợ
 * @access  Public (có thể thêm authentication sau)
 */
router.put('/:id', reliefPointController.update);

/**
 * @route   DELETE /api/relief-points/:id
 * @desc    Xóa điểm tiếp nhận cứu trợ
 * @access  Public (có thể thêm authentication sau)
 */
router.delete('/:id', reliefPointController.delete);

export default router;

