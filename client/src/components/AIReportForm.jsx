import { useState } from 'react'
import { Card, Form, Input, Upload, Button, message, Space, Typography, Alert, Modal, List } from 'antd'
import { RobotOutlined, CameraOutlined, SendOutlined, LinkOutlined, GlobalOutlined, WarningOutlined, AimOutlined } from '@ant-design/icons'
import Map, { Marker } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import axios from 'axios'
import { resizeImageForUpload } from '../utils/imageResize'
import { parseAndConvertGoogleMapsCoords } from '../utils/coordinateTransform'
import './AIReportForm.css'

const { TextArea } = Input
const { Title, Text } = Typography

// Trong production (Docker), VITE_API_URL có thể là empty để dùng relative path /api (nginx proxy)
// Trong development, dùng localhost:5000
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || (import.meta.env.MODE === 'production' ? '' : 'http://localhost:5000')
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.REACT_APP_MAPBOX_TOKEN || ''

function AIReportForm({ onSuccess }) {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [previewText, setPreviewText] = useState('')
    const [imageFile, setImageFile] = useState(null)
    const [parsedCoords, setParsedCoords] = useState(null) // Tọa độ đã parse từ Google Maps link [lng, lat]
    const [duplicateCheck, setDuplicateCheck] = useState(null) // Kết quả check duplicate
    const [showDuplicateModal, setShowDuplicateModal] = useState(false)
    const [pendingSubmit, setPendingSubmit] = useState(null) // Lưu request data khi có duplicate
    const [mapViewState, setMapViewState] = useState({
        longitude: 109.05,
        latitude: 13.08,
        zoom: 10
    })
    const [showMap, setShowMap] = useState(false)

    // Parse tọa độ từ Google Maps URL (tự động chuyển đổi GCJ-02 → WGS84)
    const parseGoogleMapsCoords = (url) => {
        return parseAndConvertGoogleMapsCoords(url, { outputFormat: 'lnglat' });
    }

    // Xử lý khi Google Maps link thay đổi
    const handleGoogleMapsLinkChange = (e) => {
        const url = e.target.value.trim()
        if (url) {
            const coords = parseGoogleMapsCoords(url)
            if (coords) {
                setParsedCoords(coords)
                // Cập nhật map view để hiển thị vị trí
                setMapViewState({
                    longitude: coords[0], // lng
                    latitude: coords[1], // lat
                    zoom: 14
                })
                setShowMap(true) // Tự động hiển thị map để user xác nhận
                message.success(`✅ Đã tìm thấy tọa độ: ${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`)
            } else {
                setParsedCoords(null)
            }
        } else {
            setParsedCoords(null)
        }
    }

    // Xử lý click trên map để điều chỉnh tọa độ
    const handleMapClick = (event) => {
        const { lng, lat } = event.lngLat
        const newCoords = [lng, lat] // [longitude, latitude]
        setParsedCoords(newCoords)
        message.success(`✅ Đã cập nhật tọa độ: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    }

    // Xử lý upload ảnh (hỗ trợ cả click và drag & drop)
    const handleImageChange = (info) => {
        // console.log('📸 handleImageChange called:', info);

        // Xử lý nhiều trường hợp: drag & drop, click, hoặc file list
        let file = null;

        if (info.file) {
            // Ant Design Upload component
            if (info.file.originFileObj) {
                file = info.file.originFileObj;
            } else if (info.file instanceof File) {
                file = info.file;
            } else if (info.fileList && info.fileList.length > 0) {
                const firstFile = info.fileList[0];
                file = firstFile.originFileObj || firstFile;
            }
        } else if (info.fileList && info.fileList.length > 0) {
            // Trường hợp drag & drop trực tiếp
            const firstFile = info.fileList[0];
            file = firstFile.originFileObj || firstFile;
        }

        if (file && file instanceof File) {
            // console.log('✅ File detected:', file.name, file.size, 'bytes');
            setImageFile(file);
            message.success(`Đã chọn ảnh: ${file.name}`);
        } else {
            console.warn('⚠️  File không hợp lệ:', file);
            // Nếu xóa file, set về null
            if (info.fileList && info.fileList.length === 0) {
                setImageFile(null);
            }
        }
    }

    // Check duplicate trước khi submit
    const checkDuplicate = async (requestData) => {
        try {
            const checkData = {
                rawText: requestData.rawText,
                description: requestData.rawText, // Dùng rawText làm description
                contact: null, // Sẽ được parse từ AI
                contactFull: null,
                coords: requestData.coords,
                facebookUrl: requestData.facebookUrl,
                location: null // Sẽ được parse từ AI
            }

            const response = await axios.post(`${API_URL}/api/rescue-requests/check-duplicate`, checkData)
            return response.data
        } catch (error) {
            console.error('Lỗi check duplicate:', error)
            // Nếu lỗi, không block submit
            return { isDuplicate: false, duplicates: [], maxSimilarity: 0 }
        }
    }

    // Submit form thực sự (sau khi check duplicate)
    const doSubmit = async (requestData) => {
        try {
            setLoading(true)

            // console.log('📤 Sending request to:', `${API_URL}/api/ai-report`);
            // console.log('📦 Request data:', {
            //     rawText: requestData.rawText?.substring(0, 100) + '...',
            //     facebookUrl: requestData.facebookUrl,
            //     hasImage: !!requestData.imageBase64,
            //     imageBase64Length: requestData.imageBase64 ? requestData.imageBase64.length : 0
            // });

            const response = await axios.post(`${API_URL}/api/ai-report`, requestData)

            if (response.data.success) {
                // Hiển thị warning nếu có duplicate
                if (response.data.duplicateCheck?.isDuplicate) {
                    message.warning({
                        content: response.data.duplicateCheck.warning,
                        duration: 8
                    })
                } else {
                    message.success('Đã thêm điểm cầu cứu! AI đã phân tích và lưu thông tin.')
                }

                form.resetFields()
                setImageFile(null)
                setPreviewText('')
                setDuplicateCheck(null)
                setShowDuplicateModal(false)
                setParsedCoords(null)
                setShowMap(false)

                // Gọi callback để refresh danh sách và map
                if (onSuccess) {
                    onSuccess(response.data.data)
                }
            }
        } catch (error) {
            console.error('Lỗi gửi cầu cứu:', error)
            if (error.response?.data?.message) {
                message.error(error.response.data.message)
            } else if (error.request) {
                message.warning('Không thể kết nối server. Vui lòng gọi hotline trực tiếp!')
            } else {
                message.error('Có lỗi xảy ra. Vui lòng thử lại!')
            }
        } finally {
            setLoading(false)
        }
    }

    // Submit form
    const handleSubmit = async (values) => {
        if ((!values.rawText || values.rawText.trim().length === 0) &&
            (!values.facebookUrl || values.facebookUrl.trim().length === 0)) {
            message.warning('Vui lòng nhập nội dung cầu cứu hoặc link Facebook!')
            return
        }

        try {
            setLoading(true)

            // Resize và convert ảnh sang base64 nếu có
            let imageBase64 = null
            if (imageFile) {
                try {
                    // Hiển thị thông báo đang xử lý ảnh
                    const processingMessage = message.loading('Đang xử lý và nén ảnh...', 0);

                    // Resize ảnh trước khi convert (giảm kích thước, tăng tốc độ upload)
                    imageBase64 = await resizeImageForUpload(imageFile);

                    // Đóng message loading
                    processingMessage();

                    const originalSizeMB = (imageFile.size / 1024 / 1024).toFixed(2);
                    const compressedSizeMB = ((imageBase64.length * 3) / 4 / 1024 / 1024).toFixed(2);

                    if (parseFloat(compressedSizeMB) < parseFloat(originalSizeMB) * 0.8) {
                        message.success(`✅ Đã tối ưu ảnh: ${originalSizeMB}MB → ${compressedSizeMB}MB`);
                    }
                } catch (imgError) {
                    console.error('❌ Lỗi xử lý ảnh:', imgError);
                    message.warning('Không thể xử lý ảnh, sẽ gửi không có ảnh');
                }
            }

            const requestData = {
                rawText: values.rawText?.trim() || '',
                facebookUrl: values.facebookUrl?.trim() || '',
                imageBase64: imageBase64,
                googleMapsUrl: values.googleMapsUrl?.trim() || '',
                coords: parsedCoords // Tọa độ từ Google Maps link (ưu tiên cao nhất)
            }

            if (parsedCoords) {
                // console.log('📍 Sử dụng tọa độ từ Google Maps:', parsedCoords);
            }

            // Check duplicate trước khi submit
            // console.log('🔍 Đang kiểm tra trùng lặp...')
            const duplicateResult = await checkDuplicate(requestData)

            if (duplicateResult.isDuplicate && duplicateResult.duplicates.length > 0) {
                // Có duplicate, hiển thị modal cảnh báo
                setDuplicateCheck(duplicateResult)
                setPendingSubmit(requestData)
                setShowDuplicateModal(true)
                setLoading(false)
                return
            }

            // Không có duplicate, submit ngay
            await doSubmit(requestData)
        } catch (error) {
            message.error('Có lỗi xảy ra. Vui lòng thử lại!')
            setLoading(false)
        }
    }

    // Xác nhận submit dù có duplicate
    const handleConfirmSubmit = async () => {
        if (pendingSubmit) {
            setShowDuplicateModal(false)
            await doSubmit(pendingSubmit)
            setPendingSubmit(null)
        }
    }

    return (
        <Card
            className="ai-report-card"
            title={
                <Space>
                    <RobotOutlined style={{ color: '#dc2626' }} />
                    <span>AI Xử Lý Cầu Cứu Tự Động</span>
                </Space>
            }
        >
            <Alert
                message="Paste link Facebook hoặc dán text từ bài post - Link sẽ được lưu để xem bài gốc!"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
            />

            <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                autoComplete="off"
            >
                <Form.Item
                    label="Link Facebook (tùy chọn - sẽ được lưu để xem bài gốc)"
                    name="facebookUrl"
                    help="Paste link Facebook, link sẽ được lưu để click xem bài gốc. Có thể để trống nếu không có link."
                >
                    <Input
                        placeholder="https://www.facebook.com/share/p/..."
                        prefix={<LinkOutlined />}
                        allowClear
                    />
                </Form.Item>

                <Form.Item
                    label="Link Google Maps (tùy chọn - để lấy tọa độ chính xác)"
                    name="googleMapsUrl"
                    help="Paste link Google Maps để tự động lấy tọa độ. Hệ thống sẽ ưu tiên dùng tọa độ này thay vì geocode."
                >
                    <Input
                        placeholder="https://www.google.com/maps?q=13.08,109.30 hoặc https://maps.google.com/@13.08,109.30"
                        prefix={<GlobalOutlined />}
                        allowClear
                        onChange={handleGoogleMapsLinkChange}
                    />
                </Form.Item>

                {parsedCoords && (
                    <>
                        <Alert
                            message={`✅ Đã tìm thấy tọa độ: ${parsedCoords[1].toFixed(6)}, ${parsedCoords[0].toFixed(6)}`}
                            type="success"
                            showIcon
                            style={{ marginBottom: 16 }}
                            closable
                            onClose={() => {
                                setParsedCoords(null)
                                setShowMap(false)
                            }}
                        />
                        <Space style={{ marginBottom: 16, width: '100%' }} wrap>
                            <Button
                                icon={<AimOutlined />}
                                onClick={() => setShowMap(!showMap)}
                                type={showMap ? 'primary' : 'default'}
                                size="middle"
                            >
                                {showMap ? 'Ẩn Bản Đồ' : 'Hiển Thị Bản Đồ'}
                            </Button>
                            <span style={{ color: '#52c41a', fontWeight: 500 }}>
                                ✓ Tọa độ: {parsedCoords[1].toFixed(6)}, {parsedCoords[0].toFixed(6)}
                            </span>
                        </Space>

                        {showMap && MAPBOX_TOKEN && (
                            <Card
                                size="small"
                                style={{ marginBottom: 16 }}
                                styles={{ body: { padding: 0, height: '400px' } }}
                            >
                                <Map
                                    mapboxAccessToken={MAPBOX_TOKEN}
                                    {...mapViewState}
                                    onMove={evt => setMapViewState(evt.viewState)}
                                    onClick={handleMapClick}
                                    style={{ width: '100%', height: '100%' }}
                                    mapStyle="mapbox://styles/mapbox/streets-v12"
                                    cursor="crosshair"
                                >
                                    {parsedCoords && (
                                        <Marker
                                            longitude={parsedCoords[0]}
                                            latitude={parsedCoords[1]}
                                            anchor="bottom"
                                        >
                                            <div style={{
                                                width: '30px',
                                                height: '30px',
                                                borderRadius: '50%',
                                                background: '#dc2626',
                                                border: '3px solid #fff',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#fff',
                                                fontSize: '16px'
                                            }}>
                                                📍
                                            </div>
                                        </Marker>
                                    )}
                                </Map>
                                <div style={{
                                    position: 'absolute',
                                    bottom: '10px',
                                    left: '10px',
                                    background: 'rgba(255,255,255,0.9)',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    zIndex: 1000,
                                    pointerEvents: 'none'
                                }}>
                                    💡 Click trên bản đồ để điều chỉnh tọa độ
                                </div>
                            </Card>
                        )}

                        {showMap && !MAPBOX_TOKEN && (
                            <Alert
                                message="Chưa có Mapbox Token"
                                description="Vui lòng cấu hình VITE_MAPBOX_TOKEN trong file .env để sử dụng bản đồ"
                                type="warning"
                                showIcon
                                style={{ marginBottom: 16 }}
                            />
                        )}
                    </>
                )}

                <Form.Item
                    label="Nội dung cầu cứu (bắt buộc)"
                    name="rawText"
                    rules={[{ required: true, message: 'Vui lòng nhập nội dung cầu cứu hoặc paste text từ Facebook!' }]}
                    help="Paste text từ bài post Facebook. Nếu có link Facebook ở trên, copy text từ bài post và paste vào đây."
                >
                    <TextArea
                        rows={6}
                        placeholder="Nội dung sẽ tự động điền nếu bạn đã fetch từ Facebook link. Hoặc paste text thủ công vào đây..."
                        style={{ fontSize: '14px' }}
                        value={previewText || undefined}
                        onChange={(e) => {
                            setPreviewText(e.target.value)
                            form.setFieldsValue({ rawText: e.target.value })
                        }}
                    />
                </Form.Item>

                <Form.Item
                    label="Upload ảnh (tùy chọn)"
                    help="Ảnh sẽ giúp AI hiểu rõ hơn tình huống"
                >
                    <Upload
                        accept="image/*"
                        beforeUpload={() => false}
                        onChange={handleImageChange}
                        maxCount={1}
                        listType="picture-card"
                    >
                        <div>
                            <CameraOutlined />
                            <div style={{ marginTop: 8 }}>Chụp/Chọn ảnh</div>
                        </div>
                    </Upload>
                </Form.Item>

                <Form.Item>
                    <Button
                        type="primary"
                        danger
                        htmlType="submit"
                        loading={loading}
                        block
                        size="large"
                        icon={<SendOutlined />}
                        style={{ height: '50px', fontSize: '16px' }}
                    >
                        Gửi Cho AI Xử Lý
                    </Button>
                </Form.Item>

                <Text type="secondary" style={{ fontSize: '12px', display: 'block', textAlign: 'center' }}>
                    AI sẽ tự động trích xuất: vị trí, số người, độ khẩn cấp, nhu cầu, số điện thoại
                </Text>
            </Form>

            {/* Duplicate Warning Modal */}
            <Modal
                title={
                    <Space>
                        <WarningOutlined style={{ color: '#faad14' }} />
                        <span>Phát hiện cầu cứu tương tự</span>
                    </Space>
                }
                open={showDuplicateModal}
                onOk={handleConfirmSubmit}
                onCancel={() => {
                    setShowDuplicateModal(false)
                    setPendingSubmit(null)
                    setDuplicateCheck(null)
                }}
                okText="Vẫn gửi"
                cancelText="Hủy"
                width={600}
                okButtonProps={{ danger: true }}
            >
                <Alert
                    message={`Phát hiện ${duplicateCheck?.duplicates.length || 0} cầu cứu tương tự (${Math.round((duplicateCheck?.maxSimilarity || 0) * 100)}% giống nhau)`}
                    description="Có thể bạn đã gửi cầu cứu này trước đó. Vui lòng kiểm tra danh sách bên dưới trước khi tiếp tục."
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                />

                {duplicateCheck?.duplicates && duplicateCheck.duplicates.length > 0 && (
                    <List
                        size="small"
                        dataSource={duplicateCheck.duplicates}
                        renderItem={(item, index) => (
                            <List.Item>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    <Text strong>
                                        #{index + 1} - Tương đồng: {Math.round(item.similarity * 100)}%
                                    </Text>
                                    <div>
                                        {item.matchReasons.map((reason, idx) => (
                                            <Text key={idx} type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                                                • {reason}
                                            </Text>
                                        ))}
                                    </div>
                                    {item.data.location && (
                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                            📍 {item.data.location}
                                        </Text>
                                    )}
                                    {item.data.description && (
                                        <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                                            {item.data.description.substring(0, 100)}...
                                        </Text>
                                    )}
                                    {item.data.contact && (
                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                            📞 {item.data.contact}
                                        </Text>
                                    )}
                                    <Text type="secondary" style={{ fontSize: '11px' }}>
                                        Tạo lúc: {new Date(item.data.createdAt).toLocaleString('vi-VN')}
                                    </Text>
                                </Space>
                            </List.Item>
                        )}
                    />
                )}

                <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: 16 }}>
                    Nếu đây là cầu cứu mới (khác với các cầu cứu trên), bạn có thể tiếp tục gửi.
                </Text>
            </Modal>
        </Card>
    )
}

export default AIReportForm

