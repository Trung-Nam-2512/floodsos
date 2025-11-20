import express from 'express';
import rescueRequestController from '../controllers/rescueRequest.controller.js';

const router = express.Router();

/**
 * @route   POST /api/rescue-requests/check-duplicate
 * @desc    Kiểm tra trùng lặp trước khi submit
 * @access  Public
 */
router.post('/check-duplicate', rescueRequestController.checkDuplicate);

/**
 * @route   POST /api/ai-report
 * @desc    Tạo yêu cầu cứu hộ bằng AI
 * @access  Public
 */
router.post('/', rescueRequestController.createWithAI);

/**
 * @route   GET /api/rescue-requests
 * @desc    Lấy danh sách yêu cầu cứu hộ (có pagination, filter, search)
 * @access  Public
 */
router.get('/', rescueRequestController.getAll);

/**
 * @route   PUT /api/rescue-requests/:id
 * @desc    Cập nhật toàn bộ thông tin của rescue request (Admin only)
 * @access  Admin
 */
router.put('/:id', rescueRequestController.update);

/**
 * @route   PUT /api/rescue-requests/:id/status
 * @desc    Cập nhật status của rescue request
 * @access  Admin
 */
router.put('/:id/status', rescueRequestController.updateStatus);

/**
 * @route   PUT /api/rescue-requests/:id/coords
 * @desc    Cập nhật tọa độ của rescue request
 * @access  Public (để user có thể cập nhật thủ công)
 */
router.put('/:id/coords', rescueRequestController.updateCoords);

/**
 * @route   DELETE /api/rescue-requests/:id
 * @desc    Xóa rescue request (Admin only - để lọc spam)
 * @access  Admin
 */
router.delete('/:id', rescueRequestController.delete);

/**
 * @route   GET /api/rescue-requests/admin/stats
 * @desc    Lấy thống kê
 * @access  Admin
 */
router.get('/admin/stats', rescueRequestController.getStats);

export default router;

