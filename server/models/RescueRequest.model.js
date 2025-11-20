import mongoose from 'mongoose';

/**
 * Schema cho yêu cầu cứu hộ (AI-parsed)
 */
const rescueRequestSchema = new mongoose.Schema({
    location: {
        type: String,
        required: true,
        trim: true
    },
    coords: {
        type: [Number], // [longitude, latitude]
        default: [null, null]
    },
    urgency: {
        type: String,
        enum: ['CỰC KỲ KHẨN CẤP', 'KHẨN CẤP', 'CẦN CỨU TRỢ'],
        default: 'CẦN CỨU TRỢ'
    },
    people: {
        type: String,
        default: 'không rõ'
    },
    needs: {
        type: String,
        default: 'cứu hộ'
    },
    description: {
        type: String,
        required: true
    },
    contact: {
        type: String,
        default: null
    },
    contactFull: {
        type: String, // Tất cả số điện thoại (nếu có nhiều)
        default: null
    },
    facebookUrl: {
        type: String,
        default: null
    },
    googleMapsUrl: {
        type: String, // Link Google Maps để lấy tọa độ chính xác
        default: null
    },
    rawText: {
        type: String, // Nội dung gốc từ user
        default: ''
    },
    fetchedText: {
        type: String, // Text fetch từ Facebook (nếu có)
        default: null
    },
    imagePath: {
        type: String, // Path tới hình ảnh local (ví dụ: /uploads/rescue-123.jpg)
        default: null
    },
    fullDetails: {
        originalText: String,
        facebookUrl: String,
        googleMapsUrl: String,
        fetchedText: String,
        timestamp: Date
    },
    status: {
        type: String,
        enum: ['Chưa xử lý', 'Đang xử lý', 'Đã xử lý', 'Không thể cứu'],
        default: 'Chưa xử lý'
    },
    assignedTo: {
        type: String, // Tên người được assign
        default: null
    },
    processedAt: {
        type: Date, // Thời gian xử lý
        default: null
    },
    notes: {
        type: String, // Ghi chú của staff
        default: null
    },
    timestamp: {
        type: Number, // Unix timestamp (giây)
        default: () => Math.floor(Date.now() / 1000)
    }
}, {
    timestamps: true // Tự động thêm createdAt, updatedAt
});

// Index để query nhanh
rescueRequestSchema.index({ timestamp: -1 }); // Sắp xếp theo mới nhất
rescueRequestSchema.index({ urgency: 1 }); // Filter theo độ khẩn cấp
rescueRequestSchema.index({ 'coords.0': 1, 'coords.1': 1 }); // Geospatial query

const RescueRequest = mongoose.model('RescueRequest', rescueRequestSchema);

export default RescueRequest;

