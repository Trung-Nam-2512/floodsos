import express from 'express';
import reportController from '../controllers/report.controller.js';

const router = express.Router();

/**
 * @route   POST /api/report
 * @desc    Tạo báo cáo khẩn cấp mới
 * @access  Public
 */
router.post('/', reportController.create);

/**
 * @route   GET /api/reports
 * @desc    Lấy danh sách báo cáo
 * @access  Public
 */
router.get('/', reportController.getAll);

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

