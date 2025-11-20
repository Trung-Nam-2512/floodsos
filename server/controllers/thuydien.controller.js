import thuydienDataService from '../services/thuydienData.service.js';
import { RESERVOIR_NAMES, RESERVOIR_INFO } from '../services/thuydienevn.service.js';

/**
 * Controller xử lý API requests cho dữ liệu thủy điện
 */
class ThuydienController {
    /**
     * Lấy dữ liệu mới nhất của tất cả các hồ
     * GET /api/thuydien/latest
     */
    getLatest(req, res) {
        try {
            const reservoirs = ["song_hinh", "song_ba_ha"];
            const result = {};

            for (const slug of reservoirs) {
                const latestData = thuydienDataService.getLatestData(slug);
                const reservoirInfo = RESERVOIR_INFO[slug] || {};
                result[slug] = {
                    name: reservoirInfo.name || RESERVOIR_NAMES[slug] || slug,
                    slug: slug,
                    coordinates: reservoirInfo.coordinates || null,
                    location: reservoirInfo.location || null,
                    data: latestData,
                    hasData: latestData !== null,
                    lastUpdated: latestData ? latestData.Time : null
                };
            }

            res.json({
                success: true,
                data: result,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Lỗi khi lấy dữ liệu mới nhất:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy dữ liệu mới nhất',
                error: error.message
            });
        }
    }

    /**
     * Lấy dữ liệu mới nhất của một hồ cụ thể
     * GET /api/thuydien/:slug/latest
     */
    getLatestBySlug(req, res) {
        try {
            const { slug } = req.params;
            
            // Validate slug
            if (!["song_hinh", "song_ba_ha"].includes(slug)) {
                return res.status(400).json({
                    success: false,
                    message: 'Slug không hợp lệ. Chỉ hỗ trợ: song_hinh, song_ba_ha'
                });
            }

            const latestData = thuydienDataService.getLatestData(slug);
            const reservoirInfo = RESERVOIR_INFO[slug] || {};
            
            if (!latestData) {
                return res.status(404).json({
                    success: false,
                    message: `Không tìm thấy dữ liệu cho hồ ${reservoirInfo.name || RESERVOIR_NAMES[slug] || slug}`
                });
            }

            res.json({
                success: true,
                data: {
                    name: reservoirInfo.name || RESERVOIR_NAMES[slug] || slug,
                    slug: slug,
                    coordinates: reservoirInfo.coordinates || null,
                    location: reservoirInfo.location || null,
                    data: latestData,
                    lastUpdated: latestData.Time
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Lỗi khi lấy dữ liệu mới nhất:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy dữ liệu mới nhất',
                error: error.message
            });
        }
    }

    /**
     * Lấy dữ liệu của một hồ theo ngày
     * GET /api/thuydien/:slug/date/:date
     * date format: YYYY-MM-DD
     */
    getDataByDate(req, res) {
        try {
            const { slug, date } = req.params;
            
            // Validate slug
            if (!["song_hinh", "song_ba_ha"].includes(slug)) {
                return res.status(400).json({
                    success: false,
                    message: 'Slug không hợp lệ. Chỉ hỗ trợ: song_hinh, song_ba_ha'
                });
            }

            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng ngày không hợp lệ. Sử dụng YYYY-MM-DD'
                });
            }

            const [year, month, day] = date.split('-').map(Number);
            const targetDate = new Date(year, month - 1, day);

            if (isNaN(targetDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày không hợp lệ'
                });
            }

            const data = thuydienDataService.getDataByDate(slug, targetDate);

            const reservoirInfo = RESERVOIR_INFO[slug] || {};
            res.json({
                success: true,
                data: {
                    name: reservoirInfo.name || RESERVOIR_NAMES[slug] || slug,
                    slug: slug,
                    coordinates: reservoirInfo.coordinates || null,
                    location: reservoirInfo.location || null,
                    date: date,
                    records: data,
                    count: data.length
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Lỗi khi lấy dữ liệu theo ngày:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy dữ liệu theo ngày',
                error: error.message
            });
        }
    }

    /**
     * Lấy dữ liệu của một hồ trong khoảng thời gian
     * GET /api/thuydien/:slug/range?start=YYYY-MM-DD&end=YYYY-MM-DD
     */
    getDataByRange(req, res) {
        try {
            const { slug } = req.params;
            const { start, end } = req.query;
            
            // Validate slug
            if (!["song_hinh", "song_ba_ha"].includes(slug)) {
                return res.status(400).json({
                    success: false,
                    message: 'Slug không hợp lệ. Chỉ hỗ trợ: song_hinh, song_ba_ha'
                });
            }

            if (!start || !end) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu tham số start hoặc end. Format: YYYY-MM-DD'
                });
            }

            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(start) || !dateRegex.test(end)) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng ngày không hợp lệ. Sử dụng YYYY-MM-DD'
                });
            }

            const [startYear, startMonth, startDay] = start.split('-').map(Number);
            const [endYear, endMonth, endDay] = end.split('-').map(Number);
            
            const startDate = new Date(startYear, startMonth - 1, startDay);
            const endDate = new Date(endYear, endMonth - 1, endDay);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày không hợp lệ'
                });
            }

            if (startDate > endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc'
                });
            }

            const data = thuydienDataService.getDataByDateRange(slug, startDate, endDate);
            const reservoirInfo = RESERVOIR_INFO[slug] || {};

            res.json({
                success: true,
                data: {
                    name: reservoirInfo.name || RESERVOIR_NAMES[slug] || slug,
                    slug: slug,
                    coordinates: reservoirInfo.coordinates || null,
                    location: reservoirInfo.location || null,
                    startDate: start,
                    endDate: end,
                    records: data,
                    count: data.length
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Lỗi khi lấy dữ liệu theo khoảng thời gian:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy dữ liệu theo khoảng thời gian',
                error: error.message
            });
        }
    }

    /**
     * Lấy thông tin tổng quan về một hồ
     * GET /api/thuydien/:slug/info
     */
    getInfo(req, res) {
        try {
            const { slug } = req.params;
            
            // Validate slug
            if (!["song_hinh", "song_ba_ha"].includes(slug)) {
                return res.status(400).json({
                    success: false,
                    message: 'Slug không hợp lệ. Chỉ hỗ trợ: song_hinh, song_ba_ha'
                });
            }

            const info = thuydienDataService.getReservoirInfo(slug);
            const reservoirInfo = RESERVOIR_INFO[slug] || {};

            res.json({
                success: true,
                data: {
                    ...info,
                    name: reservoirInfo.name || RESERVOIR_NAMES[slug] || slug,
                    coordinates: reservoirInfo.coordinates || null,
                    location: reservoirInfo.location || null
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Lỗi khi lấy thông tin hồ:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin hồ',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh sách tất cả các hồ và thông tin tổng quan
     * GET /api/thuydien
     */
    getAll(req, res) {
        try {
            const reservoirs = ["song_hinh", "song_ba_ha"];
            const result = reservoirs.map(slug => {
                const info = thuydienDataService.getReservoirInfo(slug);
                const reservoirInfo = RESERVOIR_INFO[slug] || {};
                return {
                    ...info,
                    name: reservoirInfo.name || RESERVOIR_NAMES[slug] || slug,
                    coordinates: reservoirInfo.coordinates || null,
                    location: reservoirInfo.location || null
                };
            });

            res.json({
                success: true,
                data: result,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Lỗi khi lấy danh sách hồ:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách hồ',
                error: error.message
            });
        }
    }
}

export default new ThuydienController();

