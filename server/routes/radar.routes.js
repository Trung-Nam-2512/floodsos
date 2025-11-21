import express from 'express';
import axios from 'axios';

const router = express.Router();

// Radar API configuration
const RADAR_API_URL = 'http://phuongnamdts.com:3115/api/v1/radar_reflectivity/by_offset';
const RADAR_API_KEY = 'blZ9h0o2gw89z5So2iEg14KHaPAQiBFPmnBnp9XY2NjpGs000ELXfyxmhJnanddm';

/**
 * Proxy endpoint để lấy radar image
 * GET /api/radar/image?offset=0
 * 
 * Proxy này giải quyết vấn đề Mixed Content khi trang HTTPS
 * không thể fetch từ HTTP API trực tiếp
 */
router.get('/image', async (req, res) => {
    try {
        const offset = req.query.offset || 0;
        const imageUrl = `${RADAR_API_URL}?offset=${offset}&api_key=${RADAR_API_KEY}`;

        // Fetch image từ HTTP API
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 10000, // 10 seconds timeout
            headers: {
                'Accept': 'image/png,image/*,*/*'
            }
        });

        // Set headers để trả về image
        res.set({
            'Content-Type': response.headers['content-type'] || 'image/png',
            'Content-Length': response.headers['content-length'] || response.data.length,
            'Cache-Control': 'public, max-age=120', // Cache 2 phút
            'Access-Control-Allow-Origin': '*'
        });

        // Trả về image data
        res.send(Buffer.from(response.data));
    } catch (error) {
        console.error('Error fetching radar image:', error.message);
        res.status(500).json({
            success: false,
            message: 'Không thể tải ảnh radar',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;

