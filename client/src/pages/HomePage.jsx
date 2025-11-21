import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout, Button, Form, Input, Upload, message, Card, Space, Typography, Alert, List, Tag, Empty, Collapse, Image, Row, Col, Modal, Checkbox } from 'antd'
import { PhoneOutlined, EnvironmentOutlined, CameraOutlined, ExclamationCircleOutlined, GlobalOutlined, FireOutlined, AimOutlined, ZoomInOutlined, ArrowLeftOutlined, GiftOutlined } from '@ant-design/icons'
import Map, { Marker } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import axios from 'axios'
import AIReportForm from '../components/AIReportForm'
import { resizeImageForUpload } from '../utils/imageResize'
import { parseAndConvertGoogleMapsCoords } from '../utils/coordinateTransform'
import './HomePage.css'

const { Header, Content } = Layout
const { TextArea } = Input
const { Title, Text } = Typography

// Trong production (Docker), VITE_API_URL có thể là empty để dùng relative path /api (nginx proxy)
// Trong development, dùng localhost:5000
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || (import.meta.env.MODE === 'production' ? '' : 'http://localhost:5000')
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
    const [supportForm] = Form.useForm() // Form cho yêu cầu hỗ trợ
    const [hotlines, setHotlines] = useState(FALLBACK_HOTLINES)
    const [selectedHotline, setSelectedHotline] = useState(null)
    const [hotlineModalVisible, setHotlineModalVisible] = useState(false)
    const [showAllHotlines, setShowAllHotlines] = useState(false) // State để quản lý hiển thị tất cả hotline
    const [location, setLocation] = useState(null)
    const [supportLocation, setSupportLocation] = useState(null) // Location cho form hỗ trợ
    const [loading, setLoading] = useState(false)
    const [supportLoading, setSupportLoading] = useState(false) // Loading cho form hỗ trợ
    const [imageFile, setImageFile] = useState(null)
    const [supportImageFile, setSupportImageFile] = useState(null) // Image cho form hỗ trợ
    const [mapViewState, setMapViewState] = useState({
        longitude: 109.05,
        latitude: 13.08,
        zoom: 10
    })
    const [supportMapViewState, setSupportMapViewState] = useState({
        longitude: 109.05,
        latitude: 13.08,
        zoom: 10
    })
    const [showMap, setShowMap] = useState(false)
    const [showSupportMap, setShowSupportMap] = useState(false) // Map cho form hỗ trợ
    const [rescueRequests, setRescueRequests] = useState([])
    const [loadingRescue, setLoadingRescue] = useState(false)
    const [parsedCoords, setParsedCoords] = useState(null) // Tọa độ đã parse từ Google Maps link
    const [supportParsedCoords, setSupportParsedCoords] = useState(null) // Tọa độ cho form hỗ trợ
    const [googleMapsUrl, setGoogleMapsUrl] = useState('') // Link Google Maps
    const [supportGoogleMapsUrl, setSupportGoogleMapsUrl] = useState('') // Link Google Maps cho form hỗ trợ

    // Lấy danh sách hotline từ API hoặc dùng fallback
    useEffect(() => {
        const fetchHotlines = async () => {
            try {
                const response = await axios.get(`${API_URL}/api/hotlines`)
                if (response.data && response.data.success && Array.isArray(response.data.data)) {
                    setHotlines(response.data.data)
                } else {
                    console.warn('API trả về dữ liệu không hợp lệ, sử dụng fallback data')
                    // Giữ nguyên fallback data
                }
            } catch (error) {
                console.error('Lỗi khi lấy danh sách hotline:', error)
                // Giữ nguyên fallback data
            }
        }
        fetchHotlines()
    }, [])

    // Lấy danh sách cầu cứu từ AI - chỉ lấy 5 bài mới nhất để tránh lag
    const fetchRescueRequests = async () => {
        setLoadingRescue(true)
        try {
            const response = await axios.get(`${API_URL}/api/rescue-requests?limit=5&sort=-timestamp`)
            if (response.data.success) {
                // Đảm bảo chỉ lấy 5 bài mới nhất (sort theo timestamp giảm dần)
                const sorted = response.data.data.sort((a, b) => {
                    const timeA = a.timestamp || (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0)
                    const timeB = b.timestamp || (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0)
                    return timeB - timeA
                })
                setRescueRequests(sorted.slice(0, 5))
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

        // Tối ưu hiệu năng: Dynamic interval dựa trên tab visibility
        let interval = null
        let abortController = null

        const setupInterval = () => {
            if (interval) clearInterval(interval)

            // Chỉ fetch khi tab visible, interval dài hơn khi hidden
            const intervalTime = document.hidden ? 60000 : 30000 // 30s khi visible, 1 phút khi hidden

            interval = setInterval(() => {
                if (!document.hidden) {
                    // Cancel request cũ nếu có
                    if (abortController) {
                        abortController.abort()
                    }

                    abortController = new AbortController()
                    fetchRescueRequests()
                }
            }, intervalTime)
        }

        setupInterval()

        // Lắng nghe visibility change
        const handleVisibilityChange = () => {
            setupInterval()
            if (!document.hidden) {
                fetchRescueRequests()
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            if (interval) clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            if (abortController) {
                abortController.abort()
            }
        }
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

    // Tạo Google Maps link
    const getGoogleMapsLink = (coords) => {
        if (!coords || !coords[0] || !coords[1]) return null
        // coords format: [lng, lat]
        return `https://www.google.com/maps?q=${coords[1]},${coords[0]}`
    }

    // Xem trên bản đồ (điều hướng trong app - giữ lại cho các chức năng khác)
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

    // Lấy vị trí GPS tự động cho form hỗ trợ
    const getSupportCurrentLocation = () => {
        if (navigator.geolocation) {
            setSupportLoading(true)
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const newLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    }
                    setSupportLocation(newLocation)
                    setSupportMapViewState({
                        longitude: newLocation.lng,
                        latitude: newLocation.lat,
                        zoom: 14
                    })
                    setShowSupportMap(true)
                    message.success('Đã lấy vị trí GPS thành công!')
                    setSupportLoading(false)
                },
                (error) => {
                    console.error('Lỗi GPS:', error)
                    message.warning('Không thể lấy vị trí GPS. Vui lòng chọn trên bản đồ.')
                    setShowSupportMap(true)
                    setSupportLoading(false)
                }
            )
        } else {
            message.warning('Trình duyệt không hỗ trợ GPS. Vui lòng chọn trên bản đồ.')
            setShowSupportMap(true)
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

    // Xử lý click trên map để chọn tọa độ cho form hỗ trợ
    const handleSupportMapClick = (event) => {
        const { lng, lat } = event.lngLat
        const newLocation = {
            lat: lat,
            lng: lng
        }
        setSupportLocation(newLocation)
        message.success(`Đã chọn vị trí: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    }

    // Parse tọa độ từ Google Maps URL (tự động chuyển đổi GCJ-02 → WGS84)
    const parseGoogleMapsCoords = (url) => {
        const result = parseAndConvertGoogleMapsCoords(url, { outputFormat: 'object' });
        return result; // Trả về {lat, lng} theo format của location state
    }

    // Xử lý khi Google Maps link thay đổi
    const handleGoogleMapsLinkChange = (e) => {
        const url = e.target.value.trim()
        setGoogleMapsUrl(url)
        if (url) {
            const coords = parseGoogleMapsCoords(url)
            if (coords) {
                setParsedCoords(coords)
                setLocation(coords) // Tự động set location từ Google Maps link
                // Cập nhật map view để hiển thị vị trí
                setMapViewState({
                    longitude: coords.lng,
                    latitude: coords.lat,
                    zoom: 14
                })
                setShowMap(true) // Hiển thị map để user thấy vị trí
                message.success(`✅ Đã tìm thấy tọa độ: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`)
            } else {
                setParsedCoords(null)
            }
        } else {
            setParsedCoords(null)
        }
    }

    // Xử lý khi Google Maps link thay đổi cho form hỗ trợ
    const handleSupportGoogleMapsLinkChange = (e) => {
        const url = e.target.value.trim()
        setSupportGoogleMapsUrl(url)
        if (url) {
            const coords = parseGoogleMapsCoords(url)
            if (coords) {
                setSupportParsedCoords(coords)
                setSupportLocation(coords)
                setSupportMapViewState({
                    longitude: coords.lng,
                    latitude: coords.lat,
                    zoom: 14
                })
                setShowSupportMap(true)
                message.success(`✅ Đã tìm thấy tọa độ: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`)
            } else {
                setSupportParsedCoords(null)
            }
        } else {
            setSupportParsedCoords(null)
        }
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

    // Xử lý upload ảnh cho form hỗ trợ
    const handleSupportImageChange = (info) => {
        let file = null

        if (info.file) {
            if (info.file.originFileObj) {
                file = info.file.originFileObj
            } else if (info.file instanceof File) {
                file = info.file
            } else if (info.fileList && info.fileList.length > 0) {
                const firstFile = info.fileList[0]
                file = firstFile.originFileObj || firstFile
            }
        } else if (info.fileList && info.fileList.length > 0) {
            const firstFile = info.fileList[0]
            file = firstFile.originFileObj || firstFile
        }

        if (file && file instanceof File) {
            setSupportImageFile(file)
            message.success(`Đã chọn ảnh: ${file.name}`)
        } else {
            if (info.fileList && info.fileList.length === 0) {
                setSupportImageFile(null)
            }
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

            // Resize và convert ảnh sang base64 nếu có
            let imageBase64 = null
            if (imageFile) {
                try {
                    const processingMessage = message.loading('Đang xử lý và nén ảnh...', 0);
                    imageBase64 = await resizeImageForUpload(imageFile);
                    processingMessage();
                } catch (imgError) {
                    console.error('❌ Lỗi xử lý ảnh:', imgError)
                    message.warning('Không thể xử lý ảnh, sẽ gửi báo cáo không có ảnh')
                }
            }

            // Ưu tiên dùng tọa độ từ Google Maps link, nếu không có thì dùng location đã chọn
            const finalLocation = parsedCoords || location || { lat: null, lng: null }

            const reportData = {
                location: finalLocation,
                description: values.description || '',
                imageBase64: imageBase64,
                phone: values.phone || '',
                name: values.name || '',
                googleMapsUrl: googleMapsUrl || null // Gửi Google Maps URL lên backend
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
                setParsedCoords(null)
                setGoogleMapsUrl('')

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
                    const errorData = error.response.data
                    if (errorData?.isDuplicate) {
                        message.warning(`⚠️ ${errorData.message || 'Báo cáo này có vẻ trùng lặp với báo cáo đã có. Vui lòng kiểm tra lại!'}`)
                    } else {
                        message.error(`Lỗi: ${errorData?.message || error.message}`)
                    }
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

    // Submit form yêu cầu hỗ trợ
    const handleSupportSubmit = async (values) => {
        try {
            setSupportLoading(true)

            // Validate
            if (!values.description || values.description.trim().length === 0) {
                message.error('Vui lòng nhập mô tả nhu cầu hỗ trợ!')
                setSupportLoading(false)
                return
            }

            if (!values.needs || !Array.isArray(values.needs) || values.needs.length === 0) {
                message.error('Vui lòng chọn ít nhất một loại hỗ trợ cần thiết!')
                setSupportLoading(false)
                return
            }

            // Resize và convert ảnh sang base64 nếu có
            let imageBase64 = null
            if (supportImageFile) {
                try {
                    const processingMessage = message.loading('Đang xử lý và nén ảnh...', 0);
                    imageBase64 = await resizeImageForUpload(supportImageFile);
                    processingMessage();
                } catch (imgError) {
                    console.error('❌ Lỗi xử lý ảnh:', imgError)
                    message.warning('Không thể xử lý ảnh, sẽ gửi yêu cầu không có ảnh')
                }
            }

            // Ưu tiên dùng tọa độ từ Google Maps link
            const finalLocation = supportParsedCoords || supportLocation || { lat: null, lng: null }

            const supportData = {
                location: finalLocation,
                description: values.description || '',
                imageBase64: imageBase64,
                phone: values.phone || '',
                name: values.name || '',
                googleMapsUrl: supportGoogleMapsUrl || null,
                needs: values.needs || [],
                peopleCount: values.peopleCount || 1
            }

            try {
                const response = await axios.post(`${API_URL}/api/support-requests`, supportData, {
                    timeout: 30000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })

                message.success('Đã gửi thành công yêu cầu hỗ trợ!')
                supportForm.resetFields()
                setSupportLocation(null)
                setSupportImageFile(null)
                setSupportParsedCoords(null)
                setSupportGoogleMapsUrl('')
            } catch (error) {
                console.error('❌ Request error:', error)

                if (error.response) {
                    const errorData = error.response.data
                    if (errorData?.isDuplicate) {
                        message.warning(`⚠️ ${errorData.message || 'Yêu cầu này có vẻ trùng lặp với yêu cầu đã có. Vui lòng kiểm tra lại!'}`)
                    } else {
                        message.error(`Lỗi: ${errorData?.message || error.message}`)
                    }
                } else if (error.request) {
                    message.error('Không thể kết nối server. Vui lòng kiểm tra kết nối mạng!')
                } else {
                    message.error(`Lỗi: ${error.message}`)
                }
            }
        } catch (error) {
            console.error('❌ Unexpected error:', error)
            message.error('Có lỗi xảy ra. Vui lòng thử lại!')
        } finally {
            setSupportLoading(false)
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

                    {/* Hiển thị danh sách hotline */}
                    {hotlines && hotlines.length > 0 ? (
                        <>
                            <Row gutter={[16, 16]} style={{ margin: 0, width: '100%' }}>
                                {(showAllHotlines ? hotlines : hotlines.slice(0, 3)).map((hotline) => {
                                    const hotlineId = hotline._id || hotline.id;
                                    const hasImage = hotline.imageUrl && hotline.imageUrl.trim() !== '';

                                    return (
                                        <Col
                                            key={hotlineId}
                                            xs={24}
                                            sm={12}
                                            md={hasImage ? 8 : 12}
                                            lg={hasImage ? 6 : 8}
                                        >
                                            <div
                                                style={{
                                                    cursor: 'pointer',
                                                    borderRadius: '8px',
                                                    overflow: 'hidden',
                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                                    transition: 'all 0.3s',
                                                    background: '#fff',
                                                    height: '100%'
                                                }}
                                                onClick={() => {
                                                    setSelectedHotline(hotline)
                                                    setHotlineModalVisible(true)
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
                                                {hasImage ? (
                                                    <>
                                                        <Image
                                                            src={hotline.imageUrl.startsWith('http')
                                                                ? hotline.imageUrl
                                                                : `${API_URL}${hotline.imageUrl}`
                                                            }
                                                            alt={hotline.unit || 'Hotline'}
                                                            preview={false}
                                                            style={{
                                                                width: '100%',
                                                                height: 'auto',
                                                                display: 'block'
                                                            }}
                                                            onError={(e) => {
                                                                // Nếu ảnh lỗi, ẩn ảnh và hiển thị dạng text
                                                                e.target.style.display = 'none';
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
                                                    </>
                                                ) : (
                                                    // Hiển thị dạng card text nếu không có hình ảnh
                                                    <div style={{ padding: '16px' }}>
                                                        <div style={{ marginBottom: '8px' }}>
                                                            <Text strong style={{ fontSize: '16px', color: '#dc2626' }}>
                                                                {hotline.unit || 'Hotline'}
                                                            </Text>
                                                        </div>
                                                        {hotline.province && (
                                                            <div style={{ marginBottom: '4px' }}>
                                                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                                                    {hotline.province}
                                                                </Text>
                                                            </div>
                                                        )}
                                                        <div style={{ marginTop: '8px' }}>
                                                            <PhoneOutlined style={{ color: '#52c41a', marginRight: '8px' }} />
                                                            <Text strong style={{ fontSize: '18px', color: '#52c41a' }}>
                                                                {hotline.phone}
                                                            </Text>
                                                        </div>
                                                        {hotline.note && (
                                                            <div style={{ marginTop: '8px' }}>
                                                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                                                    {hotline.note}
                                                                </Text>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </Col>
                                    );
                                })}
                            </Row>
                            {/* Nút Xem thêm / Ẩn bớt - chỉ hiển thị khi có nhiều hơn 3 hotline */}
                            {hotlines.length > 3 && (
                                <div style={{
                                    textAlign: 'center',
                                    marginTop: '16px'
                                }}>
                                    <Button
                                        type="link"
                                        onClick={() => setShowAllHotlines(!showAllHotlines)}
                                        style={{
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            color: '#1890ff'
                                        }}
                                    >
                                        {showAllHotlines ? (
                                            <>
                                                <span>Ẩn bớt</span>
                                                <span style={{ marginLeft: '4px' }}>▲</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>Xem thêm ({hotlines.length - 3} hotline khác)</span>
                                                <span style={{ marginLeft: '4px' }}>▼</span>
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : (
                        <Empty
                            description="Chưa có hotline nào được thêm vào hệ thống"
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                        />
                    )}
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
                            label="Link Google Maps (tùy chọn - để lấy tọa độ chính xác)"
                            help="Paste link Google Maps để tự động lấy tọa độ. Hệ thống sẽ ưu tiên dùng tọa độ này."
                        >
                            <Input
                                placeholder="https://www.google.com/maps?q=13.08,109.30 hoặc https://maps.google.com/@13.08,109.30"
                                prefix={<GlobalOutlined />}
                                allowClear
                                value={googleMapsUrl}
                                onChange={handleGoogleMapsLinkChange}
                            />
                        </Form.Item>

                        {parsedCoords && (
                            <Alert
                                message={`✅ Đã tìm thấy tọa độ: ${parsedCoords.lat.toFixed(6)}, ${parsedCoords.lng.toFixed(6)}`}
                                type="success"
                                showIcon
                                style={{ marginBottom: 16 }}
                                closable
                                onClose={() => {
                                    setParsedCoords(null)
                                    setGoogleMapsUrl('')
                                    form.setFieldsValue({ googleMapsUrl: '' })
                                }}
                            />
                        )}

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
                {/* Section 2a: Form Yêu cầu Hỗ Trợ */}
                <Card
                    title={
                        <div className="card-title-wrapper">
                            <GiftOutlined style={{ color: '#1890ff', fontSize: '18px' }} />
                            <span className="card-title-text">Yêu Cầu Hỗ Trợ</span>
                        </div>
                    }
                    className="support-request-card"
                >
                    <Alert
                        message="Điền form này nếu bạn cần hỗ trợ về thực phẩm, quần áo, nhu yếu phẩm..."
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                    <Form
                        form={supportForm}
                        layout="vertical"
                        onFinish={handleSupportSubmit}
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
                                placeholder="Nhập số điện thoại để đội hỗ trợ liên hệ"
                                maxLength={20}
                                showCount
                            />
                        </Form.Item>

                        <Form.Item
                            label="Loại hỗ trợ cần thiết"
                            name="needs"
                            rules={[{ required: true, message: 'Vui lòng chọn ít nhất một loại hỗ trợ!' }]}
                        >
                            <Checkbox.Group
                                options={[
                                    { label: '🍞 Thực phẩm', value: 'Thực phẩm', key: 'thuc-pham' },
                                    { label: '💧 Nước uống', value: 'Nước uống', key: 'nuoc-uong' },
                                    { label: '👕 Quần áo', value: 'Quần áo', key: 'quan-ao' },
                                    { label: '💊 Thuốc men', value: 'Thuốc men', key: 'thuoc-men' },
                                    { label: '🛏️ Chăn màn', value: 'Chăn màn', key: 'chan-man' },
                                    { label: '🔦 Đèn pin', value: 'Đèn pin', key: 'den-pin' },
                                    { label: '🔋 Pin', value: 'Pin', key: 'pin' },
                                    { label: '🔥 Bếp gas', value: 'Bếp gas', key: 'bep-gas' },
                                    { label: '🧴 Nhu yếu phẩm', value: 'Nhu yếu phẩm', key: 'nhu-yeu-pham' },
                                    { label: '📝 Khác', value: 'Khác', key: 'khac' }
                                ]}
                            />
                        </Form.Item>

                        <Form.Item
                            label="Số lượng người cần hỗ trợ"
                            name="peopleCount"
                            rules={[{ required: true, message: 'Vui lòng nhập số lượng người!' }]}
                            initialValue={1}
                        >
                            <Input
                                type="number"
                                min={1}
                                placeholder="Nhập số lượng người"
                            />
                        </Form.Item>

                        <Form.Item
                            label="Link Google Maps (tùy chọn - để lấy tọa độ chính xác)"
                            help="Paste link Google Maps để tự động lấy tọa độ. Hệ thống sẽ ưu tiên dùng tọa độ này."
                        >
                            <Input
                                placeholder="https://www.google.com/maps?q=13.08,109.30 hoặc https://maps.google.com/@13.08,109.30"
                                prefix={<GlobalOutlined />}
                                allowClear
                                value={supportGoogleMapsUrl}
                                onChange={handleSupportGoogleMapsLinkChange}
                            />
                        </Form.Item>

                        {supportParsedCoords && (
                            <Alert
                                message={`✅ Đã tìm thấy tọa độ: ${supportParsedCoords.lat.toFixed(6)}, ${supportParsedCoords.lng.toFixed(6)}`}
                                type="success"
                                showIcon
                                style={{ marginBottom: 16 }}
                                closable
                                onClose={() => {
                                    setSupportParsedCoords(null)
                                    setSupportGoogleMapsUrl('')
                                    supportForm.setFieldsValue({ googleMapsUrl: '' })
                                }}
                            />
                        )}

                        <Form.Item
                            label="Vị trí GPS"
                            help="Chọn vị trí trên bản đồ hoặc dùng GPS tự động"
                        >
                            <Space direction="vertical" style={{ width: '100%', maxWidth: '100%' }} size="middle">
                                <Space wrap style={{ width: '100%' }}>
                                    <Button
                                        icon={<EnvironmentOutlined />}
                                        onClick={getSupportCurrentLocation}
                                        loading={supportLoading}
                                        size="middle"
                                        className="gps-button"
                                    >
                                        Lấy GPS Tự Động
                                    </Button>
                                    <Button
                                        icon={<AimOutlined />}
                                        onClick={() => setShowSupportMap(!showSupportMap)}
                                        type={showSupportMap ? 'primary' : 'default'}
                                        size="middle"
                                        className="map-select-button"
                                    >
                                        {showSupportMap ? 'Ẩn Bản Đồ' : 'Chọn Trên Bản Đồ'}
                                    </Button>
                                    {supportLocation && (
                                        <Tag color="green" className="location-tag">
                                            ✓ Đã chọn: {supportLocation.lat.toFixed(6)}, {supportLocation.lng.toFixed(6)}
                                        </Tag>
                                    )}
                                </Space>

                                {showSupportMap && MAPBOX_TOKEN && (
                                    <Card
                                        size="small"
                                        className="map-selector-card"
                                        styles={{ body: { padding: 0, height: '100%' } }}
                                    >
                                        <Map
                                            mapboxAccessToken={MAPBOX_TOKEN}
                                            {...supportMapViewState}
                                            onMove={evt => setSupportMapViewState(evt.viewState)}
                                            onClick={handleSupportMapClick}
                                            style={{ width: '100%', height: '100%' }}
                                            mapStyle="mapbox://styles/mapbox/streets-v12"
                                            cursor="crosshair"
                                        >
                                            {supportLocation && (
                                                <Marker
                                                    longitude={supportLocation.lng}
                                                    latitude={supportLocation.lat}
                                                    anchor="bottom"
                                                >
                                                    <div style={{
                                                        width: '30px',
                                                        height: '30px',
                                                        borderRadius: '50%',
                                                        background: '#1890ff',
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

                                {showSupportMap && !MAPBOX_TOKEN && (
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
                            label="Mô tả nhu cầu hỗ trợ"
                            name="description"
                            rules={[
                                { required: true, message: 'Vui lòng mô tả nhu cầu hỗ trợ!' },
                                { max: 500, message: 'Mô tả không được quá 500 ký tự!' }
                            ]}
                        >
                            <TextArea
                                rows={4}
                                maxLength={500}
                                showCount
                                placeholder="Mô tả chi tiết nhu cầu hỗ trợ của bạn (ví dụ: gia đình 5 người cần thực phẩm và nước uống, đang ở khu vực ngập lụt...)"
                            />
                        </Form.Item>

                        <Form.Item
                            label="Upload ảnh (tùy chọn)"
                            help="Kéo thả ảnh vào đây hoặc click để chọn"
                        >
                            <Upload
                                accept="image/*"
                                beforeUpload={() => false}
                                onChange={handleSupportImageChange}
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
                                htmlType="submit"
                                loading={supportLoading}
                                block
                                size="large"
                                style={{ height: '50px', fontSize: '16px' }}
                            >
                                Gửi Yêu Cầu Hỗ Trợ
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
                {/* Section 2: Form AI xử lý cầu cứu */}
                <AIReportForm onSuccess={handleAISuccess} />

                {/* Section 3: Cầu cứu realtime từ người dân - Chỉ hiển thị 5 bài mới nhất */}
                <Card
                    title={
                        <div className="card-title-wrapper">
                            <FireOutlined style={{ color: '#dc2626', fontSize: '18px' }} />
                            <span className="card-title-text">Cầu Cứu Realtime (5 bài mới nhất)</span>
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
                            dataSource={rescueRequests.slice(0, 5)}
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
                                                href={getGoogleMapsLink(item.coords)}
                                                target="_blank"
                                                rel="noopener noreferrer"
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

                {/* Section 4: Nút quay lại trang chủ (bản đồ) */}
                <Card className="map-card">
                    <Button
                        type="primary"
                        size="large"
                        icon={<GlobalOutlined />}
                        block
                        onClick={() => navigate('/')}
                        style={{ height: '50px', fontSize: '16px' }}
                    >
                        🗺️ Quay lại Bản đồ
                    </Button>
                </Card>

            </Content>

            {/* Modal hiển thị thông tin chi tiết hotline */}
            <Modal
                title={
                    <Space>
                        <PhoneOutlined style={{ color: '#dc2626', fontSize: '20px' }} />
                        <span>Thông tin Hotline</span>
                    </Space>
                }
                open={hotlineModalVisible}
                onCancel={() => {
                    setHotlineModalVisible(false)
                    setSelectedHotline(null)
                }}
                footer={[
                    <Button key="close" onClick={() => {
                        setHotlineModalVisible(false)
                        setSelectedHotline(null)
                    }}>
                        Đóng
                    </Button>
                ]}
                width={600}
            >
                {selectedHotline && (
                    <Space direction="vertical" size="large" style={{ width: '100%' }}>
                        {/* Hình ảnh hotline */}
                        {selectedHotline.imageUrl && (
                            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                <Image
                                    src={selectedHotline.imageUrl.startsWith('http')
                                        ? selectedHotline.imageUrl
                                        : `${API_URL}${selectedHotline.imageUrl}`
                                    }
                                    alt={selectedHotline.unit || 'Hotline'}
                                    style={{
                                        maxWidth: '100%',
                                        height: 'auto',
                                        borderRadius: '8px',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                    }}
                                    preview={{
                                        mask: <Space><ZoomInOutlined /> Xem lớn</Space>
                                    }}
                                />
                            </div>
                        )}

                        {/* Thông tin chi tiết */}
                        <div>
                            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                <div>
                                    <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                                        Tỉnh/Thành phố
                                    </Text>
                                    <Text strong style={{ fontSize: '16px' }}>
                                        {selectedHotline.province || 'N/A'}
                                    </Text>
                                </div>

                                <div>
                                    <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                                        Đơn vị
                                    </Text>
                                    <Text strong style={{ fontSize: '16px' }}>
                                        {selectedHotline.unit || selectedHotline.imageTitle || 'N/A'}
                                    </Text>
                                </div>

                                <div>
                                    <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                                        Số điện thoại
                                    </Text>
                                    <Space>
                                        <Button
                                            type="primary"
                                            danger
                                            size="large"
                                            icon={<PhoneOutlined />}
                                            href={`tel:${selectedHotline.phone?.replace(/\./g, '') || ''}`}
                                            style={{ fontSize: '18px', fontWeight: 'bold' }}
                                        >
                                            {selectedHotline.phone || 'N/A'}
                                        </Button>
                                    </Space>
                                </div>

                                {selectedHotline.note && (
                                    <div>
                                        <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                                            Ghi chú
                                        </Text>
                                        <Text style={{ fontSize: '14px' }}>
                                            {selectedHotline.note}
                                        </Text>
                                    </div>
                                )}

                                {selectedHotline.imageTitle && selectedHotline.imageTitle !== selectedHotline.unit && (
                                    <div>
                                        <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                                            Tiêu đề hình ảnh
                                        </Text>
                                        <Text style={{ fontSize: '14px' }}>
                                            {selectedHotline.imageTitle}
                                        </Text>
                                    </div>
                                )}
                            </Space>
                        </div>
                    </Space>
                )}
            </Modal>
        </Layout >
    )
}

export default HomePage

