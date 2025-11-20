import express from 'express';
import geocodingService from '../services/geocoding.service.js';
import RescueRequest from '../models/RescueRequest.model.js';

const router = express.Router();

/**
 * @route   POST /api/geocoding/geocode
 * @desc    Geocode một địa chỉ text thành tọa độ
 * @access  Public
 */
router.post('/geocode', async (req, res) => {
  try {
    const { address } = req.body;

    if (!address || address.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập địa chỉ'
      });
    }

    const coords = await geocodingService.geocodeWithFallback(address);

    if (coords && coords[0] && coords[1]) {
      res.json({
        success: true,
        data: {
          address,
          coords: {
            longitude: coords[0],
            latitude: coords[1]
          },
          coordsArray: coords
        }
      });
    } else {
      res.json({
        success: false,
        message: 'Không thể tìm thấy tọa độ cho địa chỉ này'
      });
    }
  } catch (error) {
    console.error('Lỗi geocoding:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi geocode địa chỉ',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/geocoding/batch-geocode-reports
 * @desc    Geocode lại tất cả reports không có location
 * @access  Admin
 */
router.post('/batch-geocode-reports', async (req, res) => {
  try {
    const Report = (await import('../models/Report.model.js')).default;

    // Lấy tất cả reports không có location hoặc location = {lat: null, lng: null}
    const reportsWithoutLocation = await Report.find({
      $or: [
        { location: { $exists: false } },
        { 'location.lat': null },
        { 'location.lng': null },
        { location: null }
      ],
      description: { $exists: true, $ne: null, $ne: '' }
    }).limit(100);

    console.log(`🔍 Tìm thấy ${reportsWithoutLocation.length} reports cần geocode`);

    let successCount = 0;
    let failCount = 0;

    for (const report of reportsWithoutLocation) {
      try {
        if (report.description && report.description.trim().length > 0) {
          // Tìm địa chỉ trong description
          const locationKeywords = [
            'Phú Thịnh', 'Tuy An', 'An Thạch', 'Sông Hinh', 'Ea H\'leo', 'Krông Búk', 'Tuy Hòa',
            'Phú Yên', 'Đắk Lắk', 'Khánh Hòa', 'Bình Định', 'Quảng Ngãi',
            'thôn', 'xã', 'phường', 'huyện', 'tỉnh'
          ];

          const sentences = report.description.split(/[.!?\n]/);
          let addressText = '';

          for (const sentence of sentences) {
            for (const keyword of locationKeywords) {
              if (sentence.includes(keyword)) {
                addressText = sentence.trim();
                break;
              }
            }
            if (addressText) break;
          }

          if (!addressText && sentences.length > 0) {
            addressText = sentences.slice(0, 2).join(' ').trim();
          }

          if (addressText && addressText.length > 5) {
            console.log(`🔍 Geocoding report ${report._id}: "${addressText}"`);
            const coords = await geocodingService.geocodeWithFallback(addressText);

            if (coords && coords[0] && coords[1]) {
              report.location = { lat: coords[1], lng: coords[0] };
              await report.save();
              successCount++;
              console.log(`✅ Đã geocode: ${report._id} → [${coords[0]}, ${coords[1]}]`);
            } else {
              failCount++;
              console.log(`⚠️  Không thể geocode: ${report._id} - "${addressText}"`);
            }
          } else {
            failCount++;
            console.log(`⚠️  Không tìm thấy địa chỉ trong description: ${report._id}`);
          }

          // Delay để tránh rate limit
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        failCount++;
        console.error(`❌ Lỗi geocode report ${report._id}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: `Đã geocode ${successCount} reports, ${failCount} reports thất bại`,
      data: {
        total: reportsWithoutLocation.length,
        success: successCount,
        failed: failCount
      }
    });
  } catch (error) {
    console.error('Lỗi batch geocoding reports:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi batch geocode reports',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/geocoding/batch-geocode
 * @desc    Geocode lại tất cả rescue requests không có coords
 * @access  Admin
 */
router.post('/batch-geocode', async (req, res) => {
  try {
    // Lấy tất cả requests không có coords hoặc coords = [null, null]
    const requestsWithoutCoords = await RescueRequest.find({
      $or: [
        { coords: { $exists: false } },
        { coords: [null, null] },
        { coords: null },
        { 'coords.0': null },
        { 'coords.1': null }
      ],
      location: { $exists: true, $ne: null, $ne: '' }
    }).limit(100); // Giới hạn 100 requests mỗi lần để tránh timeout

    console.log(`🔍 Tìm thấy ${requestsWithoutCoords.length} requests cần geocode`);

    let successCount = 0;
    let failCount = 0;

    for (const request of requestsWithoutCoords) {
      try {
        if (request.location && request.location.trim().length > 0) {
          console.log(`🔍 Geocoding: "${request.location}"`);
          const coords = await geocodingService.geocodeWithFallback(request.location);

          if (coords && coords[0] && coords[1]) {
            request.coords = coords;
            await request.save();
            successCount++;
            console.log(`✅ Đã geocode: ${request._id} → [${coords[0]}, ${coords[1]}]`);
          } else {
            failCount++;
            console.log(`⚠️  Không thể geocode: ${request._id} - "${request.location}"`);
          }

          // Delay để tránh rate limit (đặc biệt với Nominatim)
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        failCount++;
        console.error(`❌ Lỗi geocode request ${request._id}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: `Đã geocode ${successCount} requests, ${failCount} requests thất bại`,
      data: {
        total: requestsWithoutCoords.length,
        success: successCount,
        failed: failCount
      }
    });
  } catch (error) {
    console.error('Lỗi batch geocoding:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi batch geocode',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/geocoding/stats
 * @desc    Thống kê số lượng requests có/không có coords
 * @access  Public
 */
router.get('/stats', async (req, res) => {
  try {
    const [total, withCoords, withoutCoords] = await Promise.all([
      RescueRequest.countDocuments(),
      RescueRequest.countDocuments({
        coords: { $exists: true, $ne: [null, null] },
        'coords.0': { $ne: null },
        'coords.1': { $ne: null }
      }),
      RescueRequest.countDocuments({
        $or: [
          { coords: { $exists: false } },
          { coords: [null, null] },
          { coords: null },
          { 'coords.0': null },
          { 'coords.1': null }
        ],
        location: { $exists: true, $ne: null, $ne: '' }
      })
    ]);

    res.json({
      success: true,
      data: {
        total,
        withCoords,
        withoutCoords,
        percentage: total > 0 ? ((withCoords / total) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thống kê',
      error: error.message
    });
  }
});

export default router;

