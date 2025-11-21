import Report from '../models/Report.model.js';
// import RescueRequest from '../models/RescueRequest.model.js'; // KHÔNG DÙNG NỮA - chỉ tạo Report, backend getAll() sẽ merge
import { saveBase64Image } from '../config/upload.config.js';
// import geocodingService from '../services/geocoding.service.js'; // ĐÃ TẮT - không dùng geocoding tự động nữa
import duplicateCheckService from '../services/duplicateCheck.service.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { parseGoogleMapsCoords } from '../utils/googleMapsParser.js';

/**
 * Controller xử lý báo cáo khẩn cấp
 */
class ReportController {
    /**
     * Tạo báo cáo khẩn cấp mới
     * POST /api/report
     */
    async create(req, res) {
        try {
            const { location, description, imageBase64, phone, name, googleMapsUrl } = req.body;

            // Validate
            if (!description || description.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng nhập mô tả tình huống'
                });
            }

            // Parse tọa độ từ Google Maps URL trước (nếu có) để dùng cho duplicate check
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

            // Check duplicate trước khi tạo report (giống AI form)
            const duplicateCheckData = {
                rawText: description.trim(), // Dùng rawText để check (giống AI form)
                description: description.trim(),
                contact: phone || null,
                contactFull: phone || null,
                coords: coordsForDuplicateCheck,
                facebookUrl: null,
                location: null // User tự chọn tọa độ hoặc dán link Google Maps
            };

            console.log('🔍 Đang kiểm tra trùng lặp cho manual report...');
            const duplicateResult = await duplicateCheckService.checkDuplicate(duplicateCheckData);

            if (duplicateResult.isDuplicate) {
                console.log('⚠️  Phát hiện manual report trùng lặp!');
                console.log(`   Similarity: ${duplicateResult.maxSimilarity * 100}%`);
                console.log(`   Số lượng duplicate: ${duplicateResult.duplicates.length}`);

                // CHẶN hoàn toàn nếu duplicate (khác AI form - vì manual report dễ spam hơn)
                return res.status(400).json({
                    success: false,
                    message: `Báo cáo này trùng lặp với ${duplicateResult.duplicates.length} báo cáo đã có (${Math.round(duplicateResult.maxSimilarity * 100)}% giống nhau). Vui lòng kiểm tra lại!`,
                    isDuplicate: true,
                    maxSimilarity: duplicateResult.maxSimilarity,
                    duplicates: duplicateResult.duplicates
                });
            }

            // Lưu hình ảnh local (nếu có)
            let imagePath = null;
            if (imageBase64) {
                try {
                    // Validate base64 string
                    if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
                        console.warn('⚠️  Base64 string không hợp lệ hoặc quá ngắn');
                    } else {
                        console.log('💾 Đang lưu hình ảnh báo cáo...');
                        console.log('📏 Kích thước base64:', imageBase64.length, 'bytes');
                        imagePath = saveBase64Image(imageBase64);
                        console.log('✅ Lưu thành công:', imagePath);
                    }
                } catch (uploadError) {
                    logger.error('Lỗi lưu hình ảnh báo cáo', uploadError, req);
                }
            } else {
                console.log('ℹ️  Không có hình ảnh trong request');
            }

            // Xử lý location: User tự chọn tọa độ hoặc dán link Google Maps
            // Ưu tiên parse từ Google Maps URL nếu có
            let finalLocation = { lat: null, lng: null };

            // Parse tọa độ từ Google Maps URL (nếu có) - ưu tiên cao nhất
            if (googleMapsUrl && typeof googleMapsUrl === 'string' && googleMapsUrl.trim()) {
                const parsedCoords = parseGoogleMapsCoords(googleMapsUrl.trim());
                if (parsedCoords) {
                    finalLocation = { lat: parsedCoords[1], lng: parsedCoords[0] }; // parsedCoords trả về [lng, lat]
                    console.log(`📍 Đã parse tọa độ từ Google Maps link: [${finalLocation.lng}, ${finalLocation.lat}]`);
                } else {
                    console.warn('⚠️  Không thể parse tọa độ từ Google Maps link:', googleMapsUrl);
                }
            }

            // Nếu không có từ Google Maps, dùng location đã chọn (từ GPS hoặc click trên map)
            if ((!finalLocation.lat || !finalLocation.lng) && location && location.lat && location.lng) {
                finalLocation = location;
            }

            const newReportData = {
                name: name || '',
                phone: phone || '',
                location: finalLocation,
                description: description.trim(),
                imagePath: imagePath
            };

            // Validate dữ liệu trước khi lưu
            console.log('📝 Dữ liệu trước khi lưu:', JSON.stringify(newReportData, null, 2));

            // Kiểm tra MongoDB connection
            if (mongoose.connection.readyState !== 1) {
                console.error('❌ MongoDB không kết nối! ReadyState:', mongoose.connection.readyState);
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi kết nối database',
                    error: 'MongoDB connection not ready'
                });
            }

            let newReport;
            try {
                newReport = await Report.create(newReportData);
                console.log('✅ Đã lưu vào MongoDB thành công!');
                console.log('✅ Report ID:', newReport._id.toString());

                // Verify lại bằng cách query
                const verifyReport = await Report.findById(newReport._id);
                if (verifyReport) {
                    console.log('✅ Đã verify: Report tồn tại trong database');
                } else {
                    console.error('❌ CẢNH BÁO: Report không tìm thấy sau khi create!');
                }
            } catch (dbError) {
                logger.error('Lỗi khi lưu vào MongoDB', dbError, req);
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi khi lưu báo cáo vào database',
                    error: dbError.message
                });
            }

            // Verify đã lưu thành công
            if (!newReport || !newReport._id) {
                console.error('❌ Report không có _id sau khi create!');
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi khi tạo báo cáo',
                    error: 'Report created but no ID returned'
                });
            }

            // Log để theo dõi
            console.log('=== BÁO CÁO KHẨN CẤP MỚI ===');
            console.log('ID:', newReport._id);
            console.log('Tên:', newReport.name || 'Không có');
            console.log('SĐT:', newReport.phone || 'Không có');
            console.log('Vị trí:', newReport.location);
            console.log('Mô tả:', newReport.description);
            console.log('Created At:', newReport.createdAt);
            console.log('============================');

            // KHÔNG tạo RescueRequest nữa - chỉ tạo Report
            // Backend API /api/rescue-requests đã có logic merge Report và RescueRequest
            // Manual report và AI report sẽ được hiển thị chung thông qua getAll() method
            console.log('✅ Manual report đã được lưu. Sẽ hiển thị chung với AI rescue requests qua API merge.');

            res.json({
                success: true,
                message: 'Đã nhận báo cáo khẩn cấp',
                data: newReport
            });
        } catch (error) {
            logger.error('Lỗi tạo report', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo báo cáo',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh sách báo cáo
     * GET /api/reports
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

            const count = await Report.countDocuments();
            console.log(`📊 Tổng số reports trong DB: ${count}`);

            const allReports = await Report.find()
                .sort({ createdAt: -1 })
                .lean();

            console.log(`✅ Đã lấy ${allReports.length} reports từ database`);

            res.json({ success: true, data: allReports, count: count });
        } catch (error) {
            logger.error('Lỗi khi lấy danh sách báo cáo', error, req);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách báo cáo',
                error: error.message
            });
        }
    }

}

// Export cả class và instance
export { ReportController };
export default new ReportController();

