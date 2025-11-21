import mongoose from 'mongoose';

/**
 * Schema cho yêu cầu hỗ trợ (thực phẩm, quần áo, nhu yếu phẩm...)
 */
const supportRequestSchema = new mongoose.Schema({
    name: {
        type: String,
        default: ''
    },
    phone: {
        type: String,
        default: ''
    },
    location: {
        lat: Number,
        lng: Number
    },
    // Loại hỗ trợ cần thiết (có thể chọn nhiều)
    needs: {
        type: [String],
        default: [],
        enum: ['Thực phẩm', 'Nước uống', 'Quần áo', 'Thuốc men', 'Chăn màn', 'Đèn pin', 'Pin', 'Bếp gas', 'Nhu yếu phẩm', 'Khác']
    },
    // Mô tả chi tiết
    description: {
        type: String,
        required: true,
        trim: true
    },
    // Số lượng người cần hỗ trợ
    peopleCount: {
        type: Number,
        default: 1,
        min: 1
    },
    // Đường dẫn ảnh
    imagePath: {
        type: String,
        default: null
    },
    // Trạng thái: Chưa xử lý, Đang xử lý, Đã hỗ trợ
    status: {
        type: String,
        enum: ['Chưa xử lý', 'Đang xử lý', 'Đã hỗ trợ'],
        default: 'Chưa xử lý'
    },
    // Ghi chú từ người hỗ trợ
    notes: {
        type: String,
        default: null,
        trim: true
    }
}, {
    timestamps: true
});

// Index để query nhanh
supportRequestSchema.index({ 'location.lat': 1, 'location.lng': 1 });
supportRequestSchema.index({ status: 1 });
supportRequestSchema.index({ createdAt: -1 });

const SupportRequest = mongoose.model('SupportRequest', supportRequestSchema);

export default SupportRequest;

