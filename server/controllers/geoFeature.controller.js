import GeoFeature from '../models/GeoFeature.model.js';
import { saveBase64Image } from '../config/upload.config.js';
import logger from '../utils/logger.js';

/**
 * GET /api/geo-features
 * Lấy danh sách GeoFeatures với filter
 */
export const getGeoFeatures = async (req, res) => {
    try {
        const {
            category,
            status,
            geometryType,
            page = 1,
            limit = 100
        } = req.query;

        // Build query
        const query = {};

        if (category) {
            query['properties.category'] = category;
        }

        if (status) {
            query['properties.status'] = status;
        }

        if (geometryType) {
            query['geometry.type'] = geometryType;
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await GeoFeature.countDocuments(query);

        const features = await GeoFeature.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Format response theo chuẩn GeoJSON FeatureCollection
        const featureCollection = {
            type: 'FeatureCollection',
            features: features.map(f => ({
                type: f.type,
                geometry: f.geometry,
                properties: {
                    ...f.properties,
                    id: f._id.toString(),
                    createdAt: f.createdAt,
                    updatedAt: f.updatedAt
                }
            }))
        };

        res.json({
            success: true,
            data: featureCollection.features,
            featureCollection, // Trả về cả FeatureCollection format
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        logger.error('Lỗi lấy GeoFeatures:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách GeoFeatures',
            error: error.message
        });
    }
};

/**
 * GET /api/geo-features/:id
 * Lấy một GeoFeature theo ID
 */
export const getGeoFeatureById = async (req, res) => {
    try {
        const { id } = req.params;

        const feature = await GeoFeature.findById(id);

        if (!feature) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy GeoFeature'
            });
        }

        res.json({
            success: true,
            data: {
                type: feature.type,
                geometry: feature.geometry,
                properties: {
                    ...feature.properties,
                    id: feature._id.toString(),
                    createdAt: feature.createdAt,
                    updatedAt: feature.updatedAt
                }
            }
        });
    } catch (error) {
        logger.error('Lỗi lấy GeoFeature:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy GeoFeature',
            error: error.message
        });
    }
};

/**
 * POST /api/geo-features
 * Tạo GeoFeature mới
 */
export const createGeoFeature = async (req, res) => {
    try {
        const { type, geometry, properties, imageBase64 } = req.body;

        // Validate input
        if (!type || type !== 'Feature') {
            return res.status(400).json({
                success: false,
                message: 'Type phải là "Feature"'
            });
        }

        if (!geometry || !geometry.type || !geometry.coordinates) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu geometry hoặc coordinates'
            });
        }

        if (!['LineString', 'Polygon', 'Point'].includes(geometry.type)) {
            return res.status(400).json({
                success: false,
                message: 'Geometry type phải là LineString, Polygon hoặc Point'
            });
        }

        if (!properties || !properties.name || !properties.category) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu properties.name hoặc properties.category'
            });
        }

        // Lưu hình ảnh hiện trường (nếu có)
        let imagePath = null;
        if (imageBase64) {
            try {
                // Validate base64 string
                if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
                    console.warn('⚠️  Base64 string không hợp lệ hoặc quá ngắn');
                } else {
                    console.log('💾 Đang lưu hình ảnh hiện trường...');
                    console.log('📏 Kích thước base64:', imageBase64.length, 'bytes');
                    // Lưu vào thư mục geo-features
                    imagePath = saveBase64Image(imageBase64, 'geo-features');
                    console.log('✅ Lưu thành công:', imagePath);
                }
            } catch (uploadError) {
                logger.error('Lỗi lưu hình ảnh hiện trường', uploadError, req);
                // Không fail request nếu lưu ảnh lỗi
            }
        } else {
            console.log('ℹ️  Không có hình ảnh trong request');
        }

        // Validate category match với geometry type (linh hoạt hơn)
        // Một số category có thể dùng nhiều geometry type
        const categoryGeometryMap = {
            // LineString categories
            'Đường sạt lở': ['LineString'],
            'Đường nguy hiểm': ['LineString'],
            'Tuyến đường': ['LineString'],
            // Polygon categories
            'Vùng nguy hiểm': ['Polygon'],
            'Vùng an toàn': ['Polygon'],
            'Vùng cứu hộ hoạt động': ['Polygon'],
            'Khu vực sơ tán': ['Polygon'],
            'Vùng ngập lụt': ['Polygon'],
            // Point categories
            'Điểm nguy hiểm': ['Point'],
            'Điểm cứu hộ': ['Point'],
            'Điểm sơ tán': ['Point']
        };

        // Nếu category có trong map, validate geometry type
        if (categoryGeometryMap[properties.category]) {
            if (!categoryGeometryMap[properties.category].includes(geometry.type)) {
                return res.status(400).json({
                    success: false,
                    message: `Category "${properties.category}" yêu cầu geometry type ${categoryGeometryMap[properties.category].join(' hoặc ')}, nhưng nhận được "${geometry.type}"`
                });
            }
        }
        // Nếu category không có trong map (custom category), cho phép tất cả geometry types

        // Tạo GeoFeature
        const geoFeature = new GeoFeature({
            type: 'Feature',
            geometry: {
                type: geometry.type,
                coordinates: geometry.coordinates
            },
            properties: {
                name: properties.name,
                category: properties.category,
                description: properties.description || null,
                severity: properties.severity || 'Trung bình',
                color: properties.color || '#ff0000',
                status: properties.status || 'Hoạt động',
                notes: properties.notes || null,
                imagePath: imagePath,
                createdBy: properties.createdBy || 'Admin'
            }
        });

        await geoFeature.save();

        res.status(201).json({
            success: true,
            message: 'Đã tạo GeoFeature thành công',
            data: {
                type: geoFeature.type,
                geometry: geoFeature.geometry,
                properties: {
                    ...geoFeature.properties,
                    id: geoFeature._id.toString(),
                    createdAt: geoFeature.createdAt,
                    updatedAt: geoFeature.updatedAt
                }
            }
        });
    } catch (error) {
        logger.error('Lỗi tạo GeoFeature:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo GeoFeature',
            error: error.message
        });
    }
};

/**
 * PUT /api/geo-features/:id
 * Cập nhật GeoFeature
 */
export const updateGeoFeature = async (req, res) => {
    try {
        const { id } = req.params;
        const { geometry, properties } = req.body;

        const feature = await GeoFeature.findById(id);

        if (!feature) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy GeoFeature'
            });
        }

        // Update geometry nếu có
        if (geometry) {
            if (geometry.type && !['LineString', 'Polygon', 'Point'].includes(geometry.type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Geometry type không hợp lệ'
                });
            }

            feature.geometry = {
                type: geometry.type || feature.geometry.type,
                coordinates: geometry.coordinates || feature.geometry.coordinates
            };
        }

        // Update properties nếu có
        if (properties) {
            if (properties.name) feature.properties.name = properties.name;
            if (properties.category) {
                // Validate category match với geometry type nếu có thay đổi
                const categoryGeometryMap = {
                    'Đường sạt lở': ['LineString'],
                    'Đường nguy hiểm': ['LineString'],
                    'Tuyến đường': ['LineString'],
                    'Vùng nguy hiểm': ['Polygon'],
                    'Vùng an toàn': ['Polygon'],
                    'Vùng cứu hộ hoạt động': ['Polygon'],
                    'Khu vực sơ tán': ['Polygon'],
                    'Vùng ngập lụt': ['Polygon'],
                    'Điểm nguy hiểm': ['Point'],
                    'Điểm cứu hộ': ['Point'],
                    'Điểm sơ tán': ['Point']
                };

                // Nếu category có trong map, validate geometry type
                if (categoryGeometryMap[properties.category]) {
                    if (!categoryGeometryMap[properties.category].includes(feature.geometry.type)) {
                        return res.status(400).json({
                            success: false,
                            message: `Category "${properties.category}" yêu cầu geometry type ${categoryGeometryMap[properties.category].join(' hoặc ')}, nhưng feature có "${feature.geometry.type}"`
                        });
                    }
                }
                // Nếu category không có trong map (custom category), cho phép tất cả geometry types
                feature.properties.category = properties.category;
            }
            if (properties.description !== undefined) feature.properties.description = properties.description;
            if (properties.severity) feature.properties.severity = properties.severity;
            if (properties.color) feature.properties.color = properties.color;
            if (properties.status) feature.properties.status = properties.status;
            if (properties.notes !== undefined) feature.properties.notes = properties.notes;
        }

        // Xử lý upload ảnh mới (nếu có)
        if (req.body.imageBase64) {
            try {
                // Validate base64 string
                if (typeof req.body.imageBase64 === 'string' && req.body.imageBase64.length >= 100) {
                    console.log('💾 Đang lưu hình ảnh hiện trường mới...');
                    // Xóa ảnh cũ nếu có
                    if (feature.properties.imagePath) {
                        try {
                            const fs = await import('fs');
                            const path = await import('path');
                            const { fileURLToPath } = await import('url');
                            const { dirname } = await import('path');

                            const __filename = fileURLToPath(import.meta.url);
                            const __dirname = dirname(__filename);
                            const oldImagePath = path.join(__dirname, '..', feature.properties.imagePath);

                            if (fs.existsSync(oldImagePath)) {
                                fs.unlinkSync(oldImagePath);
                                console.log(`🗑️  Đã xóa ảnh cũ: ${oldImagePath}`);
                            }
                        } catch (deleteError) {
                            console.warn('⚠️  Không thể xóa ảnh cũ:', deleteError);
                        }
                    }
                    // Lưu ảnh mới
                    const newImagePath = saveBase64Image(req.body.imageBase64, 'geo-features');
                    feature.properties.imagePath = newImagePath;
                    console.log('✅ Lưu ảnh mới thành công:', newImagePath);
                } else {
                    console.warn('⚠️  Base64 string không hợp lệ hoặc quá ngắn');
                }
            } catch (uploadError) {
                logger.error('Lỗi lưu hình ảnh hiện trường', uploadError, req);
                // Không fail request nếu lưu ảnh lỗi
            }
        }

        await feature.save();

        res.json({
            success: true,
            message: 'Đã cập nhật GeoFeature thành công',
            data: {
                type: feature.type,
                geometry: feature.geometry,
                properties: {
                    ...feature.properties,
                    id: feature._id.toString(),
                    createdAt: feature.createdAt,
                    updatedAt: feature.updatedAt
                }
            }
        });
    } catch (error) {
        logger.error('Lỗi cập nhật GeoFeature:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật GeoFeature',
            error: error.message
        });
    }
};

/**
 * DELETE /api/geo-features/:id
 * Xóa GeoFeature
 */
export const deleteGeoFeature = async (req, res) => {
    try {
        const { id } = req.params;

        const feature = await GeoFeature.findByIdAndDelete(id);

        if (!feature) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy GeoFeature'
            });
        }

        // Xóa hình ảnh nếu có
        if (feature.properties?.imagePath) {
            try {
                const fs = await import('fs');
                const path = await import('path');
                const { fileURLToPath } = await import('url');
                const { dirname } = await import('path');

                const __filename = fileURLToPath(import.meta.url);
                const __dirname = dirname(__filename);
                const imagePath = path.join(__dirname, '..', feature.properties.imagePath);

                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    console.log(`🗑️  Đã xóa hình ảnh: ${imagePath}`);
                }
            } catch (imgError) {
                console.warn('⚠️  Không thể xóa hình ảnh:', imgError);
                // Không fail nếu không xóa được ảnh
            }
        }

        res.json({
            success: true,
            message: 'Đã xóa GeoFeature thành công'
        });
    } catch (error) {
        logger.error('Lỗi xóa GeoFeature:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa GeoFeature',
            error: error.message
        });
    }
};

/**
 * GET /api/geo-features/feature-collection
 * Lấy tất cả features dưới dạng GeoJSON FeatureCollection (cho frontend render)
 */
export const getFeatureCollection = async (req, res) => {
    try {
        const { category, status, geometryType } = req.query;

        const query = {};

        if (category) {
            query['properties.category'] = category;
        }

        if (status) {
            query['properties.status'] = status;
        }

        if (geometryType) {
            query['geometry.type'] = geometryType;
        }

        const features = await GeoFeature.find(query)
            .sort({ createdAt: -1 })
            .lean();

        const featureCollection = {
            type: 'FeatureCollection',
            features: features.map(f => ({
                type: f.type,
                geometry: f.geometry,
                properties: {
                    ...f.properties,
                    id: f._id.toString()
                }
            }))
        };

        res.json({
            success: true,
            data: featureCollection
        });
    } catch (error) {
        logger.error('Lỗi lấy FeatureCollection:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy FeatureCollection',
            error: error.message
        });
    }
};

