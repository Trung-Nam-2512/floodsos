import express from 'express';
import hotlineRoutes from './hotline.routes.js';
import safePointRoutes from './safePoint.routes.js';
import floodAreaRoutes from './floodArea.routes.js';
import reportRoutes from './report.routes.js';
import rescueRequestRoutes from './rescueRequest.routes.js';
import adminRoutes from './admin.routes.js';
import geocodingRoutes from './geocoding.routes.js';
import thuydienRoutes from './thuydien.routes.js';

const router = express.Router();

/**
 * Tổng hợp tất cả routes
 */
router.use('/hotlines', hotlineRoutes);
router.use('/safe-points', safePointRoutes);
router.use('/flood-areas', floodAreaRoutes);
router.use('/report', reportRoutes);
router.use('/reports', reportRoutes);
router.use('/ai-report', rescueRequestRoutes);
router.use('/rescue-requests', rescueRequestRoutes);
router.use('/admin', adminRoutes);
router.use('/geocoding', geocodingRoutes);
router.use('/thuydien', thuydienRoutes);

/**
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server đang hoạt động' });
});

export default router;

