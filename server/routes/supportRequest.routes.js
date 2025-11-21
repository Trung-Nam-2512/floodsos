import express from 'express';
import { SupportRequestController } from '../controllers/supportRequest.controller.js';

// Khởi tạo controller instance
const supportRequestController = new SupportRequestController();

// Validate
if (!supportRequestController || typeof supportRequestController.create !== 'function') {
    console.error('❌ SupportRequestController không được khởi tạo đúng!');
    throw new Error('SupportRequestController không được khởi tạo đúng');
}

console.log('✅ SupportRequestController đã được khởi tạo thành công');

const router = express.Router();

/**
 * @route   POST /api/support-requests
 * @desc    Tạo yêu cầu hỗ trợ mới
 * @access  Public
 */
router.post('/', async (req, res) => {
    try {
        if (!supportRequestController || typeof supportRequestController.create !== 'function') {
            console.error('❌ supportRequestController.create is not a function!');
            return res.status(500).json({
                success: false,
                message: 'Controller không được khởi tạo đúng',
                error: 'supportRequestController.create is not a function'
            });
        }
        await supportRequestController.create(req, res);
    } catch (error) {
        console.error('Error in support-request route:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Lỗi server',
                error: error.message
            });
        }
    }
});

/**
 * @route   GET /api/support-requests
 * @desc    Lấy danh sách yêu cầu hỗ trợ (có pagination, filter, search)
 * @access  Public
 */
router.get('/', async (req, res) => {
    try {
        if (!supportRequestController || typeof supportRequestController.getAll !== 'function') {
            console.error('❌ supportRequestController.getAll is not a function!');
            return res.status(500).json({
                success: false,
                message: 'Controller không được khởi tạo đúng',
                error: 'supportRequestController.getAll is not a function'
            });
        }
        await supportRequestController.getAll(req, res);
    } catch (error) {
        console.error('Error in support-request route:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Lỗi server',
                error: error.message
            });
        }
    }
});

/**
 * @route   PUT /api/support-requests/:id/status
 * @desc    Cập nhật status của support request
 * @access  Admin
 */
router.put('/:id/status', async (req, res) => {
    try {
        await supportRequestController.updateStatus(req, res);
    } catch (error) {
        console.error('Error in support-request status route:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Lỗi server',
                error: error.message
            });
        }
    }
});

/**
 * @route   PUT /api/support-requests/:id
 * @desc    Cập nhật toàn bộ thông tin của support request (Admin only)
 * @access  Admin
 */
router.put('/:id', async (req, res) => {
    try {
        await supportRequestController.update(req, res);
    } catch (error) {
        console.error('Error in support-request update route:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Lỗi server',
                error: error.message
            });
        }
    }
});

/**
 * @route   DELETE /api/support-requests/:id
 * @desc    Xóa support request (Admin only)
 * @access  Admin
 */
router.delete('/:id', async (req, res) => {
    try {
        await supportRequestController.delete(req, res);
    } catch (error) {
        console.error('Error in support-request delete route:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Lỗi server',
                error: error.message
            });
        }
    }
});

/**
 * @route   GET /api/support-requests/admin/stats
 * @desc    Lấy thống kê support requests
 * @access  Admin
 */
router.get('/admin/stats', async (req, res) => {
    try {
        await supportRequestController.getStats(req, res);
    } catch (error) {
        console.error('Error in support-request stats route:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Lỗi server',
                error: error.message
            });
        }
    }
});

export default router;

