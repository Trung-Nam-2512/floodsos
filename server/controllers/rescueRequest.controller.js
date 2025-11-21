import RescueRequest from '../models/RescueRequest.model.js';
import Report from '../models/Report.model.js';
import aiService from '../services/ai.service.js';
import duplicateCheckService from '../services/duplicateCheck.service.js';
import { saveBase64Image } from '../config/upload.config.js';
import logger from '../utils/logger.js';
import { parseGoogleMapsCoords as parseCoords } from '../utils/googleMapsParser.js';

/**
 * Controller xử lý yêu cầu cứu hộ (AI-powered)
 */
class RescueRequestController {
    /**
     * Tạo yêu cầu cứu hộ mới bằng AI
     * POST /api/ai-report
     */
    async createWithAI(req, res) {
        try {
            const { rawText, imageBase64, facebookUrl, googleMapsUrl, coords } = req.body;

            // Validate input
            if ((!rawText || rawText.trim().length === 0) && (!facebookUrl || facebookUrl.trim().length === 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng nhập nội dung cầu cứu hoặc link Facebook'
                });
            }

            // Validate: Phải có rawText
            if (!rawText || rawText.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng nhập nội dung cầu cứu!'
                });
            }

            const finalText = rawText.trim();

            // Lưu hình ảnh local (nếu có)
            let imagePath = null;
            if (imageBase64) {
                try {
                    // Validate base64 string
                    if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
                        console.warn('⚠️  Base64 string không hợp lệ hoặc quá ngắn');
                        console.warn('   Type:', typeof imageBase64);
                        console.warn('   Length:', imageBase64?.length || 0);
                    } else {
                        console.log('💾 Đang lưu hình ảnh...');
                        console.log('📏 Kích thước base64:', imageBase64.length, 'bytes');
                        console.log('📏 Preview:', imageBase64.substring(0, 50) + '...');
                        imagePath = saveBase64Image(imageBase64);
                        console.log('✅ Lưu thành công:', imagePath);
                    }
                } catch (uploadError) {
                    logger.error('Lỗi lưu hình ảnh', uploadError, req);
                    // Không fail request nếu lưu ảnh lỗi
                }
            } else {
                console.log('ℹ️  Không có hình ảnh trong request');
                console.log('   imageBase64 value:', imageBase64);
            }

            // Xử lý bằng AI (CHỈ parse text, KHÔNG geocode - tọa độ sẽ lấy từ Google Maps link)
            console.log('Đang xử lý bằng AI...');
            const parsedData = await aiService.processRescueRequest(finalText, null, facebookUrl);

            // Log parsed data để debug
            console.log('📋 Parsed data từ AI:', {
                location: parsedData.location,
                urgency: parsedData.urgency
            });

            // Ưu tiên parse tọa độ từ Google Maps URL nếu có
            let finalCoords = [null, null];

            // Parse từ googleMapsUrl nếu có (ưu tiên cao nhất)
            if (googleMapsUrl && typeof googleMapsUrl === 'string' && googleMapsUrl.trim()) {
                const parsedCoords = this.parseGoogleMapsCoords(googleMapsUrl.trim());
                if (parsedCoords && parsedCoords[0] !== null && parsedCoords[1] !== null) {
                    finalCoords = parsedCoords;
                    console.log('✅ Đã parse tọa độ từ Google Maps URL:', finalCoords);
                } else {
                    console.log('⚠️  Không thể parse tọa độ từ Google Maps URL:', googleMapsUrl);
                }
            }

            // Nếu không có từ Google Maps URL, dùng tọa độ từ coords
            if (finalCoords[0] === null || finalCoords[1] === null) {
                if (coords && Array.isArray(coords) && coords.length === 2 &&
                    coords[0] !== null && coords[1] !== null &&
                    !isNaN(coords[0]) && !isNaN(coords[1])) {
                    finalCoords = coords;
                    console.log('✅ Sử dụng tọa độ từ coords:', finalCoords);
                } else {
                    console.log('⚠️  Không có tọa độ. User cần cập nhật thủ công trên bản đồ.');
                }
            }

            // Tạo request mới và lưu vào database
            const newRequestData = {
                ...parsedData,
                coords: finalCoords, // Dùng tọa độ từ Google Maps nếu có, nếu không thì dùng từ AI
                imagePath: imagePath,
                rawText: finalText,
                facebookUrl: facebookUrl || null, // Link Facebook (chỉ để xem bài gốc)
                googleMapsUrl: googleMapsUrl || null, // Link Google Maps (để xem lại vị trí)
                fullDetails: {
                    originalText: rawText || '',
                    facebookUrl: facebookUrl || null,
                    googleMapsUrl: googleMapsUrl || null,
                    timestamp: new Date().toISOString()
                }
            };

            // Check duplicate trước khi lưu
            console.log('🔍 Đang kiểm tra trùng lặp...');
            const duplicateCheck = await duplicateCheckService.checkDuplicate(newRequestData);

            if (duplicateCheck.isDuplicate) {
                console.log('⚠️  Phát hiện request trùng lặp!');
                console.log(`   Similarity: ${duplicateCheck.maxSimilarity * 100}%`);
                console.log(`   Số lượng duplicate: ${duplicateCheck.duplicates.length}`);
            }

            console.log(' Đang lưu vào database với coords:', newRequestData.coords);
            const newRequest = await RescueRequest.create(newRequestData);
            console.log(' Đã lưu thành công! Coords trong DB:', newRequest.coords);

            // Log để xử lý khẩn cấp
            logRescueRequest(newRequest.toObject());

            res.json({
                success: true,
                message: duplicateCheck.isDuplicate
                    ? 'Đã xử lý cầu cứu thành công! (Có thể trùng lặp với request trước đó)'
                    : 'Đã xử lý cầu cứu thành công!',
                data: newRequest,
                duplicateCheck: {
                    isDuplicate: duplicateCheck.isDuplicate,
                    maxSimilarity: duplicateCheck.maxSimilarity,
                    duplicates: duplicateCheck.duplicates,
                    warning: duplicateCheck.isDuplicate
                        ? `Phát hiện ${duplicateCheck.duplicates.length} request tương tự (${Math.round(duplicateCheck.maxSimilarity * 100)}% giống nhau). Vui lòng kiểm tra lại.`
                        : null
                }
            });

        } catch (error) {
            logger.error('Lỗi xử lý AI report', error, req);

            // Fallback: vẫn lưu request nhưng cần xác minh thủ công
            const fallbackData = aiService.createFallbackData(req.body.rawText || '');

            // Lưu hình ảnh (nếu có)
            let imagePath = null;
            if (req.body.imageBase64) {
                try {
                    imagePath = saveBase64Image(req.body.imageBase64);
                } catch (uploadError) {
                    console.error('❌ Lỗi lưu hình ảnh fallback:', uploadError.message);
                }
            }

            const fallbackRequestData = {
                ...fallbackData,
                imagePath: imagePath,
                rawText: req.body.rawText || '',
                facebookUrl: req.body.facebookUrl || null,
                fullDetails: {
                    originalText: req.body.rawText || '',
                    facebookUrl: req.body.facebookUrl || null,
                    timestamp: new Date().toISOString()
                }
            };

            // Check duplicate cho fallback request
            const fallbackDuplicateCheck = await duplicateCheckService.checkDuplicate(fallbackRequestData);

            const fallbackRequest = await RescueRequest.create(fallbackRequestData);

            res.json({
                success: true,
                message: 'Đã lưu cầu cứu (cần xác minh thủ công)',
                data: fallbackRequest,
                duplicateCheck: {
                    isDuplicate: fallbackDuplicateCheck.isDuplicate,
                    maxSimilarity: fallbackDuplicateCheck.maxSimilarity,
                    duplicates: fallbackDuplicateCheck.duplicates,
                    warning: fallbackDuplicateCheck.isDuplicate
                        ? `Phát hiện ${fallbackDuplicateCheck.duplicates.length} request tương tự (${Math.round(fallbackDuplicateCheck.maxSimilarity * 100)}% giống nhau). Vui lòng kiểm tra lại.`
                        : null
                }
            });
        }
    }

    /**
     * Check duplicate trước khi submit (optional - để frontend check)
     * POST /api/rescue-requests/check-duplicate
     */
    async checkDuplicate(req, res) {
        try {
            const { rawText, description, contact, contactFull, coords, facebookUrl, location } = req.body;

            const requestData = {
                rawText,
                description,
                contact,
                contactFull,
                coords,
                facebookUrl,
                location
            };

            const duplicateCheck = await duplicateCheckService.checkDuplicate(requestData);

            res.json({
                success: true,
                ...duplicateCheck,
                warning: duplicateCheck.isDuplicate
                    ? `Phát hiện ${duplicateCheck.duplicates.length} request tương tự (${Math.round(duplicateCheck.maxSimilarity * 100)}% giống nhau). Bạn có chắc muốn tiếp tục?`
                    : null
            });
        } catch (error) {
            logger.error('Lỗi check duplicate', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi kiểm tra trùng lặp',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh sách yêu cầu cứu hộ (có pagination, filter, search)
     * Lấy cả từ RescueRequests (AI) và Reports (Manual) - merge lại
     * GET /api/rescue-requests?page=1&limit=20&urgency=CỰC+KỲ+KHẨN+CẤP&status=Chưa+xử+lý&search=Phú+Yên
     */
    async getAll(req, res) {
        try {
            // Pagination
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;

            // Filter & Search
            const searchText = req.query.search || '';

            // Lấy TẤT CẢ RescueRequests (AI)
            let rescueRequestsQuery = {};
            if (req.query.urgency) rescueRequestsQuery.urgency = req.query.urgency;
            if (req.query.status) rescueRequestsQuery.status = req.query.status;
            if (searchText) {
                // Tìm kiếm trong TẤT CẢ các trường quan trọng
                // Hỗ trợ tìm từng từ trong search text (AND logic)
                const searchWords = searchText.trim().split(/\s+/).filter(word => word.length > 0);

                if (searchWords.length > 1) {
                    // Nếu có nhiều từ, tìm tất cả các từ (AND logic)
                    rescueRequestsQuery.$and = searchWords.map(word => ({
                        $or: [
                            { location: { $regex: word, $options: 'i' } },
                            { description: { $regex: word, $options: 'i' } },
                            { people: { $regex: word, $options: 'i' } },
                            { needs: { $regex: word, $options: 'i' } },
                            { contact: { $regex: word, $options: 'i' } },
                            { contactFull: { $regex: word, $options: 'i' } },
                            { rawText: { $regex: word, $options: 'i' } },
                            { assignedTo: { $regex: word, $options: 'i' } },
                            { notes: { $regex: word, $options: 'i' } }
                        ]
                    }));
                } else {
                    // Nếu chỉ có 1 từ, tìm trong tất cả trường
                    rescueRequestsQuery.$or = [
                        { location: { $regex: searchText, $options: 'i' } },
                        { description: { $regex: searchText, $options: 'i' } },
                        { people: { $regex: searchText, $options: 'i' } },
                        { needs: { $regex: searchText, $options: 'i' } },
                        { contact: { $regex: searchText, $options: 'i' } },
                        { contactFull: { $regex: searchText, $options: 'i' } },
                        { rawText: { $regex: searchText, $options: 'i' } },
                        { assignedTo: { $regex: searchText, $options: 'i' } },
                        { notes: { $regex: searchText, $options: 'i' } }
                    ];
                }
            }

            // Lấy TẤT CẢ Reports (Manual) - không filter vì Reports không có urgency/status
            let reportsQuery = {};
            if (searchText) {
                const searchWords = searchText.trim().split(/\s+/).filter(word => word.length > 0);

                if (searchWords.length > 1) {
                    // Nếu có nhiều từ, tìm tất cả các từ (AND logic)
                    reportsQuery.$and = searchWords.map(word => ({
                        $or: [
                            { description: { $regex: word, $options: 'i' } },
                            { name: { $regex: word, $options: 'i' } },
                            { phone: { $regex: word, $options: 'i' } },
                            { address: { $regex: word, $options: 'i' } }
                        ]
                    }));
                } else {
                    // Nếu chỉ có 1 từ, tìm trong tất cả trường
                    reportsQuery.$or = [
                        { description: { $regex: searchText, $options: 'i' } },
                        { name: { $regex: searchText, $options: 'i' } },
                        { phone: { $regex: searchText, $options: 'i' } },
                        { address: { $regex: searchText, $options: 'i' } }
                    ];
                }
            }

            // Fetch cả 2 loại
            const [rescueRequests, reports] = await Promise.all([
                RescueRequest.find(rescueRequestsQuery).lean(),
                Report.find(reportsQuery).lean()
            ]);

            // Convert Reports sang format giống RescueRequests
            const convertedReports = reports.map(report => {
                // Convert location từ {lat, lng} sang [lng, lat]
                let coords = [null, null];
                if (report.location && report.location.lat && report.location.lng) {
                    coords = [report.location.lng, report.location.lat];
                }

                // Tạo location string - không dùng tọa độ, chỉ dùng description để tiết kiệm diện tích
                // Tọa độ đã có trong coords, không cần hiển thị trong location
                let locationString = report.description ? report.description.substring(0, 100) : null;
                // Nếu không có description, để null thay vì hiển thị tọa độ

                // Convert timestamp từ createdAt
                const timestamp = report.createdAt ? Math.floor(new Date(report.createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000);

                return {
                    _id: report._id,
                    location: locationString,
                    coords: coords,
                    urgency: 'CẦN CỨU TRỢ', // Manual report mặc định
                    people: report.name ? `Người báo cáo: ${report.name}` : 'không rõ',
                    needs: 'cứu hộ',
                    description: report.description || '',
                    contact: report.phone || null,
                    contactFull: report.phone || null,
                    rawText: report.description || '',
                    imagePath: report.imagePath || null,
                    status: 'Chưa xử lý',
                    timestamp: timestamp,
                    fullDetails: {
                        source: 'manual_report',
                        reportId: report._id.toString(),
                        timestamp: report.createdAt ? new Date(report.createdAt).toISOString() : new Date().toISOString()
                    },
                    createdAt: report.createdAt,
                    updatedAt: report.updatedAt
                };
            });

            // Merge cả 2 mảng
            let allRequests = [...rescueRequests, ...convertedReports];

            // Apply filter sau khi merge (vì Reports không có urgency/status trong DB)
            if (req.query.urgency) {
                allRequests = allRequests.filter(r => r.urgency === req.query.urgency);
            }
            if (req.query.status) {
                allRequests = allRequests.filter(r => r.status === req.query.status);
            }

            // Sort theo timestamp (mới nhất trước)
            allRequests.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            // Pagination sau khi merge
            const total = allRequests.length;
            const paginatedRequests = allRequests.slice(skip, skip + limit);

            res.json({
                success: true,
                data: paginatedRequests,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            logger.error('Lỗi khi lấy danh sách cầu cứu', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách cầu cứu',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật status của rescue request
     * PUT /api/rescue-requests/:id/status
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, assignedTo, notes } = req.body;

            console.log(`🔄 Đang cập nhật status cho ID: ${id}, Status mới: ${status}`);

            // Validate status
            const validStatuses = ['Chưa xử lý', 'Đang xử lý', 'Đã xử lý', 'Không thể cứu'];
            if (!status || !validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Status không hợp lệ. Phải là một trong: ${validStatuses.join(', ')}`
                });
            }

            // Validate ID
            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'ID không hợp lệ'
                });
            }

            // Thử tìm trong RescueRequest trước
            let request = await RescueRequest.findById(id);
            console.log(`🔍 Tìm thấy RescueRequest: ${request ? 'Có' : 'Không'}`);

            // Nếu không tìm thấy, thử tìm trong Report (manual report)
            if (!request) {
                const report = await Report.findById(id);
                if (report) {
                    // Report không có status field, nhưng có thể lưu trong notes hoặc metadata
                    // Vì Report không có status, ta chỉ log và trả về success
                    console.log(`ℹ️  Report (manual) không có status field. ID: ${id}, Status yêu cầu: ${status}`);

                    // Convert Report sang format giống RescueRequest để trả về
                    let coords = [null, null];
                    if (report.location && report.location.lat && report.location.lng) {
                        coords = [report.location.lng, report.location.lat];
                    }

                    request = {
                        _id: report._id,
                        location: report.description ? report.description.substring(0, 100) : 'Không rõ vị trí',
                        coords: coords,
                        urgency: 'CẦN CỨU TRỢ',
                        people: report.name ? `Người báo cáo: ${report.name}` : 'không rõ',
                        needs: 'cứu hộ',
                        description: report.description || '',
                        contact: report.phone || null,
                        contactFull: report.phone || null,
                        status: status || 'Chưa xử lý', // Trả về status đã yêu cầu
                        timestamp: report.createdAt ? Math.floor(new Date(report.createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000),
                        fullDetails: {
                            source: 'manual_report',
                            reportId: report._id.toString()
                        }
                    };

                    console.log(`✅ Cập nhật status cho Report (manual): ${id} → ${status}`);

                    return res.json({
                        success: true,
                        message: 'Đã cập nhật status (lưu ý: Report không có status field trong DB)',
                        data: request
                    });
                }
            } else {
                // Tìm thấy trong RescueRequest, update bình thường
                console.log(`📝 Status hiện tại: ${request.status}, Status mới: ${status}`);

                const updateData = { status };
                if (assignedTo) updateData.assignedTo = assignedTo;
                if (notes) updateData.notes = notes;
                if (status === 'Đã xử lý') {
                    updateData.processedAt = new Date();
                }

                console.log(`💾 Dữ liệu cập nhật:`, updateData);

                request = await RescueRequest.findByIdAndUpdate(
                    id,
                    { $set: updateData },
                    { new: true, runValidators: true }
                );

                if (!request) {
                    console.error(`❌ Không tìm thấy document sau khi update. ID: ${id}`);
                    return res.status(404).json({
                        success: false,
                        message: 'Không tìm thấy rescue request sau khi cập nhật'
                    });
                }

                console.log(`✅ Cập nhật status thành công cho RescueRequest: ${id} → ${status}`);
                console.log(`✅ Status sau khi update: ${request.status}`);
            }

            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy rescue request hoặc report'
                });
            }

            res.json({
                success: true,
                message: 'Đã cập nhật status',
                data: request
            });
        } catch (error) {
            console.error('❌ Lỗi khi cập nhật status:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật status',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật toàn bộ thông tin của rescue request (Admin only)
     * PUT /api/rescue-requests/:id
     */
    async update(req, res) {
        try {
            const { id } = req.params;
            const {
                location,
                coords,
                urgency,
                people,
                needs,
                description,
                contact,
                contactFull,
                status,
                assignedTo,
                notes,
                facebookUrl,
                googleMapsUrl
            } = req.body;

            // Validate ID
            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'ID không hợp lệ'
                });
            }

            // Tìm rescue request - thử RescueRequest trước, nếu không có thì thử Report
            let request = await RescueRequest.findById(id);
            let isReport = false;

            if (!request) {
                // Thử tìm trong Report (manual report)
                const report = await Report.findById(id);
                if (report) {
                    isReport = true;
                    // Convert Report sang format tạm để xử lý
                    let coords = [null, null];
                    if (report.location && report.location.lat && report.location.lng) {
                        coords = [report.location.lng, report.location.lat];
                    }
                    request = {
                        _id: report._id,
                        location: report.description ? report.description.substring(0, 100) : 'Không rõ vị trí',
                        coords: coords,
                        urgency: 'CẦN CỨU TRỢ',
                        people: report.name ? `Người báo cáo: ${report.name}` : 'không rõ',
                        needs: 'cứu hộ',
                        description: report.description || '',
                        contact: report.phone || null,
                        contactFull: report.phone || null,
                        status: 'Chưa xử lý',
                        rawText: report.description || '',
                        imagePath: report.imagePath || null,
                        fullDetails: {
                            source: 'manual_report',
                            reportId: report._id.toString()
                        },
                        // Lưu reference để update sau
                        _reportDoc: report
                    };
                } else {
                    return res.status(404).json({
                        success: false,
                        message: 'Không tìm thấy rescue request hoặc report'
                    });
                }
            }

            // Build update data (chỉ update các field được gửi lên)
            const updateData = {};

            if (location !== undefined) updateData.location = location;
            if (urgency !== undefined && ['CỰC KỲ KHẨN CẤP', 'KHẨN CẤP', 'CẦN CỨU TRỢ'].includes(urgency)) {
                updateData.urgency = urgency;
            }
            if (people !== undefined) updateData.people = people;
            if (needs !== undefined) updateData.needs = needs;
            if (description !== undefined) updateData.description = description;
            if (contact !== undefined) updateData.contact = contact;
            if (contactFull !== undefined) updateData.contactFull = contactFull;
            if (status !== undefined && ['Chưa xử lý', 'Đang xử lý', 'Đã xử lý', 'Không thể cứu'].includes(status)) {
                updateData.status = status;
                if (status === 'Đã xử lý' && !request.processedAt) {
                    updateData.processedAt = new Date();
                }
            }
            if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
            if (notes !== undefined) updateData.notes = notes;
            if (facebookUrl !== undefined) updateData.facebookUrl = facebookUrl;
            if (googleMapsUrl !== undefined) updateData.googleMapsUrl = googleMapsUrl;

            // Validate và update coords
            if (coords !== undefined) {
                let finalCoords = null;
                if (Array.isArray(coords) && coords.length === 2) {
                    const [lng, lat] = coords;
                    if (typeof lng === 'number' && typeof lat === 'number' &&
                        !isNaN(lng) && !isNaN(lat) &&
                        lng >= -180 && lng <= 180 &&
                        lat >= -90 && lat <= 90) {
                        finalCoords = [lng, lat];
                    }
                } else if (coords && typeof coords === 'object') {
                    const { lng, lat } = coords;
                    if (typeof lng === 'number' && typeof lat === 'number' &&
                        !isNaN(lng) && !isNaN(lat) &&
                        lng >= -180 && lng <= 180 &&
                        lat >= -90 && lat <= 90) {
                        finalCoords = [lng, lat];
                    }
                }

                if (finalCoords) {
                    updateData.coords = finalCoords;
                } else if (coords !== null) {
                    return res.status(400).json({
                        success: false,
                        message: 'Tọa độ không hợp lệ. Vui lòng cung cấp [lng, lat] hoặc { lng, lat }'
                    });
                }
            }

            // Update request - xử lý khác nhau cho Report và RescueRequest
            let updatedRequest;

            if (isReport) {
                // Update Report (manual report)
                const reportUpdateData = {};

                // Map các field từ RescueRequest format sang Report format
                if (description !== undefined) reportUpdateData.description = description;
                if (contact !== undefined || contactFull !== undefined) {
                    reportUpdateData.phone = contactFull || contact || request._reportDoc.phone;
                }
                if (people !== undefined) {
                    // Extract name từ "Người báo cáo: {name}"
                    const nameMatch = people.match(/Người báo cáo:\s*(.+)/);
                    if (nameMatch) {
                        reportUpdateData.name = nameMatch[1].trim();
                    } else {
                        reportUpdateData.name = people;
                    }
                }
                if (coords !== undefined && coords !== null) {
                    // Convert [lng, lat] sang {lat, lng}
                    if (Array.isArray(coords) && coords.length === 2) {
                        reportUpdateData.location = { lat: coords[1], lng: coords[0] };
                    }
                }

                const updatedReport = await Report.findByIdAndUpdate(
                    id,
                    reportUpdateData,
                    { new: true, runValidators: true }
                );

                if (!updatedReport) {
                    return res.status(404).json({
                        success: false,
                        message: 'Không tìm thấy report sau khi update'
                    });
                }

                // Convert lại sang format giống RescueRequest để trả về
                let finalCoords = [null, null];
                if (updatedReport.location && updatedReport.location.lat && updatedReport.location.lng) {
                    finalCoords = [updatedReport.location.lng, updatedReport.location.lat];
                }

                updatedRequest = {
                    _id: updatedReport._id,
                    location: updatedReport.description ? updatedReport.description.substring(0, 100) : 'Không rõ vị trí',
                    coords: finalCoords,
                    urgency: urgency || 'CẦN CỨU TRỢ',
                    people: updatedReport.name ? `Người báo cáo: ${updatedReport.name}` : (people || 'không rõ'),
                    needs: needs || 'cứu hộ',
                    description: updatedReport.description || '',
                    contact: updatedReport.phone || null,
                    contactFull: updatedReport.phone || null,
                    status: status || 'Chưa xử lý',
                    rawText: updatedReport.description || '',
                    imagePath: updatedReport.imagePath || null,
                    fullDetails: {
                        source: 'manual_report',
                        reportId: updatedReport._id.toString()
                    },
                    createdAt: updatedReport.createdAt,
                    updatedAt: updatedReport.updatedAt
                };

                console.log(`✅ Admin đã cập nhật Report (manual): ${id}`);
            } else {
                // Update RescueRequest (AI report)
                updatedRequest = await RescueRequest.findByIdAndUpdate(
                    id,
                    updateData,
                    { new: true, runValidators: true }
                );

                if (!updatedRequest) {
                    return res.status(404).json({
                        success: false,
                        message: 'Không tìm thấy rescue request sau khi update'
                    });
                }

                console.log(`✅ Admin đã cập nhật RescueRequest: ${id}`);
            }

            res.json({
                success: true,
                message: 'Đã cập nhật thông tin thành công',
                data: updatedRequest
            });
        } catch (error) {
            logger.error('Lỗi khi cập nhật rescue request', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật thông tin',
                error: error.message
            });
        }
    }

    /**
     * Xóa rescue request (Admin only)
     * DELETE /api/rescue-requests/:id
     */
    async delete(req, res) {
        try {
            const { id } = req.params;

            console.log(`🗑️  Bắt đầu xóa rescue request với ID: ${id}`);

            // Validate ID
            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'ID không hợp lệ'
                });
            }

            // Tìm rescue request trước khi xóa (để lấy thông tin reportId nếu có)
            const request = await RescueRequest.findById(id);
            console.log(`🔍 Tìm thấy RescueRequest: ${request ? 'Có' : 'Không'}`);

            if (!request) {
                // Nếu không tìm thấy trong RescueRequest, thử tìm trong Report (manual report)
                console.log(`🔍 Đang tìm trong Report collection...`);
                const report = await Report.findByIdAndDelete(id);
                if (report) {
                    console.log(`✅ Tìm thấy và đã xóa Report: ${id}`);

                    // Xóa hình ảnh của Report nếu có
                    if (report.imagePath) {
                        try {
                            const fs = await import('fs');
                            const path = await import('path');
                            const { fileURLToPath } = await import('url');
                            const { dirname } = await import('path');

                            const __filename = fileURLToPath(import.meta.url);
                            const __dirname = dirname(__filename);
                            const imagePath = path.join(__dirname, '..', report.imagePath);

                            if (fs.existsSync(imagePath)) {
                                fs.unlinkSync(imagePath);
                                console.log(`🗑️  Đã xóa hình ảnh Report: ${imagePath}`);
                            }
                        } catch (imgError) {
                            console.warn('⚠️  Không thể xóa hình ảnh Report:', imgError);
                        }
                    }

                    // Xóa RescueRequest tương ứng nếu có (tìm theo reportId trong fullDetails)
                    const deletedRescueRequests = await RescueRequest.deleteMany({
                        'fullDetails.reportId': id.toString()
                    });
                    console.log(`🗑️  Đã xóa ${deletedRescueRequests.deletedCount} RescueRequest liên quan`);

                    // Verify xóa thành công
                    const verifyReport = await Report.findById(id);
                    if (verifyReport) {
                        console.error(`❌ LỖI: Report vẫn còn tồn tại sau khi xóa! ID: ${id}`);
                        return res.status(500).json({
                            success: false,
                            message: 'Không thể xóa report (vẫn còn trong database)'
                        });
                    }

                    console.log(`✅ Admin đã xóa Report (manual): ${id}`);
                    return res.json({
                        success: true,
                        message: 'Đã xóa báo cáo thành công',
                        data: { id }
                    });
                }

                console.error(`❌ Không tìm thấy rescue request hoặc report với ID: ${id}`);
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy rescue request hoặc report'
                });
            }

            // Xóa RescueRequest
            console.log(`🗑️  Đang xóa RescueRequest: ${id}`);
            const deletedRequest = await RescueRequest.findByIdAndDelete(id);

            if (!deletedRequest) {
                console.error(`❌ LỖI: Không thể xóa RescueRequest. ID: ${id}`);
                return res.status(500).json({
                    success: false,
                    message: 'Không thể xóa rescue request'
                });
            }

            console.log(`✅ Đã xóa RescueRequest thành công: ${id}`);

            // Verify xóa thành công
            const verifyRequest = await RescueRequest.findById(id);
            if (verifyRequest) {
                console.error(`❌ LỖI: RescueRequest vẫn còn tồn tại sau khi xóa! ID: ${id}`);
                return res.status(500).json({
                    success: false,
                    message: 'Không thể xóa rescue request (vẫn còn trong database)'
                });
            }

            // Nếu đây là manual report (có reportId trong fullDetails), xóa cả Report
            if (deletedRequest.fullDetails && deletedRequest.fullDetails.reportId) {
                const reportId = deletedRequest.fullDetails.reportId;
                const report = await Report.findByIdAndDelete(reportId);
                if (report) {
                    console.log(`🗑️  Đã xóa Report tương ứng: ${reportId}`);
                }
            }

            // Xóa hình ảnh nếu có
            if (deletedRequest.imagePath) {
                try {
                    const fs = await import('fs');
                    const path = await import('path');
                    const { fileURLToPath } = await import('url');
                    const { dirname } = await import('path');

                    const __filename = fileURLToPath(import.meta.url);
                    const __dirname = dirname(__filename);
                    const imagePath = path.join(__dirname, '..', deletedRequest.imagePath);

                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                        console.log(`🗑️  Đã xóa hình ảnh: ${imagePath}`);
                    }
                } catch (imgError) {
                    console.warn('⚠️  Không thể xóa hình ảnh:', imgError);
                    // Không fail nếu không xóa được ảnh
                }
            }

            console.log(`✅ Admin đã xóa rescue request thành công: ${id}`);

            res.json({
                success: true,
                message: 'Đã xóa báo cáo thành công',
                data: { id }
            });
        } catch (error) {
            console.error('❌ Lỗi khi xóa rescue request:', error);
            logger.error('Lỗi khi xóa rescue request', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa báo cáo',
                error: error.message
            });
        }
    }

    /**
     * Parse tọa độ từ Google Maps URL
     * @param {string} url - Google Maps URL
     * @returns {Array|null} [lng, lat] hoặc null
     */
    parseGoogleMapsCoords(url) {
        return parseCoords(url, { outputFormat: 'array' });
    }

    /**
     * Cập nhật tọa độ của rescue request
     * PUT /api/rescue-requests/:id/coords
     * Hỗ trợ cả RescueRequest và Report (manual report)
     * Hỗ trợ parse Google Maps link tự động
     */
    async updateCoords(req, res) {
        try {
            const { id } = req.params;
            const { coords, googleMapsUrl } = req.body; // [lng, lat] hoặc { lng, lat } hoặc googleMapsUrl

            // Ưu tiên parse từ Google Maps URL nếu có
            let finalCoords = null;

            if (googleMapsUrl && typeof googleMapsUrl === 'string' && googleMapsUrl.trim()) {
                const parsedCoords = this.parseGoogleMapsCoords(googleMapsUrl.trim());
                if (parsedCoords) {
                    finalCoords = parsedCoords;
                    console.log(`📍 Đã parse tọa độ từ Google Maps link: [${finalCoords[0]}, ${finalCoords[1]}]`);
                } else {
                    console.warn('⚠️  Không thể parse tọa độ từ Google Maps link:', googleMapsUrl);
                }
            }

            // Nếu không có từ Google Maps, thử parse từ coords
            if (!finalCoords) {
                if (Array.isArray(coords) && coords.length === 2) {
                    const [lng, lat] = coords;
                    if (typeof lng === 'number' && typeof lat === 'number' &&
                        !isNaN(lng) && !isNaN(lat) &&
                        lng >= -180 && lng <= 180 &&
                        lat >= -90 && lat <= 90) {
                        finalCoords = [lng, lat];
                    }
                } else if (coords && typeof coords === 'object') {
                    const { lng, lat } = coords;
                    if (typeof lng === 'number' && typeof lat === 'number' &&
                        !isNaN(lng) && !isNaN(lat) &&
                        lng >= -180 && lng <= 180 &&
                        lat >= -90 && lat <= 90) {
                        finalCoords = [lng, lat];
                    }
                } else if (typeof coords === 'string' && coords.trim()) {
                    // Thử parse từ string "lat, lng" hoặc "lng, lat"
                    const parts = coords.trim().split(',').map(s => s.trim());
                    if (parts.length === 2) {
                        const num1 = parseFloat(parts[0]);
                        const num2 = parseFloat(parts[1]);
                        if (!isNaN(num1) && !isNaN(num2)) {
                            // Thử cả 2 cách: [lng, lat] và [lat, lng]
                            if (num1 >= -90 && num1 <= 90 && num2 >= -180 && num2 <= 180) {
                                // num1 là lat, num2 là lng
                                finalCoords = [num2, num1];
                            } else if (num1 >= -180 && num1 <= 180 && num2 >= -90 && num2 <= 90) {
                                // num1 là lng, num2 là lat
                                finalCoords = [num1, num2];
                            }
                        }
                    }
                }
            }

            if (!finalCoords) {
                return res.status(400).json({
                    success: false,
                    message: 'Tọa độ không hợp lệ. Vui lòng cung cấp Google Maps link, [lng, lat], { lng, lat }, hoặc string "lat, lng"'
                });
            }

            // Thử tìm trong RescueRequest trước
            let request = await RescueRequest.findById(id);
            let isReport = false;

            if (request) {
                // Update RescueRequest
                const updateData = { coords: finalCoords };
                if (googleMapsUrl) {
                    updateData.googleMapsUrl = googleMapsUrl.trim();
                }

                request = await RescueRequest.findByIdAndUpdate(
                    id,
                    updateData,
                    { new: true }
                );
                console.log(`✅ Cập nhật tọa độ RescueRequest: ${id} → [${finalCoords[0]}, ${finalCoords[1]}]`);
            } else {
                // Nếu không tìm thấy trong RescueRequest, thử tìm trong Report (manual report)
                const report = await Report.findById(id);

                if (report) {
                    isReport = true;
                    const updateData = {
                        location: { lat: finalCoords[1], lng: finalCoords[0] } // Report dùng {lat, lng}
                    };

                    const updatedReport = await Report.findByIdAndUpdate(
                        id,
                        updateData,
                        { new: true }
                    );

                    if (updatedReport) {
                        console.log(`✅ Cập nhật tọa độ Report: ${id} → [${finalCoords[0]}, ${finalCoords[1]}]`);

                        // Convert Report sang format giống RescueRequest để trả về
                        request = {
                            _id: updatedReport._id,
                            location: updatedReport.description ? updatedReport.description.substring(0, 100) : 'Không rõ vị trí',
                            coords: finalCoords,
                            urgency: 'CẦN CỨU TRỢ',
                            people: updatedReport.name ? `Người báo cáo: ${updatedReport.name}` : 'không rõ',
                            needs: 'cứu hộ',
                            description: updatedReport.description || '',
                            contact: updatedReport.phone || null,
                            contactFull: updatedReport.phone || null,
                            status: 'Chưa xử lý',
                            timestamp: updatedReport.createdAt ? Math.floor(new Date(updatedReport.createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000),
                            fullDetails: {
                                source: 'manual_report',
                                reportId: updatedReport._id.toString()
                            },
                            createdAt: updatedReport.createdAt,
                            updatedAt: updatedReport.updatedAt
                        };
                    }
                }
            }

            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy rescue request hoặc report'
                });
            }

            res.json({
                success: true,
                message: 'Đã cập nhật tọa độ thành công',
                data: request
            });
        } catch (error) {
            logger.error('Lỗi khi cập nhật tọa độ', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật tọa độ',
                error: error.message
            });
        }
    }

    /**
     * Lấy thống kê
     * GET /api/admin/stats
     */
    async getStats(req, res) {
        try {
            // Tính toán từ cả 2 collections: RescueRequest và Report
            const [
                rescueRequestTotal,
                reportTotal,
                rescueRequestByUrgency,
                rescueRequestByStatus,
                rescueRequestLast24h,
                reportLast24h
            ] = await Promise.all([
                // Tổng số từ RescueRequest
                RescueRequest.countDocuments(),
                // Tổng số từ Report
                Report.countDocuments(),
                // Group by urgency từ RescueRequest
                RescueRequest.aggregate([
                    { $group: { _id: '$urgency', count: { $sum: 1 } } }
                ]),
                // Group by status từ RescueRequest
                RescueRequest.aggregate([
                    { $group: { _id: '$status', count: { $sum: 1 } } }
                ]),
                // RescueRequest trong 24h gần đây
                RescueRequest.countDocuments({
                    $or: [
                        { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
                        { timestamp: { $gte: Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000) } }
                    ]
                }),
                // Report trong 24h gần đây
                Report.countDocuments({
                    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                })
            ]);

            // Tổng số từ cả 2 collections
            const total = rescueRequestTotal + reportTotal;

            // Convert urgency aggregation từ RescueRequest
            const byUrgencyObj = rescueRequestByUrgency.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {});

            // Report không có urgency field, tất cả coi như "CẦN CỨU TRỢ"
            if (reportTotal > 0) {
                byUrgencyObj['CẦN CỨU TRỢ'] = (byUrgencyObj['CẦN CỨU TRỢ'] || 0) + reportTotal;
            }

            // Convert status aggregation từ RescueRequest
            const byStatusObj = rescueRequestByStatus.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {});

            // Report không có status field, tất cả coi như "Chưa xử lý"
            if (reportTotal > 0) {
                byStatusObj['Chưa xử lý'] = (byStatusObj['Chưa xử lý'] || 0) + reportTotal;
            }

            // Tổng số trong 24h gần đây từ cả 2 collections
            const last24h = rescueRequestLast24h + reportLast24h;

            // Log để debug
            // console.log('📊 Stats calculated (from both collections):', {
            //     rescueRequestTotal,
            //     reportTotal,
            //     total,
            //     byStatus: byStatusObj,
            //     last24h,
            //     byUrgency: byUrgencyObj
            // });

            res.json({
                success: true,
                data: {
                    total,
                    byUrgency: byUrgencyObj,
                    byStatus: byStatusObj,
                    last24h
                }
            });
        } catch (error) {
            console.error('❌ Error in getStats:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê',
                error: error.message
            });
        }
    }

}

/**
 * Helper function: Log cầu cứu ra console
 */
function logRescueRequest(request) {
    console.log('=== CẦU CỨU MỚI TỪ AI ===');
    console.log('ID:', request._id || request.id);
    console.log('Độ khẩn cấp:', request.urgency);
    console.log('Vị trí:', request.location);
    console.log('📍 Tọa độ:', request.coords || 'Chưa có');
    if (request.coords && request.coords[0] && request.coords[1]) {
        console.log(`   → [${request.coords[0]}, ${request.coords[1]}]`);
    } else {
        console.log('   ⚠️  CẢNH BÁO: Không có tọa độ GPS!');
    }
    console.log('Số người:', request.people);
    console.log('Nhu cầu:', request.needs);
    console.log('Liên hệ:', request.contactFull || request.contact || 'Không có');
    if (request.facebookUrl) {
        console.log('Link Facebook:', request.facebookUrl);
    }
    console.log('========================');
}

export default new RescueRequestController();

