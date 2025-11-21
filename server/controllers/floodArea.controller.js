import { floodAreas } from '../data/floodAreas.data.js';

/**
 * Controller xử lý khu vực ngập nặng
 */
class FloodAreaController {
  /**
   * Lấy danh sách khu vực ngập nặng
   * GET /api/flood-areas
   */
  getAll(req, res) {
    try {
      res.json({ success: true, data: floodAreas });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Lỗi khi lấy danh sách khu vực ngập',
        error: error.message 
      });
    }
  }
}

export default new FloodAreaController();




