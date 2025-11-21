import mongoose from 'mongoose';

/**
 * Schema cho Hotline cứu hộ
 */
const hotlineSchema = new mongoose.Schema({
    province: {
        type: String,
        required: true,
        trim: true
    },
    unit: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    note: {
        type: String,
        default: '',
        trim: true
    },
    imageUrl: {
        type: String,
        default: null // Đường dẫn tới hình ảnh hotline (local path hoặc external URL)
    },
    imageTitle: {
        type: String,
        default: null // Tiêu đề do user tự định nghĩa
    }
}, {
    timestamps: true // Tự động thêm createdAt, updatedAt
});

// Index để query nhanh
hotlineSchema.index({ province: 1 });
hotlineSchema.index({ unit: 1 });

const Hotline = mongoose.model('Hotline', hotlineSchema);

export default Hotline;

