import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

// Production mode check - chỉ log trong development
const isDev = import.meta.env.MODE === 'development' || import.meta.env.DEV
const devLog = (...args) => isDev && console.log(...args)
const devWarn = (...args) => isDev && console.warn(...args)
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout, Card, Button, Space, Typography, Alert, Spin, Tag, Input, List, Empty, Modal, message, Form, Upload, Tabs, Select, Image, Checkbox, Row, Col } from 'antd'
import { ArrowLeftOutlined, PhoneOutlined, HomeOutlined, FireOutlined, SearchOutlined, SendOutlined, GlobalOutlined, AimOutlined, EditOutlined, MenuOutlined, CloseOutlined, FilterOutlined, ClockCircleOutlined, EnvironmentOutlined, AppstoreOutlined, DashboardOutlined, FileTextOutlined, PlusOutlined, CameraOutlined, UserOutlined, CloudOutlined, GiftOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import Map, { Marker, Popup, useMap } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import axios from 'axios'
import Supercluster from 'supercluster'
import WaterLevelChart from '../components/WaterLevelChart'
import { resizeImageForUpload } from '../utils/imageResize'
import { parseAndConvertGoogleMapsCoords } from '../utils/coordinateTransform'
import './MapPage.css'

const { Header, Content, Sider } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { Search } = Input

// Radar legend constants - Định nghĩa ngoài component để tránh lỗi hoisting
const RADAR_GRADIENT_COLORS = [
    'rgb(40, 16, 159)',   // 0
    'rgb(40, 16, 159)',   // 
    'rgb(40, 16, 159)',   // 
    'rgb(40, 16, 159)',   // 
    'rgb(24, 44, 168)',   // 
    'rgb(0, 145, 148)',   // 20
    'rgb(0, 174, 129)',   // 
    'rgb(70, 205, 96)',   // 30
    'rgb(195, 219, 38)',  // 
    'rgb(245, 203, 8)',   // 40
    'rgb(244, 159, 33)',  // 
    'rgb(223, 102, 68)',  // 50
    'rgb(190, 52, 94)',   // 
    'rgb(157, 16, 109)',  // 60
    'rgb(157, 16, 109)'   // 
]

const DBZ_VALUES = [0, 20, 30, 40, 50, 60]
const MMH_VALUES = [0, 0.6, 3, 12, 50, 200]

// Tạo gradient string - tính toán một lần
const RADAR_GRADIENT_STOPS = RADAR_GRADIENT_COLORS.map((color, index) =>
    `${color} ${(index / (RADAR_GRADIENT_COLORS.length - 1)) * 100}%`
).join(', ')

// Radar image bounds from API
// Format for Mapbox image source: [SW, SE, NE, NW] - 4 corners [lng, lat]
// Provided coordinates: 7.109075, 97.054972 và 25.250002, 114.987230
// Đảo ngược thứ tự để khớp với ảnh radar (có thể cần [NW, NE, SE, SW])
const VIETNAM_BOUNDS = [
    [97.054972, 25.250002],  // Northwest [lng, lat] - đảo ngược
    [114.987230, 25.250002], // Northeast [lng, lat]
    [114.987230, 7.109075],  // Southeast [lng, lat]
    [97.054972, 7.109075]    // Southwest [lng, lat] - đảo ngược
]

// Component to handle radar overlay layer
function RadarOverlay({ visible, offset = 0, mapInstance = null }) {
    const mapContext = useMap()
    const imageId = 'radar-overlay-image'
    const sourceId = 'radar-overlay-source'
    const layerId = 'radar-overlay-layer'

    useEffect(() => {
        // Get map instance - try multiple ways
        let map = mapInstance

        if (!map && mapContext) {
            // Try to get from useMap hook
            if (mapContext.current) {
                map = mapContext.current
            } else if (typeof mapContext === 'object' && 'getMap' in mapContext) {
                map = mapContext.getMap()
            } else if (typeof mapContext.addSource === 'function') {
                // Direct map instance
                map = mapContext
            }
        }

        if (!map || !visible) {
            // Remove layer if map exists and overlay is hidden
            if (map && typeof map.getLayer === 'function') {
                try {
                    if (map.getLayer(layerId)) {
                        map.removeLayer(layerId)
                    }
                    if (map.getSource(sourceId)) {
                        map.removeSource(sourceId)
                    }
                    if (map.hasImage && map.hasImage(imageId)) {
                        map.removeImage(imageId)
                    }
                } catch (error) {
                    console.warn('Error removing radar layer:', error)
                }
            }
            return
        }

        // Check if map is ready and has the required methods
        if (typeof map.addSource !== 'function' || typeof map.addLayer !== 'function') {
            console.warn('Map instance is not ready or does not have required methods', map)
            return
        }

        // Fetch and add radar image
        const loadRadarImage = async () => {
            try {
                // Sử dụng proxy endpoint để tránh Mixed Content error
                const imageUrl = `${RADAR_API_URL}?offset=${offset}`

                // Fetch image as blob
                const response = await fetch(imageUrl)
                if (!response.ok) {
                    throw new Error(`Failed to fetch radar image: ${response.statusText}`)
                }

                const blob = await response.blob()
                const imageUrlObject = URL.createObjectURL(blob)

                // Create image element using window.Image to avoid conflict with antd Image component
                const img = new window.Image()
                img.crossOrigin = 'anonymous'

                img.onload = () => {
                    try {
                        // Ensure map is still ready
                        if (!map || typeof map.addSource !== 'function') {
                            console.error('Map is not ready')
                            return
                        }

                        // Remove existing layer/source/image if they exist
                        if (map.getLayer(layerId)) {
                            map.removeLayer(layerId)
                        }
                        if (map.getSource(sourceId)) {
                            map.removeSource(sourceId)
                        }
                        if (map.hasImage && map.hasImage(imageId)) {
                            map.removeImage(imageId)
                        }

                        // Add image to map
                        map.addImage(imageId, img)

                        // Add image source
                        map.addSource(sourceId, {
                            type: 'image',
                            url: imageUrlObject,
                            coordinates: VIETNAM_BOUNDS
                        })

                        // Add raster layer
                        map.addLayer({
                            id: layerId,
                            type: 'raster',
                            source: sourceId,
                            paint: {
                                'raster-opacity': 0.7, // Adjust opacity for better visibility
                                'raster-fade-duration': 0
                            }
                        })

                        // Clean up object URL after a delay
                        setTimeout(() => {
                            URL.revokeObjectURL(imageUrlObject)
                        }, 1000)
                    } catch (error) {
                        console.error('Error adding radar layer to map:', error)
                        message.error('Không thể tải lớp radar. Vui lòng thử lại.')
                    }
                }

                img.onerror = () => {
                    console.error('Error loading radar image')
                    message.error('Không thể tải ảnh radar. Vui lòng kiểm tra kết nối.')
                    URL.revokeObjectURL(imageUrlObject)
                }

                img.src = imageUrlObject
            } catch (error) {
                console.error('Error fetching radar image:', error)
                message.error('Không thể tải dữ liệu radar. Vui lòng thử lại sau.')
            }
        }

        // Wait for map style to load before adding layers
        const waitForMapReady = () => {
            if (map.isStyleLoaded && !map.isStyleLoaded()) {
                map.once('style.load', () => {
                    loadRadarImage()
                })
            } else {
                loadRadarImage()
            }
        }

        waitForMapReady()

        // Auto-refresh radar image every 2 minutes (120000ms)
        let refreshInterval = null
        if (visible && map) {
            refreshInterval = setInterval(() => {
                if (map && typeof map.addSource === 'function') {
                    console.log('🔄 Tự động làm mới dữ liệu radar...')
                    loadRadarImage()
                }
            }, 120000) // 2 minutes = 120000 milliseconds
        }

        // Cleanup function
        return () => {
            // Clear refresh interval
            if (refreshInterval) {
                clearInterval(refreshInterval)
            }

            try {
                if (map && typeof map.getLayer === 'function') {
                    if (map.getLayer(layerId)) {
                        map.removeLayer(layerId)
                    }
                    if (map.getSource(sourceId)) {
                        map.removeSource(sourceId)
                    }
                    if (map.hasImage && map.hasImage(imageId)) {
                        map.removeImage(imageId)
                    }
                }
            } catch (error) {
                console.warn('Error cleaning up radar layer:', error)
            }
        }
    }, [mapContext, visible, offset, mapInstance])

    return null // This component doesn't render anything
}

// Trong production (Docker), VITE_API_URL có thể là empty để dùng relative path /api (nginx proxy)
// Trong development, dùng localhost:5000
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || (import.meta.env.MODE === 'production' ? '' : 'http://localhost:5000')
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.REACT_APP_MAPBOX_TOKEN || ''
if (!MAPBOX_TOKEN && process.env.NODE_ENV === 'development') {
    console.warn('⚠️ MAPBOX_TOKEN không được tìm thấy trong environment variables')
}

// Radar API configuration - Sử dụng proxy endpoint để tránh Mixed Content error
// Proxy endpoint sẽ fetch từ HTTP API và trả về qua HTTPS
// Phải định nghĩa sau API_URL
const RADAR_API_URL = `${API_URL}/api/radar/image`

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
    const [reliefPoints, setReliefPoints] = useState([]) // Điểm tiếp nhận cứu trợ
    // Flood areas đã bị loại bỏ - không còn sử dụng
    // const [floodAreas, setFloodAreas] = useState([])
    const [rescueRequests, setRescueRequests] = useState([])
    const [supportRequests, setSupportRequests] = useState([]) // Yêu cầu hỗ trợ
    const [geoFeatures, setGeoFeatures] = useState([]) // GeoFeatures từ admin
    const [showGeoFeatures, setShowGeoFeatures] = useState(true) // Toggle hiển thị GeoFeatures
    const [selectedGeoFeature, setSelectedGeoFeature] = useState(null) // GeoFeature được chọn
    const [selectedSupportRequest, setSelectedSupportRequest] = useState(null) // SupportRequest được chọn
    const [selectedPoint, setSelectedPoint] = useState(null)
    const [selectedRescue, setSelectedRescue] = useState(null)
    const [selectedListItem, setSelectedListItem] = useState(null) // Item được chọn trong sidebar
    const [loading, setLoading] = useState(true)
    const [searchText, setSearchText] = useState('')
    const [activeFilter, setActiveFilter] = useState('all') // 'all', 'rescue', 'safe', 'relief', 'thuydien', 'waterlevel', 'news', 'geofeatures', 'support'
    const [sidebarPagination, setSidebarPagination] = useState({ current: 1, pageSize: 20 }) // Pagination cho sidebar list
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

    // Support request form states
    const [supportRequestModalVisible, setSupportRequestModalVisible] = useState(false)
    const [supportRequestForm] = Form.useForm()
    const [supportRequestLocation, setSupportRequestLocation] = useState(null) // { lat, lng }
    const [supportRequestImageFile, setSupportRequestImageFile] = useState(null)
    const [supportRequestLoading, setSupportRequestLoading] = useState(false)
    const [supportRequestGoogleMapsUrl, setSupportRequestGoogleMapsUrl] = useState('')
    const [supportRequestParsedCoords, setSupportRequestParsedCoords] = useState(null)

    // Hotline states
    const [hotlines, setHotlines] = useState([])
    const [hotlineModalVisible, setHotlineModalVisible] = useState(false)
    const [hotlineLoading, setHotlineLoading] = useState(false)

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

    // Add relief point form states
    const [addReliefPointModalVisible, setAddReliefPointModalVisible] = useState(false)
    const [addReliefPointForm] = Form.useForm()
    const [addReliefPointLocation, setAddReliefPointLocation] = useState(null) // { lat, lng }
    const [addReliefPointLoading, setAddReliefPointLoading] = useState(false)
    const [addReliefPointGoogleMapsUrl, setAddReliefPointGoogleMapsUrl] = useState('')
    const [addReliefPointParsedCoords, setAddReliefPointParsedCoords] = useState(null)
    const [locationPickerContext, setLocationPickerContext] = useState(null) // 'quickRescue' | 'addRescueTeam' | 'addReliefPoint' | null

    // Water level stations states
    const [waterLevelStations, setWaterLevelStations] = useState([])
    const [waterLevelModalVisible, setWaterLevelModalVisible] = useState(false)
    const [selectedWaterStation, setSelectedWaterStation] = useState(null) // { stationCode, stationName, coordinates }

    // Thủy điện (reservoirs) states
    const [thuydienData, setThuydienData] = useState({})
    const [selectedThuydien, setSelectedThuydien] = useState(null) // { slug, name, coordinates, data }

    // Tin tức states
    const [news, setNews] = useState([])

    // Cluster modal states
    const [clusterModalVisible, setClusterModalVisible] = useState(false)
    const [clusterRequests, setClusterRequests] = useState([]) // Danh sách requests trong cluster

    // Radar overlay states
    const [radarOverlayVisible, setRadarOverlayVisible] = useState(false)
    const [radarImageLoaded, setRadarImageLoaded] = useState(false)
    const mapInstanceRef = useRef(null)
    const [radarUnit, setRadarUnit] = useState('dBZ') // 'dBZ' hoặc 'mm/h'

    // Giá trị hiển thị theo đơn vị - sử dụng constants đã định nghĩa ngoài component
    const radarDisplayValues = useMemo(() => {
        return radarUnit === 'dBZ' ? DBZ_VALUES : MMH_VALUES
    }, [radarUnit])

    // News detail modal states
    const [newsDetailModalVisible, setNewsDetailModalVisible] = useState(false)
    const [selectedNewsItem, setSelectedNewsItem] = useState(null)
    const [expandedNewsItems, setExpandedNewsItems] = useState(new Set()) // Track expanded news items

    // Load dữ liệu từ API hoặc dùng fallback
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [safeRes, reliefRes, rescueRes, geoFeaturesRes, supportRes, hotlinesRes] = await Promise.all([
                    axios.get(`${API_URL}/api/safe-points`),
                    axios.get(`${API_URL}/api/relief-points`).catch(() => ({ data: { success: false } })), // Load relief points
                    axios.get(`${API_URL}/api/rescue-requests?limit=10000`),
                    axios.get(`${API_URL}/api/geo-features?limit=500&status=Hoạt động`).catch(() => ({ data: { success: false } })), // Chỉ load features đang hoạt động, limit 500 để tối ưu
                    axios.get(`${API_URL}/api/support-requests?limit=10000`).catch(() => ({ data: { success: false } })), // Load support requests
                    axios.get(`${API_URL}/api/hotlines`).catch(() => ({ data: { success: false } })) // Load hotlines
                ])

                if (safeRes.data && safeRes.data.success && Array.isArray(safeRes.data.data)) {
                    setSafePoints(safeRes.data.data)
                }
                if (reliefRes.data && reliefRes.data.success && Array.isArray(reliefRes.data.data)) {
                    setReliefPoints(reliefRes.data.data)
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

                // Load GeoFeatures
                if (geoFeaturesRes.data && geoFeaturesRes.data.success && Array.isArray(geoFeaturesRes.data.data)) {
                    devLog('✅ Fetched GeoFeatures:', geoFeaturesRes.data.data.length, 'features');
                    setGeoFeatures(geoFeaturesRes.data.data);
                } else {
                    devLog('⚠️ No GeoFeatures data or API error');
                    console.log('GeoFeatures API response:', geoFeaturesRes.data);
                    setGeoFeatures([]); // Set empty array to clear any old data
                }

                // Load SupportRequests
                if (supportRes.data && supportRes.data.success && Array.isArray(supportRes.data.data)) {
                    devLog('✅ Fetched SupportRequests:', supportRes.data.data.length, 'requests');
                    setSupportRequests(supportRes.data.data);
                } else {
                    devLog('⚠️ No SupportRequests data or API error');
                    setSupportRequests([]);
                }

                // Load Hotlines
                if (hotlinesRes.data && hotlinesRes.data.success && Array.isArray(hotlinesRes.data.data)) {
                    devLog('✅ Fetched Hotlines:', hotlinesRes.data.data.length, 'hotlines');
                    setHotlines(hotlinesRes.data.data);
                } else {
                    devLog('⚠️ No Hotlines data or API error');
                    setHotlines([]);
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

        // Fetch tin tức
        const fetchNews = async () => {
            try {
                const response = await axios.get(`${API_URL}/api/news?limit=100`)
                if (response.data && response.data.success && Array.isArray(response.data.data)) {
                    setNews(response.data.data)
                }
            } catch (error) {
                console.error('Lỗi lấy dữ liệu tin tức:', error)
            }
        }
        fetchNews()

        // Tối ưu hiệu năng: Sử dụng Page Visibility API và dynamic intervals
        let rescueInterval = null
        let thuydienInterval = null
        let newsInterval = null
        let abortController = null

        // Hash để so sánh data có thay đổi không (tránh re-render không cần thiết)
        let lastRescueDataHash = ''

        const createDataHash = (data) => {
            if (!data || data.length === 0) return ''
            // Tạo hash đơn giản từ length và một vài ID đầu tiên
            return `${data.length}-${data.slice(0, 5).map((item) => item._id || item.id).join(',')}`
        }

        const fetchRescueRequestsOptimized = async () => {
            // Chỉ fetch khi tab visible
            if (document.hidden) return

            try {
                // Tạo AbortController mới cho mỗi request
                abortController = new AbortController()

                const rescueRes = await axios.get(`${API_URL}/api/rescue-requests?limit=10000`, {
                    signal: abortController.signal
                })

                if (rescueRes.data && rescueRes.data.success && Array.isArray(rescueRes.data.data)) {
                    const newHash = createDataHash(rescueRes.data.data)
                    // Chỉ update state nếu data thực sự thay đổi
                    if (newHash !== lastRescueDataHash) {
                        setRescueRequests(rescueRes.data.data)
                        lastRescueDataHash = newHash
                    }
                }
            } catch (error) {
                // Ignore AbortError (khi cancel request)
                if (error.name !== 'AbortError' && error.name !== 'CanceledError') {
                    console.log('Không thể refresh cầu cứu:', error.message)
                }
            }
        }

        const setupIntervals = () => {
            // Clear intervals cũ nếu có
            if (rescueInterval) clearInterval(rescueInterval)
            if (thuydienInterval) clearInterval(thuydienInterval)
            if (newsInterval) clearInterval(newsInterval)

            // Dynamic interval: nhanh hơn khi tab visible, chậm hơn khi hidden
            const isVisible = !document.hidden
            const rescueIntervalTime = isVisible ? 30000 : 120000 // 30s khi visible, 2 phút khi hidden
            const thuydienIntervalTime = isVisible ? 120000 : 300000 // 2 phút khi visible, 5 phút khi hidden  
            const newsIntervalTime = isVisible ? 300000 : 600000 // 5 phút khi visible, 10 phút khi hidden

            // Refresh rescue requests với interval động
            rescueInterval = setInterval(fetchRescueRequestsOptimized, rescueIntervalTime)

            // Refresh thủy điện data với interval động
            thuydienInterval = setInterval(() => {
                if (!document.hidden) {
                    fetchThuydienData()
                }
            }, thuydienIntervalTime)

            // Refresh news với interval động
            newsInterval = setInterval(() => {
                if (!document.hidden) {
                    fetchNews()
                }
            }, newsIntervalTime)
        }

        // Setup intervals ban đầu
        setupIntervals()

        // Lắng nghe sự kiện visibility change để điều chỉnh intervals
        const handleVisibilityChange = () => {
            setupIntervals()
            // Fetch ngay khi tab trở lại visible
            if (!document.hidden) {
                fetchRescueRequestsOptimized()
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            if (rescueInterval) clearInterval(rescueInterval)
            if (thuydienInterval) clearInterval(thuydienInterval)
            if (newsInterval) clearInterval(newsInterval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            // Cancel pending requests
            if (abortController) {
                abortController.abort()
            }
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
        setSelectedSupportRequest(null)
        setSelectedGeoFeature(null)
        setSelectedListItem(request._id || request.id) // Highlight trong sidebar
    }, [])

    // Xử lý click support request marker
    const handleSupportRequestClick = useCallback((request) => {
        console.log('🔵 Support request clicked:', request)
        console.log('🔵 Location:', request.location)
        console.log('🔵 Location type check:', {
            hasLocation: !!request.location,
            hasLat: request.location?.lat != null,
            hasLng: request.location?.lng != null,
            lat: request.location?.lat,
            lng: request.location?.lng
        })
        setSelectedSupportRequest(request)
        setSelectedRescue(null)
        setSelectedPoint(null)
        setSelectedGeoFeature(null)
        setSelectedListItem(request._id || request.id) // Highlight trong sidebar

        // Điều hướng map đến vị trí của request
        if (request.location && request.location.lat != null && request.location.lng != null) {
            setViewState(prev => ({
                ...prev,
                longitude: request.location.lng,
                latitude: request.location.lat,
                zoom: Math.max(prev.zoom, 14)
            }))
        }
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
    const handleThuydienClick = useCallback(async (reservoir) => {
        // Set selected thuydien ngay để hiển thị popup
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

        // Gọi API để lấy dữ liệu mới nhất của hồ này
        if (reservoir.slug) {
            try {
                const response = await axios.get(`${API_URL}/api/thuydien/${reservoir.slug}/latest`)
                if (response.data && response.data.success && response.data.data) {
                    // Cập nhật dữ liệu mới nhất vào selectedThuydien
                    setSelectedThuydien({
                        ...reservoir,
                        ...response.data.data,
                        hasData: true,
                        data: response.data.data.data
                    })
                }
            } catch (error) {
                console.error('Lỗi lấy dữ liệu thủy điện chi tiết:', error)
                // Giữ nguyên dữ liệu cũ nếu API lỗi
            }
        }
    }, [])

    // Xử lý click cluster marker
    const handleClusterClick = useCallback((cluster) => {
        // Lấy tất cả các điểm (requests) trong cluster
        if (clusterRef.current && cluster.properties.cluster) {
            const leaves = clusterRef.current.getLeaves(cluster.id, Infinity) // Infinity để lấy tất cả
            const requests = leaves
                .map(leaf => leaf.properties.request)
                .filter(req => req !== null && req !== undefined)

            if (requests.length > 0) {
                // Hiển thị modal với danh sách requests
                setClusterRequests(requests)
                setClusterModalVisible(true)
            } else {
                // Nếu không lấy được requests, vẫn zoom như cũ
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
            }
        } else {
            // Fallback: zoom vào cluster
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
        }
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
            if (activeFilter === 'news') {
                // Tab "Tin tức mới" → vẫn hiển thị tất cả rescue requests trên bản đồ (tin tức không liên quan bản đồ)
                return true
            }
            // activeFilter === 'all' hoặc các filter khác → hiển thị tất cả
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

    // Filter relief points cho sidebar khi activeFilter === 'relief'
    const filteredReliefPoints = useMemo(() => {
        if (activeFilter !== 'relief') return []

        let filtered = reliefPoints

        // Filter theo search text
        if (debouncedSearchText) {
            const searchLower = debouncedSearchText.toLowerCase()
            filtered = filtered.filter(point => {
                return (
                    point.name?.toLowerCase().includes(searchLower) ||
                    point.address?.toLowerCase().includes(searchLower) ||
                    point.contactPerson?.toLowerCase().includes(searchLower) ||
                    point.reliefType?.toLowerCase().includes(searchLower)
                )
            })
        }

        return filtered
    }, [reliefPoints, debouncedSearchText, activeFilter])

    // Filter support requests cho sidebar khi activeFilter === 'support'
    const filteredSupportRequests = useMemo(() => {
        if (activeFilter !== 'support') return []

        let filtered = supportRequests

        // Filter theo search text
        if (debouncedSearchText) {
            const searchLower = debouncedSearchText.toLowerCase()
            filtered = filtered.filter(request => {
                const searchableText = [
                    request.name || '',
                    request.description || '',
                    request.phone || '',
                    (request.needs || []).join(' ')
                ].join(' ').toLowerCase()
                return searchableText.includes(searchLower)
            })
        }

        return filtered
    }, [supportRequests, debouncedSearchText, activeFilter])

    // Filter news theo search text
    const filteredNews = useMemo(() => {
        if (activeFilter !== 'news') return []

        let filtered = news

        // Filter theo search text
        if (debouncedSearchText) {
            const searchLower = debouncedSearchText.toLowerCase()
            const searchWords = searchLower.split(/\s+/).filter(word => word.length > 0)

            filtered = filtered.filter(item => {
                const searchableText = [
                    item.title || '',
                    item.content || '',
                    item.author || '',
                    item.category || ''
                ].join(' ').toLowerCase()

                if (searchWords.length > 1) {
                    return searchWords.every(word => searchableText.includes(word))
                } else {
                    return searchableText.includes(searchLower)
                }
            })
        }

        return filtered
    }, [news, debouncedSearchText, activeFilter])

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
        if (activeFilter === 'relief') {
            // Tab "Cứu trợ" → hiển thị relief points (điểm tiếp nhận cứu trợ)
            return filteredReliefPoints
                .filter(point => point && (point._id || point.id))
                .map(point => ({
                    id: point._id || point.id,
                    _id: point._id || point.id,
                    location: point.name || 'Không có tên',
                    description: point.description || point.address || '',
                    address: point.address || '',
                    contact: point.phone || null,
                    contactFull: point.phone || null,
                    contactPerson: point.contactPerson || null,
                    reliefType: point.reliefType || null,
                    pointType: point.type || 'Điểm tiếp nhận cứu trợ', // Loại điểm (Điểm tập kết, Kho hàng, etc.)
                    capacity: point.capacity || 0,
                    currentOccupancy: point.currentOccupancy || 0,
                    operatingHours: point.operatingHours || null,
                    coords: (typeof point.lng === 'number' && typeof point.lat === 'number' &&
                        !isNaN(point.lng) && !isNaN(point.lat) &&
                        point.lng >= -180 && point.lng <= 180 && point.lat >= -90 && point.lat <= 90)
                        ? [point.lng, point.lat] : null,
                    urgency: point.status === 'Đầy' ? 'ĐẦY' : point.status === 'Hoạt động' ? 'HOẠT ĐỘNG' : point.status || 'HOẠT ĐỘNG',
                    people: point.capacity > 0
                        ? `${point.currentOccupancy || 0}/${point.capacity} người`
                        : 'Không giới hạn',
                    needs: Array.isArray(point.reliefType) ? point.reliefType.join(', ') : (point.reliefType || 'Hỗn hợp'),
                    type: 'relief', // Loại item trong sidebar (relief, safe, rescue, etc.)
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
        if (activeFilter === 'news') {
            // Tab "Tin tức mới" → hiển thị tin tức
            return filteredNews.map(item => ({
                id: item._id,
                _id: item._id,
                title: item.title || '',
                content: item.content || '',
                imagePath: item.imagePath || null,
                imageUrl: item.imagePath ? (item.imagePath.startsWith('http') ? item.imagePath : `${API_URL}${item.imagePath}`) : null,
                sourceUrl: item.sourceUrl || null,
                category: item.category || 'cập nhật tình hình',
                author: item.author || 'Admin',
                views: item.views || 0,
                type: 'news',
                timestamp: item.createdAt || new Date(),
                news: item // Lưu object gốc
            }))
        }
        if (activeFilter === 'geofeatures') {
            // Tab "Đối tượng bản đồ" → hiển thị GeoFeatures
            let filtered = geoFeatures.filter(feature => {
                if (!feature || !feature.properties) return false

                // Filter theo search text nếu có
                if (debouncedSearchText) {
                    const searchLower = debouncedSearchText.toLowerCase()
                    const searchableText = [
                        feature.properties.name || '',
                        feature.properties.category || '',
                        feature.properties.description || '',
                        feature.properties.status || ''
                    ].join(' ').toLowerCase()
                    return searchableText.includes(searchLower)
                }
                return true
            })

            return filtered.map(feature => {
                // Tính toán tọa độ trung tâm dựa trên geometry type
                let centerCoords = null
                if (feature.geometry) {
                    if (feature.geometry.type === 'Point') {
                        centerCoords = feature.geometry.coordinates // [lng, lat]
                    } else if (feature.geometry.type === 'LineString') {
                        const coords = feature.geometry.coordinates
                        const midIndex = Math.floor(coords.length / 2)
                        centerCoords = coords[midIndex] // [lng, lat]
                    } else if (feature.geometry.type === 'Polygon') {
                        const ring = feature.geometry.coordinates[0]
                        const midIndex = Math.floor(ring.length / 2)
                        centerCoords = ring[midIndex] // [lng, lat]
                    }
                }

                return {
                    id: feature.properties?.id || feature._id,
                    _id: feature.properties?.id || feature._id,
                    location: feature.properties?.name || feature.properties?.category || 'Không có tên',
                    description: feature.properties?.description || '',
                    category: feature.properties?.category || '',
                    status: feature.properties?.status || '',
                    severity: feature.properties?.severity || '',
                    color: feature.properties?.color || '#ff0000',
                    coords: centerCoords,
                    type: 'geofeature',
                    geometryType: feature.geometry?.type || '',
                    timestamp: feature.createdAt || feature.updatedAt || new Date(),
                    geoFeature: feature // Lưu object gốc
                }
            })
        }
        if (activeFilter === 'support') {
            // Tab "Hỗ trợ" → hiển thị support requests (yêu cầu hỗ trợ)
            return filteredSupportRequests
                .filter(request => request && (request._id || request.id) && request.location && request.location.lat != null && request.location.lng != null)
                .map(request => ({
                    id: request._id || request.id,
                    _id: request._id || request.id,
                    location: request.name || 'Yêu cầu hỗ trợ',
                    description: request.description || '',
                    name: request.name || 'Yêu cầu hỗ trợ',
                    phone: request.phone || null,
                    needs: request.needs || [],
                    peopleCount: request.peopleCount || null,
                    status: request.status || 'Chưa xử lý',
                    coords: (typeof request.location.lng === 'number' && typeof request.location.lat === 'number' &&
                        !isNaN(request.location.lng) && !isNaN(request.location.lat) &&
                        request.location.lng >= -180 && request.location.lng <= 180 && request.location.lat >= -90 && request.location.lat <= 90)
                        ? [request.location.lng, request.location.lat] : null,
                    type: 'support',
                    timestamp: request.createdAt || request.updatedAt || new Date(),
                    imagePath: request.imagePath || null,
                    supportRequest: request // Lưu object gốc
                }))
        }
        // Tab "Cần cứu" hoặc "Tất cả" → hiển thị rescue requests (cầu cứu)
        return filteredRescueRequests
    }, [activeFilter, filteredRescueRequests, filteredSafePoints, filteredNews, filteredSupportRequests, thuydienData, waterLevelStations, geoFeatures, debouncedSearchText])

    // Tính số lượng cho filter buttons
    const filterCounts = useMemo(() => {
        const rescue = rescueRequests.length
        const safe = safePoints.length
        const relief = reliefPoints.length
        const support = supportRequests.length
        const thuydien = Object.keys(thuydienData).length > 0 ? Object.keys(thuydienData).length : 2 // Fallback: 2 hồ thủy điện
        const waterlevel = waterLevelStations.length
        const newsCount = news.length
        const geoFeaturesCount = geoFeatures.length

        // "Tất cả" bao gồm: rescue requests + safe points + relief points + support requests + geo features + thuydien + water level stations + news
        const all = rescue + safe + relief + support + geoFeaturesCount + thuydien + waterlevel + newsCount

        // Tab "Cần cứu" hiển thị TẤT CẢ rescue requests, không chỉ urgency khẩn cấp
        const total = rescue // Giữ lại để tương thích với code cũ

        // Flood areas đã bị loại bỏ
        return { total, all, rescue, safe, relief, support, thuydien, waterlevel, news: newsCount, geoFeatures: geoFeaturesCount }
    }, [rescueRequests, safePoints, reliefPoints, supportRequests, thuydienData, waterLevelStations, news, geoFeatures])

    // Clustering cho rescue requests - Tối ưu cho mobile
    const clusterRef = useRef(null)
    const pointsHashRef = useRef('') // Lưu hash của points để tránh reload không cần thiết

    const clusters = useMemo(() => {
        // Cluster khi filter = all, rescue, hoặc news (tin tức không liên quan bản đồ nên vẫn hiển thị markers)
        if (activeFilter !== 'all' && activeFilter !== 'rescue' && activeFilter !== 'news') {
            return []
        }

        // Khi activeFilter === 'news', dùng tất cả rescueRequests (không filter) để đảm bảo markers luôn hiển thị
        // Khi activeFilter === 'all' hoặc 'rescue', dùng filteredRescueRequests (có thể có search filter)
        const requestsToCluster = activeFilter === 'news' ? rescueRequests : filteredRescueRequests

        // Lấy các rescue requests có tọa độ hợp lệ
        const points = requestsToCluster
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


    // Parse tọa độ từ Google Maps URL (tự động chuyển đổi GCJ-02 → WGS84)
    const parseGoogleMapsCoords = (url) => {
        return parseAndConvertGoogleMapsCoords(url, { outputFormat: 'lnglat' });
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

    // Setup GeoFeatures layers
    const setupGeoFeaturesLayers = useCallback((mapInstance) => {
        if (!mapInstance) {
            devWarn('⚠️ setupGeoFeaturesLayers: mapInstance is null');
            return;
        }

        // Wait for map style to load
        if (!mapInstance.isStyleLoaded || !mapInstance.isStyleLoaded()) {
            devLog('⏳ Map style not loaded yet, waiting...');
            mapInstance.once('style.load', () => {
                devLog('✅ Map style loaded, setting up GeoFeatures layers');
                setupGeoFeaturesLayers(mapInstance);
            });
            return;
        }

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

        try {
            // Add source
            mapInstance.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            // Find a suitable layer to insert before (prefer labels layer)
            let beforeId = null;
            try {
                // Try to find a label layer to insert before
                const style = mapInstance.getStyle();
                if (style && style.layers) {
                    const labelLayer = style.layers.find(layer =>
                        layer.id && (layer.id.includes('label') || layer.id.includes('symbol'))
                    );
                    if (labelLayer) {
                        beforeId = labelLayer.id;
                    }
                }
            } catch (err) {
                // If can't find, add at the end
            }

            // Add polygon fill layer (before outline để outline hiển thị trên fill)
            mapInstance.addLayer({
                id: layers.polygon,
                type: 'fill',
                source: sourceId,
                filter: ['==', '$type', 'Polygon'],
                paint: {
                    'fill-color': ['coalesce', ['get', 'color'], '#ff0000'],
                    'fill-opacity': 0.3
                }
            }, beforeId);

            // Add polygon outline layer
            mapInstance.addLayer({
                id: layers.polygonOutline,
                type: 'line',
                source: sourceId,
                filter: ['==', '$type', 'Polygon'],
                paint: {
                    'line-color': ['coalesce', ['get', 'color'], '#ff0000'],
                    'line-width': 2
                }
            }, beforeId);

            // Add line layer
            mapInstance.addLayer({
                id: layers.line,
                type: 'line',
                source: sourceId,
                filter: ['==', '$type', 'LineString'],
                paint: {
                    'line-color': ['coalesce', ['get', 'color'], '#ff0000'],
                    'line-width': 2
                }
            }, beforeId);

            // Add point layer
            mapInstance.addLayer({
                id: layers.point,
                type: 'circle',
                source: sourceId,
                filter: ['==', '$type', 'Point'],
                paint: {
                    'circle-color': ['coalesce', ['get', 'color'], '#ff0000'],
                    'circle-radius': 6,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }
            }, beforeId);

            devLog('✅ GeoFeatures layers setup complete');
        } catch (error) {
            console.error('❌ Error setting up GeoFeatures layers:', error);
        }
    }, []);

    // Load GeoFeatures to map
    const loadGeoFeaturesToMap = useCallback(() => {
        devLog('🔄 loadGeoFeaturesToMap called', {
            hasMap: !!mapInstanceRef.current,
            showGeoFeatures,
            featuresCount: geoFeatures.length
        });

        if (!mapInstanceRef.current || !showGeoFeatures) {
            // Clear features if hidden
            if (mapInstanceRef.current) {
                try {
                    const sourceId = 'geo-features-source';
                    if (mapInstanceRef.current.getSource(sourceId)) {
                        mapInstanceRef.current.getSource(sourceId).setData({
                            type: 'FeatureCollection',
                            features: []
                        });
                    }
                } catch (err) {
                    // Ignore
                }
            }
            return;
        }

        // Đảm bảo map style đã load
        if (!mapInstanceRef.current.isStyleLoaded || !mapInstanceRef.current.isStyleLoaded()) {
            devLog('⏳ Map style not loaded, waiting...');
            mapInstanceRef.current.once('style.load', () => {
                devLog('✅ Map style loaded, retrying loadGeoFeaturesToMap...');
                setTimeout(() => {
                    loadGeoFeaturesToMap();
                }, 100);
            });
            return;
        }

        try {
            const sourceId = 'geo-features-source';
            const source = mapInstanceRef.current.getSource(sourceId);

            if (!source) {
                devLog('📝 Source not found, setting up layers...');
                setupGeoFeaturesLayers(mapInstanceRef.current);
                // Retry after setup
                setTimeout(() => {
                    loadGeoFeaturesToMap();
                }, 200);
                return;
            }

            // Convert geoFeatures to GeoJSON FeatureCollection - optimize
            // Filter out invalid features and optimize color processing
            const featuresForMap = geoFeatures
                .filter(feature => {
                    // Validate feature has required fields
                    return feature &&
                        feature.geometry &&
                        feature.geometry.coordinates &&
                        feature.properties &&
                        feature.properties.id;
                })
                .map(feature => {
                    let color = feature.properties?.color || '#ff0000';
                    if (!color.startsWith('#')) color = '#' + color;
                    if (color.length !== 7) color = '#ff0000';

                    return {
                        type: feature.type || 'Feature',
                        geometry: feature.geometry,
                        properties: {
                            ...feature.properties,
                            color: color,
                            id: feature.properties.id
                        }
                    };
                });

            const featureCollection = {
                type: 'FeatureCollection',
                features: featuresForMap
            };

            devLog('📊 FeatureCollection:', {
                featuresCount: featureCollection.features.length
            });

            // Update source data
            if (mapInstanceRef.current.getSource(sourceId)) {
                mapInstanceRef.current.getSource(sourceId).setData(featureCollection);
                devLog('✅ GeoFeatures loaded to map:', featureCollection.features.length, 'features');
            } else {
                devLog('⚠️ Source still not found, retrying...');
                setupGeoFeaturesLayers(mapInstanceRef.current);
                setTimeout(() => {
                    if (mapInstanceRef.current && mapInstanceRef.current.getSource(sourceId)) {
                        mapInstanceRef.current.getSource(sourceId).setData(featureCollection);
                        devLog('✅ GeoFeatures loaded to map (retry):', featureCollection.features.length, 'features');
                    } else {
                        console.error('❌ Failed to setup source after retry');
                    }
                }, 500);
            }
        } catch (error) {
            console.error('❌ Lỗi load GeoFeatures to map:', error);
        }
    }, [geoFeatures, showGeoFeatures, setupGeoFeaturesLayers]);

    // Setup layers when map loads
    useEffect(() => {
        if (mapInstanceRef.current) {
            setupGeoFeaturesLayers(mapInstanceRef.current);
        }
    }, [setupGeoFeaturesLayers]);

    // Load features when geoFeatures or showGeoFeatures changes
    useEffect(() => {
        if (mapInstanceRef.current && geoFeatures.length > 0) {
            devLog('🔄 GeoFeatures changed, reloading to map...', {
                featuresCount: geoFeatures.length,
                showGeoFeatures
            });
            const timer = setTimeout(() => {
                loadGeoFeaturesToMap();
            }, 300);
            return () => clearTimeout(timer);
        } else if (mapInstanceRef.current && geoFeatures.length === 0) {
            // Clear features if empty
            try {
                const sourceId = 'geo-features-source';
                if (mapInstanceRef.current.getSource(sourceId)) {
                    mapInstanceRef.current.getSource(sourceId).setData({
                        type: 'FeatureCollection',
                        features: []
                    });
                }
            } catch (err) {
                // Ignore
            }
        }
    }, [geoFeatures, showGeoFeatures, loadGeoFeaturesToMap]);

    // Xử lý click trên map để chọn tọa độ (chỉ dùng khi đang edit hoặc quick rescue)
    const handleMapClick = useCallback((event) => {
        if (editingRequest) {
            const { lng, lat } = event.lngLat
            setClickedCoords({ lat, lng })
            message.info(`Đã chọn tọa độ: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
            return
        }

        // Check if clicked on GeoFeature
        if (mapInstanceRef.current && showGeoFeatures) {
            const features = mapInstanceRef.current.queryRenderedFeatures(event.point, {
                layers: ['geo-features-polygon', 'geo-features-polygon-outline', 'geo-features-line', 'geo-features-point']
            })

            if (features.length > 0) {
                const feature = features[0]
                const props = feature.properties
                // Find full feature from state
                const fullFeature = geoFeatures.find(f => f.properties?.id === props.id)
                if (fullFeature) {
                    setSelectedGeoFeature(fullFeature)
                    setSelectedRescue(null) // Clear rescue selection
                    setSelectedPoint(null) // Clear safe point selection
                    setSelectedSupportRequest(null) // Clear support request selection
                }
            }
        }
    }, [editingRequest, showGeoFeatures, geoFeatures])

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
                    const rescueRes = await axios.get(`${API_URL}/api/rescue-requests?limit=10000`)
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

    // Handler lấy GPS location cho form thêm điểm tiếp nhận cứu trợ
    const handleGetCurrentLocationForReliefPoint = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const newLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    }
                    setAddReliefPointLocation(newLocation)
                    addReliefPointForm.setFieldsValue({
                        address: `${newLocation.lat.toFixed(6)}, ${newLocation.lng.toFixed(6)}`
                    })
                    message.success('Đã lấy vị trí GPS thành công!')
                },
                (error) => {
                    console.error('Lỗi lấy GPS:', error)
                    message.error('Không thể lấy vị trí GPS. Vui lòng chọn trên bản đồ.')
                }
            )
        } else {
            message.warning('Trình duyệt không hỗ trợ GPS. Vui lòng chọn trên bản đồ.')
        }
    }

    // Handler Google Maps URL change cho relief point
    const handleReliefPointGoogleMapsLinkChange = (e) => {
        const url = e.target.value.trim()
        setAddReliefPointGoogleMapsUrl(url)
        if (url) {
            const coords = parseGoogleMapsCoords(url)
            if (coords && Array.isArray(coords) && coords.length === 2) {
                const [lng, lat] = coords
                const locationObj = { lat, lng }
                setAddReliefPointParsedCoords(locationObj)
                setAddReliefPointLocation(locationObj)
                // Hiển thị thông báo thành công khi parse được tọa độ
                message.success(`✅ Đã tìm thấy tọa độ: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
            } else {
                setAddReliefPointParsedCoords(null)
                setAddReliefPointLocation(null)
            }
        } else {
            setAddReliefPointParsedCoords(null)
            setAddReliefPointLocation(null)
        }
    }

    // Handler submit form thêm điểm tiếp nhận cứu trợ
    const handleAddReliefPointSubmit = async (values) => {
        try {
            setAddReliefPointLoading(true)

            // Validate location - ưu tiên Google Maps URL, sau đó location picker
            let finalLocation = null
            if (addReliefPointGoogleMapsUrl && addReliefPointParsedCoords) {
                finalLocation = addReliefPointParsedCoords
            } else if (addReliefPointLocation && addReliefPointLocation.lat && addReliefPointLocation.lng) {
                finalLocation = addReliefPointLocation
            }

            if (!finalLocation) {
                message.error('Vui lòng dán link Google Maps hoặc chọn vị trí trên bản đồ!')
                setAddReliefPointLoading(false)
                return
            }

            // Validate description
            if (!values.description || values.description.trim().length === 0) {
                message.error('Vui lòng nhập thông tin về điểm tiếp nhận cứu trợ!')
                setAddReliefPointLoading(false)
                return
            }

            // Validate reliefType - phải là array
            let reliefTypes = values.reliefType
            if (!Array.isArray(reliefTypes) || reliefTypes.length === 0) {
                message.error('Vui lòng chọn ít nhất một loại cứu trợ!')
                setAddReliefPointLoading(false)
                return
            }

            // Xử lý type - nếu là array thì lấy phần tử đầu tiên
            let finalType = values.type;
            if (Array.isArray(finalType)) {
                finalType = finalType.length > 0 ? finalType[0] : 'Điểm tiếp nhận cứu trợ';
            }

            // Tạo relief point data
            const reliefPointData = {
                name: values.name || 'Điểm tiếp nhận cứu trợ',
                address: values.address || `${finalLocation.lat.toFixed(6)}, ${finalLocation.lng.toFixed(6)}`,
                phone: values.phone || null,
                description: values.description.trim(),
                type: finalType || 'Điểm tiếp nhận cứu trợ',
                reliefType: reliefTypes,
                operatingHours: values.operatingHours || null,
                contactPerson: values.contactPerson || null,
                status: 'Hoạt động',
                notes: values.notes || null,
                googleMapsUrl: addReliefPointGoogleMapsUrl || null,
                location: finalLocation
            }

            // Gửi request
            const response = await axios.post(`${API_URL}/api/relief-points`, reliefPointData)

            if (response.data && response.data.success) {
                message.success('Đã thêm điểm tiếp nhận cứu trợ thành công!')

                // Refresh danh sách relief points
                try {
                    const reliefRes = await axios.get(`${API_URL}/api/relief-points`)
                    if (reliefRes.data && reliefRes.data.success && Array.isArray(reliefRes.data.data)) {
                        setReliefPoints(reliefRes.data.data)
                    }
                } catch (refreshError) {
                    console.error('Lỗi refresh danh sách:', refreshError)
                }

                // Đóng modal và reset form
                setAddReliefPointModalVisible(false)
                addReliefPointForm.resetFields()
                setAddReliefPointLocation(null)
                setAddReliefPointGoogleMapsUrl('')
                setAddReliefPointParsedCoords(null)
            } else {
                message.error(response.data?.message || 'Thêm điểm tiếp nhận cứu trợ thất bại')
            }
        } catch (error) {
            console.error('Lỗi thêm điểm tiếp nhận cứu trợ:', error)
            const errorMessage = error.response?.data?.message ||
                error.message ||
                'Lỗi khi thêm điểm tiếp nhận cứu trợ. Vui lòng thử lại.'
            message.error(errorMessage)
        } finally {
            setAddReliefPointLoading(false)
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

            // Resize và convert ảnh sang base64 nếu có
            let imageBase64 = null
            if (quickRescueImageFile) {
                try {
                    const processingMessage = message.loading('Đang xử lý và nén ảnh...', 0);
                    imageBase64 = await resizeImageForUpload(quickRescueImageFile);
                    processingMessage();
                } catch (imgError) {
                    console.error('Lỗi xử lý ảnh:', imgError)
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
                    const rescueRes = await axios.get(`${API_URL}/api/rescue-requests?limit=10000`)
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
                const errorData = error.response.data
                if (errorData?.isDuplicate) {
                    message.warning(`⚠️ ${errorData.message || 'Báo cáo này có vẻ trùng lặp với báo cáo đã có. Vui lòng kiểm tra lại!'}`)
                } else {
                    message.error(`Lỗi: ${errorData?.message || error.message}`)
                }
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

    // Handler mở modal support request
    const openSupportRequestModal = () => {
        setSupportRequestModalVisible(true)
        // Lấy vị trí hiện tại từ map center nếu có
        if (viewState.latitude && viewState.longitude) {
            setSupportRequestLocation({
                lat: viewState.latitude,
                lng: viewState.longitude
            })
        }
    }

    // Handler đóng modal support request
    const closeSupportRequestModal = () => {
        setSupportRequestModalVisible(false)
        supportRequestForm.resetFields()
        setSupportRequestLocation(null)
        setSupportRequestImageFile(null)
        setSupportRequestGoogleMapsUrl('')
        setSupportRequestParsedCoords(null)
    }

    // Hotline modal handlers
    const openHotlineModal = () => {
        setHotlineModalVisible(true)
    }

    const closeHotlineModal = () => {
        setHotlineModalVisible(false)
    }

    // Handler chọn vị trí từ GPS cho support request
    const handleGetCurrentLocationForSupportRequest = () => {
        if (navigator.geolocation) {
            setSupportRequestLoading(true)
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const newLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    }
                    setSupportRequestLocation(newLocation)
                    setViewState(prev => ({
                        ...prev,
                        longitude: newLocation.lng,
                        latitude: newLocation.lat,
                        zoom: 15
                    }))
                    message.success('Đã lấy vị trí GPS thành công!')
                    setSupportRequestLoading(false)
                },
                (error) => {
                    console.error('Lỗi GPS:', error)
                    message.warning('Không thể lấy vị trí GPS. Vui lòng chọn trên bản đồ.')
                    setSupportRequestLoading(false)
                }
            )
        } else {
            message.warning('Trình duyệt không hỗ trợ GPS. Vui lòng chọn trên bản đồ.')
        }
    }

    // Handler upload ảnh cho support request
    const handleSupportRequestImageChange = (info) => {
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
            setSupportRequestImageFile(file)
            message.success(`Đã chọn ảnh: ${file.name}`)
        } else {
            if (info.fileList && info.fileList.length === 0) {
                setSupportRequestImageFile(null)
            }
        }
    }

    // Handler Google Maps URL change cho support request
    const handleSupportRequestGoogleMapsLinkChange = (e) => {
        const url = e.target.value.trim()
        setSupportRequestGoogleMapsUrl(url)
        if (url) {
            const coords = parseGoogleMapsCoords(url)
            if (coords && Array.isArray(coords) && coords.length === 2) {
                const [lng, lat] = coords
                const locationObj = { lat, lng }
                setSupportRequestParsedCoords(locationObj)
                setSupportRequestLocation(locationObj)
                message.success(`✅ Đã tìm thấy tọa độ: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
            } else {
                setSupportRequestParsedCoords(null)
            }
        } else {
            setSupportRequestParsedCoords(null)
        }
    }

    // Handler submit support request form
    const handleSupportRequestSubmit = async (values) => {
        try {
            setSupportRequestLoading(true)

            // Validate
            if (!values.description || values.description.trim().length === 0) {
                message.error('Vui lòng nhập mô tả nhu cầu hỗ trợ!')
                setSupportRequestLoading(false)
                return
            }

            if (!values.needs || !Array.isArray(values.needs) || values.needs.length === 0) {
                message.error('Vui lòng chọn ít nhất một loại hỗ trợ cần thiết!')
                setSupportRequestLoading(false)
                return
            }

            // Resize và convert ảnh sang base64 nếu có
            let imageBase64 = null
            if (supportRequestImageFile) {
                try {
                    const processingMessage = message.loading('Đang xử lý và nén ảnh...', 0);
                    imageBase64 = await resizeImageForUpload(supportRequestImageFile);
                    processingMessage();
                } catch (imgError) {
                    console.error('Lỗi xử lý ảnh:', imgError)
                    message.warning('Không thể xử lý ảnh, sẽ gửi yêu cầu không có ảnh')
                }
            }

            // Ưu tiên dùng tọa độ từ Google Maps link
            const finalLocation = supportRequestParsedCoords || supportRequestLocation || { lat: null, lng: null }

            const supportData = {
                location: finalLocation,
                description: values.description || '',
                imageBase64: imageBase64,
                phone: values.phone || '',
                name: values.name || '',
                googleMapsUrl: supportRequestGoogleMapsUrl || null,
                needs: values.needs || [],
                peopleCount: values.peopleCount || 1
            }

            const response = await axios.post(`${API_URL}/api/support-requests`, supportData, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (response.data && response.data.success) {
                message.success('Đã gửi thành công yêu cầu hỗ trợ!')
                supportRequestForm.resetFields()
                setSupportRequestLocation(null)
                setSupportRequestImageFile(null)
                setSupportRequestParsedCoords(null)
                setSupportRequestGoogleMapsUrl('')
                setSupportRequestModalVisible(false)

                // Refresh danh sách support requests
                try {
                    const supportRes = await axios.get(`${API_URL}/api/support-requests?limit=10000`)
                    if (supportRes.data && supportRes.data.success) {
                        setSupportRequests(supportRes.data.data)
                    }
                } catch (refreshError) {
                    console.error('Lỗi refresh danh sách support requests:', refreshError)
                }
            }
        } catch (error) {
            console.error('Lỗi gửi support request:', error)
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
        } finally {
            setSupportRequestLoading(false)
        }
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
            } else if (locationPickerContext === 'addReliefPoint') {
                setAddReliefPointLocation(locationPickerSelected)
                addReliefPointForm.setFieldsValue({
                    address: `${locationPickerSelected.lat.toFixed(6)}, ${locationPickerSelected.lng.toFixed(6)}`
                })
            } else if (locationPickerContext === 'supportRequest') {
                setSupportRequestLocation(locationPickerSelected)
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
                            onClick={() => {
                                setActiveFilter('all')
                                setSidebarPagination({ current: 1, pageSize: sidebarPagination.pageSize })
                            }}
                        >
                            <span>📋</span>
                            <span>Tất cả ({filterCounts.all})</span>
                        </button>
                        <button
                            className={`map-tab-button support ${activeFilter === 'support' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveFilter('support')
                                setSidebarPagination({ current: 1, pageSize: sidebarPagination.pageSize })
                            }}
                        >
                            <span>🎁</span>
                            <span>Hỗ trợ ({filterCounts.support || 0})</span>
                        </button>
                        <button
                            className={`map-tab-button rescue ${activeFilter === 'rescue' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveFilter('rescue')
                                setSidebarPagination({ current: 1, pageSize: sidebarPagination.pageSize })
                            }}
                        >
                            <span>🆘</span>
                            <span>Cần cứu ({filterCounts.rescue})</span>
                        </button>
                        <button
                            className={`map-tab-button news ${activeFilter === 'news' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveFilter('news')
                                setSidebarPagination({ current: 1, pageSize: sidebarPagination.pageSize })
                            }}
                        >
                            <span>📰</span>
                            <span>Tin tức mới ({filterCounts.news})</span>
                        </button>
                        <button
                            className={`map-tab-button geofeatures ${activeFilter === 'geofeatures' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveFilter('geofeatures')
                                setSidebarPagination({ current: 1, pageSize: sidebarPagination.pageSize })
                            }}
                        >
                            <span>🗺️</span>
                            <span>Đối tượng bản đồ ({filterCounts.geoFeatures})</span>
                        </button>
                        <button
                            className={`map-tab-button safe ${activeFilter === 'safe' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveFilter('safe')
                                setSidebarPagination({ current: 1, pageSize: sidebarPagination.pageSize })
                            }}
                        >
                            <span>🚁</span>
                            <span>Đội cứu ({filterCounts.safe})</span>
                        </button>
                        <button
                            className={`map-tab-button relief ${activeFilter === 'relief' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveFilter('relief')
                                setSidebarPagination({ current: 1, pageSize: sidebarPagination.pageSize })
                            }}
                        >
                            <span>📦</span>
                            <span>Cứu trợ ({filterCounts.relief})</span>
                        </button>
                        <button
                            className={`map-tab-button thuydien ${activeFilter === 'thuydien' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveFilter('thuydien')
                                setSidebarPagination({ current: 1, pageSize: sidebarPagination.pageSize })
                            }}
                        >
                            <span>⚡</span>
                            <span>Hồ thủy điện ({filterCounts.thuydien})</span>
                        </button>
                        <button
                            className={`map-tab-button waterlevel ${activeFilter === 'waterlevel' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveFilter('waterlevel')
                                setSidebarPagination({ current: 1, pageSize: sidebarPagination.pageSize })
                            }}
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
                                onChange={(e) => {
                                    setSearchText(e.target.value)
                                    setSidebarPagination({ current: 1, pageSize: sidebarPagination.pageSize })
                                }}
                            />
                        </div>

                        {/* List items */}
                        <div style={{ marginBottom: '16px' }}>
                            <Text strong style={{ fontSize: '14px', color: '#666' }}>
                                {activeFilter === 'rescue' ? 'Cầu cứu' :
                                    activeFilter === 'safe' ? 'Đội cứu hộ' :
                                        activeFilter === 'support' ? 'Yêu cầu hỗ trợ' :
                                            activeFilter === 'thuydien' ? 'Hồ thủy điện' :
                                                activeFilter === 'waterlevel' ? 'Trạm mực nước' :
                                                    activeFilter === 'news' ? 'Tin tức mới' :
                                                        activeFilter === 'geofeatures' ? 'Đối tượng bản đồ' : 'Tất cả'} ({sidebarItems.length})
                            </Text>
                            {sidebarItems.length > sidebarPagination.pageSize && (
                                <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '4px' }}>
                                    Hiển thị {sidebarPagination.pageSize} mục mỗi trang để tối ưu hiệu năng
                                </Text>
                            )}
                        </div>

                        {sidebarItems.length === 0 ? (
                            <Empty description={
                                activeFilter === 'safe' ? 'Trống' :
                                    activeFilter === 'support' ? 'Không có yêu cầu hỗ trợ nào' :
                                        activeFilter === 'thuydien' ? 'Không có hồ thủy điện nào' :
                                            activeFilter === 'waterlevel' ? 'Không có trạm mực nước nào' :
                                                activeFilter === 'news' ? 'Không có tin tức nào' :
                                                    activeFilter === 'geofeatures' ? 'Không có đối tượng bản đồ nào' :
                                                        'Không có cầu cứu nào'
                            } style={{ marginTop: '40px' }} />
                        ) : (
                            <List
                                dataSource={sidebarItems}
                                itemLayout="vertical"
                                style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}
                                pagination={{
                                    current: sidebarPagination.current,
                                    pageSize: sidebarPagination.pageSize,
                                    total: sidebarItems.length,
                                    showSizeChanger: true,
                                    showQuickJumper: true,
                                    showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} mục`,
                                    pageSizeOptions: ['10', '20', '50', '100'],
                                    onChange: (page, pageSize) => {
                                        setSidebarPagination({ current: page, pageSize })
                                        // Scroll to top khi đổi trang
                                        const sidebarContent = document.querySelector('.sidebar-content')
                                        if (sidebarContent) {
                                            sidebarContent.scrollTop = 0
                                        }
                                    },
                                    onShowSizeChange: (current, size) => {
                                        setSidebarPagination({ current: 1, pageSize: size })
                                        const sidebarContent = document.querySelector('.sidebar-content')
                                        if (sidebarContent) {
                                            sidebarContent.scrollTop = 0
                                        }
                                    }
                                }}
                                renderItem={(item) => {
                                    // Support request items
                                    if (item.type === 'support' && item.supportRequest) {
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
                                                        setSelectedSupportRequest(item.supportRequest)
                                                        setSelectedRescue(null)
                                                        setSelectedPoint(null)
                                                        setSelectedGeoFeature(null)
                                                        setSelectedListItem(item._id || item.id)
                                                        if (isMobile) {
                                                            setSidebarOpen(false)
                                                        }
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
                                                    {item.needs && item.needs.map((need, idx) => (
                                                        <Tag key={idx} color="blue" style={{ fontSize: '12px', margin: 0 }}>
                                                            {need}
                                                        </Tag>
                                                    ))}
                                                    <Tag color={
                                                        item.status === 'Chưa xử lý' ? 'red' :
                                                            item.status === 'Đang xử lý' ? 'orange' :
                                                                'green'
                                                    } style={{ fontSize: '12px', margin: 0 }}>
                                                        {item.status || 'Chưa xử lý'}
                                                    </Tag>
                                                    {item.timestamp && (
                                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                                            {formatTime(item.timestamp)}
                                                        </Text>
                                                    )}
                                                </Space>
                                                <Text strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                                    {item.name || 'Yêu cầu hỗ trợ'}
                                                </Text>
                                                {item.description && (
                                                    <Text style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                                                        {item.description.substring(0, 150)}
                                                        {item.description.length > 150 && '...'}
                                                    </Text>
                                                )}
                                                {item.peopleCount && (
                                                    <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
                                                        👥 Số người: {item.peopleCount}
                                                    </Text>
                                                )}
                                                {item.phone && (
                                                    <Button
                                                        size="small"
                                                        type="link"
                                                        icon={<PhoneOutlined />}
                                                        href={`tel:${item.phone.replace(/\./g, '')}`}
                                                        style={{ padding: 0, fontSize: '12px' }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {item.phone}
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
                                                        style={{ padding: 0, fontSize: '12px', marginTop: '8px' }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        Xem trên Google Map
                                                    </Button>
                                                )}
                                            </List.Item>
                                        )
                                    }
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
                                    // GeoFeatures items
                                    if (item.type === 'geofeature' && item.geoFeature) {
                                        const geoFeature = item.geoFeature
                                        const statusColor = item.status === 'Hoạt động' ? 'red' :
                                            item.status === 'Đã xử lý' ? 'green' : 'default'
                                        const severityColor = item.severity === 'Cao' ? 'red' :
                                            item.severity === 'Trung bình' ? 'orange' : 'green'

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
                                                        setSelectedGeoFeature(geoFeature)
                                                    } else {
                                                        message.warning('Không có tọa độ hợp lệ cho đối tượng này')
                                                    }
                                                    if (isMobile) {
                                                        setSidebarOpen(false)
                                                    }
                                                }}
                                                style={{
                                                    cursor: 'pointer',
                                                    padding: '12px',
                                                    marginBottom: '8px',
                                                    borderRadius: '8px',
                                                    border: selectedListItem === (item._id || item.id) ? `2px solid ${item.color || '#1890ff'}` : '1px solid #f0f0f0',
                                                    background: selectedListItem === (item._id || item.id) ? `${item.color || '#1890ff'}15` : '#fff',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {item.coords && item.coords[0] && item.coords[1] && (
                                                    <div style={{ marginBottom: '8px', borderRadius: '6px', overflow: 'hidden' }}>
                                                        <img
                                                            src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+${(item.color || '#1890ff').replace('#', '')}(${item.coords[0]},${item.coords[1]})/${item.coords[0]},${item.coords[1]},13,0/200x120?access_token=${MAPBOX_TOKEN}`}
                                                            alt="Map thumbnail"
                                                            style={{ width: '100%', height: '120px', objectFit: 'cover' }}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none'
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                                <Space style={{ marginBottom: '8px' }} wrap>
                                                    <Tag color={statusColor}>
                                                        {item.category || 'Đối tượng bản đồ'}
                                                    </Tag>
                                                    {item.status && (
                                                        <Tag color={statusColor === 'red' ? 'red' : statusColor === 'green' ? 'green' : 'default'}>
                                                            {item.status}
                                                        </Tag>
                                                    )}
                                                    {item.severity && (
                                                        <Tag color={severityColor}>
                                                            {item.severity}
                                                        </Tag>
                                                    )}
                                                    {item.geometryType && (
                                                        <Tag>
                                                            {item.geometryType === 'Point' ? 'Điểm' :
                                                                item.geometryType === 'LineString' ? 'Đường' :
                                                                    item.geometryType === 'Polygon' ? 'Vùng' : item.geometryType}
                                                        </Tag>
                                                    )}
                                                </Space>
                                                <Text strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                                    {item.location}
                                                </Text>
                                                {item.description && (
                                                    <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
                                                        {item.description}
                                                    </Text>
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
                                                        Xem trên Google Map
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
                                    // Tin tức items
                                    if (item.type === 'news' && item.news) {
                                        const categoryColors = {
                                            'thông báo khẩn': 'red',
                                            'hướng dẫn': 'blue',
                                            'cập nhật tình hình': 'green'
                                        }
                                        const categoryLabels = {
                                            'thông báo khẩn': 'Thông báo khẩn',
                                            'hướng dẫn': 'Hướng dẫn',
                                            'cập nhật tình hình': 'Cập nhật tình hình'
                                        }
                                        const isUrgent = item.category === 'thông báo khẩn'
                                        const borderColor = isUrgent
                                            ? (selectedListItem === (item._id || item.id) ? '#dc2626' : '#ef4444')
                                            : (selectedListItem === (item._id || item.id) ? '#1890ff' : '#e5e7eb')
                                        const bgColor = isUrgent
                                            ? (selectedListItem === (item._id || item.id) ? '#fef2f2' : '#fff')
                                            : (selectedListItem === (item._id || item.id) ? '#f0f8ff' : '#fff')

                                        return (
                                            <List.Item
                                                className={`news-list-item ${isUrgent ? 'news-urgent' : ''} ${selectedListItem === (item._id || item.id) ? 'selected' : ''}`}
                                                onClick={() => {
                                                    setSelectedListItem(item._id || item.id)
                                                    if (isMobile) {
                                                        setSidebarOpen(false)
                                                    }
                                                }}
                                                style={{
                                                    cursor: 'pointer',
                                                    padding: '16px',
                                                    marginBottom: '12px',
                                                    borderRadius: '12px',
                                                    border: `2px solid ${borderColor}`,
                                                    background: bgColor,
                                                    transition: 'all 0.3s ease',
                                                    boxShadow: selectedListItem === (item._id || item.id)
                                                        ? (isUrgent ? '0 4px 16px rgba(220, 38, 38, 0.2)' : '0 4px 16px rgba(24, 144, 255, 0.15)')
                                                        : '0 2px 8px rgba(0, 0, 0, 0.08)'
                                                }}
                                            >
                                                {/* Preview hình ảnh - fit cố định với styling đẹp hơn và có thể click để xem to */}
                                                {item.imageUrl && (
                                                    <div
                                                        className="news-image-wrapper"
                                                        style={{
                                                            marginBottom: '12px',
                                                            borderRadius: '10px',
                                                            overflow: 'hidden',
                                                            width: '100%',
                                                            height: '220px',
                                                            background: '#f5f5f5',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                                                            position: 'relative',
                                                            cursor: 'pointer'
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                        }}
                                                    >
                                                        <Image
                                                            src={item.imageUrl}
                                                            alt={item.title}
                                                            preview={{
                                                                mask: '🔍 Xem ảnh',
                                                                maskClassName: 'news-image-preview-mask'
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                height: '100%',
                                                                objectFit: 'cover'
                                                            }}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none'
                                                            }}
                                                        />
                                                    </div>
                                                )}

                                                {/* Tag và thời gian */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginBottom: '12px',
                                                    flexWrap: 'wrap',
                                                    gap: '8px'
                                                }}>
                                                    <Space wrap>
                                                        <Tag
                                                            color={categoryColors[item.category] || 'default'}
                                                            style={{
                                                                margin: 0,
                                                                fontSize: '12px',
                                                                padding: '4px 12px',
                                                                borderRadius: '6px',
                                                                fontWeight: 600,
                                                                border: isUrgent ? '1px solid #dc2626' : 'none'
                                                            }}
                                                        >
                                                            {categoryLabels[item.category] || item.category}
                                                        </Tag>
                                                        {item.timestamp && (
                                                            <Text type="secondary" style={{ fontSize: '12px', color: '#6b7280' }}>
                                                                <ClockCircleOutlined style={{ marginRight: '4px' }} />
                                                                {formatTime(item.timestamp)}
                                                            </Text>
                                                        )}
                                                    </Space>
                                                    {item.views > 0 && (
                                                        <Text type="secondary" style={{ fontSize: '12px', color: '#9ca3af' }}>
                                                            👁️ {item.views}
                                                        </Text>
                                                    )}
                                                </div>

                                                {/* Tiêu đề */}
                                                <Text strong style={{
                                                    fontSize: '18px',
                                                    display: 'block',
                                                    marginBottom: '10px',
                                                    color: isUrgent ? '#dc2626' : '#1f2937',
                                                    lineHeight: '1.4',
                                                    fontWeight: 700
                                                }}>
                                                    {item.title}
                                                </Text>

                                                {/* Nội dung */}
                                                {item.content && (
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <Text style={{
                                                            fontSize: '14px',
                                                            display: 'block',
                                                            color: '#4b5563',
                                                            lineHeight: '1.6',
                                                            whiteSpace: 'pre-wrap',
                                                            wordWrap: 'break-word'
                                                        }}>
                                                            {item.content.length > 250 && !expandedNewsItems.has(item._id || item.id)
                                                                ? `${item.content.substring(0, 250)}...`
                                                                : item.content
                                                            }
                                                        </Text>
                                                        {item.content.length > 250 && (
                                                            <Button
                                                                type="link"
                                                                size="small"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    const itemId = item._id || item.id
                                                                    if (expandedNewsItems.has(itemId)) {
                                                                        // Thu gọn
                                                                        setExpandedNewsItems(prev => {
                                                                            const newSet = new Set(prev)
                                                                            newSet.delete(itemId)
                                                                            return newSet
                                                                        })
                                                                    } else {
                                                                        // Mở rộng
                                                                        setExpandedNewsItems(prev => new Set(prev).add(itemId))
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '4px 0',
                                                                    height: 'auto',
                                                                    fontSize: '13px',
                                                                    color: '#1890ff',
                                                                    marginTop: '4px'
                                                                }}
                                                            >
                                                                {expandedNewsItems.has(item._id || item.id) ? 'Thu gọn' : 'Xem thêm'}
                                                            </Button>
                                                        )}
                                                        {item.content.length > 500 && (
                                                            <Button
                                                                type="link"
                                                                size="small"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setSelectedNewsItem(item)
                                                                    setNewsDetailModalVisible(true)
                                                                }}
                                                                style={{
                                                                    padding: '4px 0',
                                                                    height: 'auto',
                                                                    fontSize: '13px',
                                                                    color: '#1890ff',
                                                                    marginLeft: '12px'
                                                                }}
                                                            >
                                                                Xem toàn bộ
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Footer: Tác giả và Link nguồn */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginTop: '12px',
                                                    paddingTop: '12px',
                                                    borderTop: '1px solid #e5e7eb',
                                                    flexWrap: 'wrap',
                                                    gap: '8px'
                                                }}>
                                                    {item.author && (
                                                        <Text type="secondary" style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <UserOutlined /> {item.author}
                                                        </Text>
                                                    )}
                                                    {item.sourceUrl && (
                                                        <Button
                                                            size="small"
                                                            type="link"
                                                            icon={<GlobalOutlined />}
                                                            href={item.sourceUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{
                                                                padding: 0,
                                                                fontSize: '12px',
                                                                height: 'auto',
                                                                color: '#1890ff'
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            Xem nguồn
                                                        </Button>
                                                    )}
                                                </div>
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
                                                            href={getGoogleMapsLink(item.coords)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
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

                        {/* Nút thêm điểm tiếp nhận cứu trợ (chỉ hiển thị khi tab Cứu trợ) */}
                        {activeFilter === 'relief' && (
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                block
                                size="large"
                                style={{ marginTop: '16px', height: '48px', background: '#52c41a', borderColor: '#52c41a' }}
                                onClick={() => {
                                    setAddReliefPointModalVisible(true)
                                    addReliefPointForm.resetFields()
                                    setAddReliefPointLocation(null)
                                }}
                            >
                                Thêm điểm tiếp nhận cứu trợ
                            </Button>
                        )}

                        {/* Nút Gửi phản ánh (chỉ hiển thị khi không phải tab Đội cứu và Cứu trợ) */}
                        {activeFilter !== 'safe' && activeFilter !== 'relief' && (
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
                                onLoad={(evt) => {
                                    // Store map instance when map loads
                                    mapInstanceRef.current = evt.target;
                                    devLog('✅ Map loaded, setting up GeoFeatures layers...');

                                    // Wait for style to load first
                                    const setupLayersAndLoadFeatures = () => {
                                        devLog('✅ Map style ready, setting up GeoFeatures layers...');
                                        // Setup GeoFeatures layers after style is ready
                                        setTimeout(() => {
                                            setupGeoFeaturesLayers(evt.target);
                                            // Load features after layers are setup
                                            setTimeout(() => {
                                                loadGeoFeaturesToMap();
                                            }, 300);
                                        }, 300);
                                    };

                                    if (!evt.target.isStyleLoaded || !evt.target.isStyleLoaded()) {
                                        evt.target.once('style.load', setupLayersAndLoadFeatures);
                                    } else {
                                        // Style already loaded
                                        setupLayersAndLoadFeatures();
                                    }
                                }}
                                style={{ width: '100%', height: 'calc(100vh - 64px)' }}
                                mapStyle="mapbox://styles/mapbox/streets-v12"
                                cursor={editingRequest ? "crosshair" : "default"}
                            >
                                {/* Radar Overlay */}
                                <RadarOverlay visible={radarOverlayVisible} offset={0} mapInstance={mapInstanceRef.current} />

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
                                {/* Markers điểm trú ẩn - chỉ hiển thị khi filter = all, safe, hoặc news (tin tức không liên quan bản đồ nên vẫn hiển thị markers) */}
                                {(activeFilter === 'all' || activeFilter === 'safe' || activeFilter === 'news') && safePoints
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

                                {/* Markers điểm tiếp nhận cứu trợ - chỉ hiển thị khi filter = all, relief, hoặc news */}
                                {(activeFilter === 'all' || activeFilter === 'relief' || activeFilter === 'news') && reliefPoints
                                    .filter(point => point && typeof point.lng === 'number' && typeof point.lat === 'number' &&
                                        !isNaN(point.lng) && !isNaN(point.lat) &&
                                        point.lng >= -180 && point.lng <= 180 && point.lat >= -90 && point.lat <= 90)
                                    .map((point) => (
                                        <Marker
                                            key={`relief-${point._id || point.id}`}
                                            longitude={point.lng}
                                            latitude={point.lat}
                                            anchor="bottom"
                                            onClick={() => handleMarkerClick(point, 'relief')}
                                        >
                                            <div className="custom-marker relief-marker">
                                                <GiftOutlined style={{ fontSize: '20px', color: '#52c41a' }} />
                                            </div>
                                        </Marker>
                                    ))}

                                {/* Flood areas markers đã bị loại bỏ - không còn hiển thị */}

                                {/* Water Level Station Markers - chỉ hiển thị khi filter = all, waterlevel, hoặc news (tin tức không liên quan bản đồ nên vẫn hiển thị markers) */}
                                {(activeFilter === 'all' || activeFilter === 'waterlevel' || activeFilter === 'news') && waterLevelStations
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

                                {/* Thủy điện (Reservoir) Markers - chỉ hiển thị khi filter = all, thuydien, hoặc news (tin tức không liên quan bản đồ nên vẫn hiển thị markers) */}
                                {(activeFilter === 'all' || activeFilter === 'thuydien' || activeFilter === 'news') && (() => {
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

                                {/* Clustered markers cầu cứu từ người dân - chỉ hiển thị khi filter = all, rescue, hoặc news (tin tức không liên quan bản đồ nên vẫn hiển thị markers) */}
                                {(activeFilter === 'all' || activeFilter === 'rescue' || activeFilter === 'news') && clusters.map((cluster) => {
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

                                {/* Markers yêu cầu hỗ trợ - marker màu xanh dương */}
                                {supportRequests
                                    .filter(req => req.location && req.location.lat && req.location.lng &&
                                        (activeFilter === 'all' || activeFilter === 'support'))
                                    .map((request) => (
                                        <Marker
                                            key={`support-${request._id || request.id}`}
                                            longitude={request.location.lng}
                                            latitude={request.location.lat}
                                            anchor="bottom"
                                            onClick={() => handleSupportRequestClick(request)}
                                        >
                                            <div className={`custom-marker support-marker ${selectedListItem === (request._id || request.id) ? 'selected-marker' : ''}`}>
                                                <span style={{ fontSize: '22px', display: 'inline-block', lineHeight: '1' }}>🎁</span>
                                            </div>
                                        </Marker>
                                    ))}

                                {/* Popup điểm trú ẩn/điểm tiếp nhận cứu trợ */}
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
                                            <Text type="secondary">{selectedPoint.address}</Text>

                                            {/* Thông tin cho safe points */}
                                            {selectedPoint.type === 'safe' && (
                                                <div style={{ marginTop: 8 }}>
                                                    <Text>Sức chứa: {selectedPoint.capacity || 'Không có thông tin'} người</Text>
                                                    {selectedPoint.rescueType && (
                                                        <div style={{ marginTop: 4 }}>
                                                            <Text type="secondary">Loại: {selectedPoint.rescueType}</Text>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Thông tin cho relief points */}
                                            {selectedPoint.type === 'relief' && (
                                                <div style={{ marginTop: 8 }}>
                                                    <div>
                                                        <Text strong>Loại cứu trợ: </Text>
                                                        <Space wrap>
                                                            {Array.isArray(selectedPoint.reliefType)
                                                                ? selectedPoint.reliefType.map((type, idx) => (
                                                                    <Tag key={idx} color="green">{type}</Tag>
                                                                ))
                                                                : <Tag color="green">{selectedPoint.reliefType || 'Hỗn hợp'}</Tag>
                                                            }
                                                        </Space>
                                                    </div>
                                                    {selectedPoint.capacity > 0 && (
                                                        <div style={{ marginTop: 4 }}>
                                                            <Text>
                                                                Số người: {selectedPoint.currentOccupancy || 0}/{selectedPoint.capacity}
                                                            </Text>
                                                            {selectedPoint.currentOccupancy >= selectedPoint.capacity && (
                                                                <Tag color="red" style={{ marginLeft: 8 }}>ĐẦY</Tag>
                                                            )}
                                                        </div>
                                                    )}
                                                    {selectedPoint.operatingHours && (
                                                        <div style={{ marginTop: 4 }}>
                                                            <Text type="secondary">Giờ hoạt động: {selectedPoint.operatingHours}</Text>
                                                        </div>
                                                    )}
                                                    {selectedPoint.contactPerson && (
                                                        <div style={{ marginTop: 4 }}>
                                                            <Text type="secondary">Người phụ trách: {selectedPoint.contactPerson}</Text>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

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

                                {/* Popup GeoFeature */}
                                {selectedGeoFeature && selectedGeoFeature.geometry && (() => {
                                    let lng, lat;
                                    if (selectedGeoFeature.geometry.type === 'Point') {
                                        lng = selectedGeoFeature.geometry.coordinates[0];
                                        lat = selectedGeoFeature.geometry.coordinates[1];
                                    } else if (selectedGeoFeature.geometry.type === 'LineString') {
                                        const coords = selectedGeoFeature.geometry.coordinates;
                                        lng = coords[Math.floor(coords.length / 2)][0];
                                        lat = coords[Math.floor(coords.length / 2)][1];
                                    } else if (selectedGeoFeature.geometry.type === 'Polygon') {
                                        const ring = selectedGeoFeature.geometry.coordinates[0];
                                        const midIndex = Math.floor(ring.length / 2);
                                        lng = ring[midIndex][0];
                                        lat = ring[midIndex][1];
                                    }
                                    return lng && lat ? (
                                        <Popup
                                            key={`geofeature-popup-${selectedGeoFeature._id || selectedGeoFeature.properties?.id}`}
                                            longitude={lng}
                                            latitude={lat}
                                            anchor="bottom"
                                            onClose={() => setSelectedGeoFeature(null)}
                                            closeButton={true}
                                            closeOnClick={true}
                                            maxWidth={isMobile ? '90vw' : '450px'}
                                            style={{ zIndex: 1000 }}
                                        >
                                            <div className="popup-content" style={{
                                                maxWidth: isMobile ? '85vw' : '400px',
                                                maxHeight: isMobile ? '50vh' : '600px',
                                                overflowY: 'auto',
                                                padding: isMobile ? '8px' : '12px'
                                            }}>
                                                <Title level={isMobile ? 4 : 5} style={{
                                                    marginBottom: isMobile ? '8px' : '12px',
                                                    color: '#1890ff',
                                                    fontSize: isMobile ? '14px' : '16px'
                                                }}>
                                                    {selectedGeoFeature.properties?.name || 'Không có tên'}
                                                </Title>
                                                <Space direction="vertical" size={isMobile ? 'small' : 'middle'} style={{ width: '100%' }}>
                                                    {/* Tags */}
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        <Tag color={
                                                            selectedGeoFeature.properties?.category?.includes('nguy hiểm') ? 'red' :
                                                                selectedGeoFeature.properties?.category?.includes('an toàn') ? 'green' :
                                                                    selectedGeoFeature.properties?.category?.includes('cứu hộ') ? 'blue' :
                                                                        'default'
                                                        } style={{ fontSize: isMobile ? '11px' : '12px', margin: 0 }}>
                                                            {selectedGeoFeature.properties?.category || 'N/A'}
                                                        </Tag>
                                                        <Tag color={
                                                            selectedGeoFeature.properties?.severity === 'Cao' ? 'red' :
                                                                selectedGeoFeature.properties?.severity === 'Trung bình' ? 'orange' :
                                                                    'green'
                                                        } style={{ fontSize: isMobile ? '11px' : '12px', margin: 0 }}>
                                                            {selectedGeoFeature.properties?.severity || 'N/A'}
                                                        </Tag>
                                                        <Tag color={
                                                            selectedGeoFeature.properties?.status === 'Hoạt động' ? 'green' :
                                                                selectedGeoFeature.properties?.status === 'Đã xử lý' ? 'blue' :
                                                                    'default'
                                                        } style={{ fontSize: isMobile ? '11px' : '12px', margin: 0 }}>
                                                            {selectedGeoFeature.properties?.status || 'N/A'}
                                                        </Tag>
                                                    </div>

                                                    {/* Ảnh hiện trường */}
                                                    {selectedGeoFeature.properties?.imagePath && (
                                                        <div>
                                                            <Text strong style={{
                                                                display: 'block',
                                                                marginBottom: isMobile ? '6px' : '8px',
                                                                fontSize: isMobile ? '12px' : '13px'
                                                            }}>
                                                                📸 Ảnh hiện trường:
                                                            </Text>
                                                            <div style={{
                                                                width: '100%',
                                                                display: 'flex',
                                                                justifyContent: 'center',
                                                                alignItems: 'center',
                                                                backgroundColor: '#f5f5f5',
                                                                borderRadius: '6px',
                                                                padding: isMobile ? '6px' : '8px',
                                                                minHeight: isMobile ? '120px' : '150px',
                                                                maxHeight: isMobile ? '200px' : '300px',
                                                                overflow: 'hidden',
                                                                border: '1px solid #e8e8e8'
                                                            }}>
                                                                <img
                                                                    src={
                                                                        selectedGeoFeature.properties.imagePath.startsWith('http')
                                                                            ? selectedGeoFeature.properties.imagePath
                                                                            : `${API_URL}${selectedGeoFeature.properties.imagePath}`
                                                                    }
                                                                    alt={selectedGeoFeature.properties?.name || 'Ảnh hiện trường'}
                                                                    style={{
                                                                        maxWidth: '100%',
                                                                        maxHeight: '100%',
                                                                        width: 'auto',
                                                                        height: 'auto',
                                                                        objectFit: 'contain',
                                                                        borderRadius: '4px',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                    onClick={() => {
                                                                        const imageUrl = selectedGeoFeature.properties.imagePath.startsWith('http')
                                                                            ? selectedGeoFeature.properties.imagePath
                                                                            : `${API_URL}${selectedGeoFeature.properties.imagePath}`;
                                                                        window.open(imageUrl, '_blank');
                                                                    }}
                                                                    onError={(e) => {
                                                                        const parent = e.target.parentElement;
                                                                        parent.innerHTML = '<div style="text-align: center; color: #999; padding: 20px; font-size: 12px;">⚠️ Không thể tải ảnh</div>';
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Mô tả */}
                                                    {selectedGeoFeature.properties?.description && (
                                                        <div>
                                                            <Text strong style={{
                                                                display: 'block',
                                                                marginBottom: '4px',
                                                                fontSize: isMobile ? '12px' : '13px'
                                                            }}>
                                                                📝 Mô tả:
                                                            </Text>
                                                            <Text style={{
                                                                display: 'block',
                                                                padding: isMobile ? '6px' : '8px',
                                                                backgroundColor: '#f9f9f9',
                                                                borderRadius: '4px',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-word',
                                                                fontSize: isMobile ? '11px' : '12px',
                                                                maxHeight: isMobile ? '100px' : 'none',
                                                                overflowY: isMobile ? 'auto' : 'visible'
                                                            }}>
                                                                {selectedGeoFeature.properties.description}
                                                            </Text>
                                                        </div>
                                                    )}

                                                    {/* Ghi chú */}
                                                    {selectedGeoFeature.properties?.notes && (
                                                        <div>
                                                            <Text strong style={{
                                                                display: 'block',
                                                                marginBottom: '4px',
                                                                fontSize: isMobile ? '12px' : '13px'
                                                            }}>
                                                                📌 Ghi chú:
                                                            </Text>
                                                            <Text style={{
                                                                display: 'block',
                                                                padding: isMobile ? '6px' : '8px',
                                                                backgroundColor: '#fffbe6',
                                                                borderRadius: '4px',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-word',
                                                                fontSize: isMobile ? '11px' : '12px',
                                                                maxHeight: isMobile ? '80px' : 'none',
                                                                overflowY: isMobile ? 'auto' : 'visible'
                                                            }}>
                                                                {selectedGeoFeature.properties.notes}
                                                            </Text>
                                                        </div>
                                                    )}

                                                    {/* Thông tin bổ sung */}
                                                    <div style={{
                                                        borderTop: '1px solid #e8e8e8',
                                                        paddingTop: isMobile ? '6px' : '8px'
                                                    }}>
                                                        <Text type="secondary" style={{
                                                            fontSize: isMobile ? '10px' : '11px',
                                                            display: 'block'
                                                        }}>
                                                            {selectedGeoFeature.geometry?.type === 'Point' ? '📍 Điểm' :
                                                                selectedGeoFeature.geometry?.type === 'LineString' ? '📏 Đường' :
                                                                    selectedGeoFeature.geometry?.type === 'Polygon' ? '🔷 Vùng' : 'N/A'}
                                                        </Text>
                                                        {selectedGeoFeature.properties?.createdAt && (
                                                            <Text type="secondary" style={{
                                                                fontSize: isMobile ? '10px' : '11px',
                                                                display: 'block',
                                                                marginTop: '4px'
                                                            }}>
                                                                🕐 {isMobile ? new Date(selectedGeoFeature.properties.createdAt).toLocaleDateString('vi-VN') : new Date(selectedGeoFeature.properties.createdAt).toLocaleString('vi-VN')}
                                                            </Text>
                                                        )}
                                                    </div>
                                                </Space>
                                            </div>
                                        </Popup>
                                    ) : null;
                                })()}

                                {/* Popup yêu cầu hỗ trợ */}
                                {selectedSupportRequest && selectedSupportRequest.location &&
                                    selectedSupportRequest.location.lat != null &&
                                    selectedSupportRequest.location.lng != null && (
                                        <Popup
                                            key={`support-popup-${selectedSupportRequest._id || selectedSupportRequest.id}`}
                                            longitude={selectedSupportRequest.location.lng}
                                            latitude={selectedSupportRequest.location.lat}
                                            anchor="bottom"
                                            onClose={() => {
                                                console.log('🔵 Closing support popup')
                                                setSelectedSupportRequest(null)
                                            }}
                                            closeButton={true}
                                            closeOnClick={false}
                                            maxWidth={isMobile ? '90vw' : '450px'}
                                            style={{ zIndex: 1001 }}
                                        >
                                            <div className="popup-content" style={{
                                                maxWidth: isMobile ? '85vw' : '400px',
                                                maxHeight: isMobile ? '50vh' : '600px',
                                                overflowY: 'auto',
                                                padding: isMobile ? '8px' : '12px'
                                            }}>
                                                <Title level={isMobile ? 4 : 5} style={{
                                                    marginBottom: isMobile ? '8px' : '12px',
                                                    color: '#1890ff',
                                                    fontSize: isMobile ? '14px' : '16px'
                                                }}>
                                                    🎁 {selectedSupportRequest.name || 'Yêu cầu hỗ trợ'}
                                                </Title>
                                                <Space direction="vertical" size={isMobile ? 'small' : 'middle'} style={{ width: '100%' }}>
                                                    {/* Tags */}
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        {selectedSupportRequest.needs && selectedSupportRequest.needs.map((need, idx) => (
                                                            <Tag key={idx} color="blue" style={{ fontSize: isMobile ? '11px' : '12px', margin: 0 }}>
                                                                {need}
                                                            </Tag>
                                                        ))}
                                                        <Tag color={
                                                            selectedSupportRequest.status === 'Chưa xử lý' ? 'red' :
                                                                selectedSupportRequest.status === 'Đang xử lý' ? 'orange' :
                                                                    'green'
                                                        } style={{ fontSize: isMobile ? '11px' : '12px', margin: 0 }}>
                                                            {selectedSupportRequest.status || 'Chưa xử lý'}
                                                        </Tag>
                                                    </div>

                                                    {/* Ảnh */}
                                                    {selectedSupportRequest.imagePath && (
                                                        <div>
                                                            <Text strong style={{
                                                                display: 'block',
                                                                marginBottom: isMobile ? '6px' : '8px',
                                                                fontSize: isMobile ? '12px' : '13px'
                                                            }}>
                                                                📸 Ảnh:
                                                            </Text>
                                                            <div style={{
                                                                width: '100%',
                                                                display: 'flex',
                                                                justifyContent: 'center',
                                                                alignItems: 'center',
                                                                backgroundColor: '#f5f5f5',
                                                                borderRadius: '6px',
                                                                padding: isMobile ? '6px' : '8px',
                                                                minHeight: isMobile ? '120px' : '150px',
                                                                maxHeight: isMobile ? '200px' : '300px',
                                                                overflow: 'hidden',
                                                                border: '1px solid #e8e8e8'
                                                            }}>
                                                                <img
                                                                    src={
                                                                        selectedSupportRequest.imagePath.startsWith('http')
                                                                            ? selectedSupportRequest.imagePath
                                                                            : `${API_URL}${selectedSupportRequest.imagePath}`
                                                                    }
                                                                    alt="Ảnh yêu cầu hỗ trợ"
                                                                    style={{
                                                                        maxWidth: '100%',
                                                                        maxHeight: '100%',
                                                                        width: 'auto',
                                                                        height: 'auto',
                                                                        objectFit: 'contain',
                                                                        borderRadius: '4px',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                    onClick={() => {
                                                                        const imageUrl = selectedSupportRequest.imagePath.startsWith('http')
                                                                            ? selectedSupportRequest.imagePath
                                                                            : `${API_URL}${selectedSupportRequest.imagePath}`;
                                                                        window.open(imageUrl, '_blank');
                                                                    }}
                                                                    onError={(e) => {
                                                                        const parent = e.target.parentElement;
                                                                        parent.innerHTML = '<div style="text-align: center; color: #999; padding: 20px; font-size: 12px;">⚠️ Không thể tải ảnh</div>';
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Mô tả */}
                                                    {selectedSupportRequest.description && (
                                                        <div>
                                                            <Text strong style={{
                                                                display: 'block',
                                                                marginBottom: '4px',
                                                                fontSize: isMobile ? '12px' : '13px'
                                                            }}>
                                                                📝 Mô tả:
                                                            </Text>
                                                            <Text style={{
                                                                display: 'block',
                                                                padding: isMobile ? '6px' : '8px',
                                                                backgroundColor: '#f9f9f9',
                                                                borderRadius: '4px',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-word',
                                                                fontSize: isMobile ? '11px' : '12px',
                                                                maxHeight: isMobile ? '100px' : 'none',
                                                                overflowY: isMobile ? 'auto' : 'visible'
                                                            }}>
                                                                {selectedSupportRequest.description}
                                                            </Text>
                                                        </div>
                                                    )}

                                                    {/* Thông tin bổ sung */}
                                                    <div style={{ borderTop: '1px solid #e8e8e8', paddingTop: isMobile ? '6px' : '8px' }}>
                                                        {selectedSupportRequest.peopleCount && (
                                                            <Text strong style={{ fontSize: isMobile ? '12px' : '13px', display: 'block', color: '#262626' }}>
                                                                👥 Số người: <span style={{ color: '#1890ff', fontWeight: 600 }}>{selectedSupportRequest.peopleCount}</span>
                                                            </Text>
                                                        )}
                                                        {selectedSupportRequest.phone && (
                                                            <Text strong style={{ fontSize: isMobile ? '12px' : '13px', display: 'block', marginTop: '6px', color: '#262626' }}>
                                                                📞 <span style={{ color: '#1890ff', fontWeight: 600 }}>{selectedSupportRequest.phone}</span>
                                                            </Text>
                                                        )}
                                                        {selectedSupportRequest.createdAt && (
                                                            <Text style={{ fontSize: isMobile ? '11px' : '12px', display: 'block', marginTop: '6px', color: '#595959', fontWeight: 500 }}>
                                                                🕐 {isMobile ? new Date(selectedSupportRequest.createdAt).toLocaleDateString('vi-VN') : new Date(selectedSupportRequest.createdAt).toLocaleString('vi-VN')}
                                                            </Text>
                                                        )}
                                                    </div>
                                                </Space>
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
                                                        <Text style={{ fontSize: '13px', marginTop: 8, color: '#595959', fontWeight: 500 }}>
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
                                                                <Text strong style={{ fontSize: '13px', color: '#262626' }}>
                                                                    👥 {selectedRescue.people}
                                                                </Text>
                                                            )}
                                                            {selectedRescue.needs && (
                                                                <Text strong style={{ fontSize: '13px', color: '#262626' }}>
                                                                    📦 {selectedRescue.needs}
                                                                </Text>
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

                                                            <Text style={{ fontSize: '13px', color: '#595959', fontWeight: 500 }}>
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

                            {/* dBZ Legend - Chỉ hiển thị khi radar overlay được bật */}
                            {radarOverlayVisible && (
                                <div
                                    key="radar-legend"
                                    style={{
                                        position: 'absolute',
                                        ...(isMobile
                                            ? { top: '20px', left: '50%', transform: 'translateX(-50%)' }
                                            : { bottom: '20px', left: '50%', transform: 'translateX(-50%)' }
                                        ),
                                        background: 'rgba(0, 0, 0, 0.6)',
                                        padding: '10px 14px',
                                        borderRadius: '12px',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                                        zIndex: 1000,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        minWidth: '320px',
                                        maxWidth: '90%',
                                        backdropFilter: 'blur(4px)',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => setRadarUnit(radarUnit === 'dBZ' ? 'mm/h' : 'dBZ')}
                                    title="Nhấp để thay đổi đơn vị"
                                >
                                    {/* Label - Màu trắng, có thể click */}
                                    <div style={{
                                        color: '#ffffff',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap',
                                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                                        fontFamily: 'Arial, sans-serif',
                                        userSelect: 'none'
                                    }}>
                                        {radarUnit}
                                    </div>

                                    {/* Color Gradient Bar - Gradient chuẩn từ HTML */}
                                    <div style={{
                                        flex: 1,
                                        height: '24px',
                                        borderRadius: '12px',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',
                                        background: `linear-gradient(to right, ${RADAR_GRADIENT_STOPS})`
                                    }}>
                                        {/* Value labels - đặt chính xác tại các vị trí dựa trên gradient color stops */}
                                        {radarDisplayValues.map((value, index) => {
                                            // Vị trí chính xác dựa trên gradient color stops (15 stops = 14 intervals)
                                            // Mỗi stop cách nhau: 100 / 14 = 7.142857%
                                            // 0: index 0 (0%), 20: index 5 (35.71%), 30: index 7 (50%), 
                                            // 40: index 9 (64.29%), 50: index 11 (78.57%), 60: index 13 (92.86%)
                                            const positionMap = {
                                                0: 0,           // Bắt đầu gradient (index 0)
                                                20: (5 / 14) * 100,      // ~35.71% - rgb(0, 145, 148) - teal (index 5)
                                                30: (7 / 14) * 100,      // 50% - rgb(70, 205, 96) - green (index 7)
                                                40: (9 / 14) * 100,      // ~64.29% - rgb(245, 203, 8) - yellow (index 9)
                                                50: (11 / 14) * 100,     // ~78.57% - rgb(223, 102, 68) - orange-red (index 11)
                                                60: (13 / 14) * 100      // ~92.86% - rgb(157, 16, 109) - magenta (index 13)
                                            }

                                            const dbzValue = DBZ_VALUES[index]
                                            const position = positionMap[dbzValue] || (dbzValue / 60) * 100

                                            // Số 0 cần căn trái và đẩy sang phải, các số khác căn giữa
                                            const isFirst = value === 0 || (radarUnit === 'mm/h' && value === 0)
                                            const transform = isFirst ? 'translate(0, -50%)' : 'translate(-50%, -50%)'

                                            // Đẩy số 0 sang phải thêm 3 lần (khoảng 9-12px) để không bị mất
                                            const leftOffset = isFirst ? '20px' : '0'

                                            return (
                                                <div
                                                    key={`${radarUnit}-${value}-${index}`}
                                                    style={{
                                                        position: 'absolute',
                                                        top: '50%',
                                                        left: isFirst ? `calc(${position}% + ${leftOffset})` : `${position}%`,
                                                        transform: transform,
                                                        color: '#ffffff',
                                                        fontSize: '12px',
                                                        fontWeight: 700,
                                                        textShadow: '0 1px 4px rgba(0, 0, 0, 1), 0 0 3px rgba(0, 0, 0, 0.8)',
                                                        pointerEvents: 'none',
                                                        whiteSpace: 'nowrap',
                                                        fontFamily: 'Arial, sans-serif',
                                                        userSelect: 'none',
                                                        letterSpacing: '0.5px',
                                                        lineHeight: '1',
                                                        textAlign: isFirst ? 'left' : 'center'
                                                    }}
                                                >
                                                    {value}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
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

            {/* News Detail Modal - Xem toàn bộ nội dung tin tức */}
            <Modal
                title={
                    selectedNewsItem ? (
                        <div>
                            <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
                                {selectedNewsItem.title}
                            </div>
                            <Space>
                                <Tag color={selectedNewsItem.category === 'thông báo khẩn' ? 'red' : selectedNewsItem.category === 'hướng dẫn' ? 'blue' : 'green'}>
                                    {selectedNewsItem.category === 'thông báo khẩn' ? 'Thông báo khẩn' : selectedNewsItem.category === 'hướng dẫn' ? 'Hướng dẫn' : 'Cập nhật tình hình'}
                                </Tag>
                                {selectedNewsItem.timestamp && (
                                    <Text type="secondary" style={{ fontSize: '12px' }}>
                                        <ClockCircleOutlined style={{ marginRight: '4px' }} />
                                        {formatTime(selectedNewsItem.timestamp)}
                                    </Text>
                                )}
                            </Space>
                        </div>
                    ) : 'Chi tiết tin tức'
                }
                open={newsDetailModalVisible}
                onCancel={() => {
                    setNewsDetailModalVisible(false)
                    setSelectedNewsItem(null)
                }}
                footer={[
                    <Button key="close" onClick={() => {
                        setNewsDetailModalVisible(false)
                        setSelectedNewsItem(null)
                    }}>
                        Đóng
                    </Button>
                ]}
                width={isMobile ? '90%' : 800}
                style={{ top: isMobile ? 20 : 50 }}
                zIndex={3000}
                getContainer={() => document.body}
                maskClosable={true}
                destroyOnClose={false}
            >
                {selectedNewsItem && (
                    <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                        {/* Hình ảnh */}
                        {selectedNewsItem.imageUrl && (
                            <div style={{
                                marginBottom: '20px',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                width: '100%',
                                maxHeight: '400px',
                                background: '#f5f5f5',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Image
                                    src={selectedNewsItem.imageUrl}
                                    alt={selectedNewsItem.title}
                                    preview={{
                                        mask: '🔍 Xem ảnh',
                                        maskClassName: 'news-image-preview-mask'
                                    }}
                                    style={{
                                        width: '100%',
                                        height: 'auto',
                                        maxHeight: '400px',
                                        objectFit: 'contain'
                                    }}
                                />
                            </div>
                        )}

                        {/* Nội dung đầy đủ */}
                        <div style={{
                            fontSize: '15px',
                            color: '#374151',
                            lineHeight: '1.8',
                            whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word',
                            marginBottom: '20px'
                        }}>
                            {selectedNewsItem.content}
                        </div>

                        {/* Footer: Tác giả và Link nguồn */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: '20px',
                            paddingTop: '20px',
                            borderTop: '1px solid #e5e7eb',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            {selectedNewsItem.author && (
                                <Text type="secondary" style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <UserOutlined /> {selectedNewsItem.author}
                                </Text>
                            )}
                            {selectedNewsItem.sourceUrl && (
                                <Button
                                    size="small"
                                    type="link"
                                    icon={<GlobalOutlined />}
                                    href={selectedNewsItem.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        padding: 0,
                                        fontSize: '13px',
                                        height: 'auto',
                                        color: '#1890ff'
                                    }}
                                >
                                    Xem nguồn
                                </Button>
                            )}
                        </div>
                    </div>
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
                {/* Radar Overlay Toggle - Đặt đầu tiên */}
                <button
                    className={`fab-button ${radarOverlayVisible ? 'primary' : 'secondary'}`}
                    onClick={() => {
                        setRadarOverlayVisible(!radarOverlayVisible)
                        message.info(radarOverlayVisible ? 'Đã tắt lớp radar' : 'Đã bật lớp radar')
                    }}
                    title={radarOverlayVisible ? 'Tắt radar' : 'Bật radar'}
                    style={radarOverlayVisible ? {
                        background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                        boxShadow: '0 4px 12px rgba(24, 144, 255, 0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px'
                    } : {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px'
                    }}
                >
                    <CloudOutlined style={{ fontSize: '18px' }} />
                    <span style={{ fontSize: '10px', lineHeight: '1', fontWeight: 500 }}>Radar</span>
                </button>

                {/* Support Request Button */}
                <button
                    className="fab-button primary"
                    onClick={openSupportRequestModal}
                    title="Gửi yêu cầu hỗ trợ"
                    style={{
                        background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                        boxShadow: '0 4px 12px rgba(24, 144, 255, 0.4)'
                    }}
                >
                    <GiftOutlined style={{ fontSize: '20px' }} />
                </button>

                {/* Hotline Button */}
                <button
                    className="fab-button primary"
                    onClick={openHotlineModal}
                    title="Danh sách hotline cứu hộ"
                    style={{
                        background: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
                        boxShadow: '0 4px 12px rgba(82, 196, 26, 0.4)'
                    }}
                >
                    <PhoneOutlined style={{ fontSize: '20px' }} />
                </button>

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

            {/* Hotline Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <PhoneOutlined style={{ color: '#52c41a', fontSize: '20px' }} />
                        <span>Danh Sách Hotline Cứu Hộ Khẩn Cấp</span>
                    </div>
                }
                open={hotlineModalVisible}
                onCancel={closeHotlineModal}
                footer={null}
                width={isMobile ? '90%' : 800}
                style={{ top: isMobile ? 20 : 50 }}
                zIndex={3000}
                getContainer={() => document.body}
                maskClosable={true}
                destroyOnClose={false}
            >
                <Alert
                    message="Gọi ngay các số hotline dưới đây nếu bạn đang gặp nguy hiểm!"
                    type="error"
                    showIcon
                    icon={<ExclamationCircleOutlined />}
                    style={{ marginBottom: 16 }}
                />

                {hotlineLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <Spin size="large" />
                    </div>
                ) : hotlines && hotlines.length > 0 ? (
                    <List
                        dataSource={hotlines}
                        renderItem={(hotline) => {
                            const hotlineId = hotline._id || hotline.id;
                            const hasImage = hotline.imageUrl && hotline.imageUrl.trim() !== '';

                            return (
                                <List.Item
                                    key={hotlineId}
                                    style={{
                                        padding: '16px',
                                        marginBottom: '12px',
                                        borderRadius: '8px',
                                        border: '1px solid #f0f0f0',
                                        background: '#fff',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
                                        e.currentTarget.style.borderColor = '#52c41a'
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.boxShadow = 'none'
                                        e.currentTarget.style.borderColor = '#f0f0f0'
                                    }}
                                >
                                    <div style={{ width: '100%' }}>
                                        {hasImage ? (
                                            <div style={{ marginBottom: '12px' }}>
                                                <Image
                                                    src={hotline.imageUrl.startsWith('http')
                                                        ? hotline.imageUrl
                                                        : `${API_URL}${hotline.imageUrl}`
                                                    }
                                                    alt={hotline.unit || 'Hotline'}
                                                    preview={false}
                                                    style={{
                                                        width: '100%',
                                                        maxHeight: '200px',
                                                        objectFit: 'contain',
                                                        borderRadius: '4px'
                                                    }}
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                        ) : null}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                <div style={{ marginBottom: '8px' }}>
                                                    <Text strong style={{ fontSize: '16px', color: '#dc2626' }}>
                                                        {hotline.unit || 'Hotline'}
                                                    </Text>
                                                </div>
                                                {hotline.province && (
                                                    <div style={{ marginBottom: '4px' }}>
                                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                                            📍 {hotline.province}
                                                        </Text>
                                                    </div>
                                                )}
                                                {hotline.note && (
                                                    <div style={{ marginTop: '8px' }}>
                                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                                            {hotline.note}
                                                        </Text>
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                                <Button
                                                    type="primary"
                                                    size="large"
                                                    icon={<PhoneOutlined />}
                                                    href={`tel:${hotline.phone.replace(/\./g, '').trim()}`}
                                                    style={{
                                                        background: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
                                                        border: 'none',
                                                        boxShadow: '0 2px 8px rgba(82, 196, 26, 0.3)',
                                                        fontWeight: 600,
                                                        minWidth: '150px'
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                    }}
                                                >
                                                    {hotline.phone}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </List.Item>
                            );
                        }}
                    />
                ) : (
                    <Empty
                        description="Chưa có hotline nào được thêm vào hệ thống"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                )}
            </Modal>

            {/* Support Request Modal */}
            <Modal
                title="Gửi Yêu Cầu Hỗ Trợ"
                open={supportRequestModalVisible}
                onCancel={closeSupportRequestModal}
                footer={null}
                width={isMobile ? '90%' : 600}
                style={{ top: isMobile ? 20 : 50 }}
                zIndex={3000}
                getContainer={() => document.body}
                maskClosable={true}
                destroyOnClose={false}
            >
                <Form
                    form={supportRequestForm}
                    layout="vertical"
                    onFinish={handleSupportRequestSubmit}
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
                                { label: '🍞 Thực phẩm', value: 'Thực phẩm' },
                                { label: '💧 Nước uống', value: 'Nước uống' },
                                { label: '👕 Quần áo', value: 'Quần áo' },
                                { label: '💊 Thuốc men', value: 'Thuốc men' },
                                { label: '🛏️ Chăn màn', value: 'Chăn màn' },
                                { label: '🔦 Đèn pin', value: 'Đèn pin' },
                                { label: '🔋 Pin', value: 'Pin' },
                                { label: '🔥 Bếp gas', value: 'Bếp gas' },
                                { label: '🧴 Nhu yếu phẩm', value: 'Nhu yếu phẩm' },
                                { label: '📝 Khác', value: 'Khác' }
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
                            value={supportRequestGoogleMapsUrl}
                            onChange={handleSupportRequestGoogleMapsLinkChange}
                        />
                    </Form.Item>

                    {supportRequestParsedCoords && (
                        <Alert
                            message={`✅ Đã tìm thấy tọa độ: ${supportRequestParsedCoords.lat.toFixed(6)}, ${supportRequestParsedCoords.lng.toFixed(6)}`}
                            type="success"
                            showIcon
                            style={{ marginBottom: 16 }}
                            closable
                            onClose={() => {
                                setSupportRequestParsedCoords(null)
                                setSupportRequestGoogleMapsUrl('')
                                supportRequestForm.setFieldsValue({ googleMapsUrl: '' })
                            }}
                        />
                    )}

                    <Form.Item
                        label="Vị trí GPS"
                        help="Chọn vị trí trên bản đồ hoặc dùng GPS tự động"
                    >
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <Space wrap>
                                <Button
                                    icon={<EnvironmentOutlined />}
                                    onClick={handleGetCurrentLocationForSupportRequest}
                                    loading={supportRequestLoading}
                                >
                                    Lấy GPS Tự Động
                                </Button>
                                <Button
                                    icon={<AimOutlined />}
                                    onClick={() => {
                                        setLocationPickerContext('supportRequest')
                                        setLocationPickerModalVisible(true)
                                        if (supportRequestLocation) {
                                            setLocationPickerViewState({
                                                longitude: supportRequestLocation.lng,
                                                latitude: supportRequestLocation.lat,
                                                zoom: 15
                                            })
                                            setLocationPickerSelected(supportRequestLocation)
                                        } else if (viewState.latitude && viewState.longitude) {
                                            setLocationPickerViewState({
                                                longitude: viewState.longitude,
                                                latitude: viewState.latitude,
                                                zoom: 15
                                            })
                                            setLocationPickerSelected(null)
                                        } else {
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
                                                        setLocationPickerViewState({
                                                            longitude: 108.9,
                                                            latitude: 13.0,
                                                            zoom: 10
                                                        })
                                                        setLocationPickerSelected(null)
                                                    }
                                                )
                                            } else {
                                                setLocationPickerViewState({
                                                    longitude: 108.9,
                                                    latitude: 13.0,
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
                                {supportRequestLocation && (
                                    <Tag color="green">
                                        ✓ Đã chọn: {supportRequestLocation.lat.toFixed(6)}, {supportRequestLocation.lng.toFixed(6)}
                                    </Tag>
                                )}
                            </Space>
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
                        name="image"
                        help="Kéo thả ảnh vào đây hoặc click để chọn"
                    >
                        <Upload
                            accept="image/*"
                            beforeUpload={() => false}
                            onChange={handleSupportRequestImageChange}
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
                            loading={supportRequestLoading}
                            block
                            size="large"
                            style={{ height: '50px', fontSize: '16px', background: '#1890ff', borderColor: '#1890ff' }}
                        >
                            Gửi Yêu Cầu Hỗ Trợ
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

            {/* Modal Thêm Điểm Tiếp Nhận Cứu Trợ */}
            <Modal
                title="Thêm Điểm Tiếp Nhận Cứu Trợ"
                open={addReliefPointModalVisible}
                onCancel={() => {
                    setAddReliefPointModalVisible(false)
                    addReliefPointForm.resetFields()
                    setAddReliefPointLocation(null)
                    setAddReliefPointGoogleMapsUrl('')
                    setAddReliefPointParsedCoords(null)
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
                    form={addReliefPointForm}
                    layout="vertical"
                    onFinish={handleAddReliefPointSubmit}
                    onFinishFailed={(errorInfo) => {
                        message.error('Vui lòng điền đầy đủ thông tin bắt buộc!')
                    }}
                    autoComplete="off"
                    validateTrigger="onSubmit"
                >
                    <Form.Item
                        label="Tên điểm tiếp nhận cứu trợ (tùy chọn)"
                        name="name"
                        rules={[{ max: 100, message: 'Tên không được quá 100 ký tự!' }]}
                    >
                        <Input
                            placeholder="Ví dụ: Điểm tiếp nhận cứu trợ xã ABC"
                            maxLength={100}
                            showCount
                        />
                    </Form.Item>

                    <Form.Item
                        label="Loại điểm"
                        name="type"
                        rules={[{ required: true, message: 'Vui lòng nhập hoặc chọn loại điểm!' }]}
                    >
                        <Select
                            placeholder="Chọn hoặc nhập loại điểm"
                            mode="tags"
                            tokenSeparators={[',']}
                            allowClear
                        >
                            <Select.Option value="Điểm tập kết">Điểm tập kết</Select.Option>
                            <Select.Option value="Kho hàng">Kho hàng</Select.Option>
                            <Select.Option value="Trung tâm phân phối">Trung tâm phân phối</Select.Option>
                            <Select.Option value="Điểm tiếp nhận cứu trợ">Điểm tiếp nhận cứu trợ</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        label="Loại cứu trợ tiếp nhận"
                        name="reliefType"
                        rules={[{ required: true, message: 'Vui lòng chọn ít nhất một loại cứu trợ!' }]}
                    >
                        <Checkbox.Group
                            options={[
                                { label: '🍞 Thực phẩm', value: 'Thực phẩm' },
                                { label: '💧 Nước uống', value: 'Nước uống' },
                                { label: '👕 Quần áo', value: 'Quần áo' },
                                { label: '💊 Thuốc men', value: 'Thuốc men' },
                                { label: '🛏️ Vật dụng sinh hoạt', value: 'Vật dụng sinh hoạt' },
                                { label: '💰 Tài chính', value: 'Tài chính' },
                                { label: '📦 Hỗn hợp', value: 'Hỗn hợp' },
                                { label: '📝 Khác', value: 'Khác' }
                            ]}
                        />
                    </Form.Item>

                    <Form.Item
                        label="Số điện thoại (tùy chọn)"
                        name="phone"
                        rules={[{ max: 20, message: 'Số điện thoại không được quá 20 ký tự!' }]}
                    >
                        <Input
                            type="tel"
                            placeholder="Ví dụ: 0912345678"
                            maxLength={20}
                            showCount
                        />
                    </Form.Item>

                    <Form.Item
                        label="Địa chỉ (tùy chọn)"
                        name="address"
                        rules={[{ max: 200, message: 'Địa chỉ không được quá 200 ký tự!' }]}
                    >
                        <Input
                            placeholder="Ví dụ: Xã ABC, huyện XYZ, tỉnh Phú Yên"
                            maxLength={200}
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
                            value={addReliefPointGoogleMapsUrl}
                            onChange={handleReliefPointGoogleMapsLinkChange}
                        />
                    </Form.Item>

                    {addReliefPointParsedCoords && (
                        <Alert
                            message={`✅ Đã tìm thấy tọa độ: ${addReliefPointParsedCoords.lat.toFixed(6)}, ${addReliefPointParsedCoords.lng.toFixed(6)}`}
                            type="success"
                            showIcon
                            style={{ marginBottom: 16 }}
                            closable
                            onClose={() => {
                                setAddReliefPointParsedCoords(null)
                                setAddReliefPointGoogleMapsUrl('')
                                setAddReliefPointLocation(null)
                            }}
                        />
                    )}

                    <Form.Item
                        label="Vị trí trên bản đồ"
                        help="Chọn vị trí trên bản đồ hoặc dùng GPS tự động (nếu chưa có link Google Maps)"
                    >
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <Space wrap>
                                <Button
                                    icon={<EnvironmentOutlined />}
                                    onClick={handleGetCurrentLocationForReliefPoint}
                                    loading={addReliefPointLoading}
                                >
                                    Lấy GPS Tự Động
                                </Button>
                                <Button
                                    icon={<AimOutlined />}
                                    onClick={() => {
                                        setLocationPickerContext('addReliefPoint')
                                        setLocationPickerModalVisible(true)
                                        if (addReliefPointLocation) {
                                            setLocationPickerViewState({
                                                longitude: addReliefPointLocation.lng,
                                                latitude: addReliefPointLocation.lat,
                                                zoom: 15
                                            })
                                            setLocationPickerSelected(addReliefPointLocation)
                                        } else if (viewState.latitude && viewState.longitude) {
                                            setLocationPickerViewState({
                                                longitude: viewState.longitude,
                                                latitude: viewState.latitude,
                                                zoom: 15
                                            })
                                            setLocationPickerSelected(null)
                                        }
                                    }}
                                    type={addReliefPointLocation ? 'primary' : 'default'}
                                >
                                    {addReliefPointLocation ? 'Đã chọn vị trí' : 'Chọn Trên Bản Đồ'}
                                </Button>
                            </Space>
                            {addReliefPointLocation && !addReliefPointParsedCoords && (
                                <Tag color="green" style={{ fontSize: '12px' }}>
                                    ✓ Đã chọn: {addReliefPointLocation.lat.toFixed(6)}, {addReliefPointLocation.lng.toFixed(6)}
                                </Tag>
                            )}
                        </Space>
                    </Form.Item>

                    <Form.Item
                        label="Thông tin điểm tiếp nhận cứu trợ"
                        name="description"
                        rules={[
                            { required: true, message: 'Vui lòng nhập thông tin về điểm tiếp nhận cứu trợ!' },
                            { max: 1000, message: 'Nội dung không được quá 1000 ký tự!' }
                        ]}
                        help="Nhập thông tin về điểm tiếp nhận cứu trợ"
                    >
                        <TextArea
                            placeholder="Ví dụ: Điểm tiếp nhận cứu trợ tại trường học. Tiếp nhận: thực phẩm, nước uống, quần áo. Liên hệ: 0912345678."
                            rows={6}
                            maxLength={1000}
                            showCount
                        />
                    </Form.Item>

                    <Form.Item>
                        <Space>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={addReliefPointLoading}
                                icon={<PlusOutlined />}
                                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                            >
                                Thêm Điểm Cứu Trợ
                            </Button>
                            <Button
                                onClick={() => {
                                    setAddReliefPointModalVisible(false)
                                    addReliefPointForm.resetFields()
                                    setAddReliefPointLocation(null)
                                    setAddReliefPointGoogleMapsUrl('')
                                    setAddReliefPointParsedCoords(null)
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

            {/* Modal danh sách requests trong cluster */}
            <Modal
                title={
                    <Space>
                        <FireOutlined style={{ color: '#dc2626' }} />
                        <span>Danh sách cầu cứu trong cụm ({clusterRequests.length})</span>
                    </Space>
                }
                open={clusterModalVisible}
                onCancel={() => {
                    setClusterModalVisible(false)
                    setClusterRequests([])
                }}
                footer={null}
                width={600}
                zIndex={3000}
                getContainer={() => document.body}
            >
                <List
                    dataSource={clusterRequests}
                    locale={{ emptyText: 'Không có dữ liệu' }}
                    renderItem={(request, index) => {
                        const hasCoords = request.coords && Array.isArray(request.coords) && request.coords.length >= 2
                        return (
                            <List.Item
                                style={{
                                    cursor: 'pointer',
                                    padding: '12px',
                                    marginBottom: '8px',
                                    borderRadius: '8px',
                                    border: '1px solid #f0f0f0',
                                    transition: 'all 0.2s',
                                    background: selectedListItem === (request._id || request.id) ? '#f0f8ff' : '#fff'
                                }}
                                onClick={() => {
                                    // Xem chi tiết request
                                    setSelectedRescue(request)
                                    setSelectedListItem(request._id || request.id)
                                    setClusterModalVisible(false)

                                    // Điều hướng map đến vị trí
                                    if (hasCoords) {
                                        setViewState(prev => ({
                                            ...prev,
                                            longitude: request.coords[0],
                                            latitude: request.coords[1],
                                            zoom: 14
                                        }))
                                    }
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#f0f8ff'
                                    e.currentTarget.style.borderColor = '#1890ff'
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = selectedListItem === (request._id || request.id) ? '#f0f8ff' : '#fff'
                                    e.currentTarget.style.borderColor = '#f0f0f0'
                                }}
                            >
                                <Space direction="vertical" style={{ width: '100%' }} size="small">
                                    <Space>
                                        <Text strong style={{ fontSize: '14px' }}>
                                            #{index + 1} - {request.location || request.description?.substring(0, 50) || 'Không có địa chỉ'}
                                        </Text>
                                    </Space>

                                    {request.description && (
                                        <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                                            {request.description.length > 150
                                                ? `${request.description.substring(0, 150)}...`
                                                : request.description}
                                        </Text>
                                    )}

                                    <Space wrap>
                                        {request.people && (
                                            <Tag color="orange">👥 {request.people}</Tag>
                                        )}
                                        {request.urgency && (
                                            <Tag color={request.urgency.includes('CỰC') ? 'red' : 'orange'}>
                                                {request.urgency}
                                            </Tag>
                                        )}
                                        {request.status && (
                                            <Tag color={request.status === 'Đã xử lý' ? 'green' : 'default'}>
                                                {request.status}
                                            </Tag>
                                        )}
                                    </Space>

                                    <Space split={<span>|</span>}>
                                        {request.contact && (
                                            <Button
                                                size="small"
                                                type="link"
                                                icon={<PhoneOutlined />}
                                                href={`tel:${request.contact.split(',')[0].replace(/\./g, '').trim()}`}
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ padding: 0, fontSize: '12px' }}
                                            >
                                                {request.contact.split(',')[0].trim()}
                                            </Button>
                                        )}
                                        {hasCoords && (
                                            <Button
                                                size="small"
                                                type="link"
                                                icon={<GlobalOutlined />}
                                                href={`https://www.google.com/maps?q=${request.coords[1]},${request.coords[0]}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ padding: 0, fontSize: '12px' }}
                                            >
                                                📍 Xem trên Google Maps
                                            </Button>
                                        )}
                                        {request.timestamp && (
                                            <Text type="secondary" style={{ fontSize: '11px' }}>
                                                <ClockCircleOutlined /> {formatTime(request.timestamp)}
                                            </Text>
                                        )}
                                    </Space>
                                </Space>
                            </List.Item>
                        )
                    }}
                />
            </Modal>
        </Layout>
    )
}

export default MapPage
