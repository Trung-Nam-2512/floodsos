import mongoose from 'mongoose';

/**
 * Schema cho điểm tiếp nhận cứu trợ
 * Tương tự SafePoint nhưng dành riêng cho điểm tiếp nhận cứu trợ
 */
const reliefPointSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
        required: true
    },
    address: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        default: null,
        trim: true
    },
    // Sức chứa (số người có thể tiếp nhận) - optional
    capacity: {
        type: Number,
        default: null,
        min: 0
    },
    // Số người hiện tại đang tiếp nhận - optional
    currentOccupancy: {
        type: Number,
        default: null,
        min: 0
    },
    description: {
        type: String,
        default: null,
        trim: true
    },
    status: {
        type: String,
        enum: ['Hoạt động', 'Tạm ngưng', 'Đầy', 'Đã đóng'],
        default: 'Hoạt động'
    },
    // Loại điểm tiếp nhận - cho phép tùy chỉnh
    type: {
        type: String,
        required: true,
        trim: true,
        default: 'Điểm tiếp nhận cứu trợ'
    },
    // Loại cứu trợ tiếp nhận - cho phép nhiều loại (array)
    reliefType: {
        type: [String],
        default: ['Hỗn hợp'],
        validate: {
            validator: function(v) {
                return Array.isArray(v) && v.length > 0;
            },
            message: 'Phải chọn ít nhất một loại cứu trợ'
        }
    },
    // Thời gian hoạt động
    operatingHours: {
        type: String,
        default: null,
        trim: true
    },
    // Người phụ trách
    contactPerson: {
        type: String,
        default: null,
        trim: true
    },
    notes: {
        type: String,
        default: null,
        trim: true
    }
}, {
    timestamps: true // Tự động thêm createdAt, updatedAt
});

// Index để query nhanh
reliefPointSchema.index({ lat: 1, lng: 1 }); // Geospatial query
reliefPointSchema.index({ status: 1 }); // Filter theo status
reliefPointSchema.index({ type: 1 }); // Filter theo type
reliefPointSchema.index({ reliefType: 1 }); // Filter theo loại cứu trợ (array - MongoDB sẽ index từng phần tử)
reliefPointSchema.index({ createdAt: -1 }); // Sort theo thời gian tạo

const ReliefPoint = mongoose.model('ReliefPoint', reliefPointSchema);

export default ReliefPoint;

