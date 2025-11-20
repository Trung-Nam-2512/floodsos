import { useState, useEffect } from 'react';
import { Layout, Card, Table, Button, Select, Input, Tag, Space, Typography, Statistic, Row, Col, message, Modal, Upload, Tabs, Image, Form, Popconfirm } from 'antd';
import { PhoneOutlined, GlobalOutlined, ReloadOutlined, DownloadOutlined, SearchOutlined, FilterOutlined, UploadOutlined, PictureOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './AdminDashboard.css';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

// Trong production (Docker), VITE_API_URL có thể là empty để dùng relative path /api (nginx proxy)
// Trong development, dùng localhost:5000
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || (import.meta.env.MODE === 'production' ? '' : 'http://localhost:5000');

function AdminDashboard() {
    const navigate = useNavigate();
    const [requests, setRequests] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
    const [hotlines, setHotlines] = useState([]);
    const [uploadingHotline, setUploadingHotline] = useState(null);
    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [selectedHotline, setSelectedHotline] = useState(null);
    const [uploadForm] = Form.useForm();

    // Safe Points / Rescue Teams states
    const [safePoints, setSafePoints] = useState([]);
    const [loadingSafePoints, setLoadingSafePoints] = useState(false);
    const [safePointModalVisible, setSafePointModalVisible] = useState(false);
    const [editingSafePoint, setEditingSafePoint] = useState(null);
    const [safePointForm] = Form.useForm();

    // Edit Rescue Request states
    const [editRequestModalVisible, setEditRequestModalVisible] = useState(false);
    const [editingRequest, setEditingRequest] = useState(null);
    const [editRequestLoading, setEditRequestLoading] = useState(false);
    const [editRequestForm] = Form.useForm();

    // Filters
    const [urgencyFilter, setUrgencyFilter] = useState(null);
    const [statusFilter, setStatusFilter] = useState(null);
    const [searchText, setSearchText] = useState('');

    // Fetch stats
    const fetchStats = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/rescue-requests/admin/stats`);
            if (response.data.success) {
                setStats(response.data.data);
            }
        } catch (error) {
            console.error('Lỗi lấy stats:', error);
        }
    };

    // Fetch requests
    const fetchRequests = async (page = 1) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page,
                limit: pagination.limit
            });

            if (urgencyFilter) params.append('urgency', urgencyFilter);
            if (statusFilter) params.append('status', statusFilter);
            if (searchText) params.append('search', searchText);

            const response = await axios.get(`${API_URL}/api/rescue-requests?${params}`);

            if (response.data.success) {
                setRequests(response.data.data);
                setPagination(response.data.pagination);
            }
        } catch (error) {
            console.error('Lỗi lấy requests:', error);
            message.error('Không thể tải dữ liệu');
        } finally {
            setLoading(false);
        }
    };

    // Update status
    const updateStatus = async (id, newStatus, record) => {
        // Nếu đổi sang "Đang xử lý", hỏi ai xử lý
        if (newStatus === 'Đang xử lý' && !record.assignedTo) {
            const assignedTo = prompt('Nhập tên người xử lý:');
            if (!assignedTo) return;

            try {
                const response = await axios.put(`${API_URL}/api/rescue-requests/${id}/status`, {
                    status: newStatus,
                    assignedTo: assignedTo.trim()
                });

                if (response.data.success) {
                    message.success(`Đã gán cho ${assignedTo}`);
                    fetchRequests(pagination.page);
                    fetchStats();
                }
            } catch (error) {
                console.error('Lỗi cập nhật status:', error);
                message.error('Không thể cập nhật status');
            }
        } else {
            // Update status bình thường
            try {
                const response = await axios.put(`${API_URL}/api/rescue-requests/${id}/status`, {
                    status: newStatus
                });

                if (response.data.success) {
                    message.success('Đã cập nhật status');
                    fetchRequests(pagination.page);
                    fetchStats();
                }
            } catch (error) {
                console.error('Lỗi cập nhật status:', error);
                message.error('Không thể cập nhật status');
            }
        }
    };

    // Export CSV
    const exportCSV = () => {
        window.open(`${API_URL}/api/admin/export-csv`, '_blank');
        message.success('Đang tải xuống CSV...');
    };

    // Export Excel
    const exportExcel = () => {
        window.open(`${API_URL}/api/admin/export-excel`, '_blank');
        message.success('Đang tải xuống Excel...');
    };

    // Open edit modal
    const openEditModal = (record) => {
        setEditingRequest(record);
        editRequestForm.setFieldsValue({
            location: record.location || '',
            description: record.description || '',
            urgency: record.urgency || 'CẦN CỨU TRỢ',
            people: record.people || '',
            needs: record.needs || '',
            contact: record.contact || '',
            contactFull: record.contactFull || '',
            status: record.status || 'Chưa xử lý',
            assignedTo: record.assignedTo || '',
            notes: record.notes || '',
            facebookUrl: record.facebookUrl || '',
            coords: record.coords && record.coords.length === 2 
                ? `${record.coords[1]}, ${record.coords[0]}` 
                : ''
        });
        setEditRequestModalVisible(true);
    };

    // Handle edit form submit
    const handleEditSubmit = async (values) => {
        if (!editingRequest) return;

        setEditRequestLoading(true);
        try {
            // Parse coords từ string "lat, lng" hoặc "lng, lat"
            let coords = null;
            if (values.coords && values.coords.trim()) {
                const coordsStr = values.coords.trim();
                const parts = coordsStr.split(',').map(s => s.trim());
                if (parts.length === 2) {
                    const num1 = parseFloat(parts[0]);
                    const num2 = parseFloat(parts[1]);
                    if (!isNaN(num1) && !isNaN(num2)) {
                        // Nếu số đầu > 90 thì là lng, số sau là lat
                        if (Math.abs(num1) > 90) {
                            coords = [num1, num2]; // [lng, lat]
                        } else {
                            coords = [num2, num1]; // [lng, lat]
                        }
                    }
                }
            }

            const updateData = {
                location: values.location,
                description: values.description,
                urgency: values.urgency,
                people: values.people,
                needs: values.needs,
                contact: values.contact,
                contactFull: values.contactFull,
                status: values.status,
                assignedTo: values.assignedTo,
                notes: values.notes,
                facebookUrl: values.facebookUrl
            };

            if (coords) {
                updateData.coords = coords;
            }

            const response = await axios.put(
                `${API_URL}/api/rescue-requests/${editingRequest._id}`,
                updateData
            );

            if (response.data.success) {
                message.success('Đã cập nhật thông tin thành công!');
                setEditRequestModalVisible(false);
                setEditingRequest(null);
                editRequestForm.resetFields();
                fetchRequests(pagination.page);
                fetchStats();
            } else {
                message.error(response.data.message || 'Cập nhật thất bại');
            }
        } catch (error) {
            console.error('Lỗi cập nhật:', error);
            message.error(error.response?.data?.message || 'Lỗi khi cập nhật thông tin');
        } finally {
            setEditRequestLoading(false);
        }
    };

    // Handle delete
    const handleDelete = async (id) => {
        try {
            const response = await axios.delete(`${API_URL}/api/rescue-requests/${id}`);
            if (response.data.success) {
                message.success('Đã xóa báo cáo thành công!');
                fetchRequests(pagination.page);
                fetchStats();
            } else {
                message.error(response.data.message || 'Xóa thất bại');
            }
        } catch (error) {
            console.error('Lỗi xóa:', error);
            message.error(error.response?.data?.message || 'Lỗi khi xóa báo cáo');
        }
    };

    // Fetch hotlines
    const fetchHotlines = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/hotlines`);
            if (response.data.success) {
                setHotlines(response.data.data);
            }
        } catch (error) {
            console.error('Lỗi lấy hotlines:', error);
        }
    };

    // Mở modal upload
    const openUploadModal = (hotline) => {
        setSelectedHotline(hotline);
        uploadForm.setFieldsValue({
            title: hotline.imageTitle || hotline.unit || ''
        });
        setUploadModalVisible(true);
    };

    // Upload hình ảnh hotline
    const handleHotlineImageUpload = async (values) => {
        if (!selectedHotline) return;

        const { file, title } = values;

        // Lấy file object từ fileList nếu là array
        const fileObj = Array.isArray(file) ? file[0]?.originFileObj || file[0] : file;

        if (!fileObj) {
            message.error('Vui lòng chọn hình ảnh');
            return;
        }

        setUploadingHotline(selectedHotline.id);

        try {
            // Convert file to base64
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const base64 = e.target.result;
                    const response = await axios.put(
                        `${API_URL}/api/hotlines/${selectedHotline.id}/image`,
                        {
                            imageBase64: base64,
                            imageTitle: title || selectedHotline.unit || ''
                        },
                        { headers: { 'Content-Type': 'application/json' } }
                    );

                    if (response.data.success) {
                        message.success('Đã upload hình ảnh hotline thành công!');
                        setUploadModalVisible(false);
                        uploadForm.resetFields();
                        setSelectedHotline(null);
                        fetchHotlines();
                    } else {
                        message.error(response.data.message || 'Lỗi khi upload hình ảnh');
                    }
                } catch (error) {
                    console.error('Lỗi upload:', error);
                    message.error('Lỗi khi upload hình ảnh');
                } finally {
                    setUploadingHotline(null);
                }
            };
            reader.onerror = () => {
                message.error('Lỗi khi đọc file');
                setUploadingHotline(null);
            };
            reader.readAsDataURL(fileObj);
        } catch (error) {
            console.error('Lỗi:', error);
            message.error('Lỗi khi upload hình ảnh');
            setUploadingHotline(null);
        }
    };

    // Fetch safe points
    const fetchSafePoints = async () => {
        setLoadingSafePoints(true);
        try {
            const response = await axios.get(`${API_URL}/api/safe-points`);
            if (response.data.success) {
                setSafePoints(response.data.data);
            }
        } catch (error) {
            console.error('Lỗi lấy safe points:', error);
            message.error('Không thể lấy danh sách đội cứu hộ');
        } finally {
            setLoadingSafePoints(false);
        }
    };

    // Create/Update safe point
    const handleSafePointSubmit = async (values) => {
        try {
            if (editingSafePoint) {
                // Update
                const response = await axios.put(`${API_URL}/api/safe-points/${editingSafePoint._id}`, values);
                if (response.data.success) {
                    message.success('Đã cập nhật đội cứu hộ thành công');
                    setSafePointModalVisible(false);
                    safePointForm.resetFields();
                    setEditingSafePoint(null);
                    fetchSafePoints();
                }
            } else {
                // Create
                const response = await axios.post(`${API_URL}/api/safe-points`, values);
                if (response.data.success) {
                    message.success('Đã tạo đội cứu hộ thành công');
                    setSafePointModalVisible(false);
                    safePointForm.resetFields();
                    fetchSafePoints();
                }
            }
        } catch (error) {
            console.error('Lỗi lưu safe point:', error);
            message.error(error.response?.data?.message || 'Không thể lưu đội cứu hộ');
        }
    };

    // Delete safe point
    const handleDeleteSafePoint = async (id) => {
        if (!window.confirm('Bạn có chắc chắn muốn xóa đội cứu hộ này?')) {
            return;
        }
        try {
            const response = await axios.delete(`${API_URL}/api/safe-points/${id}`);
            if (response.data.success) {
                message.success('Đã xóa đội cứu hộ thành công');
                fetchSafePoints();
            }
        } catch (error) {
            console.error('Lỗi xóa safe point:', error);
            message.error('Không thể xóa đội cứu hộ');
        }
    };

    // Open modal for create/edit
    const openSafePointModal = (point = null) => {
        setEditingSafePoint(point);
        if (point) {
            safePointForm.setFieldsValue({
                name: point.name,
                lat: point.lat,
                lng: point.lng,
                address: point.address,
                phone: point.phone,
                capacity: point.capacity,
                description: point.description,
                status: point.status,
                type: point.type,
                notes: point.notes
            });
        } else {
            safePointForm.resetFields();
        }
        setSafePointModalVisible(true);
    };

    useEffect(() => {
        fetchStats();
        fetchRequests();
        fetchHotlines();
        fetchSafePoints();

        // Auto refresh mỗi 30 giây
        const interval = setInterval(() => {
            fetchStats();
            fetchRequests(pagination.page);
            fetchSafePoints();
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        fetchRequests(1); // Reset về page 1 khi filter thay đổi
    }, [urgencyFilter, statusFilter, searchText]);

    // Xem hình ảnh
    const viewImage = (imagePath) => {
        if (imagePath) {
            window.open(`${API_URL}${imagePath}`, '_blank');
        }
    };

    // Columns for table
    const columns = [
        {
            title: 'Thời gian',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 150,
            render: (timestamp) => new Date(timestamp * 1000).toLocaleString('vi-VN'),
            sorter: (a, b) => b.timestamp - a.timestamp
        },
        {
            title: 'Vị trí',
            dataIndex: 'location',
            key: 'location',
            ellipsis: true,
            render: (text, record) => (
                <div>
                    <Text strong>{text}</Text>
                    {record.imagePath && <div style={{ fontSize: '11px', color: '#999' }}>📷 Có ảnh</div>}
                </div>
            )
        },
        {
            title: 'Độ khẩn cấp',
            dataIndex: 'urgency',
            key: 'urgency',
            width: 150,
            render: (urgency) => {
                const displayUrgency = urgency === 'CẦN CỨU TRỢ' ? 'KHẨN CẤP' : urgency;
                const color = urgency === 'CỰC KỲ KHẨN CẤP' ? 'red' : 'orange';
                return <Tag color={color}>{displayUrgency}</Tag>;
            }
        },
        {
            title: 'Số người',
            dataIndex: 'people',
            key: 'people',
            width: 150
        },
        {
            title: 'Liên hệ',
            dataIndex: 'contactFull',
            key: 'contactFull',
            width: 150,
            render: (contact, record) => contact || record.contact || 'Không có'
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 180,
            render: (status, record) => (
                <div>
                    <Select
                        value={status}
                        style={{ width: '100%' }}
                        onChange={(value) => updateStatus(record._id, value, record)}
                    >
                        <Option value="Chưa xử lý">Chưa xử lý</Option>
                        <Option value="Đang xử lý">Đang xử lý</Option>
                        <Option value="Đã xử lý">Đã xử lý</Option>
                        <Option value="Không thể cứu">Không thể cứu</Option>
                    </Select>
                    {record.assignedTo && (
                        <div style={{ fontSize: '11px', color: '#999', marginTop: 4 }}>
                            👤 {record.assignedTo}
                        </div>
                    )}
                </div>
            )
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 250,
            render: (_, record) => (
                <Space size="small" wrap>
                    <Button
                        size="small"
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={() => openEditModal(record)}
                    >
                        Sửa
                    </Button>
                    <Popconfirm
                        title="Xóa báo cáo này?"
                        description="Bạn có chắc chắn muốn xóa báo cáo này? Hành động này không thể hoàn tác."
                        icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                        onConfirm={() => handleDelete(record._id)}
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                    >
                        <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                        >
                            Xóa
                        </Button>
                    </Popconfirm>
                    {record.contactFull && (
                        <Button
                            size="small"
                            icon={<PhoneOutlined />}
                            href={`tel:${record.contactFull.split(',')[0].trim()}`}
                        >
                            Gọi
                        </Button>
                    )}
                    {record.imagePath && (
                        <Button
                            size="small"
                            onClick={() => viewImage(record.imagePath)}
                        >
                            📷
                        </Button>
                    )}
                    {record.facebookUrl && (
                        <Button
                            size="small"
                            type="link"
                            icon={<GlobalOutlined />}
                            href={record.facebookUrl}
                            target="_blank"
                        >
                            FB
                        </Button>
                    )}
                </Space>
            )
        }
    ];

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Header style={{ background: '#dc2626', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Title level={3} style={{ color: '#fff', margin: 0 }}>
                    🚨 Admin Dashboard - FloodSoS
                </Title>
                <Space>
                    <Button icon={<GlobalOutlined />} onClick={() => navigate('/')}>
                        Trang chủ
                    </Button>
                </Space>
            </Header>

            <Content style={{ padding: '24px' }}>
                <Tabs
                    defaultActiveKey="requests"
                    items={[
                        {
                            key: 'requests',
                            label: '📋 Quản lý Cầu cứu',
                            children: (
                                <>
                                    {/* Stats */}
                                    {stats && (
                                        <Row gutter={16} style={{ marginBottom: 24 }}>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic title="Tổng số cầu cứu" value={stats.total} valueStyle={{ color: '#3f8600' }} />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="Chưa xử lý"
                                                        value={stats.byStatus['Chưa xử lý'] || 0}
                                                        valueStyle={{ color: '#cf1322' }}
                                                    />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="Đang xử lý"
                                                        value={stats.byStatus['Đang xử lý'] || 0}
                                                        valueStyle={{ color: '#faad14' }}
                                                    />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="24h gần đây"
                                                        value={stats.last24h}
                                                        valueStyle={{ color: '#1890ff' }}
                                                    />
                                                </Card>
                                            </Col>
                                        </Row>
                                    )}

                                    {/* Filters & Actions */}
                                    <Card style={{ marginBottom: 16 }}>
                                        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                                            <Space wrap>
                                                <Input.Search
                                                    placeholder="Tìm theo vị trí"
                                                    allowClear
                                                    style={{ width: 250 }}
                                                    onSearch={setSearchText}
                                                    prefix={<SearchOutlined />}
                                                />
                                                <Select
                                                    placeholder="Độ khẩn cấp"
                                                    style={{ width: 180 }}
                                                    allowClear
                                                    onChange={setUrgencyFilter}
                                                >
                                                    <Option value="CỰC KỲ KHẨN CẤP">CỰC KỲ KHẨN CẤP</Option>
                                                    <Option value="KHẨN CẤP">KHẨN CẤP</Option>
                                                    <Option value="CẦN CỨU TRỢ">CẦN CỨU TRỢ</Option>
                                                </Select>
                                                <Select
                                                    placeholder="Status"
                                                    style={{ width: 150 }}
                                                    allowClear
                                                    onChange={setStatusFilter}
                                                >
                                                    <Option value="Chưa xử lý">Chưa xử lý</Option>
                                                    <Option value="Đang xử lý">Đang xử lý</Option>
                                                    <Option value="Đã xử lý">Đã xử lý</Option>
                                                </Select>
                                                <Button icon={<ReloadOutlined />} onClick={() => fetchRequests(pagination.page)}>
                                                    Làm mới
                                                </Button>
                                            </Space>
                                            <Space>
                                                <Button type="primary" icon={<DownloadOutlined />} onClick={exportCSV}>
                                                    Xuất CSV
                                                </Button>
                                                <Button type="primary" icon={<DownloadOutlined />} onClick={exportExcel}>
                                                    Xuất Excel
                                                </Button>
                                            </Space>
                                        </Space>
                                    </Card>

                                    {/* Table */}
                                    <Card>
                                        <Table
                                            columns={columns}
                                            dataSource={requests}
                                            rowKey="_id"
                                            loading={loading}
                                            pagination={{
                                                current: pagination.page,
                                                pageSize: pagination.limit,
                                                total: pagination.total,
                                                showTotal: (total) => `Tổng ${total} requests`,
                                                onChange: (page) => fetchRequests(page)
                                            }}
                                            scroll={{ x: 1200 }}
                                            expandable={{
                                                expandedRowRender: (record) => (
                                                    <div style={{ padding: '16px', background: '#fafafa' }}>
                                                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                                            <div>
                                                                <Text strong>📋 Nội dung đầy đủ:</Text>
                                                                <div style={{ marginTop: 8, padding: 12, background: '#fff', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                                                                    {record.rawText || record.description}
                                                                </div>
                                                            </div>

                                                            {record.imagePath && (
                                                                <div>
                                                                    <Text strong>📷 Hình ảnh:</Text>
                                                                    <div style={{ marginTop: 8 }}>
                                                                        <img
                                                                            src={`${API_URL}${record.imagePath}`}
                                                                            alt="Hình ảnh cầu cứu"
                                                                            style={{ maxWidth: '400px', borderRadius: '8px', cursor: 'pointer' }}
                                                                            onClick={() => viewImage(record.imagePath)}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {record.assignedTo && (
                                                                <div>
                                                                    <Text type="secondary">👤 Người xử lý: {record.assignedTo}</Text>
                                                                </div>
                                                            )}

                                                            {record.notes && (
                                                                <div>
                                                                    <Text strong>📝 Ghi chú:</Text>
                                                                    <div style={{ marginTop: 4 }}>{record.notes}</div>
                                                                </div>
                                                            )}
                                                        </Space>
                                                    </div>
                                                ),
                                                rowExpandable: (record) => true
                                            }}
                                        />
                                    </Card>
                                </>
                            )
                        },
                        {
                            key: 'hotlines',
                            label: '📞 Quản lý Hotline',
                            children: (
                                <Card>
                                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                                        <div>
                                            <Typography.Title level={4}>
                                                <PictureOutlined /> Upload hình ảnh Hotline
                                            </Typography.Title>
                                            <Typography.Text type="secondary">
                                                Upload hình ảnh cho các hotline cứu hộ. Hình ảnh sẽ hiển thị trên trang báo cáo.
                                            </Typography.Text>
                                        </div>

                                        <Row gutter={[16, 16]}>
                                            {hotlines.map((hotline) => (
                                                <Col key={hotline.id} xs={24} sm={12} md={8} lg={6}>
                                                    <Card
                                                        hoverable
                                                        style={{ height: '100%' }}
                                                        cover={
                                                            hotline.imageUrl ? (
                                                                <Image
                                                                    src={hotline.imageUrl.startsWith('http')
                                                                        ? hotline.imageUrl
                                                                        : `${API_URL}${hotline.imageUrl}`
                                                                    }
                                                                    alt={hotline.imageTitle || hotline.unit}
                                                                    style={{ width: '100%', height: '200px', objectFit: 'cover' }}
                                                                    preview
                                                                />
                                                            ) : (
                                                                <div style={{
                                                                    width: '100%',
                                                                    height: '200px',
                                                                    background: '#f0f0f0',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: '#999'
                                                                }}>
                                                                    Chưa có hình ảnh
                                                                </div>
                                                            )
                                                        }
                                                    >
                                                        <Card.Meta
                                                            title={
                                                                <Space>
                                                                    <Text strong>{hotline.imageTitle || hotline.unit}</Text>
                                                                    {hotline.imageUrl && <Tag color="green">Đã có ảnh</Tag>}
                                                                </Space>
                                                            }
                                                            description={
                                                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                                                    <Text type="secondary">{hotline.province}</Text>
                                                                    {hotline.phone && (
                                                                        <Text strong style={{ color: '#dc2626' }}>
                                                                            📞 {hotline.phone}
                                                                        </Text>
                                                                    )}
                                                                    <Button
                                                                        type="primary"
                                                                        icon={<UploadOutlined />}
                                                                        block
                                                                        size="small"
                                                                        onClick={() => openUploadModal(hotline)}
                                                                    >
                                                                        {hotline.imageUrl ? 'Thay đổi ảnh' : 'Upload ảnh'}
                                                                    </Button>
                                                                </Space>
                                                            }
                                                        />
                                                    </Card>
                                                </Col>
                                            ))}
                                        </Row>
                                    </Space>
                                </Card>
                            )
                        },
                        {
                            key: 'safe-points',
                            label: '🏥 Quản lý Đội cứu hộ',
                            children: (
                                <Card>
                                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <Typography.Title level={4}>
                                                    🏥 Quản lý Đội cứu hộ / Điểm trú ẩn
                                                </Typography.Title>
                                                <Typography.Text type="secondary">
                                                    Quản lý thông tin các đội cứu hộ và điểm trú ẩn an toàn
                                                </Typography.Text>
                                            </div>
                                            <Button
                                                type="primary"
                                                onClick={() => openSafePointModal()}
                                            >
                                                + Thêm mới
                                            </Button>
                                        </div>

                                        <Table
                                            dataSource={safePoints}
                                            loading={loadingSafePoints}
                                            rowKey="_id"
                                            columns={[
                                                {
                                                    title: 'Tên',
                                                    dataIndex: 'name',
                                                    key: 'name',
                                                    ellipsis: true
                                                },
                                                {
                                                    title: 'Loại',
                                                    dataIndex: 'type',
                                                    key: 'type',
                                                    width: 120,
                                                    render: (type) => <Tag>{type}</Tag>
                                                },
                                                {
                                                    title: 'Địa chỉ',
                                                    dataIndex: 'address',
                                                    key: 'address',
                                                    ellipsis: true
                                                },
                                                {
                                                    title: 'Tọa độ',
                                                    key: 'coords',
                                                    width: 150,
                                                    render: (_, record) => (
                                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                                            {record.lat?.toFixed(6)}, {record.lng?.toFixed(6)}
                                                        </Text>
                                                    )
                                                },
                                                {
                                                    title: 'Sức chứa',
                                                    dataIndex: 'capacity',
                                                    key: 'capacity',
                                                    width: 100,
                                                    render: (capacity) => capacity ? `${capacity} người` : '-'
                                                },
                                                {
                                                    title: 'SĐT',
                                                    dataIndex: 'phone',
                                                    key: 'phone',
                                                    width: 120
                                                },
                                                {
                                                    title: 'Trạng thái',
                                                    dataIndex: 'status',
                                                    key: 'status',
                                                    width: 120,
                                                    render: (status) => {
                                                        const color = status === 'Hoạt động' ? 'green' : status === 'Tạm ngưng' ? 'orange' : 'red';
                                                        return <Tag color={color}>{status}</Tag>;
                                                    }
                                                },
                                                {
                                                    title: 'Thao tác',
                                                    key: 'action',
                                                    width: 150,
                                                    render: (_, record) => (
                                                        <Space>
                                                            <Button
                                                                size="small"
                                                                onClick={() => openSafePointModal(record)}
                                                            >
                                                                Sửa
                                                            </Button>
                                                            <Button
                                                                size="small"
                                                                danger
                                                                onClick={() => handleDeleteSafePoint(record._id)}
                                                            >
                                                                Xóa
                                                            </Button>
                                                        </Space>
                                                    )
                                                }
                                            ]}
                                            pagination={{
                                                pageSize: 10,
                                                showSizeChanger: true,
                                                showTotal: (total) => `Tổng ${total} đội cứu hộ`
                                            }}
                                        />
                                    </Space>
                                </Card>
                            )
                        }
                    ]}
                />

                {/* Modal Upload hình ảnh hotline */}
                <Modal
                    title="Upload hình ảnh Hotline"
                    open={uploadModalVisible}
                    onCancel={() => {
                        setUploadModalVisible(false);
                        uploadForm.resetFields();
                        setSelectedHotline(null);
                    }}
                    footer={null}
                    width={500}
                >
                    <Form
                        form={uploadForm}
                        layout="vertical"
                        onFinish={handleHotlineImageUpload}
                    >
                        <Form.Item
                            label="Tiêu đề hình ảnh"
                            name="title"
                            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}
                        >
                            <Input placeholder="Nhập tiêu đề hiển thị cho hình ảnh này" />
                        </Form.Item>

                        <Form.Item
                            label="Chọn hình ảnh"
                            name="file"
                            rules={[{ required: true, message: 'Vui lòng chọn hình ảnh' }]}
                            valuePropName="fileList"
                            getValueFromEvent={(e) => {
                                if (Array.isArray(e)) {
                                    return e;
                                }
                                return e?.fileList || [];
                            }}
                        >
                            <Upload
                                beforeUpload={() => false} // Prevent auto upload
                                accept="image/*"
                                maxCount={1}
                                listType="picture-card"
                            >
                                <div>
                                    <UploadOutlined />
                                    <div style={{ marginTop: 8 }}>Chọn ảnh</div>
                                </div>
                            </Upload>
                        </Form.Item>

                        <Form.Item>
                            <Space>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={uploadingHotline === selectedHotline?.id}
                                >
                                    Upload
                                </Button>
                                <Button onClick={() => {
                                    setUploadModalVisible(false);
                                    uploadForm.resetFields();
                                    setSelectedHotline(null);
                                }}>
                                    Hủy
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Modal>

                {/* Modal Quản lý Safe Point */}
                <Modal
                    title={editingSafePoint ? 'Sửa Đội cứu hộ' : 'Thêm Đội cứu hộ mới'}
                    open={safePointModalVisible}
                    onCancel={() => {
                        setSafePointModalVisible(false);
                        safePointForm.resetFields();
                        setEditingSafePoint(null);
                    }}
                    footer={null}
                    width={600}
                >
                    <Form
                        form={safePointForm}
                        layout="vertical"
                        onFinish={handleSafePointSubmit}
                    >
                        <Form.Item
                            label="Tên đội cứu hộ / Điểm trú ẩn"
                            name="name"
                            rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
                        >
                            <Input placeholder="Ví dụ: Trường THCS Ea H'leo" />
                        </Form.Item>

                        <Form.Item
                            label="Loại"
                            name="type"
                            rules={[{ required: true, message: 'Vui lòng chọn loại' }]}
                        >
                            <Select>
                                <Option value="Điểm trú ẩn">Điểm trú ẩn</Option>
                                <Option value="Đội cứu hộ">Đội cứu hộ</Option>
                                <Option value="Bệnh viện">Bệnh viện</Option>
                                <Option value="Trạm y tế">Trạm y tế</Option>
                                <Option value="Khác">Khác</Option>
                            </Select>
                        </Form.Item>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    label="Vĩ độ (Latitude)"
                                    name="lat"
                                    rules={[
                                        { required: true, message: 'Vui lòng nhập vĩ độ' },
                                        { type: 'number', message: 'Vĩ độ phải là số' }
                                    ]}
                                >
                                    <Input type="number" step="any" placeholder="12.75" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="Kinh độ (Longitude)"
                                    name="lng"
                                    rules={[
                                        { required: true, message: 'Vui lòng nhập kinh độ' },
                                        { type: 'number', message: 'Kinh độ phải là số' }
                                    ]}
                                >
                                    <Input type="number" step="any" placeholder="108.12" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item
                            label="Địa chỉ"
                            name="address"
                            rules={[{ required: true, message: 'Vui lòng nhập địa chỉ' }]}
                        >
                            <Input placeholder="Ví dụ: Ea H'leo, Đắk Lắk" />
                        </Form.Item>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    label="Số điện thoại"
                                    name="phone"
                                >
                                    <Input placeholder="0262.3812345" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="Sức chứa (người)"
                                    name="capacity"
                                    rules={[{ type: 'number', message: 'Sức chứa phải là số' }]}
                                >
                                    <Input type="number" min={0} placeholder="500" />
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
                                <Option value="Tạm ngưng">Tạm ngưng</Option>
                                <Option value="Đầy">Đầy</Option>
                            </Select>
                        </Form.Item>

                        <Form.Item
                            label="Mô tả"
                            name="description"
                        >
                            <Input.TextArea rows={3} placeholder="Mô tả thêm về đội cứu hộ / điểm trú ẩn" />
                        </Form.Item>

                        <Form.Item
                            label="Ghi chú"
                            name="notes"
                        >
                            <Input.TextArea rows={2} placeholder="Ghi chú nội bộ" />
                        </Form.Item>

                        <Form.Item>
                            <Space>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                >
                                    {editingSafePoint ? 'Cập nhật' : 'Tạo mới'}
                                </Button>
                                <Button onClick={() => {
                                    setSafePointModalVisible(false);
                                    safePointForm.resetFields();
                                    setEditingSafePoint(null);
                                }}>
                                    Hủy
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Modal>

                {/* Modal Chỉnh sửa Rescue Request */}
                <Modal
                    title="Chỉnh sửa Báo cáo Yêu cầu Cứu hộ"
                    open={editRequestModalVisible}
                    onCancel={() => {
                        setEditRequestModalVisible(false);
                        setEditingRequest(null);
                        editRequestForm.resetFields();
                    }}
                    footer={null}
                    width={800}
                    destroyOnClose={true}
                >
                    <Form
                        form={editRequestForm}
                        layout="vertical"
                        onFinish={handleEditSubmit}
                        initialValues={{
                            urgency: 'CẦN CỨU TRỢ',
                            status: 'Chưa xử lý'
                        }}
                    >
                        <Form.Item
                            label="Địa điểm"
                            name="location"
                            rules={[{ required: true, message: 'Vui lòng nhập địa điểm' }]}
                        >
                            <Input placeholder="Ví dụ: Xã ABC, huyện XYZ, tỉnh Phú Yên" />
                        </Form.Item>

                        <Form.Item
                            label="Mô tả"
                            name="description"
                            rules={[{ required: true, message: 'Vui lòng nhập mô tả' }]}
                        >
                            <Input.TextArea rows={4} placeholder="Mô tả chi tiết tình huống" />
                        </Form.Item>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    label="Độ khẩn cấp"
                                    name="urgency"
                                    rules={[{ required: true, message: 'Vui lòng chọn độ khẩn cấp' }]}
                                >
                                    <Select>
                                        <Option value="CỰC KỲ KHẨN CẤP">CỰC KỲ KHẨN CẤP</Option>
                                        <Option value="KHẨN CẤP">KHẨN CẤP</Option>
                                        <Option value="CẦN CỨU TRỢ">CẦN CỨU TRỢ</Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="Trạng thái"
                                    name="status"
                                    rules={[{ required: true, message: 'Vui lòng chọn trạng thái' }]}
                                >
                                    <Select>
                                        <Option value="Chưa xử lý">Chưa xử lý</Option>
                                        <Option value="Đang xử lý">Đang xử lý</Option>
                                        <Option value="Đã xử lý">Đã xử lý</Option>
                                        <Option value="Không thể cứu">Không thể cứu</Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    label="Số người"
                                    name="people"
                                >
                                    <Input placeholder="Ví dụ: 5 người, trong đó có 2 trẻ em" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="Nhu cầu"
                                    name="needs"
                                >
                                    <Input placeholder="Ví dụ: Cần cứu hộ, thực phẩm, nước uống" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    label="Số điện thoại"
                                    name="contact"
                                >
                                    <Input placeholder="Ví dụ: 0912345678" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="Tất cả số điện thoại"
                                    name="contactFull"
                                    help="Nếu có nhiều số, phân cách bằng dấu phẩy"
                                >
                                    <Input placeholder="Ví dụ: 0912345678, 0987654321" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item
                            label="Tọa độ GPS"
                            name="coords"
                            help="Nhập theo format: lat, lng hoặc lng, lat (ví dụ: 13.08, 109.30)"
                        >
                            <Input placeholder="Ví dụ: 13.08, 109.30" />
                        </Form.Item>

                        <Form.Item
                            label="Link Facebook"
                            name="facebookUrl"
                        >
                            <Input placeholder="https://facebook.com/..." />
                        </Form.Item>

                        <Form.Item
                            label="Người xử lý"
                            name="assignedTo"
                        >
                            <Input placeholder="Tên người được gán xử lý" />
                        </Form.Item>

                        <Form.Item
                            label="Ghi chú"
                            name="notes"
                        >
                            <Input.TextArea rows={3} placeholder="Ghi chú nội bộ" />
                        </Form.Item>

                        <Form.Item>
                            <Space>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={editRequestLoading}
                                >
                                    Cập nhật
                                </Button>
                                <Button
                                    onClick={() => {
                                        setEditRequestModalVisible(false);
                                        setEditingRequest(null);
                                        editRequestForm.resetFields();
                                    }}
                                >
                                    Hủy
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Modal>
            </Content>
        </Layout>
    );
}

export default AdminDashboard;

