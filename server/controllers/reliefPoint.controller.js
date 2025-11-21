import ReliefPoint from '../models/ReliefPoint.model.js';
import mongoose from 'mongoose';
import { parsePhoneNumbers, getFirstPhoneNumber } from '../utils/phoneParser.js';
import logger from '../utils/logger.js';
import { parseGoogleMapsCoords } from '../utils/googleMapsParser.js';

/**
 * Controller xử lý điểm tiếp nhận cứu trợ
 */
class ReliefPointController {
    /**
     * Lấy danh sách điểm tiếp nhận cứu trợ
     * GET /api/relief-points?status=Hoạt động&type=Điểm tiếp nhận cứu trợ&search=...
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
            if (req.query.reliefType) query.reliefType = req.query.reliefType;
            if (req.query.search) {
                query.$or = [
                    { name: { $regex: req.query.search, $options: 'i' } },
                    { address: { $regex: req.query.search, $options: 'i' } },
                    { phone: { $regex: req.query.search, $options: 'i' } },
                    { contactPerson: { $regex: req.query.search, $options: 'i' } }
                ];
            }

            // Pagination
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 100;
            const skip = (page - 1) * limit;

            const total = await ReliefPoint.countDocuments(query);

            const reliefPoints = await ReliefPoint.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            res.json({
                success: true,
                data: reliefPoints,
                count: reliefPoints.length,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            logger.error('Lỗi khi lấy danh sách điểm tiếp nhận cứu trợ:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách điểm tiếp nhận cứu trợ',
                error: error.message
            });
        }
    }

    /**
     * Lấy thông tin một điểm tiếp nhận cứu trợ theo ID
     * GET /api/relief-points/:id
     */
    async getById(req, res) {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database'
                });
            }

            const reliefPoint = await ReliefPoint.findById(req.params.id).lean();

            if (!reliefPoint) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy điểm tiếp nhận cứu trợ'
                });
            }

            res.json({
                success: true,
                data: reliefPoint
            });
        } catch (error) {
            logger.error('Lỗi khi lấy thông tin điểm tiếp nhận cứu trợ:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin điểm tiếp nhận cứu trợ',
                error: error.message
            });
        }
    }

    /**
     * Tạo điểm tiếp nhận cứu trợ mới
     * POST /api/relief-points
     */
    async create(req, res) {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database'
                });
            }

            const {
                name,
                lat,
                lng,
                address,
                phone,
                capacity,
                currentOccupancy,
                description,
                status,
                type,
                reliefType,
                operatingHours,
                contactPerson,
                notes,
                googleMapsUrl,
                location // {lat, lng} từ location picker
            } = req.body;

            // Validation
            if (!name || !address) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng điền đầy đủ thông tin: name, address'
                });
            }

            // Lấy tọa độ từ Google Maps URL hoặc location picker hoặc lat/lng trực tiếp
            let finalLat = lat;
            let finalLng = lng;

            if (googleMapsUrl) {
                const coords = parseGoogleMapsCoords(googleMapsUrl, { outputFormat: 'object' });
                if (coords) {
                    finalLat = coords.lat;
                    finalLng = coords.lng;
                } else {
                    return res.status(400).json({
                        success: false,
                        message: 'Không thể parse tọa độ từ Google Maps URL. Vui lòng kiểm tra lại link.'
                    });
                }
            } else if (location && location.lat && location.lng) {
                finalLat = location.lat;
                finalLng = location.lng;
            }

            // Validate coordinates
            if (!finalLat || !finalLng) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp tọa độ (Google Maps URL hoặc chọn trên bản đồ)'
                });
            }

            if (typeof finalLat !== 'number' || typeof finalLng !== 'number') {
                return res.status(400).json({
                    success: false,
                    message: 'Tọa độ không hợp lệ'
                });
            }

            if (finalLat < -90 || finalLat > 90 || finalLng < -180 || finalLng > 180) {
                return res.status(400).json({
                    success: false,
                    message: 'Tọa độ không hợp lệ'
                });
            }

            // Validate reliefType - phải là array
            let finalReliefType = reliefType;
            if (!Array.isArray(finalReliefType) || finalReliefType.length === 0) {
                finalReliefType = ['Hỗn hợp'];
            }

            // Validate capacity và currentOccupancy (optional)
            if (currentOccupancy !== undefined && capacity !== undefined && capacity !== null) {
                if (currentOccupancy > capacity) {
                    return res.status(400).json({
                        success: false,
                        message: 'Số người hiện tại không thể vượt quá sức chứa'
                    });
                }
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

            // Tự động cập nhật status nếu đầy
            let finalStatus = status || 'Hoạt động';
            if (capacity !== null && capacity !== undefined && capacity > 0 &&
                currentOccupancy !== null && currentOccupancy !== undefined &&
                currentOccupancy >= capacity) {
                finalStatus = 'Đầy';
            }

            const reliefPoint = await ReliefPoint.create({
                name: name.trim(),
                lat: finalLat,
                lng: finalLng,
                address: address.trim(),
                phone: finalPhone,
                capacity: capacity !== undefined && capacity !== null ? capacity : null,
                currentOccupancy: currentOccupancy !== undefined && currentOccupancy !== null ? currentOccupancy : null,
                description: description ? description.trim() : null,
                status: finalStatus,
                type: type ? type.trim() : 'Điểm tiếp nhận cứu trợ',
                reliefType: finalReliefType,
                operatingHours: operatingHours ? operatingHours.trim() : null,
                contactPerson: contactPerson ? contactPerson.trim() : null,
                notes: notes ? notes.trim() : null
            });

            console.log('✅ Đã tạo điểm tiếp nhận cứu trợ mới:', reliefPoint._id.toString());

            res.status(201).json({
                success: true,
                message: 'Đã tạo điểm tiếp nhận cứu trợ thành công',
                data: reliefPoint
            });
        } catch (error) {
            logger.error('Lỗi khi tạo điểm tiếp nhận cứu trợ:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo điểm tiếp nhận cứu trợ',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật điểm tiếp nhận cứu trợ
     * PUT /api/relief-points/:id
     */
    async update(req, res) {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database'
                });
            }

            const {
                name,
                lat,
                lng,
                address,
                phone,
                capacity,
                currentOccupancy,
                description,
                status,
                type,
                reliefType,
                operatingHours,
                contactPerson,
                notes,
                googleMapsUrl,
                location
            } = req.body;

            const existingPoint = await ReliefPoint.findById(req.params.id);
            if (!existingPoint) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy điểm tiếp nhận cứu trợ'
                });
            }

            // Lấy tọa độ từ Google Maps URL hoặc location picker hoặc lat/lng trực tiếp
            let finalLat = lat;
            let finalLng = lng;

            if (googleMapsUrl) {
                const coords = parseGoogleMapsCoords(googleMapsUrl, { outputFormat: 'object' });
                if (coords) {
                    finalLat = coords.lat;
                    finalLng = coords.lng;
                } else {
                    return res.status(400).json({
                        success: false,
                        message: 'Không thể parse tọa độ từ Google Maps URL. Vui lòng kiểm tra lại link.'
                    });
                }
            } else if (location && location.lat && location.lng) {
                finalLat = location.lat;
                finalLng = location.lng;
            } else if (lat === undefined && lng === undefined) {
                // Giữ nguyên tọa độ cũ nếu không có thay đổi
                finalLat = existingPoint.lat;
                finalLng = existingPoint.lng;
            }

            // Validate coordinates nếu có thay đổi
            if (finalLat !== undefined && (typeof finalLat !== 'number' || finalLat < -90 || finalLat > 90)) {
                return res.status(400).json({
                    success: false,
                    message: 'lat không hợp lệ'
                });
            }

            if (finalLng !== undefined && (typeof finalLng !== 'number' || finalLng < -180 || finalLng > 180)) {
                return res.status(400).json({
                    success: false,
                    message: 'lng không hợp lệ'
                });
            }

            // Validate reliefType - phải là array
            let finalReliefType = reliefType;
            if (reliefType !== undefined) {
                if (!Array.isArray(finalReliefType) || finalReliefType.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'reliefType phải là mảng và có ít nhất một phần tử'
                    });
                }
            }

            // Validate capacity và currentOccupancy (optional)
            const finalCapacity = capacity !== undefined ? (capacity !== null ? capacity : null) : existingPoint.capacity;
            const finalOccupancy = currentOccupancy !== undefined ? (currentOccupancy !== null ? currentOccupancy : null) : existingPoint.currentOccupancy;

            if (finalOccupancy !== null && finalCapacity !== null && finalOccupancy > finalCapacity) {
                return res.status(400).json({
                    success: false,
                    message: 'Số người hiện tại không thể vượt quá sức chứa'
                });
            }

            const updateData = {};
            if (name !== undefined) updateData.name = name.trim();
            if (finalLat !== undefined) updateData.lat = finalLat;
            if (finalLng !== undefined) updateData.lng = finalLng;
            if (address !== undefined) updateData.address = address.trim();
            if (phone !== undefined) updateData.phone = phone ? phone.trim() : null;
            if (capacity !== undefined) updateData.capacity = capacity !== null ? capacity : null;
            if (currentOccupancy !== undefined) updateData.currentOccupancy = currentOccupancy !== null ? currentOccupancy : null;
            if (description !== undefined) updateData.description = description ? description.trim() : null;
            if (type !== undefined) updateData.type = type.trim();
            if (finalReliefType !== undefined) updateData.reliefType = finalReliefType;
            if (operatingHours !== undefined) updateData.operatingHours = operatingHours ? operatingHours.trim() : null;
            if (contactPerson !== undefined) updateData.contactPerson = contactPerson ? contactPerson.trim() : null;
            if (notes !== undefined) updateData.notes = notes ? notes.trim() : null;

            // Tự động cập nhật status nếu đầy
            if (finalOccupancy !== null && finalCapacity !== null && finalOccupancy >= finalCapacity && finalCapacity > 0) {
                updateData.status = 'Đầy';
            } else if (status !== undefined) {
                updateData.status = status;
            }

            const reliefPoint = await ReliefPoint.findByIdAndUpdate(
                req.params.id,
                { $set: updateData },
                { new: true, runValidators: true }
            ).lean();

            if (!reliefPoint) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy điểm tiếp nhận cứu trợ'
                });
            }

            console.log('✅ Đã cập nhật điểm tiếp nhận cứu trợ:', req.params.id);

            res.json({
                success: true,
                message: 'Đã cập nhật điểm tiếp nhận cứu trợ thành công',
                data: reliefPoint
            });
        } catch (error) {
            logger.error('Lỗi khi cập nhật điểm tiếp nhận cứu trợ:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật điểm tiếp nhận cứu trợ',
                error: error.message
            });
        }
    }

    /**
     * Xóa điểm tiếp nhận cứu trợ
     * DELETE /api/relief-points/:id
     */
    async delete(req, res) {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database'
                });
            }

            const reliefPoint = await ReliefPoint.findByIdAndDelete(req.params.id);

            if (!reliefPoint) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy điểm tiếp nhận cứu trợ'
                });
            }

            console.log('✅ Đã xóa điểm tiếp nhận cứu trợ:', req.params.id);

            res.json({
                success: true,
                message: 'Đã xóa điểm tiếp nhận cứu trợ thành công'
            });
        } catch (error) {
            logger.error('Lỗi khi xóa điểm tiếp nhận cứu trợ:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa điểm tiếp nhận cứu trợ',
                error: error.message
            });
        }
    }

    /**
     * Lấy thống kê điểm tiếp nhận cứu trợ
     * GET /api/relief-points/admin/stats
     */
    async getStats(req, res) {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database'
                });
            }

            const total = await ReliefPoint.countDocuments();
            const active = await ReliefPoint.countDocuments({ status: 'Hoạt động' });
            const full = await ReliefPoint.countDocuments({ status: 'Đầy' });
            const paused = await ReliefPoint.countDocuments({ status: 'Tạm ngưng' });
            const closed = await ReliefPoint.countDocuments({ status: 'Đã đóng' });

            // Tổng sức chứa và số người hiện tại
            const points = await ReliefPoint.find({}).lean();
            const totalCapacity = points.reduce((sum, p) => sum + (p.capacity || 0), 0);
            const totalOccupancy = points.reduce((sum, p) => sum + (p.currentOccupancy || 0), 0);

            res.json({
                success: true,
                data: {
                    total,
                    active,
                    full,
                    paused,
                    closed,
                    totalCapacity,
                    totalOccupancy,
                    availableCapacity: totalCapacity - totalOccupancy
                }
            });
        } catch (error) {
            logger.error('Lỗi khi lấy thống kê điểm tiếp nhận cứu trợ:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê điểm tiếp nhận cứu trợ',
                error: error.message
            });
        }
    }
}

export default new ReliefPointController();

