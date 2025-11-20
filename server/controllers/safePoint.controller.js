import SafePoint from '../models/SafePoint.model.js';
import mongoose from 'mongoose';
import { parsePhoneNumbers, getFirstPhoneNumber } from '../utils/phoneParser.js';
import logger from '../utils/logger.js';

/**
 * Controller xử lý điểm trú ẩn / đội cứu hộ
 */
class SafePointController {
    /**
     * Lấy danh sách điểm trú ẩn / đội cứu hộ
     * GET /api/safe-points?status=Hoạt động&type=Điểm trú ẩn&search=...
     */
    async getAll(req, res) {
        try {
            // Kiểm tra MongoDB connection
            if (mongoose.connection.readyState !== 1) {
                console.error('❌ MongoDB không kết nối! ReadyState:', mongoose.connection.readyState);
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database',
                    error: 'MongoDB connection not ready'
                });
            }

            // Filter & Search
            const query = {};
            if (req.query.status) query.status = req.query.status;
            if (req.query.type) query.type = req.query.type;
            if (req.query.search) {
                query.$or = [
                    { name: { $regex: req.query.search, $options: 'i' } },
                    { address: { $regex: req.query.search, $options: 'i' } },
                    { phone: { $regex: req.query.search, $options: 'i' } }
                ];
            }

            const safePoints = await SafePoint.find(query)
                .sort({ createdAt: -1 })
                .lean();

            res.json({
                success: true,
                data: safePoints,
                count: safePoints.length
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy danh sách điểm trú ẩn:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách điểm trú ẩn',
                error: error.message
            });
        }
    }

    /**
     * Lấy thông tin một điểm trú ẩn theo ID
     * GET /api/safe-points/:id
     */
    async getById(req, res) {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database'
                });
            }

            const safePoint = await SafePoint.findById(req.params.id).lean();

            if (!safePoint) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy điểm trú ẩn'
                });
            }

            res.json({
                success: true,
                data: safePoint
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy thông tin điểm trú ẩn:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin điểm trú ẩn',
                error: error.message
            });
        }
    }

    /**
     * Tạo điểm trú ẩn / đội cứu hộ mới
     * POST /api/safe-points
     */
    async create(req, res) {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database'
                });
            }

            const { name, lat, lng, address, phone, capacity, description, status, type, rescueType, notes } = req.body;

            // Validation
            if (!name || !lat || !lng || !address) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng điền đầy đủ thông tin: name, lat, lng, address'
                });
            }

            // Validate coordinates
            if (typeof lat !== 'number' || typeof lng !== 'number') {
                return res.status(400).json({
                    success: false,
                    message: 'lat và lng phải là số'
                });
            }

            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return res.status(400).json({
                    success: false,
                    message: 'Tọa độ không hợp lệ'
                });
            }

            // Parse số điện thoại từ description nếu không có phone
            let finalPhone = phone ? phone.trim() : null;
            if (!finalPhone && description) {
                const parsedPhones = parsePhoneNumbers(description);
                if (parsedPhones.length > 0) {
                    finalPhone = parsedPhones[0]; // Lấy số đầu tiên
                    logger.info(`Đã parse số điện thoại từ description: ${finalPhone}`);
                }
            }

            const safePoint = await SafePoint.create({
                name: name.trim(),
                lat,
                lng,
                address: address.trim(),
                phone: finalPhone,
                capacity: capacity || 0,
                description: description ? description.trim() : null,
                status: status || 'Hoạt động',
                type: type || 'Điểm trú ẩn',
                rescueType: rescueType || null,
                notes: notes ? notes.trim() : null
            });

            console.log('✅ Đã tạo điểm trú ẩn mới:', safePoint._id.toString());

            res.status(201).json({
                success: true,
                message: 'Đã tạo điểm trú ẩn thành công',
                data: safePoint
            });
        } catch (error) {
            console.error('❌ Lỗi khi tạo điểm trú ẩn:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo điểm trú ẩn',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật điểm trú ẩn / đội cứu hộ
     * PUT /api/safe-points/:id
     */
    async update(req, res) {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database'
                });
            }

            const { name, lat, lng, address, phone, capacity, description, status, type, notes } = req.body;

            // Validate coordinates nếu có
            if (lat !== undefined && (typeof lat !== 'number' || lat < -90 || lat > 90)) {
                return res.status(400).json({
                    success: false,
                    message: 'lat không hợp lệ'
                });
            }

            if (lng !== undefined && (typeof lng !== 'number' || lng < -180 || lng > 180)) {
                return res.status(400).json({
                    success: false,
                    message: 'lng không hợp lệ'
                });
            }

            const updateData = {};
            if (name !== undefined) updateData.name = name.trim();
            if (lat !== undefined) updateData.lat = lat;
            if (lng !== undefined) updateData.lng = lng;
            if (address !== undefined) updateData.address = address.trim();
            if (phone !== undefined) updateData.phone = phone ? phone.trim() : null;
            if (capacity !== undefined) updateData.capacity = capacity;
            if (description !== undefined) updateData.description = description ? description.trim() : null;
            if (status !== undefined) updateData.status = status;
            if (type !== undefined) updateData.type = type;
            if (notes !== undefined) updateData.notes = notes ? notes.trim() : null;

            const safePoint = await SafePoint.findByIdAndUpdate(
                req.params.id,
                { $set: updateData },
                { new: true, runValidators: true }
            ).lean();

            if (!safePoint) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy điểm trú ẩn'
                });
            }

            console.log('✅ Đã cập nhật điểm trú ẩn:', req.params.id);

            res.json({
                success: true,
                message: 'Đã cập nhật điểm trú ẩn thành công',
                data: safePoint
            });
        } catch (error) {
            console.error('❌ Lỗi khi cập nhật điểm trú ẩn:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật điểm trú ẩn',
                error: error.message
            });
        }
    }

    /**
     * Xóa điểm trú ẩn / đội cứu hộ
     * DELETE /api/safe-points/:id
     */
    async delete(req, res) {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database'
                });
            }

            const safePoint = await SafePoint.findByIdAndDelete(req.params.id);

            if (!safePoint) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy điểm trú ẩn'
                });
            }

            console.log('✅ Đã xóa điểm trú ẩn:', req.params.id);

            res.json({
                success: true,
                message: 'Đã xóa điểm trú ẩn thành công'
            });
        } catch (error) {
            console.error('❌ Lỗi khi xóa điểm trú ẩn:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa điểm trú ẩn',
                error: error.message
            });
        }
    }
}

export default new SafePointController();
