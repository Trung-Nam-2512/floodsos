import mongoose from 'mongoose';

/**
 * Schema cho điểm trú ẩn / đội cứu hộ
 */
const safePointSchema = new mongoose.Schema({
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
    capacity: {
        type: Number,
        default: 0,
        min: 0
    },
    description: {
        type: String,
        default: null,
        trim: true
    },
    status: {
        type: String,
        enum: ['Hoạt động', 'Tạm ngưng', 'Đầy'],
        default: 'Hoạt động'
    },
    type: {
        type: String,
        enum: ['Điểm trú ẩn', 'Đội cứu hộ', 'Bệnh viện', 'Trạm y tế', 'Khác'],
        default: 'Điểm trú ẩn'
    },
    rescueType: {
        type: String,
        enum: ['Ca nô', 'Xe cứu hộ', 'Thuyền', 'Máy bay trực thăng', 'Khác'],
        default: null
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
safePointSchema.index({ lat: 1, lng: 1 }); // Geospatial query
safePointSchema.index({ status: 1 }); // Filter theo status
safePointSchema.index({ type: 1 }); // Filter theo type

const SafePoint = mongoose.model('SafePoint', safePointSchema);

export default SafePoint;


