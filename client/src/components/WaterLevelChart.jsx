import { useState, useEffect, useRef } from 'react'
import { Modal, Card, Statistic, Row, Col, Spin, message, Typography, Tag } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import axios from 'axios'
import './WaterLevelChart.css'

const { Title, Text } = Typography

const WATER_LEVEL_API_URL = 'https://quantrac.baonamdts.com/api/v1/all-stations/waterlevel'

// Detect mobile
const getIsMobile = () => window.innerWidth <= 768

/**
 * Component hiển thị biểu đồ mực nước 24h cho trạm đo
 */
function WaterLevelChart({ visible, onClose, stationCode, stationName, coordinates }) {
    const [loading, setLoading] = useState(false)
    const [chartData, setChartData] = useState([])
    const [stats, setStats] = useState({ max: 0, average: 0 })
    const [lastUpdate, setLastUpdate] = useState(null)
    const [alertLevel, setAlertLevel] = useState(null)
    const [isMobile, setIsMobile] = useState(getIsMobile())
    const chartContainerRef = useRef(null)
    const [chartSize, setChartSize] = useState({ width: 850, height: 450 })

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(getIsMobile())
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        if (visible && stationCode) {
            fetchWaterLevelData()
        }
    }, [visible, stationCode])

    // Calculate chart size when modal opens
    useEffect(() => {
        if (visible && chartContainerRef.current) {
            const updateSize = () => {
                if (chartContainerRef.current) {
                    const rect = chartContainerRef.current.getBoundingClientRect()
                    // Tính width chính xác từ container, trừ padding (16px mỗi bên = 32px)
                    const width = Math.max(rect.width - 32, 800)
                    const height = isMobile ? 250 : 450 // Tăng height cho desktop để fit tốt hơn
                    setChartSize({ width, height })
                }
            }

            // Delay để đảm bảo modal đã render xong
            const timer = setTimeout(() => {
                updateSize()
                // Trigger resize event để recharts tính toán lại
                window.dispatchEvent(new Event('resize'))
            }, 100)

            // Update lại khi resize window
            window.addEventListener('resize', updateSize)
            return () => {
                clearTimeout(timer)
                window.removeEventListener('resize', updateSize)
            }
        }
    }, [visible, isMobile, chartData.length])

    const fetchWaterLevelData = async () => {
        if (!stationCode) return

        setLoading(true)
        try {
            const response = await axios.get(WATER_LEVEL_API_URL, {
                params: {
                    stationCodes: stationCode
                }
            })

            if (response.data && response.data.features && response.data.features.length > 0) {
                const feature = response.data.features[0]
                const data = feature.properties.data

                // Parse dữ liệu từ waterLevel_0h đến waterLevel_23h
                const chartDataPoints = []
                const values = []

                for (let hour = 0; hour < 24; hour++) {
                    const key = `waterLevel_${hour}h`
                    const value = data[key]

                    if (value && value.trim() !== '') {
                        const numValue = parseFloat(value)
                        if (!isNaN(numValue)) {
                            chartDataPoints.push({
                                hour: `${hour}h`,
                                hourNum: hour,
                                value: numValue
                            })
                            values.push(numValue)
                        }
                    } else {
                        // Nếu không có dữ liệu, vẫn thêm điểm nhưng value là null
                        chartDataPoints.push({
                            hour: `${hour}h`,
                            hourNum: hour,
                            value: null
                        })
                    }
                }

                setChartData(chartDataPoints)

                // Tính toán thống kê
                if (values.length > 0) {
                    // TỔNG: Tổng tất cả các giá trị mực nước
                    const total = values.reduce((sum, val) => sum + val, 0)
                    // TỐI ĐA: Giá trị cao nhất
                    const max = Math.max(...values)
                    // TRUNG BÌNH: Giá trị trung bình
                    const average = total / values.length

                    setStats({
                        max: max.toFixed(1),
                        average: average.toFixed(1)
                    })
                } else {
                    // Nếu không có dữ liệu, dùng giá trị hiện tại từ API
                    const currentLevel = data.waterLevel ? parseFloat(data.waterLevel) : null
                    if (currentLevel && !isNaN(currentLevel)) {
                        setStats({
                            max: currentLevel.toFixed(1),
                            average: currentLevel.toFixed(1)
                        })
                    } else {
                        setStats({ max: 0, average: 0 })
                    }
                }

                // Lưu thông tin cập nhật
                if (data.measurementDate) {
                    setLastUpdate(data.measurementDate)
                }
                if (data.alertLevel && data.alertLevel !== '-') {
                    setAlertLevel(data.alertLevel)
                } else {
                    setAlertLevel(null)
                }
            } else {
                message.warning('Không tìm thấy dữ liệu mực nước cho trạm này')
            }
        } catch (error) {
            console.error('Lỗi lấy dữ liệu mực nước:', error)
            message.error('Không thể tải dữ liệu mực nước')
        } finally {
            setLoading(false)
        }
    }

    // Filter data để chỉ hiển thị các điểm có giá trị
    const validChartData = chartData.filter(point => point.value !== null)

    // Tính min/max cho Y-axis với padding
    const allValues = validChartData.map(d => d.value)
    let yAxisMin = 0
    let yAxisMax = 10

    if (allValues.length > 0) {
        const minValue = Math.min(...allValues)
        const maxValue = Math.max(...allValues)
        const range = maxValue - minValue
        const padding = Math.max(range * 0.1, 0.5) // 10% padding hoặc tối thiểu 0.5m

        yAxisMin = Math.max(0, Math.floor((minValue - padding) * 10) / 10)
        yAxisMax = Math.ceil((maxValue + padding) * 10) / 10
    }

    return (
        <Modal
            open={visible}
            onCancel={onClose}
            footer={null}
            width={isMobile ? '95%' : 900}
            style={{
                top: isMobile ? 10 : 50,
                paddingBottom: 0
            }}
            className="water-level-modal"
            closeIcon={<CloseOutlined style={{ fontSize: isMobile ? '16px' : '18px' }} />}
            styles={{
                body: {
                    padding: isMobile ? '12px' : '16px',
                    maxHeight: isMobile ? 'calc(100vh - 80px)' : 'calc(100vh - 100px)',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    maxWidth: '100%'
                }
            }}
        >
            <div className="water-level-chart-container">
                {/* Header */}
                <div className="water-level-header">
                    <div className="water-level-title-section">
                        <Title level={4} className="water-level-main-title">
                            Trạm đo mực nước
                        </Title>
                        <Title level={3} className="water-level-station-name">
                            {stationName || 'N/A'}
                        </Title>
                        <Text type="secondary" className="water-level-station-code">
                            Mã trạm: {stationCode || 'N/A'}
                        </Text>
                    </div>
                </div>

                {/* Main Title */}
                <Title level={4} className="water-level-chart-title">
                    Biểu đồ Mực nước 24h
                </Title>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: '16px' }}>
                            <Text>Đang tải dữ liệu...</Text>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Statistics Cards */}
                        <Row gutter={isMobile ? [8, 8] : [16, 16]} className="water-level-stats">
                            <Col xs={24} sm={12}>
                                <Card className="water-level-stat-card">
                                    <Statistic
                                        title="TỐI ĐA"
                                        value={stats.max}
                                        suffix="m"
                                        valueStyle={{ color: '#ff4d4f' }}
                                    />
                                </Card>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Card className="water-level-stat-card">
                                    <Statistic
                                        title="TRUNG BÌNH"
                                        value={stats.average}
                                        suffix="m"
                                        valueStyle={{ color: '#52c41a' }}
                                    />
                                </Card>
                            </Col>
                        </Row>

                        {/* Chart */}
                        {validChartData.length > 0 ? (
                            <div
                                ref={chartContainerRef}
                                className="water-level-chart-wrapper"
                                style={{
                                    width: '100%',
                                    maxWidth: '100%',
                                    height: isMobile ? '250px' : '450px',
                                    minHeight: isMobile ? '250px' : '450px',
                                    position: 'relative',
                                    display: 'block',
                                    overflow: 'hidden',
                                    boxSizing: 'border-box'
                                }}
                            >
                                {chartSize.width > 0 && (
                                    <LineChart
                                        data={chartData}
                                        width={chartSize.width}
                                        height={chartSize.height}
                                        margin={{
                                            top: 15,
                                            right: isMobile ? 5 : 20,
                                            left: isMobile ? 5 : 20,
                                            bottom: isMobile ? 5 : 15
                                        }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis
                                            dataKey="hour"
                                            stroke="#666"
                                            style={{ fontSize: isMobile ? '10px' : '13px' }}
                                            interval={isMobile ? 3 : 0}
                                            tick={{ fontSize: isMobile ? 10 : 13 }}
                                        />
                                        <YAxis
                                            domain={[yAxisMin, yAxisMax]}
                                            stroke="#666"
                                            style={{ fontSize: isMobile ? '10px' : '13px' }}
                                            label={isMobile ? undefined : { value: 'Mực nước (m)', angle: -90, position: 'insideLeft', style: { fontSize: '13px' } }}
                                            width={isMobile ? 35 : 70}
                                            tick={{ fontSize: isMobile ? 10 : 13 }}
                                        />
                                        <Tooltip
                                            formatter={(value) => value !== null ? `${value} m` : 'Không có dữ liệu'}
                                            labelFormatter={(label) => `Giờ: ${label}`}
                                            contentStyle={{
                                                fontSize: isMobile ? '11px' : '14px',
                                                padding: isMobile ? '6px 8px' : '10px 14px'
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#52c41a"
                                            strokeWidth={isMobile ? 2 : 3}
                                            dot={{ fill: '#52c41a', r: isMobile ? 3 : 5 }}
                                            activeDot={{ r: isMobile ? 5 : 7 }}
                                            name="Mực nước (m)"
                                            connectNulls={true}
                                        />
                                    </LineChart>
                                )}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <Text type="secondary">Không có dữ liệu mực nước</Text>
                            </div>
                        )}

                        {/* Alert Level & Last Update */}
                        <div className="water-level-footer">
                            {alertLevel && (
                                <Tag color="orange" style={{ marginBottom: '8px' }}>
                                    Mức cảnh báo: {alertLevel}
                                </Tag>
                            )}
                            {lastUpdate && (
                                <div className="water-level-update-info">
                                    <Text type="secondary">
                                        Dữ liệu cập nhật: {lastUpdate}
                                    </Text>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    )
}

export default WaterLevelChart

