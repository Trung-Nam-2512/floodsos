import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Tiêu đề không được để trống'],
        trim: true,
        maxlength: [500, 'Tiêu đề không được quá 500 ký tự']
    },
    content: {
        type: String,
        required: [true, 'Nội dung không được để trống'],
        trim: true
    },
    imagePath: {
        type: String,
        default: null // Đường dẫn đến file ảnh trong uploads/news/
    },
    sourceUrl: {
        type: String,
        default: null, // Link nguồn nếu có
        trim: true
    },
    category: {
        type: String,
        required: [true, 'Phân loại không được để trống'],
        enum: {
            values: ['thông báo khẩn', 'hướng dẫn', 'cập nhật tình hình'],
            message: 'Phân loại phải là: thông báo khẩn, hướng dẫn, hoặc cập nhật tình hình'
        },
        default: 'cập nhật tình hình'
    },
    // Thông tin người đăng (admin)
    author: {
        type: String,
        default: 'Admin',
        trim: true
    },
    // Trạng thái (để mở rộng sau nếu cần duyệt)
    status: {
        type: String,
        enum: ['published', 'draft'],
        default: 'published'
    },
    // Số lượt xem (để thống kê sau)
    views: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true, // Tự động thêm createdAt và updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Index để tìm kiếm nhanh
newsSchema.index({ category: 1, createdAt: -1 });
newsSchema.index({ status: 1, createdAt: -1 });

// Virtual để lấy image URL
newsSchema.virtual('imageUrl').get(function() {
    if (this.imagePath) {
        return this.imagePath.startsWith('http') ? this.imagePath : `/${this.imagePath}`;
    }
    return null;
});

const News = mongoose.model('News', newsSchema);

export default News;


