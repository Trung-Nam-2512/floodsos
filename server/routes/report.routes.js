import express from 'express';
import { ReportController } from '../controllers/report.controller.js';

// Khởi tạo controller instance
const reportController = new ReportController();

// Validate
if (!reportController || typeof reportController.create !== 'function') {
    console.error('❌ ReportController không được khởi tạo đúng!');
    console.error('   reportController:', reportController);
    console.error('   Type:', typeof reportController);
    throw new Error('ReportController không được khởi tạo đúng');
}

console.log('✅ ReportController đã được khởi tạo thành công');
console.log('   Type:', typeof reportController);
console.log('   Has create:', typeof reportController.create);
console.log('   Has getAll:', typeof reportController.getAll);

const router = express.Router();

/**
 * @route   POST /api/report
 * @desc    Tạo báo cáo khẩn cấp mới
 * @access  Public
 */
router.post('/', async (req, res) => {
    try {
        if (!reportController || typeof reportController.create !== 'function') {
            console.error('❌ reportController.create is not a function!');
            console.error('   reportController:', reportController);
            console.error('   typeof reportController:', typeof reportController);
            return res.status(500).json({
                success: false,
                message: 'Controller không được khởi tạo đúng',
                error: 'reportController.create is not a function'
            });
        }
        await reportController.create(req, res);
    } catch (error) {
        console.error('Error in report route:', error);
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
 * @route   GET /api/reports
 * @desc    Lấy danh sách báo cáo
 * @access  Public
 */
router.get('/', async (req, res) => {
    try {
        if (!reportController || typeof reportController.getAll !== 'function') {
            console.error('❌ reportController.getAll is not a function!');
            return res.status(500).json({
                success: false,
                message: 'Controller không được khởi tạo đúng',
                error: 'reportController.getAll is not a function'
            });
        }
        await reportController.getAll(req, res);
    } catch (error) {
        console.error('Error in report route:', error);
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
 * @route   GET /api/reports/count
 * @desc    Lấy số lượng báo cáo (để test nhanh)
 * @access  Public
 */
router.get('/count', async (req, res) => {
    try {
        const Report = (await import('../models/Report.model.js')).default;
        const mongoose = (await import('mongoose')).default;

        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: false, message: 'MongoDB không kết nối', readyState: mongoose.connection.readyState });
        }

        const count = await Report.countDocuments();
        const recent = await Report.find().sort({ createdAt: -1 }).limit(3).select('_id name phone createdAt').lean();

        res.json({
            success: true,
            count: count,
            recent: recent,
            message: `Có ${count} reports trong database`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

