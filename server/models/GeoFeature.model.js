import mongoose from 'mongoose';

/**
 * Schema cho GeoJSON Features (Line, Polygon, Point)
 * Tuân thủ chuẩn GeoJSON RFC 7946
 */
const geoFeatureSchema = new mongoose.Schema({
    // GeoJSON type - phải là "Feature"
    type: {
        type: String,
        enum: ['Feature'],
        default: 'Feature',
        required: true
    },
    // Geometry object - chứa type và coordinates
    geometry: {
        type: {
            type: String,
            enum: ['LineString', 'Polygon', 'Point'],
            required: true
        },
        // Coordinates theo chuẩn GeoJSON: [lng, lat] hoặc [[lng, lat], ...]
        coordinates: {
            type: mongoose.Schema.Types.Mixed, // Flexible để chứa array lồng nhau
            required: true,
            validate: {
                validator: function (coords) {
                    // Validate coordinates dựa trên geometry type
                    if (this.geometry.type === 'Point') {
                        return Array.isArray(coords) && coords.length === 2 &&
                            typeof coords[0] === 'number' && typeof coords[1] === 'number';
                    } else if (this.geometry.type === 'LineString') {
                        return Array.isArray(coords) && coords.length >= 2 &&
                            coords.every(coord => Array.isArray(coord) && coord.length === 2 &&
                                typeof coord[0] === 'number' && typeof coord[1] === 'number');
                    } else if (this.geometry.type === 'Polygon') {
                        return Array.isArray(coords) && coords.length > 0 &&
                            Array.isArray(coords[0]) && coords[0].length >= 4 &&
                            coords[0].every(coord => Array.isArray(coord) && coord.length === 2 &&
                                typeof coord[0] === 'number' && typeof coord[1] === 'number');
                    }
                    return false;
                },
                message: 'Coordinates không hợp lệ theo chuẩn GeoJSON'
            }
        }
    },
    // Properties - metadata của feature
    properties: {
        // Tên/mô tả
        name: {
            type: String,
            required: true,
            trim: true
        },
        // Loại đối tượng - Cho phép tự nhập, không giới hạn enum
        category: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 100
        },
        // Mô tả chi tiết
        description: {
            type: String,
            default: null,
            trim: true
        },
        // Mức độ nguy hiểm
        severity: {
            type: String,
            enum: ['Cao', 'Trung bình', 'Thấp'],
            default: 'Trung bình'
        },
        // Màu sắc để hiển thị (hex color)
        color: {
            type: String,
            default: '#ff0000',
            match: /^#[0-9A-Fa-f]{6}$/
        },
        // Trạng thái
        status: {
            type: String,
            enum: ['Hoạt động', 'Đã xử lý', 'Tạm ngưng'],
            default: 'Hoạt động'
        },
        // Ghi chú nội bộ
        notes: {
            type: String,
            default: null,
            trim: true
        },
        // Đường dẫn ảnh hiện trường
        imagePath: {
            type: String,
            default: null
        },
        // Người tạo
        createdBy: {
            type: String,
            default: 'Admin'
        }
    }
}, {
    timestamps: true, // Tự động thêm createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Index để query nhanh
geoFeatureSchema.index({ 'geometry.type': 1 });
geoFeatureSchema.index({ 'properties.category': 1 });
geoFeatureSchema.index({ 'properties.status': 1 });
geoFeatureSchema.index({ createdAt: -1 });

// Geospatial index - CHỈ cho Point geometry (không index Polygon/LineString vì có coordinates phức tạp)
// Sử dụng partial index để chỉ index Point
// LƯU Ý: Nếu đã có index cũ, cần chạy script fixGeoFeatureIndex.js để xóa và tạo lại
geoFeatureSchema.index(
    { 'geometry.coordinates': '2dsphere' },
    {
        partialFilterExpression: { 'geometry.type': 'Point' },
        name: 'geometry_coordinates_2dsphere_point_only',
        sparse: true // Thêm sparse để tránh lỗi với non-Point geometries
    }
);

// Virtual để trả về đúng format GeoJSON Feature
geoFeatureSchema.virtual('geoJSON').get(function () {
    return {
        type: this.type,
        geometry: this.geometry,
        properties: this.properties
    };
});

// Method để lấy bounding box
geoFeatureSchema.methods.getBoundingBox = function () {
    const coords = this.geometry.coordinates;

    if (this.geometry.type === 'Point') {
        return [coords, coords]; // [SW, NE]
    } else if (this.geometry.type === 'LineString') {
        const lngs = coords.map(c => c[0]);
        const lats = coords.map(c => c[1]);
        return [
            [Math.min(...lngs), Math.min(...lats)], // SW
            [Math.max(...lngs), Math.max(...lats)]  // NE
        ];
    } else if (this.geometry.type === 'Polygon') {
        // Polygon có thể có nhiều rings, lấy ring đầu tiên
        const ring = coords[0];
        const lngs = ring.map(c => c[0]);
        const lats = ring.map(c => c[1]);
        return [
            [Math.min(...lngs), Math.min(...lats)], // SW
            [Math.max(...lngs), Math.max(...lats)]  // NE
        ];
    }
    return null;
};

const GeoFeature = mongoose.model('GeoFeature', geoFeatureSchema);

export default GeoFeature;

