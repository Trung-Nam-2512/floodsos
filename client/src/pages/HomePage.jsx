import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout, Button, Form, Input, Upload, message, Card, Space, Typography, Alert, List, Tag, Empty, Collapse, Image, Row, Col } from 'antd'
import { PhoneOutlined, EnvironmentOutlined, CameraOutlined, ExclamationCircleOutlined, GlobalOutlined, FireOutlined, AimOutlined, ZoomInOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import Map, { Marker } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import axios from 'axios'
import AIReportForm from '../components/AIReportForm'
import './HomePage.css'

const { Header, Content } = Layout
const { TextArea } = Input
const { Title, Text } = Typography

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || 'http://localhost:5000'
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.REACT_APP_MAPBOX_TOKEN || ''

// Dữ liệu fallback offline
const FALLBACK_HOTLINES = [
    { id: 1, province: 'Toàn quốc', unit: 'Cấp cứu', phone: '114', note: 'Cấp cứu y tế', imageUrl: null },
    { id: 2, province: 'Toàn quốc', unit: 'Cứu hỏa', phone: '115', note: 'Cứu hỏa', imageUrl: null },
    { id: 3, province: 'Đắk Lắk', unit: 'Ban PCLB Đắk Lắk', phone: '0262.3812345', note: 'Phòng chống lụt bão', imageUrl: null },
    { id: 4, province: 'Phú Yên', unit: 'PCLB Phú Yên', phone: '0257.3841234', note: 'Phòng chống lụt bão', imageUrl: null },
    { id: 5, province: 'Quân khu 5', unit: 'Quân khu 5', phone: '069.959261', note: 'Lực lượng vũ trang', imageUrl: null },
    { id: 6, province: 'Khánh Hòa', unit: 'PCLB Khánh Hòa', phone: '0258.3821234', note: 'Phòng chống lụt bão', imageUrl: null },
    { id: 7, province: 'Bình Định', unit: 'PCLB Bình Định', phone: '0256.3823456', note: 'Phòng chống lụt bão', imageUrl: null },
    { id: 8, province: 'Quảng Ngãi', unit: 'PCLB Quảng Ngãi', phone: '0255.3824567', note: 'Phòng chống lụt bão', imageUrl: null },
    { id: 9, province: 'Đắk Lắk', unit: 'Cảnh sát 113', phone: '113', note: 'Cảnh sát', imageUrl: null },
    { id: 10, province: 'Phú Yên', unit: 'Cảnh sát 113', phone: '113', note: 'Cảnh sát', imageUrl: null }
]

function HomePage() {
    const navigate = useNavigate()
    const [form] = Form.useForm()
    const [hotlines, setHotlines] = useState(FALLBACK_HOTLINES)
    const [location, setLocation] = useState(null)
    const [loading, setLoading] = useState(false)
    const [imageFile, setImageFile] = useState(null)
    const [mapViewState, setMapViewState] = useState({
        longitude: 109.05,
        latitude: 13.08,
        zoom: 10
    })
    const [showMap, setShowMap] = useState(false)
    const [rescueRequests, setRescueRequests] = useState([])
    const [loadingRescue, setLoadingRescue] = useState(false)

    // Lấy danh sách hotline từ API hoặc dùng fallback
    useEffect(() => {
        const fetchHotlines = async () => {
            try {
                const response = await axios.get(`${API_URL}/api/hotlines`)
                if (response.data.success) {
                    setHotlines(response.data.data)
                }
            } catch (error) {
                // console.log('Không thể kết nối API, sử dụng dữ liệu offline')
                // Giữ nguyên fallback data
            }
        }
        fetchHotlines()
    }, [])

    // Lấy danh sách cầu cứu từ AI
    const fetchRescueRequests = async () => {
        setLoadingRescue(true)
        try {
            const response = await axios.get(`${API_URL}/api/rescue-requests`)
            if (response.data.success) {
                setRescueRequests(response.data.data)
            }
        } catch (error) {
            // console.log('Không thể tải danh sách cầu cứu')
            setRescueRequests([])
        } finally {
            setLoadingRescue(false)
        }
    }

    useEffect(() => {
        fetchRescueRequests()
        // Refresh mỗi 10 giây
        const interval = setInterval(fetchRescueRequests, 10000)
        return () => clearInterval(interval)
    }, [])

    // Xử lý khi AI form submit thành công
    const handleAISuccess = () => {
        fetchRescueRequests()
    }

    // Copy số điện thoại
    const copyPhone = (phone) => {
        if (phone) {
            navigator.clipboard.writeText(phone)
            message.success(`Đã copy số điện thoại: ${phone}`)
        }
    }

    // Format thời gian
    const formatTime = (timestamp) => {
        const date = new Date(timestamp * 1000)
        const now = new Date()
        const diff = Math.floor((now - date) / 1000) // giây

        if (diff < 60) return 'Vừa xong'
        if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
        if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
        return `${Math.floor(diff / 86400)} ngày trước`
    }

    // Xem trên bản đồ
    const viewOnMap = (request) => {
        if (request.coords && request.coords[0] && request.coords[1]) {
            navigate('/', { state: { focusRequest: request._id || request.id } })
        } else {
            message.warning('Không có tọa độ GPS cho điểm này')
        }
    }

    const handleItemClick = (item, e) => {
        // Ngăn chặn click khi click vào buttons hoặc links
        if (e.target.closest('button') || e.target.closest('a')) {
            return
        }
        // Điều hướng đến bản đồ nếu có tọa độ
        if (item.coords && item.coords[0] && item.coords[1]) {
            viewOnMap(item)
        }
    }

    // Lấy vị trí GPS tự động
    const getCurrentLocation = () => {
        if (navigator.geolocation) {
            setLoading(true)
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const newLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    }
                    setLocation(newLocation)
                    // Cập nhật map view để hiển thị vị trí
                    setMapViewState({
                        longitude: newLocation.lng,
                        latitude: newLocation.lat,
                        zoom: 14
                    })
                    setShowMap(true)
                    message.success('Đã lấy vị trí GPS thành công!')
                    setLoading(false)
                },
                (error) => {
                    console.error('Lỗi GPS:', error)
                    message.warning('Không thể lấy vị trí GPS. Vui lòng chọn trên bản đồ.')
                    setShowMap(true) // Vẫn hiển thị map để user chọn thủ công
                    setLoading(false)
                }
            )
        } else {
            message.warning('Trình duyệt không hỗ trợ GPS. Vui lòng chọn trên bản đồ.')
            setShowMap(true)
        }
    }

    // Xử lý click trên map để chọn tọa độ
    const handleMapClick = (event) => {
        const { lng, lat } = event.lngLat
        const newLocation = {
            lat: lat,
            lng: lng
        }
        setLocation(newLocation)
        message.success(`Đã chọn vị trí: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    }

    // Xử lý upload ảnh (hỗ trợ cả click và drag & drop)
    const handleImageChange = (info) => {
        // console.log('📸 handleImageChange called:', info)       

        // Xử lý nhiều trường hợp: drag & drop, click, hoặc file list
        let file = null

        if (info.file) {
            // Ant Design Upload component
            if (info.file.originFileObj) {
                file = info.file.originFileObj
            } else if (info.file instanceof File) {
                file = info.file
            } else if (info.fileList && info.fileList.length > 0) {
                const firstFile = info.fileList[0]
                file = firstFile.originFileObj || firstFile
            }
        } else if (info.fileList && info.fileList.length > 0) {
            // Trường hợp drag & drop trực tiếp
            const firstFile = info.fileList[0]
            file = firstFile.originFileObj || firstFile
        }

        if (file && file instanceof File) {
            // console.log('✅ File detected:', file.name, file.size, 'bytes')
            setImageFile(file)
            message.success(`Đã chọn ảnh: ${file.name}`)
        } else {
            console.warn('⚠️  File không hợp lệ:', file)
        }
    }

    // Submit form báo cáo
    const handleSubmit = async (values) => {
        // console.log('🚀 handleSubmit called with values:', values)  
        // console.log('📸 imageFile:', imageFile)
        // console.log('📍 location:', location)

        try {
            setLoading(true)

            // Validate description
            if (!values.description || values.description.trim().length === 0) {
                message.error('Vui lòng nhập mô tả tình huống!')
                setLoading(false)
                return
            }

            // Convert ảnh sang base64 nếu có
            let imageBase64 = null
            if (imageFile) {
                // console.log('📸 Converting image to base64...')
                try {
                    imageBase64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                            // console.log('✅ Image converted, size:', reader.result.length, 'bytes')
                            resolve(reader.result)
                        }
                        reader.onerror = (error) => {
                            console.error('❌ Error reading file:', error)
                            reject(error)
                        }
                        reader.readAsDataURL(imageFile)
                    })
                } catch (imgError) {
                    console.error('❌ Lỗi convert ảnh:', imgError)
                    message.warning('Không thể xử lý ảnh, sẽ gửi báo cáo không có ảnh')
                }
            } else {
                console.log('ℹ️  Không có ảnh')
            }

            const reportData = {
                location: location || { lat: null, lng: null },
                description: values.description || '',
                imageBase64: imageBase64,
                phone: values.phone || '',
                name: values.name || ''
            }

            // console.log('📤 Sending request to:', `${API_URL}/api/report`)
            // console.log('📦 Request data:', {
            //     ...reportData,
            //     imageBase64: imageBase64 ? `${imageBase64.substring(0, 50)}...` : null
            // })

            try {
                const response = await axios.post(`${API_URL}/api/report`, reportData, {
                    timeout: 30000, // 30 seconds timeout
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })

                // console.log('✅ Response received:', response.data)
                message.success('Đã gửi thành công báo cáo khẩn cấp!')
                form.resetFields()
                setLocation(null)
                setImageFile(null)

                // Refresh danh sách cầu cứu để hiển thị báo cáo mới
                fetchRescueRequests()
            } catch (error) {
                console.error('❌ Request error:', error)
                console.error('❌ Error details:', {
                    message: error.message,
                    response: error.response?.data,
                    status: error.response?.status
                })

                if (error.response) {
                    // Server responded with error
                    message.error(`Lỗi: ${error.response.data?.message || error.message}`)
                } else if (error.request) {
                    // Request sent but no response
                    message.error('Không thể kết nối server. Vui lòng kiểm tra kết nối mạng!')
                } else {
                    message.error(`Lỗi: ${error.message}`)
                }
            }
        } catch (error) {
            console.error('❌ Unexpected error:', error)
            message.error('Có lỗi xảy ra. Vui lòng thử lại hoặc gọi hotline trực tiếp!')
        } finally {
            setLoading(false)
        }
    }


    return (
        <Layout className="home-layout">
            <Header className="emergency-header">
                <div className="header-content-wrapper">
                    <Button
                        type="text"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate('/')}
                        className="header-back-button"
                        title="Quay lại bản đồ"
                    />
                    <Title level={4} className="header-title-mobile">
                        🚨 FloodSoS
                    </Title>
                    <Title level={2} className="header-title-desktop">
                        🚨 FloodSoS
                    </Title>
                </div>
            </Header>

            <Content className="home-content">
                {/* Section 1: Hotline - Hiển thị bằng hình ảnh */}
                <Card
                    title={
                        <div className="card-title-wrapper">
                            <PhoneOutlined style={{ color: '#dc2626', fontSize: '18px' }} />
                            <span className="card-title-text">Hotline Cứu Hộ Khẩn Cấp</span>
                        </div>
                    }
                    className="hotline-card"
                >
                    <Alert
                        message="Gọi ngay các số hotline dưới đây nếu bạn đang gặp nguy hiểm!"
                        type="error"
                        showIcon
                        icon={<ExclamationCircleOutlined />}
                        style={{ marginBottom: 16 }}
                    />

                    {/* Hiển thị danh sách hình ảnh hotline */}
                    <Row gutter={[16, 16]} style={{ margin: 0, width: '100%' }}>
                        {hotlines
                            .filter(h => h.imageUrl) // Chỉ hiển thị các hotline có hình ảnh
                            .map((hotline) => (
                                <Col
                                    key={hotline.id}
                                    xs={24}
                                    sm={12}
                                    md={8}
                                    lg={6}
                                >
                                    <div
                                        style={{
                                            cursor: 'pointer',
                                            borderRadius: '8px',
                                            overflow: 'hidden',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                            transition: 'all 0.3s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                                            e.currentTarget.style.transform = 'translateY(-2px)'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
                                            e.currentTarget.style.transform = 'translateY(0)'
                                        }}
                                    >
                                        <Image
                                            src={hotline.imageUrl.startsWith('http')
                                                ? hotline.imageUrl
                                                : `${API_URL}${hotline.imageUrl}`
                                            }
                                            alt={hotline.unit || 'Hotline'}
                                            preview={{
                                                mask: <Space><ZoomInOutlined /> Xem lớn</Space>
                                            }}
                                            style={{
                                                width: '100%',
                                                height: 'auto',
                                                display: 'block'
                                            }}
                                        />
                                        {(hotline.imageTitle || hotline.unit) && (
                                            <div style={{
                                                padding: '12px',
                                                background: '#fff',
                                                borderTop: '1px solid #f0f0f0'
                                            }}>
                                                <Text strong style={{ fontSize: '14px', color: '#333' }}>
                                                    {hotline.imageTitle || hotline.unit}
                                                </Text>
                                            </div>
                                        )}
                                    </div>
                                </Col>
                            ))}
                    </Row>
                </Card>
                {/* Section 5: Form báo cáo khẩn cấp */}
                <Card
                    title={
                        <div className="card-title-wrapper">
                            <ExclamationCircleOutlined style={{ color: '#dc2626', fontSize: '18px' }} />
                            <span className="card-title-text">Báo Cáo Khẩn Cấp</span>
                        </div>
                    }
                    className="report-card"
                >
                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={handleSubmit}
                        autoComplete="off"
                    >
                        <Form.Item
                            label="Họ và tên (tùy chọn)"
                            name="name"
                            rules={[{ max: 100, message: 'Họ tên không được quá 100 ký tự!' }]}
                        >
                            <Input
                                placeholder="Nhập họ tên của bạn"
                                maxLength={100}
                                showCount
                            />
                        </Form.Item>

                        <Form.Item
                            label="Số điện thoại (tùy chọn)"
                            name="phone"
                            rules={[{ max: 20, message: 'Số điện thoại không được quá 20 ký tự!' }]}
                        >
                            <Input
                                placeholder="Nhập số điện thoại để đội cứu hộ liên hệ"
                                maxLength={20}
                                showCount
                            />
                        </Form.Item>

                        <Form.Item
                            label="Vị trí GPS"
                            help="Chọn vị trí trên bản đồ hoặc dùng GPS tự động"
                        >
                            <Space direction="vertical" style={{ width: '100%', maxWidth: '100%' }} size="middle">
                                <Space wrap style={{ width: '100%' }}>
                                    <Button
                                        icon={<EnvironmentOutlined />}
                                        onClick={getCurrentLocation}
                                        loading={loading}
                                        size="middle"
                                        className="gps-button"
                                    >
                                        Lấy GPS Tự Động
                                    </Button>
                                    <Button
                                        icon={<AimOutlined />}
                                        onClick={() => setShowMap(!showMap)}
                                        type={showMap ? 'primary' : 'default'}
                                        size="middle"
                                        className="map-select-button"
                                    >
                                        {showMap ? 'Ẩn Bản Đồ' : 'Chọn Trên Bản Đồ'}
                                    </Button>
                                    {location && (
                                        <Tag color="green" className="location-tag">
                                            ✓ Đã chọn: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                                        </Tag>
                                    )}
                                </Space>

                                {showMap && MAPBOX_TOKEN && (
                                    <Card
                                        size="small"
                                        className="map-selector-card"
                                        styles={{ body: { padding: 0, height: '100%' } }}
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
                                            {location && (
                                                <Marker
                                                    longitude={location.lng}
                                                    latitude={location.lat}
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
                                            💡 Click trên bản đồ để chọn vị trí
                                        </div>
                                    </Card>
                                )}

                                {showMap && !MAPBOX_TOKEN && (
                                    <Alert
                                        message="Chưa có Mapbox Token"
                                        description="Vui lòng cấu hình VITE_MAPBOX_TOKEN trong file .env để sử dụng bản đồ"
                                        type="warning"
                                        showIcon
                                    />
                                )}
                            </Space>
                        </Form.Item>

                        <Form.Item
                            label="Mô tả tình huống khẩn cấp"
                            name="description"
                            rules={[
                                { required: true, message: 'Vui lòng mô tả tình huống!' },
                                { max: 500, message: 'Mô tả không được quá 500 ký tự!' }
                            ]}
                        >
                            <TextArea
                                rows={4}
                                maxLength={500}
                                showCount
                                placeholder="Mô tả chi tiết tình huống khẩn cấp của bạn (ví dụ: nhà bị ngập, cần cứu hộ, số người cần giúp đỡ...)"
                            />
                        </Form.Item>

                        <Form.Item
                            label="Upload ảnh (tùy chọn)"
                            help="Kéo thả ảnh vào đây hoặc click để chọn"
                        >
                            <Upload
                                accept="image/*"
                                beforeUpload={() => false}
                                onChange={handleImageChange}
                                maxCount={1}
                                listType="picture-card"
                                drag
                                showUploadList={true}
                            >
                                <div>
                                    <CameraOutlined />
                                    <div style={{ marginTop: 8 }}>Chụp/Chọn/Kéo thả ảnh</div>
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
                                style={{ height: '50px', fontSize: '16px' }}
                            >
                                Gửi Báo Cáo Khẩn Cấp
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
                {/* Section 2: Form AI xử lý cầu cứu */}
                <AIReportForm onSuccess={handleAISuccess} />

                {/* Section 3: Cầu cứu realtime từ người dân */}
                <Card
                    title={
                        <div className="card-title-wrapper">
                            <FireOutlined style={{ color: '#dc2626', fontSize: '18px' }} />
                            <span className="card-title-text">Cầu Cứu Realtime</span>
                        </div>
                    }
                    className="rescue-requests-card"
                    extra={
                        <Button
                            size="small"
                            onClick={fetchRescueRequests}
                            loading={loadingRescue}
                            className="refresh-button"
                        >
                            Làm mới
                        </Button>
                    }
                >
                    {rescueRequests.length === 0 ? (
                        <Empty description="Chưa có cầu cứu nào" />
                    ) : (
                        <List
                            dataSource={rescueRequests}
                            loading={loadingRescue}
                            itemLayout="vertical"
                            renderItem={(item) => (
                                <List.Item
                                    className={item.urgency === 'CỰC KỲ KHẨN CẤP' ? 'rescue-item-urgent' : 'rescue-item'}
                                    onClick={(e) => handleItemClick(item, e)}
                                >
                                    <div className="rescue-item-content">
                                        {/* Header: Tag và Timestamp */}
                                        <div className="rescue-item-header">
                                            <Tag
                                                color={item.urgency === 'CỰC KỲ KHẨN CẤP' ? 'red' : 'orange'}
                                                icon={item.urgency === 'CỰC KỲ KHẨN CẤP' ? <FireOutlined /> : null}
                                                className="rescue-item-tag"
                                            >
                                                {item.urgency === 'CẦN CỨU TRỢ' ? 'KHẨN CẤP' : item.urgency}
                                            </Tag>
                                            <Text type="secondary" className="rescue-item-time">
                                                {formatTime(item.timestamp)}
                                            </Text>
                                        </div>

                                        {/* Description */}
                                        <div className="rescue-item-description">
                                            <Text>{item.description}</Text>
                                        </div>

                                        {/* Location - Chỉ hiển thị nếu không phải tọa độ thuần túy (ẩn tọa độ để tiết kiệm diện tích) */}
                                        {item.location &&
                                            !item.location.match(/^Vị trí GPS:\s*\d+\.\d+,\s*\d+\.\d+$/i) &&
                                            !item.location.match(/^\d+\.\d+,\s*\d+\.\d+$/) && (
                                                <div className="rescue-item-location">
                                                    <span className="location-icon">📍</span>
                                                    <Text type="secondary">{item.location.replace(/^Vị trí GPS:\s*/i, '')}</Text>
                                                </div>
                                            )}

                                        {/* Info: People, Needs, Status */}
                                        <div className="rescue-item-info">
                                            {item.people && (
                                                <Text type="secondary" className="rescue-info-item">👥 {item.people}</Text>
                                            )}
                                            {item.needs && (
                                                <Text type="secondary" className="rescue-info-item">📦 {item.needs}</Text>
                                            )}
                                            {item.status && (
                                                <Tag
                                                    color={item.status === 'Chưa xử lý' ? 'red' : item.status === 'Đang xử lý' ? 'orange' : 'green'}
                                                    className="rescue-status-tag"
                                                >
                                                    {item.status}
                                                </Tag>
                                            )}
                                        </div>

                                    </div>
                                    {/* Hình ảnh */}
                                    {item.imagePath && (
                                        <div className="rescue-item-image-wrapper">
                                            <img
                                                src={`${API_URL}${item.imagePath}`}
                                                alt="Hình ảnh cầu cứu"
                                                className="rescue-item-image"
                                                onClick={() => window.open(`${API_URL}${item.imagePath}`, '_blank')}
                                            />
                                        </div>
                                    )}
                                    {/* Actions: Phone, Map */}
                                    <div className="rescue-item-actions">
                                        {item.contactFull && (
                                            <Button
                                                size="small"
                                                icon={<PhoneOutlined />}
                                                onClick={() => copyPhone(item.contactFull)}
                                                title={item.contactFull}
                                                className="phone-button"
                                            >
                                                {item.contactFull.split(',')[0]} {item.contactFull.includes(',') && `(+${item.contactFull.split(',').length - 1})`}
                                            </Button>
                                        )}
                                        {!item.contactFull && item.contact && (
                                            <Button
                                                size="small"
                                                icon={<PhoneOutlined />}
                                                onClick={() => copyPhone(item.contact)}
                                                className="phone-button"
                                            >
                                                {item.contact}
                                            </Button>
                                        )}
                                        {item.coords && item.coords[0] && item.coords[1] && (
                                            <Button
                                                size="small"
                                                type="link"
                                                icon={<GlobalOutlined />}
                                                onClick={() => viewOnMap(item)}
                                                className="map-link-button"
                                            >
                                                Xem trên bản đồ
                                            </Button>
                                        )}
                                    </div>

                                    {/* Facebook Link */}
                                    {item.facebookUrl && (
                                        <Button
                                            size="small"
                                            type="link"
                                            href={item.facebookUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="facebook-link-button"
                                        >
                                            🔗 Xem bài gốc trên Facebook
                                        </Button>
                                    )}
                                    {/* Thông tin chi tiết đầy đủ */}
                                    {item.fullDetails && item.fullDetails.originalText && (
                                        <div className="rescue-item-full-details">
                                            <Text strong className="rescue-item-full-details-title">📋 Nội dung đầy đủ:</Text>
                                            <div className="rescue-item-full-details-content">
                                                {item.fullDetails.originalText.substring(0, 300)}
                                                {item.fullDetails.originalText.length > 300 && '...'}
                                            </div>
                                        </div>
                                    )}
                                </List.Item>
                            )}
                        />
                    )}
                </Card>

                {/* Section 4: Nút xem bản đồ
                <Card className="map-card">
                    <Button
                        type="primary"
                        danger
                        size="large"
                        icon={<GlobalOutlined />}
                        block
                        onClick={() => navigate('/map')}
                        style={{ height: '50px', fontSize: '16px' }}
                    >
                        Xem Bản Đồ Điểm Trú Ẩn & Khu Vực Ngập Nặng
                    </Button>
                </Card> */}


            </Content>
        </Layout >
    )
}

export default HomePage

