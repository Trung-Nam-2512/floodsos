import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Space, Typography, Row, Col, Button, Table, Tag, message, Modal, Form, Input, Select, Popconfirm, AutoComplete, Upload } from 'antd';
import { EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, DownloadOutlined, UploadOutlined, CameraOutlined } from '@ant-design/icons';
import Map from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import axios from 'axios';
import { resizeImageForUpload } from '../utils/imageResize';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea, Search } = Input;

// Trong production (Docker), VITE_API_URL có thể là empty để dùng relative path /api (nginx proxy)
// Trong development, dùng localhost:5000
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || (import.meta.env.MODE === 'production' ? '' : 'http://localhost:5000');
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.REACT_APP_MAPBOX_TOKEN || '';

function GeoFeatureManager() {
    const [geoFeatures, setGeoFeatures] = useState([]);
    const [loadingGeoFeatures, setLoadingGeoFeatures] = useState(false);
    const [geoFeatureModalVisible, setGeoFeatureModalVisible] = useState(false);
    const [editingGeoFeature, setEditingGeoFeature] = useState(null);
    const [geoFeatureForm] = Form.useForm();
    const [drawMode, setDrawMode] = useState(null); // 'line', 'polygon', 'point', null
    const [mapViewState, setMapViewState] = useState({
        longitude: 108.2772,
        latitude: 14.0583,
        zoom: 10
    });
    const mapInstanceRef = useRef(null);
    const drawRef = useRef(null);
    const [filterCategory, setFilterCategory] = useState(null);
    const [filterStatus, setFilterStatus] = useState(null);
    const [filterSeverity, setFilterSeverity] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [selectedFeature, setSelectedFeature] = useState(null);
    const [featureDetailModalVisible, setFeatureDetailModalVisible] = useState(false);

    // Lấy danh sách category từ database để suggest
    const [categoryOptions, setCategoryOptions] = useState([
        'Đường sạt lở',
        'Vùng nguy hiểm',
        'Điểm nguy hiểm',
        'Vùng an toàn',
        'Vùng cứu hộ hoạt động',
        'Khu vực sơ tán',
        'Điểm cứu hộ',
        'Điểm sơ tán',
        'Vùng ngập lụt',
        'Đường nguy hiểm',
        'Tuyến đường'
    ]);

    // Fetch GeoFeatures với filters
    const fetchGeoFeatures = async () => {
        setLoadingGeoFeatures(true);
        try {
            const params = new URLSearchParams();
            if (filterCategory) params.append('category', filterCategory);
            if (filterStatus) params.append('status', filterStatus);
            if (filterSeverity) params.append('severity', filterSeverity);

            const response = await axios.get(`${API_URL}/api/geo-features?${params}`);
            if (response.data.success) {
                let features = response.data.data;

                // Client-side search filter
                if (searchText) {
                    const searchLower = searchText.toLowerCase();
                    features = features.filter(f =>
                        f.properties?.name?.toLowerCase().includes(searchLower) ||
                        f.properties?.description?.toLowerCase().includes(searchLower)
                    );
                }

                setGeoFeatures(features);

                // Cập nhật category options từ database (unique categories)
                const uniqueCategories = [...new Set(features.map(f => f.properties?.category).filter(Boolean))];
                setCategoryOptions(prev => {
                    const combined = [...new Set([...prev, ...uniqueCategories])];
                    return combined.sort();
                });

                // Note: loadFeaturesToMap will be called via useEffect when geoFeatures changes
            }
        } catch (error) {
            console.error('Lỗi lấy GeoFeatures:', error);
            message.error('Không thể tải danh sách GeoFeatures');
        } finally {
            setLoadingGeoFeatures(false);
        }
    };

    // Initialize Mapbox Draw
    const initializeDraw = (mapInstance) => {
        if (!mapInstance || drawRef.current) return;

        const draw = new MapboxDraw({
            displayControlsDefault: false,
            controls: {
                point: true,
                line_string: true,
                polygon: true,
                trash: true
            },
            defaultMode: 'simple_select'
        });

        mapInstance.addControl(draw, 'top-left');
        drawRef.current = draw;

        // Listen to draw events
        mapInstance.on('draw.create', handleDrawCreate);
        mapInstance.on('draw.update', handleDrawUpdate);
        mapInstance.on('draw.delete', handleDrawDelete);

        console.log('✅ Mapbox Draw initialized');
    };

    // Setup custom layers để render features với màu từ properties
    const setupCustomLayers = (mapInstance) => {
        if (!mapInstance) return;

        const sourceId = 'geo-features-source';
        const layers = {
            polygon: 'geo-features-polygon',
            polygonOutline: 'geo-features-polygon-outline',
            line: 'geo-features-line',
            point: 'geo-features-point'
        };

        // Remove existing layers and source if they exist
        try {
            if (mapInstance.getLayer(layers.polygon)) mapInstance.removeLayer(layers.polygon);
            if (mapInstance.getLayer(layers.polygonOutline)) mapInstance.removeLayer(layers.polygonOutline);
            if (mapInstance.getLayer(layers.line)) mapInstance.removeLayer(layers.line);
            if (mapInstance.getLayer(layers.point)) mapInstance.removeLayer(layers.point);
            if (mapInstance.getSource(sourceId)) mapInstance.removeSource(sourceId);
        } catch (err) {
            // Ignore if doesn't exist
        }

        // Add source
        mapInstance.addSource(sourceId, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        // Add polygon fill layer
        mapInstance.addLayer({
            id: layers.polygon,
            type: 'fill',
            source: sourceId,
            filter: ['==', '$type', 'Polygon'],
            paint: {
                'fill-color': [
                    'coalesce',
                    ['get', 'color'],
                    '#ff0000' // Fallback color
                ],
                'fill-opacity': 0.3
            }
        });

        // Add polygon outline layer
        mapInstance.addLayer({
            id: layers.polygonOutline,
            type: 'line',
            source: sourceId,
            filter: ['==', '$type', 'Polygon'],
            paint: {
                'line-color': [
                    'coalesce',
                    ['get', 'color'],
                    '#ff0000' // Fallback color
                ],
                'line-width': 2
            }
        });

        // Add line layer
        mapInstance.addLayer({
            id: layers.line,
            type: 'line',
            source: sourceId,
            filter: ['==', '$type', 'LineString'],
            paint: {
                'line-color': [
                    'coalesce',
                    ['get', 'color'],
                    '#ff0000' // Fallback color
                ],
                'line-width': 2
            }
        });

        // Add point layer
        mapInstance.addLayer({
            id: layers.point,
            type: 'circle',
            source: sourceId,
            filter: ['==', '$type', 'Point'],
            paint: {
                'circle-color': [
                    'coalesce',
                    ['get', 'color'],
                    '#ff0000' // Fallback color
                ],
                'circle-radius': 6,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            }
        });

        // Đảm bảo custom layers hiển thị trên Mapbox Draw layers
        // Mapbox Draw layers có prefix 'gl-draw-', cần đảm bảo custom layers ở trên
        console.log('✅ Custom layers setup complete');
    };

    // Handle draw create
    const handleDrawCreate = (e) => {
        const feature = e.features[0];

        // Determine category based on geometry type (suggest default)
        const defaultCategoryMap = {
            'LineString': 'Đường sạt lở',
            'Polygon': 'Vùng nguy hiểm',
            'Point': 'Điểm nguy hiểm'
        };

        const category = defaultCategoryMap[feature.geometry.type] || '';

        // Open modal to enter name and details
        setEditingGeoFeature({
            ...feature,
            properties: {
                ...feature.properties,
                category: category
            }
        });

        // Reset image state
        setImageFile(null);
        setPreviewImage(null);

        // Set form values after modal is opened
        setTimeout(() => {
            geoFeatureForm.setFieldsValue({
                name: '',
                category: category,
                description: '',
                severity: 'Trung bình',
                color: '#ff0000',
                status: 'Hoạt động',
                notes: ''
            });
        }, 0);

        setGeoFeatureModalVisible(true);

        // Exit draw mode - Use setTimeout to avoid infinite loop
        setTimeout(() => {
            if (drawRef.current) {
                try {
                    drawRef.current.changeMode('simple_select');
                    setDrawMode(null);
                } catch (err) {
                    console.warn('Error changing draw mode:', err);
                }
            }
        }, 100);
    };

    // Handle draw update
    const handleDrawUpdate = (e) => {
        const feature = e.features[0];
        // Chỉ update nếu feature đã có database ID (đã lưu)
        // Tránh update khi đang vẽ feature mới (chưa có ID từ database)
        if (feature.properties?.id &&
            typeof feature.properties.id === 'string' &&
            feature.properties.id.length === 24) {
            const existingFeature = geoFeatures.find(f => f.properties.id === feature.properties.id);
            if (existingFeature) {
                updateGeoFeatureFromDraw(feature, feature.properties.id);
            }
        }
    };

    // Handle draw delete
    const handleDrawDelete = async (e) => {
        const featureIds = e.features.map(f => f.properties?.id || f.id).filter(Boolean);
        for (const id of featureIds) {
            const feature = geoFeatures.find(f => f.properties.id === id);
            if (feature && feature.properties.id && feature.properties.id.length === 24) {
                try {
                    await axios.delete(`${API_URL}/api/geo-features/${feature.properties.id}`);
                    message.success('Đã xóa đối tượng');
                } catch (error) {
                    console.error('Lỗi xóa GeoFeature:', error);
                    message.error('Lỗi khi xóa đối tượng');
                }
            }
        }
        fetchGeoFeatures();
    };

    // Set draw mode
    const setDrawModeHandler = (mode) => {
        if (!drawRef.current || !mapInstanceRef.current) return;

        if (mode === null) {
            drawRef.current.changeMode('simple_select');
            setDrawMode(null);
        } else {
            const modeMap = {
                'line': 'draw_line_string',
                'polygon': 'draw_polygon',
                'point': 'draw_point'
            };
            drawRef.current.changeMode(modeMap[mode]);
            setDrawMode(mode);
        }
    };

    // Load features to map using custom layers (not Mapbox Draw)
    const loadFeaturesToMap = useCallback(() => {
        if (!mapInstanceRef.current) {
            console.warn('Map instance not ready');
            return;
        }

        try {
            const sourceId = 'geo-features-source';
            const source = mapInstanceRef.current.getSource(sourceId);

            if (!source) {
                // Setup layers if not already done
                setupCustomLayers(mapInstanceRef.current);
            }

            // Convert geoFeatures to GeoJSON FeatureCollection với color ở top level của properties
            const featuresForMap = geoFeatures.map(feature => {
                // Lấy color từ properties, đảm bảo format đúng
                let color = feature.properties?.color || '#ff0000';

                // Validate color format (phải là hex color)
                if (!color.startsWith('#')) {
                    color = '#' + color;
                }
                if (color.length !== 7) {
                    console.warn('⚠️ Invalid color format:', color, 'for feature:', feature.properties?.name);
                    color = '#ff0000';
                }

                console.log('📝 Feature:', feature.properties?.name, '| Color:', color, '| Original:', feature.properties?.color);

                return {
                    type: feature.type || 'Feature',
                    geometry: feature.geometry,
                    properties: {
                        ...feature.properties,
                        // Đảm bảo color ở top level để Mapbox có thể đọc
                        color: color,
                        id: feature.properties.id
                    }
                };
            });

            const featureCollection = {
                type: 'FeatureCollection',
                features: featuresForMap
            };

            // Update source data
            if (mapInstanceRef.current.getSource(sourceId)) {
                mapInstanceRef.current.getSource(sourceId).setData(featureCollection);
                console.log('✅ Loaded', featuresForMap.length, 'features to map with custom colors');
                console.log('🎨 Colors:', featuresForMap.map(f => ({ name: f.properties.name, color: f.properties.color })));
            } else {
                console.error('❌ Source not found, setting up layers...');
                setupCustomLayers(mapInstanceRef.current);
                setTimeout(() => {
                    if (mapInstanceRef.current.getSource(sourceId)) {
                        mapInstanceRef.current.getSource(sourceId).setData(featureCollection);
                    }
                }, 100);
            }
        } catch (error) {
            console.error('❌ Lỗi load features to map:', error);
        }
    }, [geoFeatures]);

    // Xử lý upload ảnh
    const handleImageChange = (info) => {
        let file = null;

        if (info.file) {
            if (info.file.originFileObj) {
                file = info.file.originFileObj;
            } else if (info.file instanceof File) {
                file = info.file;
            } else if (info.fileList && info.fileList.length > 0) {
                const firstFile = info.fileList[0];
                file = firstFile.originFileObj || firstFile;
            }
        } else if (info.fileList && info.fileList.length > 0) {
            const firstFile = info.fileList[0];
            file = firstFile.originFileObj || firstFile;
        }

        if (file && file instanceof File) {
            setImageFile(file);
            // Tạo preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result);
            };
            reader.readAsDataURL(file);
            message.success(`Đã chọn ảnh: ${file.name}`);
        } else {
            if (info.fileList && info.fileList.length === 0) {
                setImageFile(null);
                setPreviewImage(null);
            }
        }
    };

    // Save GeoFeature
    const handleGeoFeatureSubmit = async (values) => {
        if (!editingGeoFeature) return;

        try {
            // Resize và convert ảnh sang base64 nếu có
            let imageBase64 = null;
            if (imageFile) {
                try {
                    const processingMessage = message.loading('Đang xử lý và nén ảnh...', 0);
                    imageBase64 = await resizeImageForUpload(imageFile);
                    processingMessage();
                } catch (imgError) {
                    console.error('❌ Lỗi xử lý ảnh:', imgError);
                    message.warning('Không thể xử lý ảnh, sẽ gửi không có ảnh');
                }
            }

            // Ensure coordinates are properly formatted
            let geometry = { ...editingGeoFeature.geometry };

            // Validate and clean coordinates
            if (geometry.type === 'Point') {
                if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 2) {
                    message.error('Tọa độ Point không hợp lệ');
                    return;
                }
            } else if (geometry.type === 'LineString') {
                if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
                    message.error('LineString phải có ít nhất 2 điểm');
                    return;
                }
                // Ensure each coordinate is [lng, lat]
                geometry.coordinates = geometry.coordinates.map(coord => {
                    if (Array.isArray(coord) && coord.length === 2) {
                        return [Number(coord[0]), Number(coord[1])];
                    }
                    return coord;
                });
            } else if (geometry.type === 'Polygon') {
                if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
                    message.error('Polygon phải có ít nhất 1 ring');
                    return;
                }
                // Ensure each ring is properly formatted
                geometry.coordinates = geometry.coordinates.map(ring => {
                    if (Array.isArray(ring)) {
                        const cleanedRing = ring.map(coord => {
                            if (Array.isArray(coord) && coord.length === 2) {
                                return [Number(coord[0]), Number(coord[1])];
                            }
                            return coord;
                        });

                        // Validate Polygon ring phải đóng kín (điểm đầu = điểm cuối)
                        if (cleanedRing.length >= 4) {
                            const first = cleanedRing[0];
                            const last = cleanedRing[cleanedRing.length - 1];
                            // Nếu chưa đóng kín, tự động đóng
                            if (first[0] !== last[0] || first[1] !== last[1]) {
                                cleanedRing.push([first[0], first[1]]);
                            }
                        } else {
                            message.error('Polygon ring phải có ít nhất 4 điểm');
                            return null;
                        }

                        return cleanedRing;
                    }
                    return ring;
                }).filter(ring => ring !== null);

                if (geometry.coordinates.length === 0) {
                    message.error('Polygon không hợp lệ');
                    return;
                }
            }

            const geoFeatureData = {
                type: 'Feature',
                geometry: geometry,
                properties: {
                    name: values.name,
                    category: values.category,
                    description: values.description || null,
                    severity: values.severity,
                    color: values.color,
                    status: values.status,
                    notes: values.notes || null
                }
            };

            const response = await axios.post(`${API_URL}/api/geo-features`, {
                ...geoFeatureData,
                imageBase64: imageBase64
            });

            if (response.data.success) {
                message.success('Đã lưu GeoFeature thành công!');
                setGeoFeatureModalVisible(false);
                setEditingGeoFeature(null);
                setImageFile(null);
                setPreviewImage(null);
                geoFeatureForm.resetFields();

                // Remove temporary feature from draw (if it exists)
                if (drawRef.current && editingGeoFeature.id) {
                    try {
                        drawRef.current.delete(editingGeoFeature.id);
                    } catch (err) {
                        console.warn('Error deleting temporary feature from draw:', err);
                    }
                }

                // Reload features from database
                await fetchGeoFeatures();
            }
        } catch (error) {
            console.error('Lỗi lưu GeoFeature:', error);
            const errorMsg = error.response?.data?.message || error.response?.data?.error?.message || 'Lỗi khi lưu GeoFeature';
            message.error(errorMsg);
        }
    };

    // Update GeoFeature from draw
    const updateGeoFeatureFromDraw = async (feature, id) => {
        try {
            const response = await axios.put(`${API_URL}/api/geo-features/${id}`, {
                geometry: feature.geometry
            });

            if (response.data.success) {
                message.success('Đã cập nhật vị trí đối tượng');
                fetchGeoFeatures();
            }
        } catch (error) {
            console.error('Lỗi cập nhật GeoFeature:', error);
            message.error('Lỗi khi cập nhật vị trí');
        }
    };

    // Delete GeoFeature
    const handleDeleteGeoFeature = async (id) => {
        try {
            const response = await axios.delete(`${API_URL}/api/geo-features/${id}`);
            if (response.data.success) {
                message.success('Đã xóa GeoFeature thành công!');
                if (drawRef.current) {
                    const feature = geoFeatures.find(f => f.properties.id === id);
                    if (feature && feature.id) {
                        drawRef.current.delete(feature.id);
                    }
                }
                fetchGeoFeatures();
            }
        } catch (error) {
            console.error('Lỗi xóa GeoFeature:', error);
            message.error('Lỗi khi xóa GeoFeature');
        }
    };

    // Open edit modal
    const openGeoFeatureModal = (feature) => {
        setEditingGeoFeature(feature);
        setGeoFeatureModalVisible(true);
        // Reset image state
        setImageFile(null);
        // Set preview image nếu có ảnh cũ (lưu vào state để hiển thị)
        if (feature.properties?.imagePath) {
            const imageUrl = feature.properties.imagePath.startsWith('http')
                ? feature.properties.imagePath
                : `${API_URL}${feature.properties.imagePath}`;
            setPreviewImage(imageUrl);
        } else {
            setPreviewImage(null);
        }
        // Set form values after modal is opened to avoid warning
        setTimeout(() => {
            geoFeatureForm.setFieldsValue({
                name: feature.properties.name,
                category: feature.properties.category,
                description: feature.properties.description || '',
                severity: feature.properties.severity || 'Trung bình',
                color: feature.properties.color || '#ff0000',
                status: feature.properties.status || 'Hoạt động',
                notes: feature.properties.notes || ''
            });
        }, 0);
    };

    // Update GeoFeature
    const handleUpdateGeoFeature = async (values) => {
        if (!editingGeoFeature || !editingGeoFeature.properties.id) return;

        try {
            // Resize và convert ảnh sang base64 nếu có ảnh mới
            let imageBase64 = null;
            if (imageFile) {
                try {
                    const processingMessage = message.loading('Đang xử lý và nén ảnh...', 0);
                    imageBase64 = await resizeImageForUpload(imageFile);
                    processingMessage();
                } catch (imgError) {
                    console.error('❌ Lỗi xử lý ảnh:', imgError);
                    message.warning('Không thể xử lý ảnh, sẽ gửi không có ảnh');
                }
            }

            const response = await axios.put(`${API_URL}/api/geo-features/${editingGeoFeature.properties.id}`, {
                properties: {
                    name: values.name,
                    category: values.category,
                    description: values.description || null,
                    severity: values.severity,
                    color: values.color,
                    status: values.status,
                    notes: values.notes || null
                },
                imageBase64: imageBase64
            });

            if (response.data.success) {
                message.success('Đã cập nhật GeoFeature thành công!');
                setGeoFeatureModalVisible(false);
                setEditingGeoFeature(null);
                setImageFile(null);
                setPreviewImage(null);
                geoFeatureForm.resetFields();
                fetchGeoFeatures();
            }
        } catch (error) {
            console.error('Lỗi cập nhật GeoFeature:', error);
            message.error('Lỗi khi cập nhật GeoFeature');
        }
    };

    // Load features to map whenever geoFeatures state changes
    useEffect(() => {
        if (mapInstanceRef.current) {
            if (geoFeatures.length > 0) {
                // Small delay to ensure map is ready
                const timer = setTimeout(() => {
                    // Loading features to map
                    loadFeaturesToMap();
                }, 200);
                return () => clearTimeout(timer);
            } else {
                // Clear all features if list is empty
                try {
                    const sourceId = 'geo-features-source';
                    if (mapInstanceRef.current.getSource(sourceId)) {
                        mapInstanceRef.current.getSource(sourceId).setData({
                            type: 'FeatureCollection',
                            features: []
                        });
                    }
                } catch (err) {
                    console.warn('Error clearing features:', err);
                }
            }
        }
    }, [geoFeatures, loadFeaturesToMap]);

    // Load on mount and when filters change
    useEffect(() => {
        fetchGeoFeatures();
    }, [filterCategory, filterStatus, filterSeverity]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchGeoFeatures();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchText]);

    return (
        <Card>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <Title level={4}>
                            🗺️ Quản lý Đối tượng Bản đồ
                        </Title>
                        <Text type="secondary">
                            Vẽ và quản lý đường sạt lở, vùng nguy hiểm, điểm nguy hiểm trên bản đồ
                        </Text>
                    </div>
                    <Space>
                        <Button
                            type={drawMode === 'line' ? 'primary' : 'default'}
                            onClick={() => setDrawModeHandler(drawMode === 'line' ? null : 'line')}
                        >
                            📏 Vẽ Đường
                        </Button>
                        <Button
                            type={drawMode === 'polygon' ? 'primary' : 'default'}
                            onClick={() => setDrawModeHandler(drawMode === 'polygon' ? null : 'polygon')}
                        >
                            🔷 Vẽ Vùng
                        </Button>
                        <Button
                            type={drawMode === 'point' ? 'primary' : 'default'}
                            onClick={() => setDrawModeHandler(drawMode === 'point' ? null : 'point')}
                        >
                            📍 Vẽ Điểm
                        </Button>
                        <Button onClick={() => setDrawModeHandler(null)}>
                            ✋ Dừng vẽ
                        </Button>
                        <Button icon={<ReloadOutlined />} onClick={fetchGeoFeatures}>
                            Làm mới
                        </Button>
                    </Space>
                </div>

                {/* Filters */}
                <Card size="small" style={{ marginBottom: 16 }}>
                    <Space wrap style={{ width: '100%' }}>
                        <Input.Search
                            placeholder="Tìm theo tên hoặc mô tả"
                            allowClear
                            style={{ width: 250 }}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            onSearch={fetchGeoFeatures}
                        />
                        <AutoComplete
                            placeholder="Loại đối tượng"
                            style={{ width: 200 }}
                            allowClear
                            value={filterCategory}
                            onChange={setFilterCategory}
                            options={categoryOptions.map(cat => ({ value: cat, label: cat }))}
                            filterOption={(inputValue, option) =>
                                option?.value?.toLowerCase().includes(inputValue.toLowerCase())
                            }
                        />
                        <Select
                            placeholder="Mức độ"
                            style={{ width: 150 }}
                            allowClear
                            value={filterSeverity}
                            onChange={setFilterSeverity}
                        >
                            <Option value="Cao">Cao</Option>
                            <Option value="Trung bình">Trung bình</Option>
                            <Option value="Thấp">Thấp</Option>
                        </Select>
                        <Select
                            placeholder="Trạng thái"
                            style={{ width: 150 }}
                            allowClear
                            value={filterStatus}
                            onChange={setFilterStatus}
                        >
                            <Option value="Hoạt động">Hoạt động</Option>
                            <Option value="Đã xử lý">Đã xử lý</Option>
                            <Option value="Tạm ngưng">Tạm ngưng</Option>
                        </Select>
                    </Space>
                </Card>

                <Row gutter={16}>
                    <Col span={16}>
                        <div style={{ height: '600px', width: '100%', position: 'relative', border: '1px solid #d9d9d9', borderRadius: '8px', overflow: 'hidden' }}>
                            {MAPBOX_TOKEN ? (
                                <Map
                                    mapboxAccessToken={MAPBOX_TOKEN}
                                    {...mapViewState}
                                    onMove={evt => setMapViewState(evt.viewState)}
                                    onClick={(evt) => {
                                        // Check if clicked on a GeoFeature
                                        if (mapInstanceRef.current) {
                                            const features = mapInstanceRef.current.queryRenderedFeatures(evt.point, {
                                                layers: ['geo-features-polygon', 'geo-features-polygon-outline', 'geo-features-line', 'geo-features-point']
                                            });

                                            if (features.length > 0) {
                                                const clickedFeature = features[0];
                                                const featureId = clickedFeature.properties?.id;

                                                // Find full feature from state
                                                const fullFeature = geoFeatures.find(f => f.properties?.id === featureId);
                                                if (fullFeature) {
                                                    setSelectedFeature(fullFeature);
                                                    setFeatureDetailModalVisible(true);
                                                }
                                            }
                                        }
                                    }}
                                    onLoad={(evt) => {
                                        const mapInstance = evt.target;
                                        mapInstanceRef.current = mapInstance;
                                        initializeDraw(mapInstance);
                                        setupCustomLayers(mapInstance);
                                        // Load features after a short delay
                                        setTimeout(() => {
                                            loadFeaturesToMap();
                                        }, 500);
                                    }}
                                    style={{ width: '100%', height: '100%' }}
                                    mapStyle="mapbox://styles/mapbox/streets-v12"
                                    cursor="pointer"
                                />
                            ) : (
                                <div style={{ padding: '50px', textAlign: 'center', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                    <Text type="danger" style={{ fontSize: '16px' }}>
                                        ⚠️ Chưa cấu hình MAPBOX_TOKEN
                                    </Text>
                                    <Text type="secondary" style={{ marginTop: '8px' }}>
                                        Vui lòng thêm VITE_MAPBOX_TOKEN vào file .env
                                    </Text>
                                </div>
                            )}
                        </div>
                    </Col>
                    <Col span={8}>
                        <Card>
                            <Title level={5}>Danh sách đối tượng</Title>
                            <Table
                                dataSource={geoFeatures}
                                loading={loadingGeoFeatures}
                                rowKey={(record) => record.properties.id}
                                size="small"
                                pagination={{ pageSize: 10 }}
                                scroll={{ x: 'max-content' }}
                                onRow={(record) => ({
                                    onClick: () => {
                                        setSelectedFeature(record);
                                        setFeatureDetailModalVisible(true);
                                    },
                                    style: { cursor: 'pointer' }
                                })}
                                columns={[
                                    {
                                        title: 'Tên',
                                        dataIndex: ['properties', 'name'],
                                        key: 'name',
                                        ellipsis: true
                                    },
                                    {
                                        title: 'Loại',
                                        dataIndex: ['properties', 'category'],
                                        key: 'category',
                                        width: 120,
                                        render: (category) => {
                                            const colors = {
                                                'Đường sạt lở': 'red',
                                                'Vùng nguy hiểm': 'orange',
                                                'Điểm nguy hiểm': 'purple',
                                                'Vùng an toàn': 'green',
                                                'Vùng cứu hộ hoạt động': 'blue',
                                                'Khu vực sơ tán': 'cyan',
                                                'Điểm cứu hộ': 'blue',
                                                'Điểm sơ tán': 'cyan',
                                                'Vùng ngập lụt': 'purple',
                                                'Đường nguy hiểm': 'red',
                                                'Tuyến đường': 'red'
                                            };
                                            // Default color nếu không có trong map
                                            const color = colors[category] || 'default';
                                            return <Tag color={color}>{category}</Tag>;
                                        }
                                    },
                                    {
                                        title: 'Mức độ',
                                        dataIndex: ['properties', 'severity'],
                                        key: 'severity',
                                        width: 100,
                                        render: (severity) => {
                                            const colors = {
                                                'Cao': 'red',
                                                'Trung bình': 'orange',
                                                'Thấp': 'green'
                                            };
                                            return <Tag color={colors[severity]}>{severity}</Tag>;
                                        }
                                    },
                                    {
                                        title: 'Thao tác',
                                        key: 'action',
                                        width: 150,
                                        fixed: 'right',
                                        render: (_, record) => (
                                            <Space size="small" wrap={false}>
                                                <Button
                                                    size="small"
                                                    icon={<EditOutlined />}
                                                    onClick={() => openGeoFeatureModal(record)}
                                                >
                                                    Sửa
                                                </Button>
                                                <Popconfirm
                                                    title="Xóa đối tượng này?"
                                                    onConfirm={() => handleDeleteGeoFeature(record.properties.id)}
                                                    okText="Xóa"
                                                    cancelText="Hủy"
                                                >
                                                    <Button
                                                        size="small"
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                    >
                                                        Xóa
                                                    </Button>
                                                </Popconfirm>
                                            </Space>
                                        )
                                    }
                                ]}
                            />
                        </Card>
                    </Col>
                </Row>
            </Space>

            {/* Modal Quản lý GeoFeature */}
            <Modal
                title={editingGeoFeature && editingGeoFeature.properties?.id ? 'Sửa Đối tượng Bản đồ' : 'Tạo Đối tượng Bản đồ mới'}
                open={geoFeatureModalVisible}
                onCancel={() => {
                    setGeoFeatureModalVisible(false);
                    geoFeatureForm.resetFields();
                    setEditingGeoFeature(null);
                    setImageFile(null);
                    setPreviewImage(null);
                    // Remove from draw if canceling new feature
                    if (drawRef.current && editingGeoFeature && !editingGeoFeature.properties?.id) {
                        if (editingGeoFeature.id) {
                            drawRef.current.delete(editingGeoFeature.id);
                        }
                    }
                }}
                footer={null}
                width={600}
                destroyOnClose={true}
            >
                <Form
                    form={geoFeatureForm}
                    layout="vertical"
                    onFinish={editingGeoFeature && editingGeoFeature.properties?.id ? handleUpdateGeoFeature : handleGeoFeatureSubmit}
                    initialValues={{
                        severity: 'Trung bình',
                        color: '#ff0000',
                        status: 'Hoạt động'
                    }}
                >
                    <Form.Item
                        label="Tên đối tượng"
                        name="name"
                        rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
                    >
                        <Input placeholder="Ví dụ: Đường sạt lở tại xã ABC" />
                    </Form.Item>

                    <Form.Item
                        label="Loại đối tượng"
                        name="category"
                        rules={[{ required: true, message: 'Vui lòng nhập/chọn loại đối tượng' }]}
                        help={editingGeoFeature?.geometry?.type === 'LineString' ? 'Gợi ý: Đường sạt lở, Đường nguy hiểm, Tuyến đường' :
                            editingGeoFeature?.geometry?.type === 'Polygon' ? 'Gợi ý: Vùng nguy hiểm, Vùng an toàn, Vùng cứu hộ hoạt động, Khu vực sơ tán' :
                                editingGeoFeature?.geometry?.type === 'Point' ? 'Gợi ý: Điểm nguy hiểm, Điểm cứu hộ, Điểm sơ tán' : ''}
                    >
                        <AutoComplete
                            placeholder="Nhập hoặc chọn loại đối tượng"
                            disabled={!!(editingGeoFeature && editingGeoFeature.properties?.id)}
                            options={categoryOptions
                                .filter(cat => {
                                    // Filter suggestions based on geometry type
                                    if (editingGeoFeature?.geometry?.type === 'LineString') {
                                        return cat.includes('Đường') || cat.includes('Tuyến');
                                    } else if (editingGeoFeature?.geometry?.type === 'Polygon') {
                                        return cat.includes('Vùng') || cat.includes('Khu');
                                    } else if (editingGeoFeature?.geometry?.type === 'Point') {
                                        return cat.includes('Điểm');
                                    }
                                    return true;
                                })
                                .map(cat => ({ value: cat, label: cat }))}
                            filterOption={(inputValue, option) =>
                                option?.value?.toLowerCase().includes(inputValue.toLowerCase())
                            }
                            allowClear
                        />
                    </Form.Item>

                    <Form.Item
                        label="Mô tả"
                        name="description"
                    >
                        <TextArea rows={3} placeholder="Mô tả chi tiết về đối tượng này" />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                label="Mức độ nguy hiểm"
                                name="severity"
                                rules={[{ required: true, message: 'Vui lòng chọn mức độ' }]}
                            >
                                <Select>
                                    <Option value="Cao">Cao</Option>
                                    <Option value="Trung bình">Trung bình</Option>
                                    <Option value="Thấp">Thấp</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                label="Màu sắc"
                                name="color"
                                rules={[{ required: true, message: 'Vui lòng chọn màu' }]}
                            >
                                <Input type="color" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        label="Trạng thái"
                        name="status"
                        rules={[{ required: true, message: 'Vui lòng chọn trạng thái' }]}
                    >
                        <Select>
                            <Option value="Hoạt động">Hoạt động</Option>
                            <Option value="Đã xử lý">Đã xử lý</Option>
                            <Option value="Tạm ngưng">Tạm ngưng</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        label="Ghi chú"
                        name="notes"
                    >
                        <TextArea rows={2} placeholder="Ghi chú nội bộ" />
                    </Form.Item>

                    <Form.Item
                        label="Ảnh hiện trường (tùy chọn)"
                        help="Upload ảnh chụp tại hiện trường để minh chứng"
                    >
                        <Upload
                            accept="image/*"
                            beforeUpload={() => false}
                            onChange={handleImageChange}
                            maxCount={1}
                            listType="picture-card"
                            fileList={imageFile ? [{
                                uid: '-1',
                                name: imageFile.name,
                                status: 'done',
                                url: previewImage
                            }] : (previewImage && !imageFile ? [{
                                uid: '-2',
                                name: 'Ảnh hiện tại',
                                status: 'done',
                                url: previewImage
                            }] : [])}
                            onRemove={() => {
                                setImageFile(null);
                                // Nếu đang edit và có ảnh cũ, giữ lại ảnh cũ
                                if (editingGeoFeature?.properties?.imagePath && !imageFile) {
                                    const imageUrl = editingGeoFeature.properties.imagePath.startsWith('http')
                                        ? editingGeoFeature.properties.imagePath
                                        : `${API_URL}${editingGeoFeature.properties.imagePath}`;
                                    setPreviewImage(imageUrl);
                                } else {
                                    setPreviewImage(null);
                                }
                            }}
                        >
                            {(!previewImage || (previewImage && imageFile)) && (
                                <div>
                                    <CameraOutlined />
                                    <div style={{ marginTop: 8 }}>Chụp/Chọn ảnh</div>
                                </div>
                            )}
                        </Upload>
                        {previewImage && !imageFile && (
                            <div style={{ marginTop: 8 }}>
                                <Text type="secondary" style={{ fontSize: '12px' }}>Ảnh hiện tại:</Text>
                                <img
                                    src={previewImage}
                                    alt="Current"
                                    style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px', marginTop: '4px' }}
                                />
                            </div>
                        )}
                    </Form.Item>

                    <Form.Item>
                        <Space>
                            <Button
                                type="primary"
                                htmlType="submit"
                            >
                                {editingGeoFeature && editingGeoFeature.properties?.id ? 'Cập nhật' : 'Lưu'}
                            </Button>
                            <Button
                                onClick={() => {
                                    setGeoFeatureModalVisible(false);
                                    geoFeatureForm.resetFields();
                                    setEditingGeoFeature(null);
                                    setImageFile(null);
                                    setPreviewImage(null);
                                    // Remove from draw if canceling new feature
                                    if (drawRef.current && editingGeoFeature && !editingGeoFeature.properties?.id) {
                                        if (editingGeoFeature.id) {
                                            drawRef.current.delete(editingGeoFeature.id);
                                        }
                                    }
                                }}
                            >
                                Hủy
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal Chi tiết Đối tượng (khi click trên map) */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '18px', fontWeight: 600 }}>📋 Chi tiết Đối tượng</span>
                        {selectedFeature?.properties?.category && (
                            <Tag color={
                                selectedFeature.properties.category.includes('nguy hiểm') ? 'red' :
                                    selectedFeature.properties.category.includes('an toàn') ? 'green' :
                                        selectedFeature.properties.category.includes('cứu hộ') ? 'blue' :
                                            'default'
                            } style={{ fontSize: '13px', padding: '4px 12px' }}>
                                {selectedFeature.properties.category}
                            </Tag>
                        )}
                    </div>
                }
                open={featureDetailModalVisible}
                onCancel={() => {
                    setFeatureDetailModalVisible(false);
                    setSelectedFeature(null);
                }}
                footer={[
                    <Button
                        key="edit"
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={() => {
                            if (selectedFeature) {
                                setFeatureDetailModalVisible(false);
                                openGeoFeatureModal(selectedFeature);
                            }
                        }}
                    >
                        Chỉnh sửa
                    </Button>,
                    <Button
                        key="close"
                        onClick={() => {
                            setFeatureDetailModalVisible(false);
                            setSelectedFeature(null);
                        }}
                    >
                        Đóng
                    </Button>
                ]}
                width={Math.min(700, window.innerWidth * 0.9)}
                destroyOnClose={true}
                style={{ top: 20 }}
            >
                {selectedFeature && (
                    <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
                        <Space direction="vertical" size="large" style={{ width: '100%' }}>
                            {/* Tên đối tượng */}
                            <div>
                                <Text strong style={{ fontSize: '18px', display: 'block', marginBottom: '4px', color: '#1890ff' }}>
                                    {selectedFeature.properties?.name || 'Không có tên'}
                                </Text>
                            </div>

                            {/* Ảnh hiện trường */}
                            {selectedFeature.properties?.imagePath && (
                                <div>
                                    <Text strong style={{ display: 'block', marginBottom: '12px', fontSize: '15px' }}>
                                        📸 Ảnh hiện trường:
                                    </Text>
                                    <div style={{
                                        width: '100%',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        backgroundColor: '#f5f5f5',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        minHeight: '200px',
                                        maxHeight: '500px',
                                        overflow: 'hidden',
                                        border: '1px solid #e8e8e8'
                                    }}>
                                        <img
                                            src={
                                                selectedFeature.properties.imagePath.startsWith('http')
                                                    ? selectedFeature.properties.imagePath
                                                    : `${API_URL}${selectedFeature.properties.imagePath}`
                                            }
                                            alt={selectedFeature.properties?.name || 'Ảnh hiện trường'}
                                            style={{
                                                maxWidth: '100%',
                                                maxHeight: '100%',
                                                width: 'auto',
                                                height: 'auto',
                                                objectFit: 'contain',
                                                borderRadius: '4px',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                            }}
                                            onError={(e) => {
                                                const parent = e.target.parentElement;
                                                parent.innerHTML = '<div style="text-align: center; color: #999; padding: 40px; font-size: 14px;">⚠️ Không thể tải ảnh<br/><span style="font-size: 12px; color: #bbb;">Vui lòng kiểm tra đường dẫn ảnh</span></div>';
                                            }}
                                            onLoad={(e) => {
                                                // Đảm bảo ảnh không tràn
                                                const img = e.target;
                                                const parent = img.parentElement;
                                                if (img.naturalWidth > parent.clientWidth - 24) {
                                                    img.style.width = '100%';
                                                    img.style.height = 'auto';
                                                }
                                                if (img.naturalHeight > 500) {
                                                    img.style.maxHeight = '500px';
                                                    img.style.width = 'auto';
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Thông tin chi tiết */}
                            <Row gutter={[16, 16]}>
                                <Col xs={24} sm={12}>
                                    <div style={{ padding: '8px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
                                        <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                            Loại đối tượng:
                                        </Text>
                                        <Tag color={
                                            selectedFeature.properties?.category?.includes('nguy hiểm') ? 'red' :
                                                selectedFeature.properties?.category?.includes('an toàn') ? 'green' :
                                                    selectedFeature.properties?.category?.includes('cứu hộ') ? 'blue' :
                                                        'default'
                                        } style={{ fontSize: '13px', padding: '4px 10px' }}>
                                            {selectedFeature.properties?.category || 'N/A'}
                                        </Tag>
                                    </div>
                                </Col>
                                <Col xs={24} sm={12}>
                                    <div style={{ padding: '8px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
                                        <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                            Mức độ nguy hiểm:
                                        </Text>
                                        <Tag color={
                                            selectedFeature.properties?.severity === 'Cao' ? 'red' :
                                                selectedFeature.properties?.severity === 'Trung bình' ? 'orange' :
                                                    'green'
                                        } style={{ fontSize: '13px', padding: '4px 10px' }}>
                                            {selectedFeature.properties?.severity || 'N/A'}
                                        </Tag>
                                    </div>
                                </Col>
                                <Col xs={24} sm={12}>
                                    <div style={{ padding: '8px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
                                        <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                            Trạng thái:
                                        </Text>
                                        <Tag color={
                                            selectedFeature.properties?.status === 'Hoạt động' ? 'green' :
                                                selectedFeature.properties?.status === 'Đã xử lý' ? 'blue' :
                                                    'default'
                                        } style={{ fontSize: '13px', padding: '4px 10px' }}>
                                            {selectedFeature.properties?.status || 'N/A'}
                                        </Tag>
                                    </div>
                                </Col>
                                <Col xs={24} sm={12}>
                                    <div style={{ padding: '8px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
                                        <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                            Hình dạng:
                                        </Text>
                                        <Tag style={{ fontSize: '13px', padding: '4px 10px' }}>
                                            {selectedFeature.geometry?.type === 'Point' ? '📍 Điểm' :
                                                selectedFeature.geometry?.type === 'LineString' ? '📏 Đường' :
                                                    selectedFeature.geometry?.type === 'Polygon' ? '🔷 Vùng' : 'N/A'}
                                        </Tag>
                                    </div>
                                </Col>
                            </Row>

                            {/* Mô tả */}
                            {selectedFeature.properties?.description && (
                                <div>
                                    <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                                        📝 Mô tả:
                                    </Text>
                                    <Text style={{
                                        display: 'block',
                                        padding: '12px',
                                        backgroundColor: '#f9f9f9',
                                        borderRadius: '4px',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}>
                                        {selectedFeature.properties.description}
                                    </Text>
                                </div>
                            )}

                            {/* Ghi chú */}
                            {selectedFeature.properties?.notes && (
                                <div>
                                    <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                                        📌 Ghi chú:
                                    </Text>
                                    <Text style={{
                                        display: 'block',
                                        padding: '12px',
                                        backgroundColor: '#fffbe6',
                                        borderRadius: '4px',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}>
                                        {selectedFeature.properties.notes}
                                    </Text>
                                </div>
                            )}

                            {/* Thông tin bổ sung */}
                            <div>
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    {selectedFeature.properties?.createdAt && (
                                        <div style={{ marginBottom: '4px' }}>
                                            🕐 Tạo lúc: {new Date(selectedFeature.properties.createdAt).toLocaleString('vi-VN')}
                                        </div>
                                    )}
                                    {selectedFeature.properties?.updatedAt && (
                                        <div>
                                            🔄 Cập nhật: {new Date(selectedFeature.properties.updatedAt).toLocaleString('vi-VN')}
                                        </div>
                                    )}
                                </Text>
                            </div>
                        </Space>
                    </div>
                )}
            </Modal>
        </Card>
    );
}

export default GeoFeatureManager;

