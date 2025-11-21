import SupportRequest from '../models/SupportRequest.model.js';
import { saveBase64Image } from '../config/upload.config.js';
import duplicateCheckService from '../services/duplicateCheck.service.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { parseGoogleMapsCoords } from '../utils/googleMapsParser.js';

/**
 * Controller xử lý yêu cầu hỗ trợ
 */
class SupportRequestController {
    /**
     * Tạo yêu cầu hỗ trợ mới
     * POST /api/support-requests
     */
    async create(req, res) {
        try {
            const { location, description, imageBase64, phone, name, googleMapsUrl, needs, peopleCount } = req.body;

            // Validate
            if (!description || description.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng nhập mô tả nhu cầu hỗ trợ'
                });
            }

            if (!needs || !Array.isArray(needs) || needs.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng chọn ít nhất một loại hỗ trợ cần thiết'
                });
            }

            // Parse tọa độ từ Google Maps URL trước (nếu có)
            let coordsForDuplicateCheck = null;
            if (googleMapsUrl && typeof googleMapsUrl === 'string' && googleMapsUrl.trim()) {
                const parsedCoords = parseGoogleMapsCoords(googleMapsUrl.trim());
                if (parsedCoords) {
                    coordsForDuplicateCheck = parsedCoords; // [lng, lat]
                }
            }
            // Nếu không có từ Google Maps, dùng location
            if (!coordsForDuplicateCheck && location && location.lat && location.lng) {
                coordsForDuplicateCheck = [location.lng, location.lat];
            }

            // Check duplicate (tương tự Report)
            const duplicateCheckData = {
                rawText: description.trim(),
                description: description.trim(),
                contact: phone || null,
                contactFull: phone || null,
                coords: coordsForDuplicateCheck,
                facebookUrl: null,
                location: null
            };

            console.log('🔍 Đang kiểm tra trùng lặp cho support request...');
            const duplicateResult = await duplicateCheckService.checkDuplicate(duplicateCheckData);

            if (duplicateResult.isDuplicate) {
                console.log('⚠️  Phát hiện support request trùng lặp!');
                return res.status(400).json({
                    success: false,
                    message: `Yêu cầu này trùng lặp với ${duplicateResult.duplicates.length} yêu cầu đã có (${Math.round(duplicateResult.maxSimilarity * 100)}% giống nhau). Vui lòng kiểm tra lại!`,
                    isDuplicate: true,
                    maxSimilarity: duplicateResult.maxSimilarity,
                    duplicates: duplicateResult.duplicates
                });
            }

            // Lưu hình ảnh local (nếu có)
            let imagePath = null;
            if (imageBase64) {
                try {
                    if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
                        console.warn('⚠️  Base64 string không hợp lệ hoặc quá ngắn');
                    } else {
                        console.log('💾 Đang lưu hình ảnh yêu cầu hỗ trợ...');
                        imagePath = saveBase64Image(imageBase64, 'support-requests');
                        console.log('✅ Lưu thành công:', imagePath);
                    }
                } catch (uploadError) {
                    logger.error('Lỗi lưu hình ảnh yêu cầu hỗ trợ', uploadError, req);
                }
            }

            // Xử lý location: Ưu tiên parse từ Google Maps URL
            let finalLocation = { lat: null, lng: null };

            if (googleMapsUrl && typeof googleMapsUrl === 'string' && googleMapsUrl.trim()) {
                const parsedCoords = parseGoogleMapsCoords(googleMapsUrl.trim());
                if (parsedCoords) {
                    finalLocation = { lat: parsedCoords[1], lng: parsedCoords[0] };
                    console.log(`📍 Đã parse tọa độ từ Google Maps link: [${finalLocation.lng}, ${finalLocation.lat}]`);
                }
            }

            // Nếu không có từ Google Maps, dùng location đã chọn
            if ((!finalLocation.lat || !finalLocation.lng) && location && location.lat && location.lng) {
                finalLocation = location;
            }

            const newSupportRequestData = {
                name: name || '',
                phone: phone || '',
                location: finalLocation,
                needs: needs || [],
                description: description.trim(),
                peopleCount: peopleCount || 1,
                imagePath: imagePath,
                status: 'Chưa xử lý'
            };

            // Validate dữ liệu trước khi lưu
            console.log('📝 Dữ liệu trước khi lưu:', JSON.stringify(newSupportRequestData, null, 2));

            // Kiểm tra MongoDB connection
            if (mongoose.connection.readyState !== 1) {
                console.error('❌ MongoDB không kết nối! ReadyState:', mongoose.connection.readyState);
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database',
                    error: 'MongoDB connection not ready'
                });
            }

            let newSupportRequest;
            try {
                newSupportRequest = await SupportRequest.create(newSupportRequestData);
                console.log('✅ Đã lưu vào MongoDB thành công!');
                console.log('✅ SupportRequest ID:', newSupportRequest._id.toString());

                // Verify lại
                const verifyRequest = await SupportRequest.findById(newSupportRequest._id);
                if (verifyRequest) {
                    console.log('✅ Đã verify: SupportRequest tồn tại trong database');
                } else {
                    console.error('❌ CẢNH BÁO: SupportRequest không tìm thấy sau khi create!');
                }
            } catch (dbError) {
                logger.error('Lỗi khi lưu vào MongoDB', dbError, req);
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi khi lưu yêu cầu hỗ trợ vào database',
                    error: dbError.message
                });
            }

            // Log để theo dõi
            console.log('=== YÊU CẦU HỖ TRỢ MỚI ===');
            console.log('ID:', newSupportRequest._id);
            console.log('Tên:', newSupportRequest.name || 'Không có');
            console.log('SĐT:', newSupportRequest.phone || 'Không có');
            console.log('Nhu cầu:', newSupportRequest.needs.join(', '));
            console.log('Số người:', newSupportRequest.peopleCount);
            console.log('Vị trí:', newSupportRequest.location);
            console.log('Mô tả:', newSupportRequest.description);
            console.log('Created At:', newSupportRequest.createdAt);
            console.log('============================');

            res.json({
                success: true,
                message: 'Đã nhận yêu cầu hỗ trợ',
                data: newSupportRequest
            });
        } catch (error) {
            logger.error('Lỗi tạo support request', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo yêu cầu hỗ trợ',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh sách yêu cầu hỗ trợ (có pagination, filter, search)
     * GET /api/support-requests?page=1&limit=20&status=Chưa+xử+lý&search=Phú+Yên
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

            const { page = 1, limit = 20, status, search } = req.query;
            const query = {};

            // Filter theo status
            if (status) {
                query.status = status;
            }

            // Search theo name, phone, description, needs
            if (search && search.trim()) {
                const searchRegex = new RegExp(search.trim(), 'i');
                query.$or = [
                    { name: searchRegex },
                    { phone: searchRegex },
                    { description: searchRegex },
                    { needs: { $in: [searchRegex] } }
                ];
            }

            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const skip = (pageNum - 1) * limitNum;

            // Lấy tổng số documents
            const total = await SupportRequest.countDocuments(query);
            const pages = Math.ceil(total / limitNum);

            // Lấy data với pagination
            const allRequests = await SupportRequest.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean();

            console.log(`✅ Đã lấy ${allRequests.length} support requests từ database (trang ${pageNum}/${pages})`);

            res.json({
                success: true,
                data: allRequests,
                count: allRequests.length,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages
                }
            });
        } catch (error) {
            logger.error('Lỗi khi lấy danh sách yêu cầu hỗ trợ', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách yêu cầu hỗ trợ',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật status của support request
     * PUT /api/support-requests/:id/status
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, assignedTo, notes } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'ID không hợp lệ'
                });
            }

            const request = await SupportRequest.findById(id);
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy yêu cầu hỗ trợ'
                });
            }

            const updateData = { status };
            if (assignedTo) updateData.assignedTo = assignedTo;
            if (notes !== undefined) updateData.notes = notes;
            if (status === 'Đã hỗ trợ') {
                updateData.processedAt = new Date();
            }

            const updatedRequest = await SupportRequest.findByIdAndUpdate(
                id,
                updateData,
                { new: true }
            );

            console.log(`✅ Cập nhật status cho SupportRequest: ${id} → ${status}`);

            res.json({
                success: true,
                message: 'Đã cập nhật status',
                data: updatedRequest
            });
        } catch (error) {
            logger.error('Lỗi khi cập nhật status', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật status',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật toàn bộ thông tin của support request (Admin only)
     * PUT /api/support-requests/:id
     */
    async update(req, res) {
        try {
            const { id } = req.params;
            const {
                name,
                phone,
                location,
                needs,
                description,
                peopleCount,
                imageBase64,
                status,
                notes
            } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'ID không hợp lệ'
                });
            }

            const request = await SupportRequest.findById(id);
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy yêu cầu hỗ trợ'
                });
            }

            const updateData = {};
            if (name !== undefined) updateData.name = name;
            if (phone !== undefined) updateData.phone = phone;
            if (location !== undefined) updateData.location = location;
            if (needs !== undefined) updateData.needs = needs;
            if (description !== undefined) updateData.description = description.trim();
            if (peopleCount !== undefined) updateData.peopleCount = peopleCount;
            if (status !== undefined) updateData.status = status;
            if (notes !== undefined) updateData.notes = notes;

            // Xử lý ảnh mới nếu có
            if (imageBase64) {
                try {
                    // Xóa ảnh cũ nếu có
                    if (request.imagePath) {
                        const { deleteImage } = await import('../config/upload.config.js');
                        deleteImage(request.imagePath);
                    }
                    // Lưu ảnh mới
                    updateData.imagePath = saveBase64Image(imageBase64, 'support-requests');
                } catch (uploadError) {
                    logger.error('Lỗi lưu hình ảnh', uploadError, req);
                }
            }

            const updatedRequest = await SupportRequest.findByIdAndUpdate(
                id,
                updateData,
                { new: true }
            );

            console.log(`✅ Cập nhật SupportRequest: ${id}`);

            res.json({
                success: true,
                message: 'Đã cập nhật yêu cầu hỗ trợ',
                data: updatedRequest
            });
        } catch (error) {
            logger.error('Lỗi khi cập nhật support request', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật yêu cầu hỗ trợ',
                error: error.message
            });
        }
    }

    /**
     * Xóa support request (Admin only)
     * DELETE /api/support-requests/:id
     */
    async delete(req, res) {
        try {
            const { id } = req.params;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'ID không hợp lệ'
                });
            }

            const request = await SupportRequest.findById(id);
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy yêu cầu hỗ trợ'
                });
            }

            // Xóa hình ảnh nếu có
            if (request.imagePath) {
                try {
                    const { deleteImage } = await import('../config/upload.config.js');
                    deleteImage(request.imagePath);
                } catch (imgError) {
                    console.warn('⚠️  Không thể xóa hình ảnh:', imgError);
                }
            }

            await SupportRequest.findByIdAndDelete(id);

            console.log(`✅ Đã xóa SupportRequest: ${id}`);

            res.json({
                success: true,
                message: 'Đã xóa yêu cầu hỗ trợ thành công',
                data: { id }
            });
        } catch (error) {
            logger.error('Lỗi khi xóa support request', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa yêu cầu hỗ trợ',
                error: error.message
            });
        }
    }

    /**
     * Lấy thống kê support requests
     * GET /api/support-requests/admin/stats
     */
    async getStats(req, res) {
        try {
            const [
                total,
                byStatus,
                last24h
            ] = await Promise.all([
                // Tổng số
                SupportRequest.countDocuments(),
                // Group by status
                SupportRequest.aggregate([
                    { $group: { _id: '$status', count: { $sum: 1 } } }
                ]),
                // Trong 24h gần đây
                SupportRequest.countDocuments({
                    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                })
            ]);

            // Convert status aggregation
            const byStatusObj = byStatus.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {});

            res.json({
                success: true,
                data: {
                    total,
                    byStatus: byStatusObj,
                    last24h
                }
            });
        } catch (error) {
            logger.error('Lỗi khi lấy thống kê', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê',
                error: error.message
            });
        }
    }
}

// Export cả class và instance
export { SupportRequestController };
export default new SupportRequestController();

