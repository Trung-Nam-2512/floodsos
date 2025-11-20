import { useState } from 'react'
import { Card, Form, Input, Upload, Button, message, Space, Typography, Alert } from 'antd'
import { RobotOutlined, CameraOutlined, SendOutlined, LinkOutlined, GlobalOutlined } from '@ant-design/icons'
import axios from 'axios'
import './AIReportForm.css'

const { TextArea } = Input
const { Title, Text } = Typography

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || 'http://localhost:5000'

function AIReportForm({ onSuccess }) {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [previewText, setPreviewText] = useState('')
    const [imageFile, setImageFile] = useState(null)
    const [parsedCoords, setParsedCoords] = useState(null) // Tọa độ đã parse từ Google Maps link

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
        if (url) {
            const coords = parseGoogleMapsCoords(url)
            if (coords) {
                setParsedCoords(coords)
                message.success(`✅ Đã tìm thấy tọa độ: ${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`)
            } else {
                setParsedCoords(null)
            }
        } else {
            setParsedCoords(null)
        }
    }

    // Xử lý upload ảnh (hỗ trợ cả click và drag & drop)
    const handleImageChange = (info) => {
        console.log('📸 handleImageChange called:', info);

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
            console.log('✅ File detected:', file.name, file.size, 'bytes');
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

    // Submit form
    const handleSubmit = async (values) => {
        if ((!values.rawText || values.rawText.trim().length === 0) &&
            (!values.facebookUrl || values.facebookUrl.trim().length === 0)) {
            message.warning('Vui lòng nhập nội dung cầu cứu hoặc link Facebook!')
            return
        }

        try {
            setLoading(true)

            // Convert ảnh sang base64 nếu có
            let imageBase64 = null
            if (imageFile) {
                console.log('📸 Converting image to base64...');
                console.log('   File name:', imageFile.name);
                console.log('   File size:', imageFile.size, 'bytes');
                try {
                    imageBase64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                            console.log('✅ Image converted, size:', reader.result.length, 'bytes');
                            resolve(reader.result)
                        }
                        reader.onerror = (error) => {
                            console.error('❌ Error reading file:', error);
                            reject(error)
                        }
                        reader.readAsDataURL(imageFile)
                    })
                } catch (imgError) {
                    console.error('❌ Lỗi convert ảnh:', imgError);
                    message.warning('Không thể xử lý ảnh, sẽ gửi không có ảnh');
                }
            } else {
                console.log('ℹ️  Không có ảnh');
            }

            const requestData = {
                rawText: values.rawText?.trim() || '',
                facebookUrl: values.facebookUrl?.trim() || '',
                imageBase64: imageBase64,
                googleMapsUrl: values.googleMapsUrl?.trim() || '',
                coords: parsedCoords // Tọa độ từ Google Maps link (ưu tiên cao nhất)
            }

            if (parsedCoords) {
                console.log('📍 Sử dụng tọa độ từ Google Maps:', parsedCoords);
            }

            console.log('📤 Sending request to:', `${API_URL}/api/ai-report`);
            console.log('📦 Request data:', {
                rawText: requestData.rawText?.substring(0, 100) + '...',
                facebookUrl: requestData.facebookUrl,
                hasImage: !!imageBase64,
                imageBase64Length: imageBase64 ? imageBase64.length : 0
            });

            try {
                const response = await axios.post(`${API_URL}/api/ai-report`, requestData)

                if (response.data.success) {
                    message.success('Đã thêm điểm cầu cứu! AI đã phân tích và lưu thông tin.')
                    form.resetFields()
                    setImageFile(null)
                    setPreviewText('')

                    // Gọi callback để refresh danh sách và map
                    if (onSuccess) {
                        onSuccess(response.data.data)
                    }
                }
            } catch (error) {
                console.error('Lỗi gửi cầu cứu:', error)
                // Nếu không có mạng, vẫn hiển thị thông báo
                message.warning('Không thể kết nối server. Vui lòng gọi hotline trực tiếp!')
            }
        } catch (error) {
            message.error('Có lỗi xảy ra. Vui lòng thử lại!')
        } finally {
            setLoading(false)
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
                    <Alert
                        message={`✅ Đã tìm thấy tọa độ: ${parsedCoords[1].toFixed(6)}, ${parsedCoords[0].toFixed(6)}`}
                        type="success"
                        showIcon
                        style={{ marginBottom: 16 }}
                        closable
                        onClose={() => setParsedCoords(null)}
                    />
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
        </Card>
    )
}

export default AIReportForm

