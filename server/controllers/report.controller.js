import Report from '../models/Report.model.js';
import RescueRequest from '../models/RescueRequest.model.js';
import { saveBase64Image } from '../config/upload.config.js';
import geocodingService from '../services/geocoding.service.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

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
            const { location, description, imageBase64, phone, name } = req.body;

            // Validate
            if (!description || description.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng nhập mô tả tình huống'
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

            // Xử lý location: Nếu không có GPS, thử geocode từ description (ASYNC - không block response)
            let finalLocation = location || { lat: null, lng: null };

            // Tìm địa chỉ trong description để geocode sau (async)
            let addressTextForGeocode = null;
            if ((!finalLocation.lat || !finalLocation.lng) && description && description.trim().length > 0) {
                try {
                    // Tìm địa chỉ trong description (các từ khóa địa danh)
                    const locationKeywords = [
                        'Phú Thịnh', 'Tuy An', 'An Thạch', 'Sông Hinh', 'Ea H\'leo', 'Krông Búk', 'Tuy Hòa',
                        'Phú Yên', 'Đắk Lắk', 'Khánh Hòa', 'Bình Định', 'Quảng Ngãi', 'An Dân', 'Ngân Sơn',
                        'Mỹ Hoà', 'Mỹ Hòa', 'mỹ hoà', 'mỹ hòa', 'Mỹ Hoa', 'mỹ hoa',
                        'Bến Đình', 'Hòa Phong', 'Tây Hòa', 'Hòa Thịnh',
                        'thôn', 'xã', 'phường', 'huyện', 'tỉnh', 'cầu', 'di tích', 'đội', 'xóm'
                    ];

                    // Strategy 1: Ưu tiên tìm câu có "Địa chỉ:" hoặc "địa chỉ:"
                    const lines = description.split(/\n/).map(s => s.trim()).filter(s => s.length > 0);
                    for (const line of lines) {
                        const lowerLine = line.toLowerCase();
                        if (lowerLine.includes('địa chỉ:') || lowerLine.includes('địa chỉ :')) {
                            // Lấy phần sau "Địa chỉ:"
                            const addressMatch = line.match(/[Đđ]ịa\s+chỉ\s*:\s*(.+)/i);
                            if (addressMatch && addressMatch[1]) {
                                addressTextForGeocode = addressMatch[1].trim();
                                console.log(`✅ Tìm thấy địa chỉ (từ "Địa chỉ:"): "${addressTextForGeocode}"`);
                                break;
                            }
                        }
                    }

                    // Strategy 2: Tìm câu có format chuẩn (nhiều dấu phẩy, có xã/huyện/tỉnh)
                    if (!addressTextForGeocode) {
                        const sentences = description.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 0);
                        let bestSentence = '';
                        let maxScore = 0;

                        for (const sentence of sentences) {
                            const lowerSentence = sentence.toLowerCase();
                            let score = 0;

                            // Điểm cho format chuẩn (nhiều dấu phẩy = địa chỉ đầy đủ)
                            const commaCount = (sentence.match(/,/g) || []).length;
                            if (commaCount >= 2) score += 10;
                            if (commaCount >= 3) score += 5;

                            // Điểm cho có từ khóa địa danh
                            const keywordCount = locationKeywords.filter(k =>
                                lowerSentence.includes(k.toLowerCase())
                            ).length;
                            score += keywordCount * 5;

                            // Điểm cho có "xã", "huyện", "tỉnh"
                            if (lowerSentence.includes('xã')) score += 3;
                            if (lowerSentence.includes('huyện')) score += 3;
                            if (lowerSentence.includes('tỉnh')) score += 3;

                            // Trừ điểm nếu có từ không cần thiết
                            if (lowerSentence.includes('cầu cứu') || lowerSentence.includes('sos')) score -= 5;
                            if (lowerSentence.includes('nhà đang ngập') || lowerSentence.includes('ngập')) score -= 3;

                            if (score > maxScore) {
                                maxScore = score;
                                bestSentence = sentence;
                            }
                        }

                        if (bestSentence && maxScore > 5) {
                            addressTextForGeocode = bestSentence.trim();
                            console.log(`✅ Tìm thấy địa chỉ (score: ${maxScore}): "${addressTextForGeocode}"`);
                        }
                    }

                    // Strategy 3: Fallback - tìm câu có nhiều keyword nhất
                    if (!addressTextForGeocode) {
                        const sentences = description.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 0);
                        let bestSentence = '';
                        let maxKeywords = 0;

                        for (const sentence of sentences) {
                            const keywordCount = locationKeywords.filter(k =>
                                sentence.toLowerCase().includes(k.toLowerCase())
                            ).length;
                            if (keywordCount > maxKeywords) {
                                maxKeywords = keywordCount;
                                bestSentence = sentence;
                            }
                        }

                        if (bestSentence && maxKeywords > 0) {
                            addressTextForGeocode = bestSentence.trim();
                            console.log(`✅ Tìm thấy địa chỉ (${maxKeywords} keywords): "${addressTextForGeocode}"`);
                        }
                    }

                    // Clean up: Loại bỏ các từ không cần thiết ở đầu
                    if (addressTextForGeocode) {
                        addressTextForGeocode = addressTextForGeocode
                            // Loại bỏ các từ không cần thiết ở đầu
                            .replace(/^(Cứu với|Mọi người ơi|Em kêu cứu|SOS|Cần cứu hộ|Nhà đối diện|gần|Nhà e ở|Nhà ở|ở|CẦU CỨU KHẨN CẤP|Cầu cứu khẩn cấp|NHÀ ĐANG NGẬP|Nhà đang ngập)[\s,–—-]*/gi, '')
                            // Loại bỏ emoji và ký tự đặc biệt
                            .replace(/[😭😢💔⚠️📢📞🙏]/g, '')
                            .replace(/[–—-]/g, ',') // Thay dấu gạch ngang bằng dấu phẩy
                            .replace(/\s+/g, ' ')
                            .trim();

                        // Rút gọn: Chỉ lấy phần địa chỉ chính (xã, huyện, tỉnh)
                        const addressParts = addressTextForGeocode.split(',').map(p => p.trim()).filter(p => p.length > 0);
                        const simplifiedParts = [];
                        for (let i = addressParts.length - 1; i >= 0; i--) {
                            simplifiedParts.unshift(addressParts[i]);
                            // Dừng khi đã có đủ: tỉnh, huyện, xã
                            const lowerPart = addressParts[i].toLowerCase();
                            if (lowerPart.includes('tỉnh') || lowerPart.includes('phú yên') ||
                                lowerPart.includes('đắk lắk') || lowerPart.includes('khánh hòa')) {
                                break;
                            }
                        }
                        addressTextForGeocode = simplifiedParts.join(', ').trim();

                        // Nếu không có tỉnh, thử thêm "Phú Yên" hoặc "Đắk Lắk" dựa trên keyword
                        if (addressTextForGeocode && !addressTextForGeocode.toLowerCase().includes('tỉnh') &&
                            !addressTextForGeocode.toLowerCase().includes('phú yên') &&
                            !addressTextForGeocode.toLowerCase().includes('đắk lắk')) {
                            // Thêm tỉnh dựa trên keyword
                            if (addressTextForGeocode.toLowerCase().includes('tuy an') ||
                                addressTextForGeocode.toLowerCase().includes('sông hinh') ||
                                addressTextForGeocode.toLowerCase().includes('tuy hòa')) {
                                addressTextForGeocode = `${addressTextForGeocode}, Phú Yên`;
                            } else if (addressTextForGeocode.toLowerCase().includes('ea') ||
                                addressTextForGeocode.toLowerCase().includes('krông')) {
                                addressTextForGeocode = `${addressTextForGeocode}, Đắk Lắk`;
                            }
                        }

                        console.log(`🔍 Địa chỉ đã clean: "${addressTextForGeocode}"`);
                    }
                } catch (parseError) {
                    console.error('❌ Lỗi parse địa chỉ:', parseError.message);
                }
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

            // Tạo RescueRequest tương ứng để hiển thị chung với AI rescue requests
            let rescueRequestId = null;
            try {
                console.log('🔄 Bắt đầu tạo RescueRequest tương ứng cho manual report...');

                // Convert location từ {lat, lng} sang [lng, lat] format
                let coords = [null, null];
                if (newReport.location && newReport.location.lat && newReport.location.lng) {
                    coords = [newReport.location.lng, newReport.location.lat];
                    console.log('   📍 Có tọa độ từ GPS:', coords);
                } else {
                    console.log('   ⚠️  Chưa có tọa độ, sẽ geocode sau');
                }

                // Tạo location string từ description hoặc tọa độ
                let locationString = addressTextForGeocode || description.substring(0, 100);
                if (!locationString || locationString.trim().length === 0) {
                    locationString = coords[0] && coords[1]
                        ? `Vị trí GPS: ${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`
                        : 'Không rõ vị trí';
                }
                console.log('   📍 Location string:', locationString);

                // Tạo RescueRequest tương ứng
                const rescueRequestData = {
                    location: locationString,
                    coords: coords,
                    urgency: 'CẦN CỨU TRỢ', // Manual report mặc định là CẦN CỨU TRỢ
                    people: name ? `Người báo cáo: ${name}` : 'không rõ',
                    needs: 'cứu hộ',
                    description: description.trim(),
                    contact: phone || null,
                    contactFull: phone || null,
                    rawText: description.trim(),
                    imagePath: imagePath,
                    status: 'Chưa xử lý',
                    timestamp: Math.floor(Date.now() / 1000),
                    fullDetails: {
                        originalText: description.trim(),
                        source: 'manual_report',
                        reportId: newReport._id.toString(),
                        timestamp: new Date().toISOString()
                    }
                };

                console.log('   📦 RescueRequest data:', {
                    location: rescueRequestData.location,
                    coords: rescueRequestData.coords,
                    urgency: rescueRequestData.urgency,
                    contact: rescueRequestData.contact
                });

                const rescueRequest = await RescueRequest.create(rescueRequestData);
                rescueRequestId = rescueRequest._id;
                console.log('✅ Đã tạo RescueRequest tương ứng:', rescueRequest._id.toString());
                console.log('   → Báo cáo này sẽ hiển thị chung với AI rescue requests');

                // Geocode ASYNC sau khi đã trả response (không block user)
                if (addressTextForGeocode && addressTextForGeocode.length > 5 && (!finalLocation.lat || !finalLocation.lng)) {
                    // Chạy geocoding trong background (không await)
                    geocodingService.geocodeWithFallback(addressTextForGeocode)
                        .then(coords => {
                            if (coords && coords[0] && coords[1]) {
                                // Update location trong Report
                                Report.findByIdAndUpdate(newReport._id, {
                                    location: { lat: coords[1], lng: coords[0] }
                                }, { new: true })
                                    .then(updated => {
                                        console.log(`✅ Đã geocode và update Report location: [${coords[0]}, ${coords[1]}]`);

                                        // Cũng update RescueRequest tương ứng (nếu đã tạo)
                                        if (rescueRequestId) {
                                            RescueRequest.findByIdAndUpdate(rescueRequestId, {
                                                coords: coords
                                            }, { new: true })
                                                .then(updatedRescue => {
                                                    if (updatedRescue) {
                                                        console.log(`✅ Đã update RescueRequest coords: [${coords[0]}, ${coords[1]}]`);
                                                    }
                                                })
                                                .catch(rescueUpdateError => {
                                                    console.error('⚠️  Lỗi update RescueRequest coords:', rescueUpdateError.message);
                                                });
                                        }
                                    })
                                    .catch(updateError => {
                                        console.error('❌ Lỗi update location:', updateError.message);
                                    });
                            } else {
                                console.log(`⚠️  Không thể geocode địa chỉ: "${addressTextForGeocode}"`);
                            }
                        })
                        .catch(geoError => {
                            console.error('❌ Lỗi geocoding async:', geoError.message);
                        });
                }
            } catch (rescueError) {
                console.error('⚠️  Lỗi khi tạo RescueRequest tương ứng:', rescueError.message);
                // Không fail request nếu lỗi tạo RescueRequest

                // Vẫn chạy geocoding cho Report nếu có
                if (addressTextForGeocode && addressTextForGeocode.length > 5 && (!finalLocation.lat || !finalLocation.lng)) {
                    geocodingService.geocodeWithFallback(addressTextForGeocode)
                        .then(coords => {
                            if (coords && coords[0] && coords[1]) {
                                Report.findByIdAndUpdate(newReport._id, {
                                    location: { lat: coords[1], lng: coords[0] }
                                }, { new: true })
                                    .then(updated => {
                                        console.log(`✅ Đã geocode và update Report location: [${coords[0]}, ${coords[1]}]`);
                                    })
                                    .catch(updateError => {
                                        console.error('❌ Lỗi update location:', updateError.message);
                                    });
                            }
                        })
                        .catch(geoError => {
                            console.error('❌ Lỗi geocoding async:', geoError.message);
                        });
                }
            }

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

export default new ReportController();

