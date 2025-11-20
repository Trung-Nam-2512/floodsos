import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout, Card, Button, Space, Typography, Alert, Spin, Tag, Input, List, Empty, Modal, message, Form, Upload, Tabs, Select } from 'antd'
import { ArrowLeftOutlined, PhoneOutlined, HomeOutlined, FireOutlined, SearchOutlined, SendOutlined, GlobalOutlined, AimOutlined, EditOutlined, MenuOutlined, CloseOutlined, FilterOutlined, ClockCircleOutlined, EnvironmentOutlined, AppstoreOutlined, DashboardOutlined, FileTextOutlined, PlusOutlined, CameraOutlined } from '@ant-design/icons'
import Map, { Marker, Popup } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import axios from 'axios'
import Supercluster from 'supercluster'
import WaterLevelChart from '../components/WaterLevelChart'
import './MapPage.css'

const { Header, Content, Sider } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { Search } = Input

// Trong production (Docker), VITE_API_URL có thể là empty để dùng relative path /api (nginx proxy)
// Trong development, dùng localhost:5000
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || (import.meta.env.MODE === 'production' ? '' : 'http://localhost:5000')
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.REACT_APP_MAPBOX_TOKEN || ''
if (!MAPBOX_TOKEN && process.env.NODE_ENV === 'development') {
    console.warn('⚠️ MAPBOX_TOKEN không được tìm thấy trong environment variables')
}

// Mapping các thông số thủy điện sang tiếng Việt dễ hiểu
const THUYDIEN_PARAM_LABELS = {
    'Htl': 'Mực nước hồ (m)',
    'Hdbt': 'Mực nước đập bê tông (m)',
    'Hc': 'Mực nước cao (m)',
    'Qve': 'Lưu lượng nước vào (m³/s)',
    'ΣQx': 'Tổng lưu lượng xả (m³/s)',
    'Qxt': 'Lưu lượng xả tổng (m³/s)',
    'Qxm': 'Lưu lượng xả máy (m³/s)',
    'Ncxs': 'Công suất phát điện (MW)',
    'Ncxm': 'Công suất máy (MW)'
}

function MapPage() {
    const navigate = useNavigate()
    const location = useLocation()
    const [safePoints, setSafePoints] = useState([])
    // Flood areas đã bị loại bỏ - không còn sử dụng
    // const [floodAreas, setFloodAreas] = useState([])
    const [rescueRequests, setRescueRequests] = useState([])
    const [selectedPoint, setSelectedPoint] = useState(null)
    const [selectedRescue, setSelectedRescue] = useState(null)
    const [selectedListItem, setSelectedListItem] = useState(null) // Item được chọn trong sidebar
    const [loading, setLoading] = useState(true)
    const [searchText, setSearchText] = useState('')
    const [activeFilter, setActiveFilter] = useState('all') // 'all', 'rescue', 'safe', 'thuydien', 'waterlevel'
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false) // Mobile sidebar state
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
    const [viewState, setViewState] = useState({
        longitude: 108.9, // Phú Yên
        latitude: 13.0,  // Phú Yên
        zoom: 9
    })
    const [editingRequest, setEditingRequest] = useState(null) // Request đang được edit tọa độ
    const [clickedCoords, setClickedCoords] = useState(null) // Tọa độ khi click trên map (chỉ dùng trong modal edit)
    const [googleMapsLink, setGoogleMapsLink] = useState('') // Link Google Maps để parse tọa độ
    const [updateError, setUpdateError] = useState(null) // Lỗi khi cập nhật tọa độ
    const [isUpdating, setIsUpdating] = useState(false) // Đang cập nhật
    const [debouncedSearchText, setDebouncedSearchText] = useState('') // Search text đã debounce

    // Quick rescue form states
    const [quickRescueModalVisible, setQuickRescueModalVisible] = useState(false)
    const [quickRescueForm] = Form.useForm()
    const [quickRescueLocation, setQuickRescueLocation] = useState(null) // { lat, lng }
    const [quickRescueImageFile, setQuickRescueImageFile] = useState(null)
    const [quickRescueLoading, setQuickRescueLoading] = useState(false)

    // Location picker modal states
    const [locationPickerModalVisible, setLocationPickerModalVisible] = useState(false)
    const [locationPickerMapType, setLocationPickerMapType] = useState('streets') // 'streets' or 'satellite'
    const [locationPickerViewState, setLocationPickerViewState] = useState({
        longitude: 108.9, // Phú Yên
        latitude: 13.0,  // Phú Yên
        zoom: 14
    })
    const [locationPickerSelected, setLocationPickerSelected] = useState(null) // { lat, lng }

    // Add rescue team form states
    const [addRescueTeamModalVisible, setAddRescueTeamModalVisible] = useState(false)
    const [addRescueTeamForm] = Form.useForm()
    const [addRescueTeamLocation, setAddRescueTeamLocation] = useState(null) // { lat, lng }
    const [addRescueTeamLoading, setAddRescueTeamLoading] = useState(false)
    const [locationPickerContext, setLocationPickerContext] = useState(null) // 'quickRescue' | 'addRescueTeam' | null

    // Water level stations states
    const [waterLevelStations, setWaterLevelStations] = useState([])
    const [waterLevelModalVisible, setWaterLevelModalVisible] = useState(false)
    const [selectedWaterStation, setSelectedWaterStation] = useState(null) // { stationCode, stationName, coordinates }

    // Thủy điện (reservoirs) states
    const [thuydienData, setThuydienData] = useState({})
    const [selectedThuydien, setSelectedThuydien] = useState(null) // { slug, name, coordinates, data }

    // Load dữ liệu từ API hoặc dùng fallback
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [safeRes, rescueRes] = await Promise.all([
                    axios.get(`${API_URL}/api/safe-points`),
                    axios.get(`${API_URL}/api/rescue-requests`)
                ])

                if (safeRes.data && safeRes.data.success && Array.isArray(safeRes.data.data)) {
                    setSafePoints(safeRes.data.data)
                }
                // Flood areas đã bị loại bỏ - không còn fetch
                if (rescueRes.data && rescueRes.data.success && Array.isArray(rescueRes.data.data)) {
                    setRescueRequests(rescueRes.data.data)

                    // Nếu có focusRequest từ HomePage, focus vào đó
                    if (location.state?.focusRequest && rescueRes.data.data.length > 0) {
                        const focusReq = rescueRes.data.data.find(r => (r._id || r.id) === location.state.focusRequest)
                        if (focusReq && focusReq.coords && Array.isArray(focusReq.coords) && focusReq.coords.length >= 2 && focusReq.coords[0] && focusReq.coords[1]) {
                            setViewState({
                                longitude: focusReq.coords[0],
                                latitude: focusReq.coords[1],
                                zoom: 14
                            })
                            setSelectedRescue(focusReq)
                            setSelectedListItem(focusReq._id || focusReq.id)
                        }
                    }
                }
            } catch (error) {
                console.log('Không thể kết nối API, sử dụng dữ liệu offline')
                // Giữ nguyên fallback data
            } finally {
                setLoading(false)
            }
        }
        fetchData()

        // Fetch water level stations
        const fetchWaterLevelStations = async () => {
            try {
                // Lấy danh sách các trạm đo mực nước (có thể mở rộng sau)
                const stationCodes = '71559,71558,71564' // Có thể lấy từ config hoặc API khác
                const response = await axios.get('https://quantrac.baonamdts.com/api/v1/all-stations/waterlevel', {
                    params: { stationCodes }
                })

                if (response.data && response.data.features) {
                    const stations = response.data.features.map(feature => ({
                        stationCode: feature.properties.stationCode,
                        stationName: feature.properties.stationName,
                        coordinates: feature.geometry.coordinates, // [lng, lat]
                        data: feature.properties.data
                    }))
                    setWaterLevelStations(stations)
                }
            } catch (error) {
                console.error('Lỗi lấy dữ liệu trạm đo mực nước:', error)
            }
        }
        fetchWaterLevelStations()

        // Fetch thủy điện data
        const fetchThuydienData = async () => {
            try {
                const response = await axios.get(`${API_URL}/api/thuydien/latest`)
                // console.log('📊 Thuỷ điện API response:', response.data)
                if (response.data && response.data.success && response.data.data) {
                    setThuydienData(response.data.data)
                } else {
                    console.warn('⚠️ Thuỷ điện API không trả về dữ liệu hợp lệ:', response.data)
                }
            } catch (error) {
                console.error('❌ Lỗi lấy dữ liệu thủy điện:', error)
            }
        }
        fetchThuydienData()

        // Refresh thủy điện data mỗi 1 phút
        const thuydienInterval = setInterval(fetchThuydienData, 60 * 1000)

        // Refresh rescue requests mỗi 10 giây
        const interval = setInterval(async () => {
            try {
                const rescueRes = await axios.get(`${API_URL}/api/rescue-requests`)
                if (rescueRes.data && rescueRes.data.success && Array.isArray(rescueRes.data.data)) {
                    setRescueRequests(rescueRes.data.data)
                }
            } catch (error) {
                console.log('Không thể refresh cầu cứu:', error.message)
                // Không set state để giữ nguyên dữ liệu cũ
            }
        }, 10000)

        return () => {
            clearInterval(interval)
            clearInterval(thuydienInterval)
        }
    }, [location.state])

    // Detect mobile
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768)
            if (window.innerWidth > 768) {
                setSidebarOpen(false)
            }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // Cleanup timeout khi unmount
    useEffect(() => {
        return () => {
            if (moveTimeoutRef.current) {
                clearTimeout(moveTimeoutRef.current)
            }
        }
    }, [])

    // Debounce search text để tối ưu hiệu năng trên mobile
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchText(searchText)
        }, 300) // Debounce 300ms

        return () => clearTimeout(timer)
    }, [searchText])

    // Debug: Log thuydienData khi thay đổi
    useEffect(() => {
        // console.log('🔄 thuydienData đã thay đổi:', thuydienData)
        // console.log('🔄 Số lượng reservoirs:', Object.keys(thuydienData).length)
        // Object.entries(thuydienData).forEach(([key, value]) => {
        //     console.log(`  - ${key}:`, value)
        // })
    }, [thuydienData])

    // Xử lý click marker
    const handleMarkerClick = useCallback((point, type) => {
        setSelectedPoint({ ...point, type })
        setSelectedRescue(null)

        // Điều hướng map đến vị trí của point
        if (point && typeof point.lng === 'number' && typeof point.lat === 'number' &&
            !isNaN(point.lng) && !isNaN(point.lat) &&
            point.lng >= -180 && point.lng <= 180 && point.lat >= -90 && point.lat <= 90) {
            setViewState(prev => ({
                ...prev,
                longitude: point.lng,
                latitude: point.lat,
                zoom: Math.max(prev.zoom, 14) // Đảm bảo zoom đủ gần
            }))
        }
    }, [])

    // Xử lý click rescue marker
    const handleRescueClick = useCallback((request) => {
        setSelectedRescue(request)
        setSelectedPoint(null)
        setSelectedListItem(request._id || request.id) // Highlight trong sidebar
    }, [])

    // Xử lý click water level station marker - mở modal trực tiếp
    const handleWaterStationClick = useCallback((station) => {
        // Set thông tin trạm và mở modal luôn
        setSelectedWaterStation({
            stationCode: station.stationCode,
            stationName: station.stationName,
            coordinates: station.coordinates
        })
        setWaterLevelModalVisible(true)

        // Điều hướng map đến vị trí trạm
        if (station.coordinates && station.coordinates.length >= 2) {
            setViewState(prev => ({
                ...prev,
                longitude: parseFloat(station.coordinates[0]),
                latitude: parseFloat(station.coordinates[1]),
                zoom: Math.max(prev.zoom, 14)
            }))
        }
    }, [])

    // Xử lý click thủy điện marker
    const handleThuydienClick = useCallback((reservoir) => {
        setSelectedThuydien(reservoir)
        setSelectedPoint(null)
        setSelectedRescue(null)

        // Điều hướng map đến vị trí đập
        if (reservoir.coordinates && reservoir.coordinates.lat && reservoir.coordinates.lng) {
            setViewState(prev => ({
                ...prev,
                longitude: reservoir.coordinates.lng,
                latitude: reservoir.coordinates.lat,
                zoom: Math.max(prev.zoom, 14)
            }))
        }
    }, [])

    // Xử lý click cluster marker
    const handleClusterClick = useCallback((cluster) => {
        const expansionZoom = Math.min(
            clusterRef.current?.getClusterExpansionZoom(cluster.id) || viewState.zoom + 2,
            18
        )
        setViewState(prev => ({
            ...prev,
            longitude: cluster.geometry.coordinates[0],
            latitude: cluster.geometry.coordinates[1],
            zoom: expansionZoom
        }))
    }, [viewState.zoom])

    // Xử lý click item trong sidebar
    const handleListItemClick = useCallback((request) => {
        if (!request) return

        const coords = request.coords
        if (Array.isArray(coords) && coords.length >= 2 &&
            typeof coords[0] === 'number' && typeof coords[1] === 'number' &&
            !isNaN(coords[0]) && !isNaN(coords[1]) &&
            coords[0] >= -180 && coords[0] <= 180 && coords[1] >= -90 && coords[1] <= 90) {
            setViewState(prev => ({
                ...prev,
                longitude: coords[0],
                latitude: coords[1],
                zoom: 14
            }))
            setSelectedRescue(request)
            setSelectedPoint(null)
            setSelectedListItem(request._id || request.id)

            // Đóng sidebar trên mobile khi click vào item
            if (isMobile) {
                setSidebarOpen(false)
            }
        } else {
            message.warning('Không có tọa độ GPS hợp lệ cho điểm này')
        }
    }, [isMobile])

    // Copy số điện thoại
    const copyPhone = useCallback((phone) => {
        if (phone) {
            navigator.clipboard.writeText(phone)
            message.success(`Đã copy số điện thoại: ${phone}`)
        }
    }, [])

    // Xem trên bản đồ (điều hướng map đến vị trí)
    const viewOnMap = useCallback((request) => {
        if (request.coords && request.coords[0] && request.coords[1]) {
            setViewState(prev => ({
                ...prev,
                longitude: request.coords[0],
                latitude: request.coords[1],
                zoom: 14
            }))
            setSelectedRescue(request)
            setSelectedPoint(null)
            setSelectedListItem(request._id || request.id)

            // Đóng sidebar trên mobile
            if (isMobile) {
                setSidebarOpen(false)
            }
        } else {
            message.warning('Không có tọa độ GPS cho điểm này')
        }
    }, [isMobile])

    // Handle item click (ngăn chặn click khi click vào buttons/links)
    const handleItemClick = useCallback((item, e) => {
        // Ngăn chặn click khi click vào buttons hoặc links
        if (e.target.closest('button') || e.target.closest('a')) {
            return
        }
        // Điều hướng đến bản đồ nếu có tọa độ
        if (item.coords && item.coords[0] && item.coords[1]) {
            viewOnMap(item)
        }
    }, [viewOnMap])

    // Tạo Google Maps link
    const getGoogleMapsLink = useCallback((coords) => {
        if (!coords || !coords[0] || !coords[1]) return null
        return `https://www.google.com/maps?q=${coords[1]},${coords[0]}`
    }, [])

    // Tạo map thumbnail URL (dùng Google Static Maps)
    const getMapThumbnailUrl = useCallback((coords) => {
        if (!coords || !coords[0] || !coords[1]) return null
        const lat = coords[1]
        const lng = coords[0]
        return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=14&size=200x120&markers=color:red|${lat},${lng}&key=AIzaSyDummyKey`
    }, [])

    // Filter rescue requests theo search và filter - Tối ưu cho mobile
    const filteredRescueRequests = useMemo(() => {
        let filtered = rescueRequests.filter(req => {
            // Filter theo activeFilter
            if (activeFilter === 'rescue') {
                // Tab "Cần cứu" → hiển thị TẤT CẢ rescue requests (cầu cứu)
                return true
            }
            if (activeFilter === 'safe') {
                // Tab "Đội cứu" → KHÔNG hiển thị rescue requests
                return false
            }
            // activeFilter === 'all' → hiển thị tất cả
            return true
        })

        // Filter theo search text (dùng debounced để giảm re-render)
        // Tìm kiếm trong TẤT CẢ các trường quan trọng và hỗ trợ tìm từng từ
        if (debouncedSearchText) {
            const searchLower = debouncedSearchText.toLowerCase().trim()
            // Split search text thành các từ để tìm chính xác hơn
            const searchWords = searchLower.split(/\s+/).filter(word => word.length > 0)

            filtered = filtered.filter(req => {
                // Tạo một string chứa tất cả thông tin để search
                const searchableText = [
                    req.location || '',
                    req.description || '',
                    req.people || '',
                    req.needs || '',
                    req.urgency || '',
                    req.status || '',
                    req.contact || '',
                    req.contactFull || '',
                    req.rawText || '',
                    req.assignedTo || '',
                    req.notes || ''
                ].join(' ').toLowerCase()

                // Nếu có nhiều từ, tìm tất cả các từ (AND logic)
                if (searchWords.length > 1) {
                    return searchWords.every(word => searchableText.includes(word))
                } else {
                    // Nếu chỉ có 1 từ, tìm như cũ
                    return searchableText.includes(searchLower)
                }
            })
        }

        return filtered
    }, [rescueRequests, debouncedSearchText, activeFilter])

    // Filter safe points cho sidebar khi activeFilter === 'safe'
    const filteredSafePoints = useMemo(() => {
        if (activeFilter !== 'safe') return []

        let filtered = safePoints

        // Filter theo search text
        if (debouncedSearchText) {
            const searchLower = debouncedSearchText.toLowerCase()
            filtered = filtered.filter(point => {
                return (
                    point.name?.toLowerCase().includes(searchLower) ||
                    point.address?.toLowerCase().includes(searchLower)
                )
            })
        }

        return filtered
    }, [safePoints, debouncedSearchText, activeFilter])

    // Dữ liệu hiển thị trong sidebar
    const sidebarItems = useMemo(() => {
        if (activeFilter === 'safe') {
            // Tab "Đội cứu" → hiển thị safe points (điểm trú ẩn / đội cứu hộ)
            return filteredSafePoints
                .filter(point => point && (point._id || point.id))
                .map(point => ({
                    id: point._id || point.id,
                    _id: point._id || point.id,
                    location: point.name || 'Không có tên',
                    description: point.description || point.address || '',
                    address: point.address || '',
                    contact: point.phone || null,
                    contactFull: point.phone || null,
                    rescueType: point.rescueType || null,
                    coords: (typeof point.lng === 'number' && typeof point.lat === 'number' &&
                        !isNaN(point.lng) && !isNaN(point.lat) &&
                        point.lng >= -180 && point.lng <= 180 && point.lat >= -90 && point.lat <= 90)
                        ? [point.lng, point.lat] : null,
                    urgency: point.type === 'Đội cứu hộ' ? 'ĐỘI CỨU HỘ' : 'ĐIỂM TRÚ ẨN',
                    people: point.capacity ? `Sức chứa: ${point.capacity} người` : (point.type === 'Đội cứu hộ' ? 'Đội cứu hộ' : 'Sức chứa không rõ'),
                    needs: point.type === 'Đội cứu hộ' ? (point.rescueType || 'Đội cứu hộ') : 'Điểm trú ẩn an toàn',
                    type: 'safe',
                    timestamp: point.createdAt || point.updatedAt || new Date(),
                    point: point // Lưu object gốc
                }))
        }
        if (activeFilter === 'thuydien') {
            // Tab "Hồ thủy điện" → hiển thị các hồ thủy điện
            const reservoirs = Object.keys(thuydienData).length > 0
                ? Object.values(thuydienData)
                : [
                    {
                        slug: 'song_ba_ha',
                        name: 'Sông Ba Hạ',
                        coordinates: { lat: 13.0230809, lng: 108.9037585 },
                        location: 'Sơn Hòa, Phú Yên, Việt Nam',
                        hasData: false
                    },
                    {
                        slug: 'song_hinh',
                        name: 'Sông Hinh',
                        coordinates: { lat: 12.926851, lng: 108.946318 },
                        location: 'Sông Hinh, Phú Yên, Việt Nam',
                        hasData: false
                    }
                ]
            return reservoirs
                .filter(reservoir => reservoir && reservoir.coordinates && reservoir.coordinates.lat && reservoir.coordinates.lng)
                .map(reservoir => ({
                    id: reservoir.slug,
                    _id: reservoir.slug,
                    location: reservoir.name,
                    description: reservoir.location || '',
                    address: reservoir.location || '',
                    coords: [reservoir.coordinates.lng, reservoir.coordinates.lat],
                    type: 'thuydien',
                    timestamp: reservoir.lastUpdated || reservoir.data?.Time || new Date(),
                    reservoir: reservoir // Lưu object gốc
                }))
        }
        if (activeFilter === 'waterlevel') {
            // Tab "Trạm mực nước" → hiển thị các trạm mực nước
            return waterLevelStations
                .filter(station => station && station.coordinates && station.coordinates.length >= 2)
                .map(station => ({
                    id: station.stationCode,
                    _id: station.stationCode,
                    location: station.stationName || `Trạm ${station.stationCode}`,
                    description: station.data ? `Mực nước: ${station.data.waterLevel || 'N/A'}m` : 'Chưa có dữ liệu',
                    address: '',
                    coords: station.coordinates, // [lng, lat]
                    type: 'waterlevel',
                    timestamp: station.data?.timestamp || new Date(),
                    station: station // Lưu object gốc
                }))
        }
        // Tab "Cần cứu" hoặc "Tất cả" → hiển thị rescue requests (cầu cứu)
        return filteredRescueRequests
    }, [activeFilter, filteredRescueRequests, filteredSafePoints, thuydienData, waterLevelStations])

    // Tính số lượng cho filter buttons
    const filterCounts = useMemo(() => {
        const total = rescueRequests.length
        // Tab "Cần cứu" hiển thị TẤT CẢ rescue requests, không chỉ urgency khẩn cấp
        const rescue = rescueRequests.length
        const safe = safePoints.length
        const thuydien = Object.keys(thuydienData).length > 0 ? Object.keys(thuydienData).length : 2 // Fallback: 2 hồ thủy điện
        const waterlevel = waterLevelStations.length
        // Flood areas đã bị loại bỏ
        return { total, rescue, safe, thuydien, waterlevel }
    }, [rescueRequests, safePoints, thuydienData, waterLevelStations])

    // Clustering cho rescue requests - Tối ưu cho mobile
    const clusterRef = useRef(null)
    const pointsHashRef = useRef('') // Lưu hash của points để tránh reload không cần thiết

    const clusters = useMemo(() => {
        // Chỉ cluster khi filter = all hoặc rescue
        if (activeFilter !== 'all' && activeFilter !== 'rescue') {
            return []
        }

        // Lấy các rescue requests có tọa độ hợp lệ
        const points = filteredRescueRequests
            .filter(req => {
                if (!req || !req.coords || !Array.isArray(req.coords) || req.coords.length < 2) {
                    return false
                }
                const [lng, lat] = req.coords
                return typeof lng === 'number' && typeof lat === 'number' &&
                    !isNaN(lng) && !isNaN(lat) &&
                    lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
            })
            .map(req => ({
                type: 'Feature',
                properties: {
                    cluster: false,
                    requestId: req._id || req.id,
                    request: req
                },
                geometry: {
                    type: 'Point',
                    coordinates: [req.coords[0], req.coords[1]] // [lng, lat]
                }
            }))

        if (points.length === 0) {
            // Reset hash khi không có points
            pointsHashRef.current = ''
            return []
        }

        // Khởi tạo supercluster nếu chưa có - Tối ưu cho mobile
        if (!clusterRef.current) {
            clusterRef.current = new Supercluster({
                radius: 60, // Tối ưu: 60px - cân bằng giữa cluster và hiển thị chi tiết
                maxZoom: 16, // Cluster đến zoom 16, sau đó hiển thị từng điểm
                minZoom: 0,
                minPoints: 2, // Tối thiểu 2 điểm để tạo cluster
                extent: 512, // Tile extent (mặc định)
                nodeSize: 64 // Kích thước node trong tree (tối ưu cho performance)
            })
        }

        // Tạo hash đơn giản và hiệu quả hơn - chỉ dùng length và checksum
        const newHash = `${points.length}-${points.slice(0, 10).map(p =>
            `${p.properties.requestId}`
        ).join(',')}`

        // Chỉ reload khi points thực sự thay đổi
        if (pointsHashRef.current !== newHash) {
            clusterRef.current.load(points)
            pointsHashRef.current = newHash
        }

        // Tính toán bounds dựa trên zoom level và viewport
        // Sử dụng công thức chính xác cho Web Mercator projection
        const zoom = Math.floor(viewState.zoom)

        // Tính toán độ rộng viewport theo độ (longitude)
        // Ở zoom level z, 1 tile = 360 / 2^z degrees
        // Với buffer 1.5x để load thêm clusters ngoài viewport
        const lngRange = (360 / Math.pow(2, zoom)) * 1.5

        // Tính toán độ cao viewport theo độ (latitude)
        // Latitude range phụ thuộc vào zoom và vị trí, nhưng có thể ước tính
        const latRange = (180 / Math.pow(2, zoom)) * 1.5

        const bounds = [
            viewState.longitude - lngRange / 2, // West
            viewState.latitude - latRange / 2,  // South
            viewState.longitude + lngRange / 2, // East
            viewState.latitude + latRange / 2   // North
        ]

        return clusterRef.current.getClusters(bounds, zoom)
    }, [filteredRescueRequests, viewState.longitude, viewState.latitude, viewState.zoom, activeFilter, isMobile])

    // Format thời gian
    const formatTime = (timestamp) => {
        if (!timestamp) return 'Không rõ thời gian'

        let date
        // Handle different timestamp formats
        if (timestamp instanceof Date) {
            date = timestamp
        } else if (typeof timestamp === 'string') {
            // ISO string hoặc date string
            date = new Date(timestamp)
        } else if (typeof timestamp === 'number') {
            // Nếu là số, kiểm tra xem là milliseconds hay seconds
            // Nếu < 1e12 thì là seconds, ngược lại là milliseconds
            date = timestamp < 1e12 ? new Date(timestamp * 1000) : new Date(timestamp)
        } else {
            return 'Không rõ thời gian'
        }

        // Validate date
        if (isNaN(date.getTime())) {
            return 'Không rõ thời gian'
        }

        const now = new Date()
        const diff = Math.floor((now - date) / 1000)

        if (diff < 0) return 'Vừa xong' // Nếu thời gian trong tương lai
        if (diff < 60) return 'Vừa xong'
        if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
        if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
        return `${Math.floor(diff / 86400)} ngày trước`
    }


    // Parse tọa độ từ Google Maps URL
    const parseGoogleMapsCoords = (url) => {
        if (!url || typeof url !== 'string') return null

        try {
            // Format 1: https://www.google.com/maps?q=lat,lng
            let match = url.match(/[?&]q=([^&]+)/)
            if (match) {
                const coords = match[1].split(',')
                if (coords.length >= 2) {
                    const lat = parseFloat(coords[0].trim())
                    const lng = parseFloat(coords[1].trim())
                    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                        return [lng, lat] // Trả về [longitude, latitude] theo format của hệ thống
                    }
                }
            }

            // Format 2: https://www.google.com/maps/@lat,lng,zoom
            match = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
            if (match) {
                const lat = parseFloat(match[1])
                const lng = parseFloat(match[2])
                if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    return [lng, lat]
                }
            }

            // Format 3: https://maps.google.com/?q=lat,lng
            match = url.match(/[?&]q=([^&]+)/)
            if (match) {
                const coords = match[1].split(',')
                if (coords.length >= 2) {
                    const lat = parseFloat(coords[0].trim())
                    const lng = parseFloat(coords[1].trim())
                    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                        return [lng, lat]
                    }
                }
            }

            // Format 4: https://www.google.com/maps/place/.../@lat,lng,zoom
            match = url.match(/\/place\/[^@]+@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
            if (match) {
                const lat = parseFloat(match[1])
                const lng = parseFloat(match[2])
                if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    return [lng, lat]
                }
            }

            return null
        } catch (error) {
            console.error('Lỗi parse Google Maps URL:', error)
            return null
        }
    }

    // Xử lý khi Google Maps link thay đổi
    const handleGoogleMapsLinkChange = (e) => {
        const url = e.target.value.trim()
        setGoogleMapsLink(url)

        if (url) {
            const coords = parseGoogleMapsCoords(url)
            if (coords) {
                const [lng, lat] = coords
                setClickedCoords({ lat, lng })
                message.success(`✅ Đã tìm thấy tọa độ: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
            } else {
                setClickedCoords(null)
            }
        } else {
            setClickedCoords(null)
        }
    }

    // Xử lý edit tọa độ cho rescue request
    const handleEditCoords = (request) => {
        setEditingRequest(request)
        setClickedCoords(null) // Reset clicked coords khi mở modal
        setGoogleMapsLink('') // Reset Google Maps link
        setUpdateError(null) // Reset error
        setIsUpdating(false) // Reset loading state
    }

    // Xử lý click trên map để chọn tọa độ (chỉ dùng khi đang edit hoặc quick rescue)
    const handleMapClick = useCallback((event) => {
        if (editingRequest) {
            const { lng, lat } = event.lngLat
            setClickedCoords({ lat, lng })
            message.info(`Đã chọn tọa độ: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
        }
    }, [editingRequest])

    // Throttle map move để tối ưu hiệu năng trên mobile
    const moveTimeoutRef = useRef(null)
    const handleMapMove = useCallback((evt) => {
        // Clear timeout cũ
        if (moveTimeoutRef.current) {
            clearTimeout(moveTimeoutRef.current)
        }

        // Update ngay lập tức để map mượt mà
        setViewState(evt.viewState)

        // Throttle clustering update (chỉ update clusters sau khi dừng di chuyển 150ms)
        moveTimeoutRef.current = setTimeout(() => {
            // Force re-render clusters bằng cách trigger dependency
            // Clusters sẽ tự động update qua useMemo
        }, 150)
    }, [])

    // Cập nhật tọa độ cho rescue request
    const handleUpdateCoords = async (coords) => {
        if (!editingRequest) {
            const errorMsg = 'Không tìm thấy yêu cầu cần cập nhật'
            setUpdateError(errorMsg)
            message.error(errorMsg)
            return
        }

        const requestId = editingRequest._id || editingRequest.id
        if (!requestId) {
            const errorMsg = 'ID yêu cầu không hợp lệ'
            setUpdateError(errorMsg)
            message.error(errorMsg)
            return
        }

        // Validate coords
        if (!Array.isArray(coords) || coords.length !== 2) {
            const errorMsg = 'Tọa độ không hợp lệ. Vui lòng thử lại.'
            setUpdateError(errorMsg)
            message.error(errorMsg)
            return
        }

        const [lng, lat] = coords
        if (typeof lng !== 'number' || typeof lat !== 'number' ||
            isNaN(lng) || isNaN(lat) ||
            lng < -180 || lng > 180 || lat < -90 || lat > 90) {
            const errorMsg = 'Tọa độ không hợp lệ. Vui lòng kiểm tra lại.'
            setUpdateError(errorMsg)
            message.error(errorMsg)
            return
        }

        setIsUpdating(true)
        setUpdateError(null)

        try {
            // console.log('📤 Đang cập nhật tọa độ:', { requestId, coords })
            const response = await axios.put(
                `${API_URL}/api/rescue-requests/${requestId}/coords`,
                { coords }
            )

            if (response.data && response.data.success) {
                message.success('Đã cập nhật tọa độ thành công!')
                // Refresh danh sách
                try {
                    const rescueRes = await axios.get(`${API_URL}/api/rescue-requests`)
                    if (rescueRes.data && rescueRes.data.success) {
                        setRescueRequests(rescueRes.data.data)
                    }
                } catch (refreshError) {
                    console.error('Lỗi refresh danh sách:', refreshError)
                }
                setEditingRequest(null)
                setClickedCoords(null)
                setGoogleMapsLink('')
                setUpdateError(null)
            } else {
                const errorMsg = response.data?.message || 'Cập nhật tọa độ thất bại'
                setUpdateError(errorMsg)
                message.error(errorMsg)
            }
        } catch (error) {
            console.error('Lỗi cập nhật tọa độ:', error)
            const errorMessage = error.response?.data?.message ||
                error.message ||
                'Lỗi khi cập nhật tọa độ. Vui lòng thử lại.'
            setUpdateError(errorMessage)
            message.error(errorMessage)
        } finally {
            setIsUpdating(false)
        }
    }

    // Handler lấy GPS location cho form thêm đội cứu hộ
    const handleGetCurrentLocationForRescueTeam = () => {
        if (navigator.geolocation) {
            setAddRescueTeamLoading(true)
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const newLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    }
                    setAddRescueTeamLocation(newLocation)
                    addRescueTeamForm.setFieldsValue({
                        lat: newLocation.lat,
                        lng: newLocation.lng
                    })
                    message.success('Đã lấy vị trí GPS thành công!')
                    setAddRescueTeamLoading(false)
                },
                (error) => {
                    console.error('Lỗi GPS:', error)
                    message.warning('Không thể lấy vị trí GPS. Vui lòng chọn trên bản đồ.')
                    setAddRescueTeamLoading(false)
                }
            )
        } else {
            message.warning('Trình duyệt không hỗ trợ GPS. Vui lòng chọn trên bản đồ.')
        }
    }

    // Handler submit form thêm đội cứu hộ
    const handleAddRescueTeamSubmit = async (values) => {
        // console.log('🔵 handleAddRescueTeamSubmit called', values)
        // console.log('🔵 addRescueTeamLocation:', addRescueTeamLocation)
        try {
            setAddRescueTeamLoading(true)

            // Validate location
            if (!addRescueTeamLocation || !addRescueTeamLocation.lat || !addRescueTeamLocation.lng) {
                // console.log('❌ Location validation failed')
                message.error('Vui lòng chọn vị trí trên bản đồ hoặc dùng GPS tự động!')
                setAddRescueTeamLoading(false)
                return
            }

            // Validate description
            if (!values.description || values.description.trim().length === 0) {
                // console.log('❌ Description validation failed')
                message.error('Vui lòng nhập thông tin về đội cứu hộ!')
                setAddRescueTeamLoading(false)
                return
            }

            // console.log('✅ Validation passed, creating safe point data...')

            // console.log('Validation passed, creating safe point data...')

            // Tạo safe point data
            const safePointData = {
                name: values.name || 'Đội cứu hộ',
                lat: addRescueTeamLocation.lat,
                lng: addRescueTeamLocation.lng,
                address: values.address || `${addRescueTeamLocation.lat.toFixed(6)}, ${addRescueTeamLocation.lng.toFixed(6)}`,
                phone: values.phone || null, // Sẽ được parse từ description nếu không có
                description: values.description.trim(),
                type: 'Đội cứu hộ',
                rescueType: values.rescueType || 'Khác',
                status: 'Hoạt động',
                capacity: 0
            }

            // Gửi request
            const response = await axios.post(`${API_URL}/api/safe-points`, safePointData)

            if (response.data && response.data.success) {
                message.success('Đã thêm thông tin đội cứu hộ thành công!')

                // Refresh danh sách safe points
                try {
                    const safeRes = await axios.get(`${API_URL}/api/safe-points`)
                    if (safeRes.data && safeRes.data.success && Array.isArray(safeRes.data.data)) {
                        setSafePoints(safeRes.data.data)
                    }
                } catch (refreshError) {
                    console.error('Lỗi refresh danh sách:', refreshError)
                }

                // Đóng modal và reset form
                setAddRescueTeamModalVisible(false)
                addRescueTeamForm.resetFields()
                setAddRescueTeamLocation(null)
            } else {
                message.error(response.data?.message || 'Thêm thông tin đội cứu hộ thất bại')
            }
        } catch (error) {
            console.error('Lỗi thêm đội cứu hộ:', error)
            const errorMessage = error.response?.data?.message ||
                error.message ||
                'Lỗi khi thêm thông tin đội cứu hộ. Vui lòng thử lại.'
            message.error(errorMessage)
        } finally {
            setAddRescueTeamLoading(false)
        }
    }

    // Handler cho quick rescue form
    const handleQuickRescueSubmit = async (values) => {
        try {
            setQuickRescueLoading(true)

            // Validate description
            if (!values.description || values.description.trim().length === 0) {
                message.error('Vui lòng mô tả tình huống!')
                setQuickRescueLoading(false)
                return
            }

            // Convert ảnh sang base64 nếu có
            let imageBase64 = null
            if (quickRescueImageFile) {
                try {
                    imageBase64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onloadend = () => resolve(reader.result)
                        reader.onerror = (error) => reject(error)
                        reader.readAsDataURL(quickRescueImageFile)
                    })
                } catch (imgError) {
                    console.error('Lỗi convert ảnh:', imgError)
                    message.warning('Không thể xử lý ảnh, sẽ gửi báo cáo không có ảnh')
                }
            }

            const reportData = {
                location: quickRescueLocation || { lat: null, lng: null },
                description: values.description || '',
                imageBase64: imageBase64,
                phone: values.phone || '',
                name: values.name || ''
            }

            const response = await axios.post(`${API_URL}/api/report`, reportData, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (response.data && response.data.success) {
                message.success('Đã gửi thành công báo cáo khẩn cấp!')
                quickRescueForm.resetFields()
                setQuickRescueLocation(null)
                setQuickRescueImageFile(null)
                setQuickRescueModalVisible(false)

                // Refresh danh sách cầu cứu
                try {
                    const rescueRes = await axios.get(`${API_URL}/api/rescue-requests`)
                    if (rescueRes.data && rescueRes.data.success) {
                        setRescueRequests(rescueRes.data.data)
                    }
                } catch (refreshError) {
                    console.error('Lỗi refresh danh sách:', refreshError)
                }
            } else {
                message.error(response.data?.message || 'Gửi yêu cầu thất bại')
            }
        } catch (error) {
            console.error('Lỗi gửi yêu cầu:', error)
            if (error.response) {
                message.error(`Lỗi: ${error.response.data?.message || error.message}`)
            } else if (error.request) {
                message.error('Không thể kết nối server. Vui lòng kiểm tra kết nối mạng!')
            } else {
                message.error(`Lỗi: ${error.message}`)
            }
        } finally {
            setQuickRescueLoading(false)
        }
    }

    // Handler mở modal quick rescue
    const openQuickRescueModal = () => {
        setQuickRescueModalVisible(true)
        // Lấy vị trí hiện tại từ map center nếu có
        if (viewState.latitude && viewState.longitude) {
            setQuickRescueLocation({
                lat: viewState.latitude,
                lng: viewState.longitude
            })
        }
    }

    // Handler đóng modal quick rescue
    const closeQuickRescueModal = () => {
        setQuickRescueModalVisible(false)
        quickRescueForm.resetFields()
        setQuickRescueLocation(null)
        setQuickRescueImageFile(null)
    }

    // Handler chọn vị trí từ GPS
    const handleGetCurrentLocationForQuickRescue = () => {
        if (navigator.geolocation) {
            setQuickRescueLoading(true)
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const newLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    }
                    setQuickRescueLocation(newLocation)
                    // Cập nhật map view để hiển thị vị trí
                    setViewState(prev => ({
                        ...prev,
                        longitude: newLocation.lng,
                        latitude: newLocation.lat,
                        zoom: 15
                    }))
                    message.success('Đã lấy vị trí GPS thành công!')
                    setQuickRescueLoading(false)
                },
                (error) => {
                    console.error('Lỗi GPS:', error)
                    message.warning('Không thể lấy vị trí GPS. Vui lòng chọn trên bản đồ.')
                    setQuickRescueLoading(false)
                }
            )
        } else {
            message.warning('Trình duyệt không hỗ trợ GPS. Vui lòng chọn trên bản đồ.')
        }
    }

    // Handler upload ảnh cho quick rescue
    const handleQuickRescueImageChange = (info) => {
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
            setQuickRescueImageFile(file)
            message.success(`Đã chọn ảnh: ${file.name}`)
        }
    }

    // Handler cho location picker modal
    const handleLocationPickerMapClick = (event) => {
        const { lng, lat } = event.lngLat
        setLocationPickerSelected({ lat, lng })
    }

    const handleConfirmLocation = () => {
        if (locationPickerSelected) {
            // Cập nhật location dựa trên context
            if (locationPickerContext === 'addRescueTeam') {
                setAddRescueTeamLocation(locationPickerSelected)
                addRescueTeamForm.setFieldsValue({
                    lat: locationPickerSelected.lat,
                    lng: locationPickerSelected.lng
                })
            } else {
                // Default: quick rescue
                setQuickRescueLocation(locationPickerSelected)
            }
            setLocationPickerModalVisible(false)
            setLocationPickerContext(null)
            message.success(`Đã chọn vị trí: ${locationPickerSelected.lat.toFixed(6)}, ${locationPickerSelected.lng.toFixed(6)}`)
        } else {
            message.warning('Vui lòng chọn vị trí trên bản đồ')
        }
    }

    const handleCancelLocationPicker = () => {
        setLocationPickerModalVisible(false)
        setLocationPickerSelected(null)
        setLocationPickerContext(null)
    }

    if (!MAPBOX_TOKEN) {
        return (
            <Layout className="map-layout">
                <Header className="emergency-header">
                    <Button
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate('/')}
                        style={{ marginRight: 16 }}
                    >
                        Về trang chủ
                    </Button>
                    <Title level={4} style={{ color: '#fff', margin: 0 }}>
                        Bản Đồ Cứu Hộ
                    </Title>
                </Header>

            </Layout>
        )
    }

    return (
        <Layout className="map-layout">
            <Header className="emergency-header">
                <div className="header-content">
                    {/* Left: Logo & Navigation */}
                    <Space>
                        {isMobile ? (
                            <Button
                                type="text"
                                icon={<MenuOutlined />}
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                className="header-button"
                            />
                        ) : null}
                        <Title level={4} className="header-title">
                            <Button type="text" icon={<HomeOutlined />} onClick={() => navigate('/')}><span>🚨 FloodSoS</span></Button>
                        </Title>
                        {!isMobile && (
                            <div className="header-nav">
                                <Button
                                    type="text"
                                    icon={<AppstoreOutlined />}
                                    className="header-nav-button active"
                                    onClick={() => navigate('/report')}
                                >
                                    Gửi báo cáo
                                </Button>
                                {/* <Button
                                    type="text"
                                    icon={<FileTextOutlined />}
                                    className="header-nav-button"
                                    onClick={() => navigate('/report')}
                                >
                                    Báo cáo
                                </Button> */}
                            </div>
                        )}
                    </Space>

                    {/* Right: Location/Report Button */}
                    <Button
                        type="default"
                        icon={<EnvironmentOutlined />}
                        onClick={() => navigate('/report')}
                        className="header-location-button"
                    >
                        <span>Báo cáo</span>
                    </Button>
                </div>
            </Header>

            <Layout style={{ height: 'calc(100vh - 64px)' }}>
                {/* Sidebar bên trái */}
                <Sider
                    width={400}
                    collapsed={sidebarCollapsed}
                    collapsible={false}
                    trigger={null}
                    style={{
                        background: '#fff',
                        overflow: 'auto',
                        borderRight: '1px solid #f0f0f0'
                    }}
                    className={`map-sidebar ${sidebarOpen ? 'open' : ''}`}
                >
                    {/* Sidebar Header với nút back - chỉ hiển thị trên mobile */}
                    {isMobile && (
                        <div style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid #f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#fff',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10
                        }}>
                            <Title level={5} style={{ margin: 0, flex: 1 }}>
                                Danh sách
                            </Title>
                            <Button
                                type="text"
                                icon={<CloseOutlined />}
                                onClick={() => setSidebarOpen(false)}
                                style={{
                                    padding: '4px 8px',
                                    minWidth: 'auto',
                                    fontSize: '18px',
                                    marginRight: '12px'
                                }}
                                title="Đóng"
                            />
                        </div>
                    )}

                    {/* Tabs/Filters */}
                    <div className="map-tabs">
                        <button
                            className={`map-tab-button ${activeFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('all')}
                        >
                            <span>📋</span>
                            <span>Tất cả ({filterCounts.total + filterCounts.safe})</span>
                        </button>
                        <button
                            className={`map-tab-button rescue ${activeFilter === 'rescue' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('rescue')}
                        >
                            <span>🆘</span>
                            <span>Cần cứu ({filterCounts.rescue})</span>
                        </button>
                        <button
                            className={`map-tab-button safe ${activeFilter === 'safe' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('safe')}
                        >
                            <span>🚁</span>
                            <span>Đội cứu ({filterCounts.safe})</span>
                        </button>
                        <button
                            className={`map-tab-button thuydien ${activeFilter === 'thuydien' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('thuydien')}
                        >
                            <span>⚡</span>
                            <span>Hồ thủy điện ({filterCounts.thuydien})</span>
                        </button>
                        <button
                            className={`map-tab-button waterlevel ${activeFilter === 'waterlevel' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('waterlevel')}
                        >
                            <span>💧</span>
                            <span>Trạm mực nước ({filterCounts.waterlevel})</span>
                        </button>
                    </div>

                    <div className="sidebar-content">
                        {/* Search bar */}
                        <div className="sidebar-search">
                            <Search
                                placeholder="Tìm kiếm..."
                                allowClear
                                enterButton={<SearchOutlined />}
                                size="large"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                            />
                        </div>

                        {/* List items */}
                        <div style={{ marginBottom: '16px' }}>
                            <Text strong style={{ fontSize: '14px', color: '#666' }}>
                                {activeFilter === 'rescue' ? 'Cầu cứu' :
                                    activeFilter === 'safe' ? 'Đội cứu hộ' :
                                        activeFilter === 'thuydien' ? 'Hồ thủy điện' :
                                            activeFilter === 'waterlevel' ? 'Trạm mực nước' : 'Tất cả'} ({sidebarItems.length})
                            </Text>
                        </div>

                        {sidebarItems.length === 0 ? (
                            <Empty description={
                                activeFilter === 'safe' ? 'Trống' :
                                    activeFilter === 'thuydien' ? 'Không có hồ thủy điện nào' :
                                        activeFilter === 'waterlevel' ? 'Không có trạm mực nước nào' :
                                            'Không có cầu cứu nào'
                            } style={{ marginTop: '40px' }} />
                        ) : (
                            <List
                                dataSource={sidebarItems}
                                itemLayout="vertical"
                                style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}
                                renderItem={(item) => {
                                    // Thủy điện items
                                    if (item.type === 'thuydien' && item.reservoir) {
                                        return (
                                            <List.Item
                                                className={`rescue-list-item ${selectedListItem === (item._id || item.id) ? 'selected' : ''}`}
                                                onClick={() => {
                                                    if (item.coords && item.coords[0] && item.coords[1]) {
                                                        setViewState(prev => ({
                                                            ...prev,
                                                            longitude: item.coords[0],
                                                            latitude: item.coords[1],
                                                            zoom: Math.max(prev.zoom, 14)
                                                        }))
                                                        setSelectedListItem(item._id || item.id)
                                                    }
                                                    handleThuydienClick(item.reservoir)
                                                    if (isMobile) {
                                                        setSidebarOpen(false)
                                                    }
                                                }}
                                                style={{
                                                    cursor: 'pointer',
                                                    padding: '12px',
                                                    marginBottom: '8px',
                                                    borderRadius: '8px',
                                                    border: selectedListItem === (item._id || item.id) ? '2px solid #1890ff' : '1px solid #f0f0f0',
                                                    background: selectedListItem === (item._id || item.id) ? '#f0f7ff' : '#fff',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {item.coords && item.coords[0] && item.coords[1] && (
                                                    <div style={{ marginBottom: '8px', borderRadius: '6px', overflow: 'hidden' }}>
                                                        <img
                                                            src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+1890ff(${item.coords[0]},${item.coords[1]})/${item.coords[0]},${item.coords[1]},13,0/200x120?access_token=${MAPBOX_TOKEN}`}
                                                            alt="Map thumbnail"
                                                            style={{ width: '100%', height: '120px', objectFit: 'cover' }}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none'
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                                <Space style={{ marginBottom: '8px' }} wrap>
                                                    <Tag color="blue" icon={<span>⚡</span>}>
                                                        Hồ thủy điện
                                                    </Tag>
                                                    {item.timestamp && (
                                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                                            {formatTime(item.timestamp)}
                                                        </Text>
                                                    )}
                                                </Space>
                                                <Text strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                                    {item.location}
                                                </Text>
                                                {item.description && (
                                                    <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
                                                        📍 {item.description}
                                                    </Text>
                                                )}
                                                {item.reservoir.hasData && item.reservoir.data && (
                                                    <div style={{ marginTop: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                                                        <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>
                                                            Mực nước hồ: {item.reservoir.data.Htl || 'N/A'}m
                                                        </Text>
                                                        {item.reservoir.data.Qve && (
                                                            <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>
                                                                Lưu lượng vào: {item.reservoir.data.Qve} m³/s
                                                            </Text>
                                                        )}
                                                    </div>
                                                )}
                                                {item.coords && item.coords[0] && item.coords[1] && (
                                                    <Button
                                                        size="small"
                                                        type="link"
                                                        icon={<GlobalOutlined />}
                                                        href={getGoogleMapsLink(item.coords)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ padding: 0, fontSize: '12px', marginTop: '8px' }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        Google Map
                                                    </Button>
                                                )}
                                            </List.Item>
                                        )
                                    }
                                    // Trạm mực nước items
                                    if (item.type === 'waterlevel' && item.station) {
                                        return (
                                            <List.Item
                                                className={`rescue-list-item ${selectedListItem === (item._id || item.id) ? 'selected' : ''}`}
                                                onClick={() => {
                                                    if (item.coords && item.coords[0] && item.coords[1]) {
                                                        setViewState(prev => ({
                                                            ...prev,
                                                            longitude: item.coords[0],
                                                            latitude: item.coords[1],
                                                            zoom: Math.max(prev.zoom, 14)
                                                        }))
                                                        setSelectedListItem(item._id || item.id)
                                                    }
                                                    handleWaterStationClick(item.station)
                                                    if (isMobile) {
                                                        setSidebarOpen(false)
                                                    }
                                                }}
                                                style={{
                                                    cursor: 'pointer',
                                                    padding: '12px',
                                                    marginBottom: '8px',
                                                    borderRadius: '8px',
                                                    border: selectedListItem === (item._id || item.id) ? '2px solid #52c41a' : '1px solid #f0f0f0',
                                                    background: selectedListItem === (item._id || item.id) ? '#f6ffed' : '#fff',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {item.coords && item.coords[0] && item.coords[1] && (
                                                    <div style={{ marginBottom: '8px', borderRadius: '6px', overflow: 'hidden' }}>
                                                        <img
                                                            src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+52c41a(${item.coords[0]},${item.coords[1]})/${item.coords[0]},${item.coords[1]},13,0/200x120?access_token=${MAPBOX_TOKEN}`}
                                                            alt="Map thumbnail"
                                                            style={{ width: '100%', height: '120px', objectFit: 'cover' }}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none'
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                                <Space style={{ marginBottom: '8px' }} wrap>
                                                    <Tag color="green" icon={<span>💧</span>}>
                                                        Trạm mực nước
                                                    </Tag>
                                                    {item.timestamp && (
                                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                                            {formatTime(item.timestamp)}
                                                        </Text>
                                                    )}
                                                </Space>
                                                <Text strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                                    {item.location}
                                                </Text>
                                                {item.description && (
                                                    <Text style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                                                        {item.description}
                                                    </Text>
                                                )}
                                                {item.station.data && (
                                                    <div style={{ marginTop: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                                                        <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>
                                                            Mã trạm: {item.station.stationCode}
                                                        </Text>
                                                        {item.station.data.waterLevel && (
                                                            <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>
                                                                Mực nước: {item.station.data.waterLevel}m
                                                            </Text>
                                                        )}
                                                    </div>
                                                )}
                                                {item.coords && item.coords[0] && item.coords[1] && (
                                                    <Button
                                                        size="small"
                                                        type="link"
                                                        icon={<GlobalOutlined />}
                                                        href={getGoogleMapsLink(item.coords)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ padding: 0, fontSize: '12px', marginTop: '8px' }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        Google Map
                                                    </Button>
                                                )}
                                            </List.Item>
                                        )
                                    }
                                    // Safe points: Giữ nguyên cách hiển thị cũ
                                    if (item.type === 'safe' && item.point) {
                                        return (
                                            <List.Item
                                                className={`rescue-list-item ${selectedListItem === (item._id || item.id) ? 'selected' : ''}`}
                                                onClick={() => {
                                                    // Điều hướng map đến vị trí của safe point
                                                    if (item.coords && item.coords[0] && item.coords[1]) {
                                                        setViewState(prev => ({
                                                            ...prev,
                                                            longitude: item.coords[0],
                                                            latitude: item.coords[1],
                                                            zoom: Math.max(prev.zoom, 14)
                                                        }))
                                                        setSelectedListItem(item._id || item.id)
                                                    }
                                                    // Hiển thị popup
                                                    handleMarkerClick(item.point, 'safe')
                                                    // Đóng sidebar trên mobile
                                                    if (isMobile) {
                                                        setSidebarOpen(false)
                                                    }
                                                }}
                                                style={{
                                                    cursor: 'pointer',
                                                    padding: '12px',
                                                    marginBottom: '8px',
                                                    borderRadius: '8px',
                                                    border: selectedListItem === (item._id || item.id) ? '2px solid #dc2626' : '1px solid #f0f0f0',
                                                    background: selectedListItem === (item._id || item.id) ? '#fff5f5' : '#fff',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {/* Map thumbnail */}
                                                {item.coords && item.coords[0] && item.coords[1] && (
                                                    <div style={{ marginBottom: '8px', borderRadius: '6px', overflow: 'hidden' }}>
                                                        <img
                                                            src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+dc2626(${item.coords[0]},${item.coords[1]})/${item.coords[0]},${item.coords[1]},13,0/200x120?access_token=${MAPBOX_TOKEN}`}
                                                            alt="Map thumbnail"
                                                            style={{ width: '100%', height: '120px', objectFit: 'cover' }}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none'
                                                            }}
                                                        />
                                                    </div>
                                                )}

                                                {/* Tag và thời gian */}
                                                <Space style={{ marginBottom: '8px' }} wrap>
                                                    <Tag
                                                        color={item.urgency === 'CỰC KỲ KHẨN CẤP' ? 'red' : item.urgency === 'ĐỘI CỨU HỘ' ? 'blue' : 'green'}
                                                        icon={item.urgency === 'CỰC KỲ KHẨN CẤP' ? <FireOutlined /> : null}
                                                    >
                                                        {item.urgency === 'CẦN CỨU TRỢ' ? 'KHẨN CẤP' : item.urgency}
                                                    </Tag>
                                                    {item.rescueType && (
                                                        <Tag color="cyan">{item.rescueType}</Tag>
                                                    )}
                                                    {item.timestamp && (
                                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                                            {formatTime(item.timestamp)}
                                                        </Text>
                                                    )}
                                                </Space>

                                                {/* Tên / Location */}
                                                <Text strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                                    {item.location}
                                                </Text>

                                                {/* Địa chỉ (nếu có) */}
                                                {item.address && item.address !== item.location && (
                                                    <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
                                                        📍 {item.address}
                                                    </Text>
                                                )}

                                                {/* Mô tả */}
                                                {item.description && (
                                                    <Text style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                                                        {item.description.substring(0, 150)}
                                                        {item.description.length > 150 && '...'}
                                                    </Text>
                                                )}

                                                {/* Links */}
                                                <Space size="small" wrap>
                                                    {item.coords && item.coords[0] && item.coords[1] ? (
                                                        <Button
                                                            size="small"
                                                            type="link"
                                                            icon={<GlobalOutlined />}
                                                            href={getGoogleMapsLink(item.coords)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ padding: 0, fontSize: '12px' }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            Google Map
                                                        </Button>
                                                    ) : null}
                                                    {(item.contactFull || item.contact) && (
                                                        <Button
                                                            size="small"
                                                            type="link"
                                                            icon={<PhoneOutlined />}
                                                            href={`tel:${(item.contactFull || item.contact).split(',')[0].replace(/\./g, '').trim()}`}
                                                            style={{ padding: 0, fontSize: '12px' }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {(item.contactFull || item.contact).split(',')[0].trim()}
                                                        </Button>
                                                    )}
                                                </Space>
                                            </List.Item>
                                        )
                                    }

                                    // Rescue requests: Dùng layout giống HomePage
                                    return (
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

                                                {/* Location - Chỉ hiển thị nếu không phải tọa độ thuần túy */}
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
                                                <Space size="middle" wrap>
                                                    {item.contactFull && (
                                                        <Button
                                                            size="small"
                                                            icon={<PhoneOutlined />}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                copyPhone(item.contactFull)
                                                            }}
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
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                copyPhone(item.contact)
                                                            }}
                                                            className="phone-button"
                                                        >
                                                            {item.contact}
                                                        </Button>
                                                    )}
                                                    {item.coords && item.coords[0] && item.coords[1] && (
                                                        <Button
                                                            size="small"
                                                            icon={<GlobalOutlined />}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                viewOnMap(item)
                                                            }}
                                                            className="map-link-button"
                                                        >
                                                            Xem trên bản đồ
                                                        </Button>
                                                    )}
                                                </Space>
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
                                                    onClick={(e) => e.stopPropagation()}
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
                                    )
                                }}
                            />
                        )}

                        {/* Nút thêm thông tin đội cứu hộ (chỉ hiển thị khi tab Đội cứu) */}
                        {activeFilter === 'safe' && (
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                block
                                size="large"
                                style={{ marginTop: '16px', height: '48px', background: '#1890ff', borderColor: '#1890ff' }}
                                onClick={() => {
                                    setAddRescueTeamModalVisible(true)
                                    addRescueTeamForm.resetFields()
                                    setAddRescueTeamLocation(null)
                                }}
                            >
                                Thêm thông tin đội cứu hộ
                            </Button>
                        )}

                        {/* Nút Gửi phản ánh (chỉ hiển thị khi không phải tab Đội cứu) */}
                        {activeFilter !== 'safe' && (
                            <Button
                                type="primary"
                                danger
                                icon={<SendOutlined />}
                                block
                                size="large"
                                style={{ marginTop: '16px', height: '48px' }}
                                onClick={() => navigate('/report')}
                            >
                                Gửi phản ánh
                            </Button>
                        )}
                    </div>
                </Sider>

                {/* Map bên phải */}
                <Content className="map-content">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '50px' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: 16 }}>Đang tải bản đồ...</div>
                        </div>
                    ) : (
                        <>
                            <Map
                                mapboxAccessToken={MAPBOX_TOKEN}
                                {...viewState}
                                onMove={handleMapMove}
                                onClick={handleMapClick}
                                style={{ width: '100%', height: 'calc(100vh - 64px)' }}
                                mapStyle="mapbox://styles/mapbox/streets-v12"
                                cursor={editingRequest ? "crosshair" : "default"}
                            >
                                {/* Marker khi click trên map (chỉ hiển thị khi đang edit) */}
                                {editingRequest && clickedCoords && (
                                    <Marker
                                        longitude={clickedCoords.lng}
                                        latitude={clickedCoords.lat}
                                        anchor="bottom"
                                    >
                                        <div style={{
                                            width: '30px',
                                            height: '30px',
                                            borderRadius: '50%',
                                            background: '#52c41a',
                                            border: '3px solid #fff',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#fff',
                                            fontSize: '16px',
                                            cursor: 'pointer'
                                        }}>
                                            📍
                                        </div>
                                    </Marker>
                                )}

                                {/* Marker khi chọn vị trí cho quick rescue form */}
                                {quickRescueLocation && (
                                    <Marker
                                        longitude={quickRescueLocation.lng}
                                        latitude={quickRescueLocation.lat}
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
                                            fontSize: '16px',
                                            cursor: 'pointer'
                                        }}>
                                            📍
                                        </div>
                                    </Marker>
                                )}
                                {/* Markers điểm trú ẩn - chỉ hiển thị khi filter = all hoặc safe */}
                                {(activeFilter === 'all' || activeFilter === 'safe') && safePoints
                                    .filter(point => point && typeof point.lng === 'number' && typeof point.lat === 'number' &&
                                        !isNaN(point.lng) && !isNaN(point.lat) &&
                                        point.lng >= -180 && point.lng <= 180 && point.lat >= -90 && point.lat <= 90)
                                    .map((point) => (
                                        <Marker
                                            key={`safe-${point._id || point.id}`}
                                            longitude={point.lng}
                                            latitude={point.lat}
                                            anchor="bottom"
                                            onClick={() => handleMarkerClick(point, 'safe')}
                                        >
                                            <div className="custom-marker safe-marker">
                                                <HomeOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
                                            </div>
                                        </Marker>
                                    ))}

                                {/* Flood areas markers đã bị loại bỏ - không còn hiển thị */}

                                {/* Water Level Station Markers - chỉ hiển thị khi filter = all hoặc waterlevel */}
                                {(activeFilter === 'all' || activeFilter === 'waterlevel') && waterLevelStations
                                    .filter(station => station.coordinates && station.coordinates.length >= 2)
                                    .map((station) => {
                                        const lng = parseFloat(station.coordinates[0])
                                        const lat = parseFloat(station.coordinates[1])
                                        if (isNaN(lng) || isNaN(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                                            return null
                                        }
                                        return (
                                            <Marker
                                                key={`water-${station.stationCode}`}
                                                longitude={lng}
                                                latitude={lat}
                                                anchor="bottom"
                                                onClick={() => handleWaterStationClick(station)}
                                            >
                                                <div className="custom-marker water-marker">
                                                    <span style={{ fontSize: '20px' }}>💧</span>
                                                </div>
                                            </Marker>
                                        )
                                    })}

                                {/* Thủy điện (Reservoir) Markers - chỉ hiển thị khi filter = all hoặc thuydien */}
                                {(activeFilter === 'all' || activeFilter === 'thuydien') && (() => {
                                    // Fallback: Nếu không có dữ liệu từ API, dùng tọa độ cố định
                                    const fallbackReservoirs = [
                                        {
                                            slug: 'song_ba_ha',
                                            name: 'Sông Ba Hạ',
                                            coordinates: { lat: 13.0230809, lng: 108.9037585 },
                                            location: 'Sơn Hòa, Phú Yên, Việt Nam',
                                            hasData: false
                                        },
                                        {
                                            slug: 'song_hinh',
                                            name: 'Sông Hinh',
                                            coordinates: { lat: 12.926851, lng: 108.946318 },
                                            location: 'Sông Hinh, Phú Yên, Việt Nam',
                                            hasData: false
                                        }
                                    ]

                                    const reservoirs = Object.keys(thuydienData).length > 0
                                        ? Object.values(thuydienData)
                                        : fallbackReservoirs

                                    // console.log('🔍 Thuỷ điện data để render:', thuydienData)
                                    // console.log('🔍 Số lượng reservoirs:', reservoirs.length)

                                    return reservoirs
                                        .filter(reservoir => {
                                            const hasCoords = reservoir && reservoir.coordinates && reservoir.coordinates.lat && reservoir.coordinates.lng
                                            if (!hasCoords) {
                                                console.warn('⚠️ Reservoir không có coordinates:', reservoir)
                                            }
                                            return hasCoords
                                        })
                                        .map((reservoir) => {
                                            const lng = parseFloat(reservoir.coordinates.lng)
                                            const lat = parseFloat(reservoir.coordinates.lat)
                                            if (isNaN(lng) || isNaN(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                                                console.warn('⚠️ Tọa độ không hợp lệ:', { lng, lat, reservoir })
                                                return null
                                            }
                                            return (
                                                <Marker
                                                    key={`thuydien-${reservoir.slug}`}
                                                    longitude={lng}
                                                    latitude={lat}
                                                    anchor="bottom"
                                                    onClick={() => handleThuydienClick(reservoir)}
                                                >
                                                    <div className="custom-marker thuydien-marker">
                                                        <span style={{ fontSize: '20px' }}>⚡</span>
                                                    </div>
                                                </Marker>
                                            )
                                        })
                                })()}

                                {/* Clustered markers cầu cứu từ người dân */}
                                {(activeFilter === 'all' || activeFilter === 'rescue') && clusters.map((cluster) => {
                                    const [longitude, latitude] = cluster.geometry.coordinates
                                    const { cluster: isCluster, point_count } = cluster.properties

                                    if (isCluster) {
                                        // Render cluster marker với số lượng - Đẹp hơn
                                        const size = point_count < 10 ? 40 : point_count < 50 ? 48 : point_count < 100 ? 56 : 64
                                        const fontSize = point_count < 10 ? 14 : point_count < 50 ? 16 : point_count < 100 ? 18 : 20
                                        return (
                                            <Marker
                                                key={`cluster-${cluster.id}`}
                                                longitude={longitude}
                                                latitude={latitude}
                                                anchor="center"
                                                onClick={() => handleClusterClick(cluster)}
                                            >
                                                <div
                                                    className="cluster-marker"
                                                    style={{
                                                        width: `${size}px`,
                                                        height: `${size}px`,
                                                        fontSize: `${fontSize}px`,
                                                    }}
                                                >
                                                    {point_count}
                                                </div>
                                            </Marker>
                                        )
                                    } else {
                                        // Render marker đơn lẻ
                                        const request = cluster.properties.request
                                        return (
                                            <Marker
                                                key={`rescue-${request._id || request.id}`}
                                                longitude={longitude}
                                                latitude={latitude}
                                                anchor="bottom"
                                                onClick={() => handleRescueClick(request)}
                                            >
                                                <div className={`custom-marker rescue-marker ${selectedListItem === (request._id || request.id) ? 'selected-marker' : ''}`}>
                                                    <FireOutlined style={{ fontSize: '22px', color: '#fff' }} />
                                                </div>
                                            </Marker>
                                        )
                                    }
                                })}

                                {/* Popup điểm trú ẩn/khu vực ngập */}
                                {selectedPoint && (
                                    <Popup
                                        longitude={selectedPoint.lng}
                                        latitude={selectedPoint.lat}
                                        anchor="bottom"
                                        onClose={() => setSelectedPoint(null)}
                                        closeButton={true}
                                        closeOnClick={false}
                                        maxWidth="400px"
                                        style={{ zIndex: 1000 }}
                                    >
                                        <div className="popup-content">
                                            <Title level={5}>{selectedPoint.name}</Title>
                                            {/* Chỉ hiển thị safe points - flood areas đã bị loại bỏ */}
                                            <Text type="secondary">{selectedPoint.address}</Text>
                                            <div style={{ marginTop: 8 }}>
                                                <Text>Sức chứa: {selectedPoint.capacity || 0} người</Text>
                                            </div>
                                            {(selectedPoint.phone || (selectedPoint.lng && selectedPoint.lat)) && (
                                                <Space
                                                    style={{ width: '100%', marginTop: 12 }}
                                                    size="small"
                                                    wrap
                                                >
                                                    {selectedPoint.phone && (
                                                        <Button
                                                            type="primary"
                                                            danger
                                                            icon={<PhoneOutlined />}
                                                            href={`tel:${selectedPoint.phone.replace(/\./g, '')}`}
                                                            style={{ flex: 1, minWidth: '120px' }}
                                                        >
                                                            {selectedPoint.phone}
                                                        </Button>
                                                    )}
                                                    {selectedPoint.lng && selectedPoint.lat && (
                                                        <Button
                                                            size="small"
                                                            type="link"
                                                            icon={<GlobalOutlined />}
                                                            href={getGoogleMapsLink([selectedPoint.lng, selectedPoint.lat])}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ padding: 0, fontSize: '12px' }}
                                                        >
                                                            Xem trên bản đồ
                                                        </Button>
                                                    )}
                                                </Space>
                                            )}
                                        </div>
                                    </Popup>
                                )}

                                {/* Popup thủy điện */}
                                {selectedThuydien && selectedThuydien.coordinates && selectedThuydien.coordinates.lat && selectedThuydien.coordinates.lng && (
                                    <Popup
                                        longitude={selectedThuydien.coordinates.lng}
                                        latitude={selectedThuydien.coordinates.lat}
                                        anchor="bottom"
                                        onClose={() => setSelectedThuydien(null)}
                                        closeButton={true}
                                        closeOnClick={false}
                                        maxWidth="400px"
                                        style={{ zIndex: 1000 }}
                                    >
                                        <div className="popup-content thuydien-popup">
                                            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                                <Title level={5} style={{ margin: 0, color: '#1890ff' }}>
                                                    ⚡ {selectedThuydien.name}
                                                </Title>
                                                {selectedThuydien.location && (
                                                    <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                                                        📍 {selectedThuydien.location}
                                                    </Text>
                                                )}
                                                {selectedThuydien.hasData && selectedThuydien.data ? (
                                                    <>
                                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
                                                            <Text strong style={{ display: 'block', marginBottom: 4 }}>Thông số mới nhất:</Text>
                                                            <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                                                {selectedThuydien.data.Time && (
                                                                    <Text type="secondary" style={{ fontSize: '12px' }}>
                                                                        ⏰ {new Date(selectedThuydien.data.Time).toLocaleString('vi-VN')}
                                                                    </Text>
                                                                )}
                                                                {Object.entries(selectedThuydien.data)
                                                                    .filter(([key]) => key !== 'Time')
                                                                    .map(([key, value]) => {
                                                                        const label = THUYDIEN_PARAM_LABELS[key] || key
                                                                        return (
                                                                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                                                <Text>{label}:</Text>
                                                                                <Text strong style={{ marginLeft: 8 }}>{value || 'N/A'}</Text>
                                                                            </div>
                                                                        )
                                                                    })}
                                                            </Space>
                                                        </div>
                                                        {selectedThuydien.lastUpdated && (
                                                            <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginTop: 8 }}>
                                                                Cập nhật: {new Date(selectedThuydien.lastUpdated).toLocaleString('vi-VN')}
                                                            </Text>
                                                        )}
                                                    </>
                                                ) : (
                                                    <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: 8 }}>
                                                        ⚠️ Chưa có dữ liệu
                                                    </Text>
                                                )}
                                                {selectedThuydien.coordinates && (
                                                    <Button
                                                        size="small"
                                                        type="link"
                                                        icon={<GlobalOutlined />}
                                                        href={getGoogleMapsLink([selectedThuydien.coordinates.lng, selectedThuydien.coordinates.lat])}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        block
                                                        style={{ padding: 0, fontSize: '12px', marginTop: 8 }}
                                                    >
                                                        📍 Mở Google Maps
                                                    </Button>
                                                )}
                                            </Space>
                                        </div>
                                    </Popup>
                                )}

                                {/* Popup cầu cứu từ người dân */}
                                {selectedRescue && selectedRescue.coords && selectedRescue.coords[0] && selectedRescue.coords[1] && (
                                    <Popup
                                        longitude={selectedRescue.coords[0]}
                                        latitude={selectedRescue.coords[1]}
                                        anchor="bottom"
                                        onClose={() => setSelectedRescue(null)}
                                        closeButton={true}
                                        closeOnClick={false}
                                        maxWidth="400px"
                                        style={{ zIndex: 1000 }}
                                    >
                                        <div className="popup-content rescue-popup">
                                            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                                {/* Kiểm tra xem có phải từ form "Báo cáo khẩn cấp" không */}
                                                {selectedRescue.fullDetails?.source === 'manual_report' || (selectedRescue.people && selectedRescue.people.includes('Người báo cáo:')) ? (
                                                    <>
                                                        {/* Form Báo cáo khẩn cấp - Chỉ hiển thị các trường từ form */}

                                                        {/* Tên người báo cáo */}
                                                        {selectedRescue.people && selectedRescue.people.includes('Người báo cáo:') && (
                                                            <Text strong style={{ display: 'block', fontSize: '16px', color: '#1890ff' }}>
                                                                👤 {selectedRescue.people.replace('Người báo cáo: ', '')}
                                                            </Text>
                                                        )}



                                                        {/* Địa chỉ - Chỉ hiển thị nếu không phải tọa độ thuần túy */}
                                                        {selectedRescue.location &&
                                                            !selectedRescue.location.match(/^Vị trí GPS:\s*\d+\.\d+,\s*\d+\.\d+$/i) &&
                                                            !selectedRescue.location.match(/^\d+\.\d+,\s*\d+\.\d+$/) && (
                                                                <Title level={5} style={{ margin: 0, marginTop: 8 }}>
                                                                    📍 {selectedRescue.location.replace(/^Vị trí GPS:\s*/i, '')}
                                                                </Title>
                                                            )}

                                                        {/* Mô tả */}
                                                        <Text style={{ display: 'block', marginTop: 8, whiteSpace: 'pre-wrap' }}>
                                                            {selectedRescue.description}
                                                        </Text>

                                                        {/* Hình ảnh */}
                                                        {selectedRescue.imagePath && (
                                                            <div style={{ marginTop: 8 }}>
                                                                <img
                                                                    src={`${API_URL}${selectedRescue.imagePath}`}
                                                                    alt="Hình ảnh báo cáo"
                                                                    style={{
                                                                        width: '100%',
                                                                        maxHeight: '150px',
                                                                        objectFit: 'cover',
                                                                        borderRadius: '6px',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                    onClick={() => window.open(`${API_URL}${selectedRescue.imagePath}`, '_blank')}
                                                                />
                                                            </div>
                                                        )}
                                                        {/* Số điện thoại */}
                                                        {(selectedRescue.contactFull || selectedRescue.contact) && (
                                                            <Button
                                                                type="primary"
                                                                danger
                                                                icon={<PhoneOutlined />}
                                                                href={`tel:${(selectedRescue.contactFull || selectedRescue.contact).split(',')[0].replace(/\./g, '').trim()}`}
                                                                block
                                                                style={{ marginTop: 8 }}
                                                            >
                                                                📞 Gọi: {(selectedRescue.contactFull || selectedRescue.contact).split(',')[0].trim()}
                                                            </Button>
                                                        )}
                                                        {/* Thời gian */}
                                                        <Text type="secondary" style={{ fontSize: '12px', marginTop: 8 }}>
                                                            ⏰ {formatTime(selectedRescue.timestamp)}
                                                        </Text>

                                                        {/* Link Google Maps */}
                                                        {selectedRescue.coords && selectedRescue.coords[0] && selectedRescue.coords[1] && (
                                                            <Button
                                                                size="small"
                                                                type="link"
                                                                icon={<GlobalOutlined />}
                                                                href={getGoogleMapsLink(selectedRescue.coords)}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                block
                                                                style={{ padding: 0, fontSize: '12px', marginTop: 8 }}
                                                            >
                                                                📍 Mở Google Maps
                                                            </Button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        {/* AI Rescue Request - Hiển thị đầy đủ thông tin */}
                                                        <Space wrap>
                                                            <Tag
                                                                color={selectedRescue.urgency === 'CỰC KỲ KHẨN CẤP' ? 'red' : 'orange'}
                                                                icon={selectedRescue.urgency === 'CỰC KỲ KHẨN CẤP' ? <FireOutlined /> : null}
                                                            >
                                                                {selectedRescue.urgency === 'CẦN CỨU TRỢ' ? 'KHẨN CẤP' : selectedRescue.urgency}
                                                            </Tag>
                                                            {selectedRescue.status && (
                                                                <Tag color={selectedRescue.status === 'Chưa xử lý' ? 'red' : selectedRescue.status === 'Đang xử lý' ? 'orange' : 'green'}>
                                                                    {selectedRescue.status}
                                                                </Tag>
                                                            )}
                                                        </Space>

                                                        {/* Location - Chỉ hiển thị nếu không phải tọa độ thuần túy */}
                                                        {selectedRescue.location &&
                                                            !selectedRescue.location.match(/^Vị trí GPS:\s*\d+\.\d+,\s*\d+\.\d+$/i) &&
                                                            !selectedRescue.location.match(/^\d+\.\d+,\s*\d+\.\d+$/) && (
                                                                <Title level={5} style={{ margin: 0, marginTop: 4 }}>
                                                                    📍 {selectedRescue.location.replace(/^Vị trí GPS:\s*/i, '')}
                                                                </Title>
                                                            )}

                                                        <Text style={{ display: 'block', marginTop: 8 }}>
                                                            {selectedRescue.description}
                                                        </Text>

                                                        {selectedRescue.imagePath && (
                                                            <div style={{ marginTop: 8 }}>
                                                                <img
                                                                    src={`${API_URL}${selectedRescue.imagePath}`}
                                                                    alt="Hình ảnh cầu cứu"
                                                                    style={{
                                                                        width: '100%',
                                                                        maxHeight: '150px',
                                                                        objectFit: 'cover',
                                                                        borderRadius: '6px',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                    onClick={() => window.open(`${API_URL}${selectedRescue.imagePath}`, '_blank')}
                                                                />
                                                            </div>
                                                        )}

                                                        <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 8 }}>
                                                            {selectedRescue.people && (
                                                                <Text type="secondary">👥 {selectedRescue.people}</Text>
                                                            )}
                                                            {selectedRescue.needs && (
                                                                <Text type="secondary">📦 {selectedRescue.needs}</Text>
                                                            )}

                                                            {(selectedRescue.contactFull || selectedRescue.contact) && (
                                                                <Button
                                                                    type="primary"
                                                                    danger
                                                                    icon={<PhoneOutlined />}
                                                                    href={`tel:${(selectedRescue.contactFull || selectedRescue.contact).split(',')[0].replace(/\./g, '').trim()}`}
                                                                    block
                                                                    title={selectedRescue.contactFull || selectedRescue.contact}
                                                                >
                                                                    📞 Gọi: {(selectedRescue.contactFull || selectedRescue.contact).split(',')[0].trim()}
                                                                    {selectedRescue.contactFull && selectedRescue.contactFull.includes(',') &&
                                                                        ` (+${selectedRescue.contactFull.split(',').length - 1} số khác)`}
                                                                </Button>
                                                            )}

                                                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                                                ⏰ {formatTime(selectedRescue.timestamp)}
                                                            </Text>

                                                            {selectedRescue.facebookUrl && (
                                                                <Button
                                                                    size="small"
                                                                    type="link"
                                                                    href={selectedRescue.facebookUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    block
                                                                    style={{ padding: 0, fontSize: '12px', marginTop: 8 }}
                                                                >
                                                                    🔗 Xem bài gốc trên Facebook
                                                                </Button>
                                                            )}

                                                            {selectedRescue.coords && selectedRescue.coords[0] && selectedRescue.coords[1] && (
                                                                <Button
                                                                    size="small"
                                                                    type="link"
                                                                    icon={<GlobalOutlined />}
                                                                    href={getGoogleMapsLink(selectedRescue.coords)}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    block
                                                                    style={{ padding: 0, fontSize: '12px', marginTop: 8 }}
                                                                >
                                                                    📍 Mở Google Maps
                                                                </Button>
                                                            )}
                                                        </Space>
                                                    </>
                                                )}
                                            </Space>
                                        </div>
                                    </Popup>
                                )}
                            </Map>
                        </>
                    )}
                </Content>
            </Layout>

            {/* Modal cập nhật tọa độ */}
            <Modal
                title="Cập nhật tọa độ"
                open={!!editingRequest}
                onCancel={() => {
                    setEditingRequest(null)
                    setClickedCoords(null)
                    setGoogleMapsLink('')
                    setUpdateError(null)
                    setIsUpdating(false)
                }}
                footer={null}
                width={500}
                zIndex={3000}
                getContainer={() => document.body}
                maskClosable={true}
                destroyOnClose={false}
            >
                {editingRequest && (
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Alert
                            message={`Cập nhật tọa độ cho: ${editingRequest.location}`}
                            type="info"
                            showIcon
                        />

                        {/* Hiển thị lỗi nếu có */}
                        {updateError && (
                            <Alert
                                message={updateError}
                                type="error"
                                showIcon
                                closable
                                onClose={() => setUpdateError(null)}
                            />
                        )}

                        <div>
                            <Text strong>Tọa độ hiện tại: </Text>
                            {editingRequest.coords && editingRequest.coords[0] && editingRequest.coords[1] ? (
                                <Text>{editingRequest.coords[1].toFixed(6)}, {editingRequest.coords[0].toFixed(6)}</Text>
                            ) : (
                                <Text type="danger">Chưa có tọa độ</Text>
                            )}
                        </div>

                        {/* Paste Google Maps link */}
                        <div>
                            <Text strong>Paste link Google Maps (nhanh nhất):</Text>
                            <Input
                                placeholder="https://www.google.com/maps?q=13.08,109.30 hoặc https://maps.google.com/@13.08,109.30"
                                prefix={<GlobalOutlined />}
                                value={googleMapsLink}
                                onChange={handleGoogleMapsLinkChange}
                                allowClear
                                style={{ marginTop: '8px' }}
                            />
                            {googleMapsLink && !clickedCoords && (
                                <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '4px' }}>
                                    ⚠️ Không thể parse tọa độ từ link này
                                </Text>
                            )}
                        </div>

                        {clickedCoords && (
                            <Alert
                                message={`Tọa độ đã chọn: ${clickedCoords.lat.toFixed(6)}, ${clickedCoords.lng.toFixed(6)}`}
                                type="success"
                                showIcon
                                action={
                                    <Button
                                        size="small"
                                        type="primary"
                                        loading={isUpdating}
                                        onClick={() => handleUpdateCoords([clickedCoords.lng, clickedCoords.lat])}
                                    >
                                        Cập nhật
                                    </Button>
                                }
                            />
                        )}

                        <div>
                            <Text strong>Hoặc nhập tọa độ thủ công:</Text>
                            <Input
                                placeholder="Nhập tọa độ (ví dụ: 13.08, 109.30 hoặc 109.30, 13.08)"
                                style={{ marginTop: '8px' }}
                                onPressEnter={(e) => {
                                    const value = e.target.value.trim()
                                    const coordPattern = /^(-?\d+\.?\d*)\s*[,，]\s*(-?\d+\.?\d*)$/
                                    const match = value.match(coordPattern)
                                    if (match) {
                                        let lat = parseFloat(match[1])
                                        let lng = parseFloat(match[2])
                                        if (Math.abs(lng) > 90 && Math.abs(lat) <= 90) {
                                            [lat, lng] = [lng, lat]
                                        }
                                        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                            setClickedCoords({ lat, lng })
                                            handleUpdateCoords([lng, lat])
                                        } else {
                                            message.error('Tọa độ không hợp lệ')
                                        }
                                    } else {
                                        message.error('Định dạng không đúng. Vui lòng nhập: lat, lng')
                                    }
                                }}
                            />
                        </div>

                        <Alert
                            message="💡 Hướng dẫn: Paste link Google Maps (nhanh nhất), hoặc click trên bản đồ, hoặc nhập tọa độ thủ công"
                            type="info"
                            showIcon
                        />
                    </Space>
                )}
            </Modal>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && isMobile && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 1999,
                    }}
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Floating Action Buttons - Map Controls */}
            <div className="fab-container">
                {/* Filter/Sidebar Toggle (Mobile only) */}
                {isMobile && (
                    <button
                        className="fab-button secondary"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        title="Danh sách"
                        style={{ position: 'relative' }}
                    >
                        <FilterOutlined />
                        {filteredRescueRequests.length > 0 && (
                            <span className="fab-badge">{filteredRescueRequests.length}</span>
                        )}
                    </button>
                )}


                {/* Locate User */}
                <button
                    className="fab-button primary"
                    onClick={() => {
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                                (position) => {
                                    setViewState(prev => ({
                                        ...prev,
                                        longitude: position.coords.longitude,
                                        latitude: position.coords.latitude,
                                        zoom: 15
                                    }))
                                    message.success('Đã định vị vị trí của bạn')
                                },
                                (error) => {
                                    message.error('Không thể lấy vị trí. Vui lòng bật GPS.')
                                }
                            )
                        } else {
                            message.error('Trình duyệt không hỗ trợ định vị')
                        }
                    }}
                    title="Vị trí của tôi"
                >
                    <EnvironmentOutlined />
                </button>

                {/* Quick Rescue Button */}
                <button
                    className="fab-button primary"
                    onClick={openQuickRescueModal}
                    title="Cầu cứu nhanh"
                    style={{
                        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                        boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)'
                    }}
                >
                    <PlusOutlined style={{ fontSize: '20px' }} />
                </button>

                {/* Send Report */}
                <button
                    className="fab-button secondary"
                    onClick={() => navigate('/report')}
                    title="Gửi phản ánh"
                >
                    <SendOutlined />
                </button>
            </div>

            {/* Quick Rescue Modal */}
            <Modal
                title="Gửi Yêu Cầu Trợ Giúp"
                open={quickRescueModalVisible}
                onCancel={closeQuickRescueModal}
                footer={null}
                width={isMobile ? '90%' : 600}
                style={{ top: isMobile ? 20 : 50 }}
                zIndex={3000}
                getContainer={() => document.body}
                maskClosable={true}
                destroyOnClose={false}
            >
                <Form
                    form={quickRescueForm}
                    layout="vertical"
                    onFinish={handleQuickRescueSubmit}
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
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <Space wrap>
                                <Button
                                    icon={<EnvironmentOutlined />}
                                    onClick={handleGetCurrentLocationForQuickRescue}
                                    loading={quickRescueLoading}
                                >
                                    Lấy GPS Tự Động
                                </Button>
                                <Button
                                    icon={<AimOutlined />}
                                    onClick={() => {
                                        // Set context để biết đang chọn cho form nào
                                        setLocationPickerContext('quickRescue')
                                        // Mở modal chọn vị trí trên bản đồ lớn
                                        setLocationPickerModalVisible(true)
                                        // Khởi tạo vị trí từ vị trí hiện tại hoặc vị trí đã chọn
                                        if (quickRescueLocation) {
                                            setLocationPickerViewState({
                                                longitude: quickRescueLocation.lng,
                                                latitude: quickRescueLocation.lat,
                                                zoom: 15
                                            })
                                            setLocationPickerSelected(quickRescueLocation)
                                        } else if (viewState.latitude && viewState.longitude) {
                                            setLocationPickerViewState({
                                                longitude: viewState.longitude,
                                                latitude: viewState.latitude,
                                                zoom: 15
                                            })
                                            setLocationPickerSelected(null)
                                        } else {
                                            // Mặc định: lấy vị trí hiện tại từ GPS nếu có thể
                                            if (navigator.geolocation) {
                                                navigator.geolocation.getCurrentPosition(
                                                    (position) => {
                                                        const newLocation = {
                                                            lat: position.coords.latitude,
                                                            lng: position.coords.longitude
                                                        }
                                                        setLocationPickerViewState({
                                                            longitude: newLocation.lng,
                                                            latitude: newLocation.lat,
                                                            zoom: 15
                                                        })
                                                        setLocationPickerSelected(null)
                                                    },
                                                    () => {
                                                        // Nếu không lấy được GPS, dùng vị trí mặc định (Phú Yên)
                                                        setLocationPickerViewState({
                                                            longitude: 108.9, // Phú Yên
                                                            latitude: 13.0,  // Phú Yên
                                                            zoom: 10
                                                        })
                                                        setLocationPickerSelected(null)
                                                    }
                                                )
                                            } else {
                                                setLocationPickerViewState({
                                                    longitude: 108.9, // Phú Yên
                                                    latitude: 13.0,  // Phú Yên
                                                    zoom: 10
                                                })
                                                setLocationPickerSelected(null)
                                            }
                                        }
                                    }}
                                    type="default"
                                >
                                    Chọn Trên Bản Đồ
                                </Button>
                                {quickRescueLocation && (
                                    <Tag color="green">
                                        ✓ Đã chọn: {quickRescueLocation.lat.toFixed(6)}, {quickRescueLocation.lng.toFixed(6)}
                                    </Tag>
                                )}
                            </Space>
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
                        name="image"
                        help="Kéo thả ảnh vào đây hoặc click để chọn"
                    >
                        <Upload
                            accept="image/*"
                            beforeUpload={() => false}
                            onChange={handleQuickRescueImageChange}
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
                            loading={quickRescueLoading}
                            block
                            size="large"
                            style={{ height: '50px', fontSize: '16px' }}
                        >
                            Gửi Báo Cáo Khẩn Cấp
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Location Picker Modal - Chọn vị trí chính xác trên bản đồ lớn */}
            <Modal
                title="Chọn vị trí chính xác"
                open={locationPickerModalVisible}
                onCancel={handleCancelLocationPicker}
                footer={[
                    <Button key="cancel" onClick={handleCancelLocationPicker}>
                        Hủy
                    </Button>,
                    <Button
                        key="confirm"
                        type="primary"
                        onClick={handleConfirmLocation}
                        disabled={!locationPickerSelected}
                    >
                        Xác nhận vị trí
                    </Button>
                ]}
                width={isMobile ? '100%' : '90%'}
                style={{ top: isMobile ? 0 : 20, paddingBottom: 0 }}
                styles={{ body: { padding: 0, height: isMobile ? 'calc(100vh - 120px)' : '80vh' } }}
                zIndex={3000}
                getContainer={() => document.body}
                maskClosable={true}
                destroyOnClose={false}
            >
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {/* Tabs để chuyển đổi giữa Bản đồ và Vệ tinh */}
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f0f0f0',
                        background: '#fff',
                        display: 'flex',
                        gap: '8px'
                    }}>
                        <Button
                            type={locationPickerMapType === 'streets' ? 'primary' : 'default'}
                            onClick={() => setLocationPickerMapType('streets')}
                            style={{ flex: 1 }}
                        >
                            Bản đồ
                        </Button>
                        <Button
                            type={locationPickerMapType === 'satellite' ? 'primary' : 'default'}
                            onClick={() => setLocationPickerMapType('satellite')}
                            style={{ flex: 1 }}
                        >
                            Vệ tinh
                        </Button>
                    </div>

                    {/* Map container */}
                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                        <Map
                            mapboxAccessToken={MAPBOX_TOKEN}
                            {...locationPickerViewState}
                            onMove={evt => setLocationPickerViewState(evt.viewState)}
                            onClick={handleLocationPickerMapClick}
                            style={{ width: '100%', height: '100%' }}
                            mapStyle={
                                locationPickerMapType === 'satellite'
                                    ? 'mapbox://styles/mapbox/satellite-v9'
                                    : 'mapbox://styles/mapbox/streets-v12'
                            }
                            cursor="crosshair"
                        >
                            {/* Marker đỏ tại vị trí đã chọn */}
                            {locationPickerSelected && (
                                <Marker
                                    longitude={locationPickerSelected.lng}
                                    latitude={locationPickerSelected.lat}
                                    anchor="bottom"
                                >
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        background: '#dc2626',
                                        borderRadius: '50% 50% 50% 0',
                                        transform: 'rotate(-45deg)',
                                        border: '4px solid #fff',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative'
                                    }}>
                                        <div style={{
                                            transform: 'rotate(45deg)',
                                            color: '#fff',
                                            fontSize: '20px',
                                            fontWeight: 'bold'
                                        }}>
                                            📍
                                        </div>
                                    </div>
                                </Marker>
                            )}
                        </Map>

                        {/* Hướng dẫn */}
                        {!locationPickerSelected && (
                            <div style={{
                                position: 'absolute',
                                top: '16px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(255, 255, 255, 0.95)',
                                padding: '8px 16px',
                                borderRadius: '20px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: '#333',
                                zIndex: 1000,
                                pointerEvents: 'none'
                            }}>
                                💡 Click trên bản đồ để ghim vị trí
                            </div>
                        )}

                        {/* Hiển thị tọa độ đã chọn */}
                        {locationPickerSelected && (
                            <div style={{
                                position: 'absolute',
                                bottom: '16px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(255, 255, 255, 0.95)',
                                padding: '12px 20px',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: '#333',
                                zIndex: 1000,
                                pointerEvents: 'none',
                                textAlign: 'center'
                            }}>
                                <div style={{ marginBottom: '4px', color: '#dc2626', fontWeight: 'bold' }}>
                                    Vị trí đã chọn
                                </div>
                                <div style={{ fontSize: '12px', color: '#666' }}>
                                    {locationPickerSelected.lat.toFixed(6)}, {locationPickerSelected.lng.toFixed(6)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* Modal Thêm Thông Tin Đội Cứu Hộ */}
            <Modal
                title="Thêm Thông Tin Đội Cứu Hộ"
                open={addRescueTeamModalVisible}
                onCancel={() => {
                    setAddRescueTeamModalVisible(false)
                    addRescueTeamForm.resetFields()
                    setAddRescueTeamLocation(null)
                }}
                footer={null}
                width={isMobile ? '90%' : 600}
                style={{ top: isMobile ? 20 : 50 }}
                zIndex={3000}
                getContainer={() => document.body}
                maskClosable={true}
                destroyOnClose={false}
            >
                <Form
                    form={addRescueTeamForm}
                    layout="vertical"
                    onFinish={handleAddRescueTeamSubmit}
                    onFinishFailed={(errorInfo) => {
                        // console.log('❌ Form validation failed:', errorInfo)    
                        // console.log('❌ Error fields:', errorInfo.errorFields)
                        message.error('Vui lòng điền đầy đủ thông tin bắt buộc!')
                    }}
                    autoComplete="off"
                    validateTrigger="onSubmit"
                >
                    <Form.Item
                        label="Tên đội cứu hộ (tùy chọn)"
                        name="name"
                        rules={[{ max: 100, message: 'Tên không được quá 100 ký tự!' }]}
                    >
                        <Input
                            name="name"
                            placeholder="Ví dụ: Đội cứu hộ xã ABC"
                            maxLength={100}
                            showCount
                            autoComplete="organization"
                        />
                    </Form.Item>

                    <Form.Item
                        label="Loại cứu hộ"
                        name="rescueType"
                        rules={[{ required: true, message: 'Vui lòng chọn loại cứu hộ!' }]}
                    >
                        <Select
                            name="rescueType"
                            placeholder="Chọn loại cứu hộ"
                            autoComplete="off"
                        >
                            <Select.Option value="Ca nô">Ca nô</Select.Option>
                            <Select.Option value="Xe cứu hộ">Xe cứu hộ</Select.Option>
                            <Select.Option value="Thuyền">Thuyền</Select.Option>
                            <Select.Option value="Máy bay trực thăng">Máy bay trực thăng</Select.Option>
                            <Select.Option value="Khác">Khác</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        label="Số điện thoại (tùy chọn)"
                        name="phone"
                        help="Nếu không nhập, hệ thống sẽ tự động tìm số điện thoại trong nội dung"
                        rules={[{ max: 20, message: 'Số điện thoại không được quá 20 ký tự!' }]}
                    >
                        <Input
                            name="phone"
                            type="tel"
                            placeholder="Ví dụ: 0912345678"
                            maxLength={20}
                            showCount
                            autoComplete="tel"
                        />
                    </Form.Item>

                    <Form.Item
                        label="Địa chỉ (tùy chọn)"
                        name="address"
                        rules={[{ max: 200, message: 'Địa chỉ không được quá 200 ký tự!' }]}
                    >
                        <Input
                            name="address"
                            placeholder="Ví dụ: Xã ABC, huyện XYZ, tỉnh Phú Yên"
                            maxLength={200}
                            showCount
                            autoComplete="street-address"
                        />
                    </Form.Item>

                    <Form.Item
                        label="Vị trí GPS"
                        help="Chọn vị trí trên bản đồ hoặc dùng GPS tự động"
                    >
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <Space wrap>
                                <Button
                                    icon={<EnvironmentOutlined />}
                                    onClick={handleGetCurrentLocationForRescueTeam}
                                    loading={addRescueTeamLoading}
                                >
                                    Lấy GPS Tự Động
                                </Button>
                                <Button
                                    icon={<AimOutlined />}
                                    onClick={() => {
                                        // Set context để biết đang chọn cho form nào
                                        setLocationPickerContext('addRescueTeam')
                                        // Mở modal chọn vị trí trên bản đồ lớn
                                        setLocationPickerModalVisible(true)
                                        if (addRescueTeamLocation) {
                                            setLocationPickerViewState({
                                                longitude: addRescueTeamLocation.lng,
                                                latitude: addRescueTeamLocation.lat,
                                                zoom: 15
                                            })
                                            setLocationPickerSelected(addRescueTeamLocation)
                                        } else if (viewState.latitude && viewState.longitude) {
                                            setLocationPickerViewState({
                                                longitude: viewState.longitude,
                                                latitude: viewState.latitude,
                                                zoom: 15
                                            })
                                            setLocationPickerSelected(null)
                                        }
                                    }}
                                    type={addRescueTeamLocation ? 'primary' : 'default'}
                                >
                                    {addRescueTeamLocation ? 'Đã chọn vị trí' : 'Chọn Trên Bản Đồ'}
                                </Button>
                            </Space>
                            {addRescueTeamLocation && (
                                <Tag color="green" style={{ fontSize: '12px' }}>
                                    ✓ Đã chọn: {addRescueTeamLocation.lat.toFixed(6)}, {addRescueTeamLocation.lng.toFixed(6)}
                                </Tag>
                            )}
                        </Space>
                    </Form.Item>

                    <Form.Item
                        label="Thông tin đội cứu hộ"
                        name="description"
                        rules={[
                            { required: true, message: 'Vui lòng nhập thông tin về đội cứu hộ!' },
                            { max: 1000, message: 'Nội dung không được quá 1000 ký tự!' }
                        ]}
                        help="Nhập thông tin về đội cứu hộ. Số điện thoại trong nội dung sẽ được tự động nhận diện."
                    >
                        <TextArea
                            name="description"
                            placeholder="Ví dụ: Đội cứu hộ có ca nô, sẵn sàng hỗ trợ. Liên hệ: 0912345678 hoặc 0987654321. Hoạt động 24/7."
                            rows={6}
                            maxLength={1000}
                            showCount
                            autoComplete="off"
                        />
                    </Form.Item>

                    <Form.Item>
                        <Space>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={addRescueTeamLoading}
                                icon={<PlusOutlined />}
                                onClick={(e) => {
                                    // console.log('🔵 Submit button clicked')
                                    // console.log('🔵 Form values:', addRescueTeamForm.getFieldsValue())
                                    // console.log('🔵 Form errors:', addRescueTeamForm.getFieldsError())
                                    // Không prevent default - để form tự xử lý
                                }}
                            >
                                Thêm Đội Cứu Hộ
                            </Button>
                            <Button
                                onClick={() => {
                                    setAddRescueTeamModalVisible(false)
                                    addRescueTeamForm.resetFields()
                                    setAddRescueTeamLocation(null)
                                }}
                            >
                                Hủy
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Water Level Chart Modal */}
            <WaterLevelChart
                visible={waterLevelModalVisible}
                onClose={() => {
                    setWaterLevelModalVisible(false)
                    setSelectedWaterStation(null)
                }}
                stationCode={selectedWaterStation?.stationCode}
                stationName={selectedWaterStation?.stationName}
                coordinates={selectedWaterStation?.coordinates}
            />
        </Layout>
    )
}

export default MapPage

