import express from 'express';
import thuydienController from '../controllers/thuydien.controller.js';

const router = express.Router();

/**
 * @route   GET /api/thuydien
 * @desc    Lấy danh sách tất cả các hồ và thông tin tổng quan
 * @access  Public
 */
router.get('/', thuydienController.getAll);

/**
 * @route   GET /api/thuydien/latest
 * @desc    Lấy dữ liệu mới nhất của tất cả các hồ
 * @access  Public
 */
router.get('/latest', thuydienController.getLatest);

/**
 * @route   GET /api/thuydien/:slug
 * @desc    Lấy thông tin tổng quan về một hồ
 * @access  Public
 */
router.get('/:slug/info', thuydienController.getInfo);

/**
 * @route   GET /api/thuydien/:slug/latest
 * @desc    Lấy dữ liệu mới nhất của một hồ cụ thể
 * @access  Public
 */
router.get('/:slug/latest', thuydienController.getLatestBySlug);

/**
 * @route   GET /api/thuydien/:slug/date/:date
 * @desc    Lấy dữ liệu của một hồ theo ngày (format: YYYY-MM-DD)
 * @access  Public
 */
router.get('/:slug/date/:date', thuydienController.getDataByDate);

/**
 * @route   GET /api/thuydien/:slug/range
 * @desc    Lấy dữ liệu của một hồ trong khoảng thời gian
 * @query   start=YYYY-MM-DD&end=YYYY-MM-DD
 * @access  Public
 */
router.get('/:slug/range', thuydienController.getDataByRange);

export default router;

