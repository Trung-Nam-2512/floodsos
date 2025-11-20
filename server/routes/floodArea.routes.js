import express from 'express';
import floodAreaController from '../controllers/floodArea.controller.js';

const router = express.Router();

/**
 * @route   GET /api/flood-areas
 * @desc    Lấy danh sách khu vực ngập nặng
 * @access  Public
 */
router.get('/', floodAreaController.getAll);

export default router;



