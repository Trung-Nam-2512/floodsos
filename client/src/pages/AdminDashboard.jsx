import { useState, useEffect } from 'react';
import { Layout, Card, Table, Button, Select, Input, Tag, Space, Typography, Statistic, Row, Col, message, Modal, Upload, Tabs, Image, Form, Popconfirm, Alert, Checkbox } from 'antd';
import { PhoneOutlined, GlobalOutlined, ReloadOutlined, DownloadOutlined, SearchOutlined, FilterOutlined, UploadOutlined, PictureOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import GeoFeatureManager from '../components/GeoFeatureManager';
import { resizeImageForUpload } from '../utils/imageResize';
import { parseAndConvertGoogleMapsCoords } from '../utils/coordinateTransform';
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
    const [loadingHotlines, setLoadingHotlines] = useState(false);
    const [hotlineModalVisible, setHotlineModalVisible] = useState(false);
    const [editingHotline, setEditingHotline] = useState(null);
    const [hotlineForm] = Form.useForm();

    // Safe Points / Rescue Teams states
    const [safePoints, setSafePoints] = useState([]);
    const [loadingSafePoints, setLoadingSafePoints] = useState(false);
    const [safePointModalVisible, setSafePointModalVisible] = useState(false);
    const [editingSafePoint, setEditingSafePoint] = useState(null);
    const [safePointForm] = Form.useForm();

    // Relief Points states
    const [reliefPoints, setReliefPoints] = useState([]);
    const [loadingReliefPoints, setLoadingReliefPoints] = useState(false);
    const [reliefPointModalVisible, setReliefPointModalVisible] = useState(false);
    const [editingReliefPoint, setEditingReliefPoint] = useState(null);
    const [reliefPointForm] = Form.useForm();
    const [reliefPointGoogleMapsUrl, setReliefPointGoogleMapsUrl] = useState('');
    const [reliefPointParsedCoords, setReliefPointParsedCoords] = useState(null);

    // Edit Rescue Request states
    const [editRequestModalVisible, setEditRequestModalVisible] = useState(false);
    const [editingRequest, setEditingRequest] = useState(null);
    const [editRequestLoading, setEditRequestLoading] = useState(false);
    const [editRequestForm] = Form.useForm();

    // Filters
    const [urgencyFilter, setUrgencyFilter] = useState(null);
    const [statusFilter, setStatusFilter] = useState(null);
    const [searchText, setSearchText] = useState('');

    // News states
    const [news, setNews] = useState([]);
    const [loadingNews, setLoadingNews] = useState(false);
    const [newsModalVisible, setNewsModalVisible] = useState(false);
    const [editingNews, setEditingNews] = useState(null);
    const [newsForm] = Form.useForm();
    const [newsPagination, setNewsPagination] = useState({ page: 1, limit: 20, total: 0 });

    // Support Requests states
    const [supportRequests, setSupportRequests] = useState([]);
    const [supportStats, setSupportStats] = useState(null);
    const [loadingSupportRequests, setLoadingSupportRequests] = useState(false);
    const [supportPagination, setSupportPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
    const [supportStatusFilter, setSupportStatusFilter] = useState(null);
    const [supportSearchText, setSupportSearchText] = useState('');
    const [editSupportModalVisible, setEditSupportModalVisible] = useState(false);
    const [editingSupportRequest, setEditingSupportRequest] = useState(null);
    const [editSupportLoading, setEditSupportLoading] = useState(false);
    const [editSupportForm] = Form.useForm();


    // Fetch stats
    const fetchStats = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/rescue-requests/admin/stats`);
            if (response.data.success) {
                console.log('📊 Stats received:', response.data.data);
                setStats(response.data.data);
            } else {
                console.error('❌ Stats API returned error:', response.data);
            }
        } catch (error) {
            console.error('❌ Lỗi lấy stats:', error);
            // Set default stats để UI không bị lỗi
            setStats({
                total: 0,
                byStatus: {},
                last24h: 0,
                byUrgency: {}
            });
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
        console.log('🔄 Cập nhật status:', { id, newStatus, currentStatus: record.status });

        // Optimistic update: cập nhật UI ngay lập tức
        setRequests(prevRequests =>
            prevRequests.map(req =>
                req._id === id ? { ...req, status: newStatus } : req
            )
        );

        try {
            const response = await axios.put(`${API_URL}/api/rescue-requests/${id}/status`, {
                status: newStatus
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('📥 Response từ API:', response.data);

            if (response.data.success) {
                message.success('Đã cập nhật status');
                // Update state với data từ response thay vì fetch lại toàn bộ
                if (response.data.data) {
                    console.log('✅ Cập nhật state với data từ response:', response.data.data);
                    setRequests(prevRequests =>
                        prevRequests.map(req =>
                            req._id === id ? { ...req, ...response.data.data } : req
                        )
                    );
                }
                // Chỉ refresh stats, không fetch lại requests để tránh overwrite
                fetchStats();
            } else {
                console.error('❌ API trả về success: false', response.data);
                // Rollback nếu API fail
                setRequests(prevRequests =>
                    prevRequests.map(req =>
                        req._id === id ? { ...req, status: record.status } : req
                    )
                );
                message.error(response.data.message || 'Cập nhật thất bại');
            }
        } catch (error) {
            console.error('❌ Lỗi cập nhật status:', error);
            console.error('❌ Error response:', error.response?.data);
            message.error(error.response?.data?.message || 'Không thể cập nhật status');
            // Rollback nếu có lỗi
            setRequests(prevRequests =>
                prevRequests.map(req =>
                    req._id === id ? { ...req, status: record.status } : req
                )
            );
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
            googleMapsUrl: record.googleMapsUrl || '',
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

            // Xử lý coords và googleMapsUrl
            if (values.googleMapsUrl && values.googleMapsUrl.trim()) {
                // Nếu có Google Maps link, gửi cả link và coords (nếu có)
                updateData.googleMapsUrl = values.googleMapsUrl.trim();
                if (coords) {
                    updateData.coords = coords;
                }
            } else if (coords) {
                // Nếu không có Google Maps link, chỉ gửi coords
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
                // Refresh cả requests và stats với delay nhỏ để đảm bảo DB đã update
                setTimeout(() => {
                    fetchRequests(pagination.page);
                    fetchStats();
                }, 300);
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
        console.log('🗑️  Bắt đầu xóa rescue request:', id);
        try {
            const response = await axios.delete(`${API_URL}/api/rescue-requests/${id}`);
            console.log('📥 Response từ API:', response.data);

            if (response.data.success) {
                message.success('Đã xóa báo cáo thành công!');
                // Optimistic update: xóa ngay khỏi UI
                setRequests(prevRequests => prevRequests.filter(req => req._id !== id));
                // Refresh cả requests và stats với delay nhỏ để đảm bảo DB đã update
                setTimeout(() => {
                    fetchRequests(pagination.page);
                    fetchStats();
                }, 300);
            } else {
                console.error('❌ API trả về success: false', response.data);
                message.error(response.data.message || 'Xóa thất bại');
            }
        } catch (error) {
            console.error('❌ Lỗi xóa:', error);
            console.error('❌ Error response:', error.response?.data);
            message.error(error.response?.data?.message || 'Lỗi khi xóa báo cáo');
        }
    };

    // Fetch hotlines
    const fetchHotlines = async () => {
        setLoadingHotlines(true);
        try {
            const response = await axios.get(`${API_URL}/api/hotlines`);
            if (response.data.success) {
                setHotlines(response.data.data);
            }
        } catch (error) {
            console.error('Lỗi lấy hotlines:', error);
            message.error('Không thể tải danh sách hotline');
        } finally {
            setLoadingHotlines(false);
        }
    };

    // Open hotline modal (create or edit)
    const openHotlineModal = (hotline = null) => {
        setEditingHotline(hotline);
        if (hotline) {
            hotlineForm.setFieldsValue({
                province: hotline.province,
                unit: hotline.unit,
                phone: hotline.phone,
                note: hotline.note || '',
                imageTitle: hotline.imageTitle || hotline.unit || ''
            });
        } else {
            hotlineForm.resetFields();
        }
        setHotlineModalVisible(true);
    };

    // Handle hotline submit (create or update)
    const handleHotlineSubmit = async (values) => {
        try {
            const { image, ...otherValues } = values;

            // Lấy file object từ fileList
            const fileObj = Array.isArray(image) && image.length > 0
                ? (image[0]?.originFileObj || image[0])
                : null;

            let imageBase64 = null;
            if (fileObj) {
                try {
                    // Resize và convert file to base64
                    const processingMessage = message.loading('Đang xử lý và nén ảnh...', 0);
                    imageBase64 = await resizeImageForUpload(fileObj);
                    processingMessage();
                } catch (imgError) {
                    console.error('❌ Lỗi xử lý ảnh:', imgError);
                    message.warning('Không thể xử lý ảnh, sẽ gửi không có ảnh');
                }
            }

            const payload = {
                ...otherValues,
                imageBase64
            };

            if (editingHotline) {
                // Update
                const response = await axios.put(
                    `${API_URL}/api/hotlines/${editingHotline._id}`,
                    payload,
                    { headers: { 'Content-Type': 'application/json' } }
                );

                if (response.data.success) {
                    message.success('Đã cập nhật hotline thành công!');
                    setHotlineModalVisible(false);
                    setEditingHotline(null);
                    hotlineForm.resetFields();
                    fetchHotlines();
                } else {
                    message.error(response.data.message || 'Cập nhật thất bại');
                }
            } else {
                // Create
                const response = await axios.post(
                    `${API_URL}/api/hotlines`,
                    payload,
                    { headers: { 'Content-Type': 'application/json' } }
                );

                if (response.data.success) {
                    message.success('Đã tạo hotline thành công!');
                    setHotlineModalVisible(false);
                    hotlineForm.resetFields();
                    fetchHotlines();
                } else {
                    message.error(response.data.message || 'Tạo thất bại');
                }
            }
        } catch (error) {
            console.error('Lỗi submit hotline:', error);
            message.error(error.response?.data?.message || 'Lỗi khi lưu hotline');
        }
    };

    // Handle delete hotline
    const handleDeleteHotline = async (id) => {
        try {
            const response = await axios.delete(`${API_URL}/api/hotlines/${id}`);
            if (response.data.success) {
                message.success('Đã xóa hotline thành công!');
                fetchHotlines();
            } else {
                message.error(response.data.message || 'Xóa thất bại');
            }
        } catch (error) {
            console.error('Lỗi xóa hotline:', error);
            message.error(error.response?.data?.message || 'Lỗi khi xóa hotline');
        }
    };

    // Fetch news
    const fetchNews = async (page = 1) => {
        setLoadingNews(true);
        try {
            const response = await axios.get(`${API_URL}/api/news?page=${page}&limit=${newsPagination.limit}`);
            if (response.data.success) {
                setNews(response.data.data);
                setNewsPagination({
                    ...newsPagination,
                    page: response.data.pagination.page,
                    total: response.data.pagination.total
                });
            }
        } catch (error) {
            console.error('Lỗi lấy tin tức:', error);
            message.error('Không thể tải danh sách tin tức');
        } finally {
            setLoadingNews(false);
        }
    };

    // Fetch support requests stats
    const fetchSupportStats = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/support-requests/admin/stats`);
            if (response.data.success) {
                setSupportStats(response.data.data);
            }
        } catch (error) {
            console.error('❌ Lỗi lấy stats support requests:', error);
            setSupportStats({
                total: 0,
                byStatus: {},
                last24h: 0
            });
        }
    };

    // Fetch support requests
    const fetchSupportRequests = async (page = 1) => {
        setLoadingSupportRequests(true);
        try {
            const params = new URLSearchParams({
                page: page,
                limit: supportPagination.limit
            });

            if (supportStatusFilter) params.append('status', supportStatusFilter);
            if (supportSearchText) params.append('search', supportSearchText);

            const response = await axios.get(`${API_URL}/api/support-requests?${params}`);

            if (response.data.success) {
                setSupportRequests(response.data.data);
                setSupportPagination(response.data.pagination);
            }
        } catch (error) {
            console.error('Lỗi lấy support requests:', error);
            message.error('Không thể tải dữ liệu');
        } finally {
            setLoadingSupportRequests(false);
        }
    };

    // Update support request status
    const updateSupportStatus = async (id, newStatus, record) => {
        // Optimistic update: cập nhật UI ngay lập tức
        setSupportRequests(prevRequests =>
            prevRequests.map(req =>
                req._id === id ? { ...req, status: newStatus } : req
            )
        );

        try {
            const response = await axios.put(`${API_URL}/api/support-requests/${id}/status`, {
                status: newStatus
            });

            if (response.data.success) {
                message.success('Đã cập nhật status');
                // Update state với data từ response thay vì fetch lại toàn bộ
                if (response.data.data) {
                    setSupportRequests(prevRequests =>
                        prevRequests.map(req =>
                            req._id === id ? { ...req, ...response.data.data } : req
                        )
                    );
                }
                // Chỉ refresh stats, không fetch lại requests để tránh overwrite
                fetchSupportStats();
            } else {
                // Rollback nếu API fail
                setSupportRequests(prevRequests =>
                    prevRequests.map(req =>
                        req._id === id ? { ...req, status: record.status } : req
                    )
                );
                message.error(response.data.message || 'Cập nhật thất bại');
            }
        } catch (error) {
            console.error('Lỗi cập nhật status:', error);
            message.error('Không thể cập nhật status');
            // Rollback nếu có lỗi
            setSupportRequests(prevRequests =>
                prevRequests.map(req =>
                    req._id === id ? { ...req, status: record.status } : req
                )
            );
        }
    };

    // Open edit support request modal
    const openEditSupportModal = (request) => {
        setEditingSupportRequest(request);
        editSupportForm.setFieldsValue({
            name: request.name || '',
            phone: request.phone || '',
            description: request.description || '',
            needs: request.needs || [],
            peopleCount: request.peopleCount || 1,
            status: request.status || 'Chưa xử lý',
            notes: request.notes || ''
        });
        setEditSupportModalVisible(true);
    };

    // Handle edit support request submit
    const handleEditSupportSubmit = async (values) => {
        setEditSupportLoading(true);
        try {
            const updateData = {
                name: values.name,
                phone: values.phone,
                description: values.description,
                needs: values.needs,
                peopleCount: values.peopleCount,
                status: values.status,
                notes: values.notes
            };

            const response = await axios.put(
                `${API_URL}/api/support-requests/${editingSupportRequest._id}`,
                updateData
            );

            if (response.data.success) {
                message.success('Đã cập nhật thông tin thành công!');
                setEditSupportModalVisible(false);
                setEditingSupportRequest(null);
                editSupportForm.resetFields();
                setTimeout(() => {
                    fetchSupportRequests(supportPagination.page);
                    fetchSupportStats();
                }, 300);
            } else {
                message.error(response.data.message || 'Cập nhật thất bại');
            }
        } catch (error) {
            console.error('Lỗi cập nhật:', error);
            message.error(error.response?.data?.message || 'Lỗi khi cập nhật thông tin');
        } finally {
            setEditSupportLoading(false);
        }
    };

    // Handle delete support request
    const handleDeleteSupport = async (id) => {
        try {
            const response = await axios.delete(`${API_URL}/api/support-requests/${id}`);
            if (response.data.success) {
                message.success('Đã xóa yêu cầu hỗ trợ thành công!');
                setTimeout(() => {
                    fetchSupportRequests(supportPagination.page);
                    fetchSupportStats();
                }, 300);
            } else {
                message.error(response.data.message || 'Xóa thất bại');
            }
        } catch (error) {
            console.error('Lỗi xóa:', error);
            message.error(error.response?.data?.message || 'Lỗi khi xóa yêu cầu hỗ trợ');
        }
    };

    // Open news modal (create or edit)
    const openNewsModal = (newsItem = null) => {
        setEditingNews(newsItem);
        if (newsItem) {
            newsForm.setFieldsValue({
                title: newsItem.title || '',
                content: newsItem.content || '',
                category: newsItem.category || 'cập nhật tình hình',
                sourceUrl: newsItem.sourceUrl || '',
                author: newsItem.author || 'Admin'
            });
        } else {
            newsForm.resetFields();
        }
        setNewsModalVisible(true);
    };

    // Handle news form submit
    const handleNewsSubmit = async (values) => {
        if (!values.title || !values.content) {
            message.error('Vui lòng nhập đầy đủ thông tin');
            return;
        }

        setLoadingNews(true);

        try {
            const formData = {
                title: values.title.trim(),
                content: values.content.trim(),
                category: values.category,
                sourceUrl: values.sourceUrl && values.sourceUrl.trim() ? values.sourceUrl.trim() : null,
                author: values.author && values.author.trim() ? values.author.trim() : 'Admin'
            };

            // Xử lý hình ảnh nếu có (giống cách xử lý hotline)
            const { image } = values;

            // Lấy file object từ fileList (với valuePropName="fileList", giá trị sẽ là mảng fileList)
            const fileObj = Array.isArray(image) && image.length > 0
                ? (image[0]?.originFileObj || image[0])
                : null;

            if (fileObj) {
                // Resize và convert file to base64
                try {
                    const processingMessage = message.loading('Đang xử lý và nén ảnh...', 0);
                    const base64 = await resizeImageForUpload(fileObj);
                    processingMessage();
                    formData.imageBase64 = base64;
                    await submitNewsData(formData);
                } catch (error) {
                    console.error('Lỗi xử lý hình ảnh:', error);
                    message.error('Lỗi khi xử lý hình ảnh');
                    setLoadingNews(false);
                }
            } else {
                // Không có ảnh mới, submit luôn
                await submitNewsData(formData);
            }
        } catch (error) {
            console.error('Lỗi submit tin tức:', error);
            message.error('Lỗi khi lưu tin tức');
            setLoadingNews(false);
        }
    };

    const submitNewsData = async (formData) => {
        try {
            let response;
            if (editingNews) {
                // Update
                response = await axios.put(`${API_URL}/api/news/${editingNews._id}`, formData);
            } else {
                // Create
                response = await axios.post(`${API_URL}/api/news`, formData);
            }

            if (response.data.success) {
                message.success(editingNews ? 'Đã cập nhật tin tức thành công!' : 'Đã đăng tin tức thành công!');
                setNewsModalVisible(false);
                setEditingNews(null);
                newsForm.resetFields();
                fetchNews(newsPagination.page);
            } else {
                message.error(response.data.message || 'Lỗi khi lưu tin tức');
            }
        } catch (error) {
            console.error('Lỗi submit:', error);
            message.error(error.response?.data?.message || 'Lỗi khi lưu tin tức');
        } finally {
            setLoadingNews(false);
        }
    };

    // Handle delete news
    const handleDeleteNews = async (id) => {
        try {
            const response = await axios.delete(`${API_URL}/api/news/${id}`);
            if (response.data.success) {
                message.success('Đã xóa tin tức thành công!');
                fetchNews(newsPagination.page);
            } else {
                message.error(response.data.message || 'Xóa thất bại');
            }
        } catch (error) {
            console.error('Lỗi xóa tin tức:', error);
            message.error(error.response?.data?.message || 'Lỗi khi xóa tin tức');
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
            // Đảm bảo lat, lng, capacity là number
            const submitData = {
                ...values,
                lat: typeof values.lat === 'string' ? parseFloat(values.lat) : values.lat,
                lng: typeof values.lng === 'string' ? parseFloat(values.lng) : values.lng,
                capacity: values.capacity !== undefined && values.capacity !== null
                    ? (typeof values.capacity === 'string' ? parseInt(values.capacity, 10) : values.capacity)
                    : undefined
            };

            // Validate lại trước khi gửi
            if (isNaN(submitData.lat) || isNaN(submitData.lng)) {
                message.error('Vĩ độ và kinh độ phải là số hợp lệ');
                return;
            }

            if (submitData.lat < -90 || submitData.lat > 90) {
                message.error('Vĩ độ phải từ -90 đến 90');
                return;
            }

            if (submitData.lng < -180 || submitData.lng > 180) {
                message.error('Kinh độ phải từ -180 đến 180');
                return;
            }

            if (editingSafePoint) {
                // Update
                const response = await axios.put(`${API_URL}/api/safe-points/${editingSafePoint._id}`, submitData);
                if (response.data.success) {
                    message.success('Đã cập nhật đội cứu hộ thành công');
                    setSafePointModalVisible(false);
                    safePointForm.resetFields();
                    setEditingSafePoint(null);
                    fetchSafePoints();
                }
            } else {
                // Create
                const response = await axios.post(`${API_URL}/api/safe-points`, submitData);
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

    // Fetch relief points
    const fetchReliefPoints = async () => {
        setLoadingReliefPoints(true);
        try {
            const response = await axios.get(`${API_URL}/api/relief-points`);
            if (response.data.success) {
                setReliefPoints(response.data.data);
            }
        } catch (error) {
            console.error('Lỗi lấy relief points:', error);
            message.error('Không thể lấy danh sách điểm tiếp nhận cứu trợ');
        } finally {
            setLoadingReliefPoints(false);
        }
    };

    // Handler Google Maps URL change cho relief point
    const handleReliefPointGoogleMapsLinkChange = (e) => {
        const url = e.target.value.trim();
        setReliefPointGoogleMapsUrl(url);
        if (url) {
            const coords = parseAndConvertGoogleMapsCoords(url, { outputFormat: 'object' });
            if (coords && coords.lat && coords.lng) {
                setReliefPointParsedCoords(coords);
                reliefPointForm.setFieldsValue({
                    lat: coords.lat,
                    lng: coords.lng
                });
                message.success(`✅ Đã tìm thấy tọa độ: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
            } else {
                setReliefPointParsedCoords(null);
            }
        } else {
            setReliefPointParsedCoords(null);
        }
    };

    // Create/Update relief point
    const handleReliefPointSubmit = async (values) => {
        try {
            // Lấy tọa độ từ Google Maps URL hoặc lat/lng trực tiếp
            let finalLat = values.lat;
            let finalLng = values.lng;

            if (reliefPointGoogleMapsUrl && reliefPointParsedCoords) {
                finalLat = reliefPointParsedCoords.lat;
                finalLng = reliefPointParsedCoords.lng;
            } else if (editingReliefPoint && !finalLat && !finalLng) {
                // Giữ nguyên tọa độ cũ nếu đang edit và không có thay đổi
                finalLat = editingReliefPoint.lat;
                finalLng = editingReliefPoint.lng;
            }

            if (!finalLat || !finalLng) {
                message.error('Vui lòng cung cấp tọa độ (Google Maps URL hoặc nhập trực tiếp)');
                return;
            }

            if (typeof finalLat !== 'number' || typeof finalLng !== 'number') {
                message.error('Tọa độ không hợp lệ');
                return;
            }

            if (finalLat < -90 || finalLat > 90 || finalLng < -180 || finalLng > 180) {
                message.error('Tọa độ không hợp lệ');
                return;
            }

            // Validate reliefType - phải là array
            let reliefTypes = values.reliefType;
            if (!Array.isArray(reliefTypes) || reliefTypes.length === 0) {
                message.error('Vui lòng chọn ít nhất một loại cứu trợ');
                return;
            }

            // Xử lý type - nếu là array thì lấy phần tử đầu tiên hoặc join
            let finalType = values.type;
            if (Array.isArray(finalType)) {
                finalType = finalType.length > 0 ? finalType[0] : 'Điểm tiếp nhận cứu trợ';
            }

            const submitData = {
                ...values,
                type: finalType,
                lat: finalLat,
                lng: finalLng,
                reliefType: reliefTypes,
                capacity: values.capacity !== undefined && values.capacity !== null && values.capacity !== ''
                    ? (typeof values.capacity === 'string' ? parseInt(values.capacity, 10) : values.capacity)
                    : null,
                currentOccupancy: values.currentOccupancy !== undefined && values.currentOccupancy !== null && values.currentOccupancy !== ''
                    ? (typeof values.currentOccupancy === 'string' ? parseInt(values.currentOccupancy, 10) : values.currentOccupancy)
                    : null,
                googleMapsUrl: reliefPointGoogleMapsUrl || null
            };

            if (editingReliefPoint) {
                const response = await axios.put(`${API_URL}/api/relief-points/${editingReliefPoint._id}`, submitData);
                if (response.data.success) {
                    message.success('Đã cập nhật điểm tiếp nhận cứu trợ thành công');
                    setReliefPointModalVisible(false);
                    reliefPointForm.resetFields();
                    setEditingReliefPoint(null);
                    fetchReliefPoints();
                }
            } else {
                const response = await axios.post(`${API_URL}/api/relief-points`, submitData);
                if (response.data.success) {
                    message.success('Đã tạo điểm tiếp nhận cứu trợ thành công');
                    setReliefPointModalVisible(false);
                    reliefPointForm.resetFields();
                    fetchReliefPoints();
                }
            }
        } catch (error) {
            console.error('Lỗi lưu relief point:', error);
            message.error(error.response?.data?.message || 'Không thể lưu điểm tiếp nhận cứu trợ');
        }
    };

    // Delete relief point
    const handleDeleteReliefPoint = async (id) => {
        if (!window.confirm('Bạn có chắc chắn muốn xóa điểm tiếp nhận cứu trợ này?')) {
            return;
        }
        try {
            const response = await axios.delete(`${API_URL}/api/relief-points/${id}`);
            if (response.data.success) {
                message.success('Đã xóa điểm tiếp nhận cứu trợ thành công');
                fetchReliefPoints();
            }
        } catch (error) {
            console.error('Lỗi xóa relief point:', error);
            message.error('Không thể xóa điểm tiếp nhận cứu trợ');
        }
    };

    // Open modal for create/edit relief point
    const openReliefPointModal = (point = null) => {
        setEditingReliefPoint(point);
        setReliefPointGoogleMapsUrl('');
        setReliefPointParsedCoords(null);
        if (point) {
            reliefPointForm.setFieldsValue({
                name: point.name,
                lat: point.lat,
                lng: point.lng,
                address: point.address,
                phone: point.phone,
                capacity: point.capacity,
                currentOccupancy: point.currentOccupancy,
                description: point.description,
                status: point.status,
                type: point.type,
                reliefType: Array.isArray(point.reliefType) ? point.reliefType : [point.reliefType || 'Hỗn hợp'],
                operatingHours: point.operatingHours,
                contactPerson: point.contactPerson,
                notes: point.notes
            });
        } else {
            reliefPointForm.resetFields();
        }
        setReliefPointModalVisible(true);
    };


    useEffect(() => {
        fetchStats();
        fetchRequests();
        fetchHotlines();
        fetchSafePoints();
        fetchReliefPoints();
        fetchNews(); // Thêm fetchNews khi component mount
        fetchSupportStats();
        fetchSupportRequests();

        // Tối ưu hiệu năng: Auto refresh với dynamic interval
        let interval = null;

        const setupInterval = () => {
            if (interval) clearInterval(interval);

            // Interval dài hơn khi tab hidden
            const intervalTime = document.hidden ? 120000 : 60000; // 1 phút khi visible, 2 phút khi hidden

            interval = setInterval(() => {
                if (!document.hidden) {
                    fetchStats();
                    fetchRequests(pagination.page);
                    fetchSafePoints();
                    fetchReliefPoints();
                    fetchNews(newsPagination.page); // Thêm fetchNews vào auto refresh
                }
            }, intervalTime);
        };

        setupInterval();

        // Lắng nghe visibility change
        const handleVisibilityChange = () => {
            setupInterval();
            if (!document.hidden) {
                // Fetch ngay khi tab trở lại visible
                fetchStats();
                fetchRequests(pagination.page);
                fetchSafePoints();
                fetchReliefPoints();
                fetchNews(newsPagination.page); // Thêm fetchNews khi tab trở lại visible
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (interval) clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        fetchRequests(1); // Reset về page 1 khi filter thay đổi
    }, [urgencyFilter, statusFilter, searchText]);

    useEffect(() => {
        fetchSupportRequests(1); // Reset về page 1 khi filter thay đổi
    }, [supportStatusFilter, supportSearchText]);

    // Xem hình ảnh
    const viewImage = (imagePath) => {
        if (imagePath) {
            window.open(`${API_URL}${imagePath}`, '_blank');
        }
    };

    // Columns for table
    // Support Requests columns
    const supportColumns = [
        {
            title: 'Thời gian',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 150,
            render: (createdAt) => new Date(createdAt).toLocaleString('vi-VN'),
            sorter: (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        },
        {
            title: 'Tên người yêu cầu',
            dataIndex: 'name',
            key: 'name',
            width: 150,
            ellipsis: true
        },
        {
            title: 'Số điện thoại',
            dataIndex: 'phone',
            key: 'phone',
            width: 120,
            render: (phone) => phone || 'Không có'
        },
        {
            title: 'Nhu cầu',
            dataIndex: 'needs',
            key: 'needs',
            width: 200,
            render: (needs) => (
                <Space wrap>
                    {needs && needs.map((need, idx) => (
                        <Tag key={idx} color="blue">{need}</Tag>
                    ))}
                </Space>
            )
        },
        {
            title: 'Số người',
            dataIndex: 'peopleCount',
            key: 'peopleCount',
            width: 100,
            render: (count) => count ? `${count} người` : '-'
        },
        {
            title: 'Mô tả',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            render: (text, record) => (
                <div>
                    <Text>{text?.substring(0, 100) || ''}</Text>
                    {record.imagePath && <div style={{ fontSize: '11px', color: '#999' }}>📷 Có ảnh</div>}
                </div>
            )
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 180,
            render: (status, record) => (
                <Select
                    key={`support-status-${record._id}-${status}`}
                    value={status}
                    style={{ width: '100%' }}
                    onChange={(value) => updateSupportStatus(record._id, value, record)}
                >
                    <Option value="Chưa xử lý">Chưa xử lý</Option>
                    <Option value="Đang xử lý">Đang xử lý</Option>
                    <Option value="Đã hỗ trợ">Đã hỗ trợ</Option>
                </Select>
            )
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 200,
            render: (_, record) => (
                <Space size="small" wrap>
                    <Button
                        size="small"
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={() => openEditSupportModal(record)}
                    >
                        Sửa
                    </Button>
                    <Popconfirm
                        title="Xóa yêu cầu hỗ trợ này?"
                        description="Bạn có chắc chắn muốn xóa yêu cầu hỗ trợ này? Hành động này không thể hoàn tác."
                        icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                        onConfirm={() => handleDeleteSupport(record._id)}
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
                    {record.phone && (
                        <Button
                            size="small"
                            icon={<PhoneOutlined />}
                            href={`tel:${record.phone}`}
                        >
                            Gọi
                        </Button>
                    )}
                </Space>
            )
        }
    ];

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
                        key={`status-${record._id}-${status}`}
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
                                    {stats ? (
                                        <Row gutter={16} style={{ marginBottom: 24 }}>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="Tổng số cầu cứu"
                                                        value={stats.total || 0}
                                                        valueStyle={{ color: '#3f8600' }}
                                                    />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="Chưa xử lý"
                                                        value={stats.byStatus?.['Chưa xử lý'] || 0}
                                                        valueStyle={{ color: '#cf1322' }}
                                                    />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="Đang xử lý"
                                                        value={stats.byStatus?.['Đang xử lý'] || 0}
                                                        valueStyle={{ color: '#faad14' }}
                                                    />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="24h gần đây"
                                                        value={stats.last24h || 0}
                                                        valueStyle={{ color: '#1890ff' }}
                                                    />
                                                </Card>
                                            </Col>
                                        </Row>
                                    ) : (
                                        <Row gutter={16} style={{ marginBottom: 24 }}>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic title="Tổng số cầu cứu" value={0} valueStyle={{ color: '#3f8600' }} />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic title="Chưa xử lý" value={0} valueStyle={{ color: '#cf1322' }} />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic title="Đang xử lý" value={0} valueStyle={{ color: '#faad14' }} />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic title="24h gần đây" value={0} valueStyle={{ color: '#1890ff' }} />
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
                            key: 'support',
                            label: '🎁 Quản lý Yêu cầu Hỗ trợ',
                            children: (
                                <>
                                    {/* Stats */}
                                    {supportStats ? (
                                        <Row gutter={16} style={{ marginBottom: 24 }}>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="Tổng số yêu cầu"
                                                        value={supportStats.total || 0}
                                                        valueStyle={{ color: '#3f8600' }}
                                                    />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="Chưa xử lý"
                                                        value={supportStats.byStatus?.['Chưa xử lý'] || 0}
                                                        valueStyle={{ color: '#cf1322' }}
                                                    />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="Đang xử lý"
                                                        value={supportStats.byStatus?.['Đang xử lý'] || 0}
                                                        valueStyle={{ color: '#faad14' }}
                                                    />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic
                                                        title="24h gần đây"
                                                        value={supportStats.last24h || 0}
                                                        valueStyle={{ color: '#1890ff' }}
                                                    />
                                                </Card>
                                            </Col>
                                        </Row>
                                    ) : (
                                        <Row gutter={16} style={{ marginBottom: 24 }}>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic title="Tổng số yêu cầu" value={0} valueStyle={{ color: '#3f8600' }} />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic title="Chưa xử lý" value={0} valueStyle={{ color: '#cf1322' }} />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic title="Đang xử lý" value={0} valueStyle={{ color: '#faad14' }} />
                                                </Card>
                                            </Col>
                                            <Col xs={24} sm={12} md={6}>
                                                <Card>
                                                    <Statistic title="24h gần đây" value={0} valueStyle={{ color: '#1890ff' }} />
                                                </Card>
                                            </Col>
                                        </Row>
                                    )}

                                    {/* Filters & Actions */}
                                    <Card style={{ marginBottom: 16 }}>
                                        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                                            <Space wrap>
                                                <Input.Search
                                                    placeholder="Tìm theo tên, SĐT, mô tả"
                                                    allowClear
                                                    style={{ width: 250 }}
                                                    onSearch={setSupportSearchText}
                                                    prefix={<SearchOutlined />}
                                                />
                                                <Select
                                                    placeholder="Status"
                                                    style={{ width: 150 }}
                                                    allowClear
                                                    onChange={setSupportStatusFilter}
                                                >
                                                    <Option value="Chưa xử lý">Chưa xử lý</Option>
                                                    <Option value="Đang xử lý">Đang xử lý</Option>
                                                    <Option value="Đã hỗ trợ">Đã hỗ trợ</Option>
                                                </Select>
                                                <Button icon={<ReloadOutlined />} onClick={() => fetchSupportRequests(supportPagination.page)}>
                                                    Làm mới
                                                </Button>
                                            </Space>
                                        </Space>
                                    </Card>

                                    {/* Table */}
                                    <Card>
                                        <Table
                                            columns={supportColumns}
                                            dataSource={supportRequests}
                                            rowKey="_id"
                                            loading={loadingSupportRequests}
                                            pagination={{
                                                current: supportPagination.page,
                                                pageSize: supportPagination.limit,
                                                total: supportPagination.total,
                                                showTotal: (total) => `Tổng ${total} yêu cầu`,
                                                onChange: (page) => fetchSupportRequests(page)
                                            }}
                                            scroll={{ x: 1200 }}
                                            expandable={{
                                                expandedRowRender: (record) => (
                                                    <div style={{ padding: '16px', background: '#fafafa' }}>
                                                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                                            <div>
                                                                <Text strong>📋 Mô tả đầy đủ:</Text>
                                                                <div style={{ marginTop: 8, padding: 12, background: '#fff', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                                                                    {record.description}
                                                                </div>
                                                            </div>

                                                            {record.imagePath && (
                                                                <div>
                                                                    <Text strong>📷 Hình ảnh:</Text>
                                                                    <div style={{ marginTop: 8 }}>
                                                                        <img
                                                                            src={`${API_URL}${record.imagePath}`}
                                                                            alt="Hình ảnh yêu cầu hỗ trợ"
                                                                            style={{ maxWidth: '400px', borderRadius: '8px', cursor: 'pointer' }}
                                                                            onClick={() => viewImage(record.imagePath)}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {record.location && record.location.lat && record.location.lng && (
                                                                <div>
                                                                    <Text strong>📍 Vị trí:</Text>
                                                                    <div style={{ marginTop: 4 }}>
                                                                        <Text>Lat: {record.location.lat.toFixed(6)}, Lng: {record.location.lng.toFixed(6)}</Text>
                                                                    </div>
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

                                    {/* Edit Modal */}
                                    <Modal
                                        title="Sửa Yêu cầu Hỗ trợ"
                                        open={editSupportModalVisible}
                                        onCancel={() => {
                                            setEditSupportModalVisible(false);
                                            setEditingSupportRequest(null);
                                            editSupportForm.resetFields();
                                        }}
                                        footer={null}
                                        width={600}
                                    >
                                        <Form
                                            form={editSupportForm}
                                            layout="vertical"
                                            onFinish={handleEditSupportSubmit}
                                        >
                                            <Form.Item
                                                label="Tên người yêu cầu"
                                                name="name"
                                            >
                                                <Input placeholder="Nhập tên" />
                                            </Form.Item>

                                            <Form.Item
                                                label="Số điện thoại"
                                                name="phone"
                                            >
                                                <Input placeholder="Nhập số điện thoại" />
                                            </Form.Item>

                                            <Form.Item
                                                label="Nhu cầu hỗ trợ"
                                                name="needs"
                                                rules={[{ required: true, message: 'Vui lòng chọn ít nhất một nhu cầu' }]}
                                            >
                                                <Select mode="multiple" placeholder="Chọn nhu cầu">
                                                    <Option value="Thực phẩm">Thực phẩm</Option>
                                                    <Option value="Nước uống">Nước uống</Option>
                                                    <Option value="Quần áo">Quần áo</Option>
                                                    <Option value="Thuốc men">Thuốc men</Option>
                                                    <Option value="Chăn màn">Chăn màn</Option>
                                                    <Option value="Đèn pin">Đèn pin</Option>
                                                    <Option value="Pin">Pin</Option>
                                                    <Option value="Bếp gas">Bếp gas</Option>
                                                    <Option value="Nhu yếu phẩm">Nhu yếu phẩm</Option>
                                                    <Option value="Khác">Khác</Option>
                                                </Select>
                                            </Form.Item>

                                            <Form.Item
                                                label="Số người"
                                                name="peopleCount"
                                                rules={[{ required: true, message: 'Vui lòng nhập số người' }]}
                                            >
                                                <Input type="number" min={1} placeholder="Nhập số người" />
                                            </Form.Item>

                                            <Form.Item
                                                label="Mô tả"
                                                name="description"
                                                rules={[{ required: true, message: 'Vui lòng nhập mô tả' }]}
                                            >
                                                <Input.TextArea rows={4} placeholder="Nhập mô tả chi tiết" />
                                            </Form.Item>

                                            <Form.Item
                                                label="Trạng thái"
                                                name="status"
                                            >
                                                <Select>
                                                    <Option value="Chưa xử lý">Chưa xử lý</Option>
                                                    <Option value="Đang xử lý">Đang xử lý</Option>
                                                    <Option value="Đã hỗ trợ">Đã hỗ trợ</Option>
                                                </Select>
                                            </Form.Item>

                                            <Form.Item
                                                label="Ghi chú"
                                                name="notes"
                                            >
                                                <Input.TextArea rows={3} placeholder="Nhập ghi chú (nếu có)" />
                                            </Form.Item>

                                            <Form.Item>
                                                <Space>
                                                    <Button type="primary" htmlType="submit" loading={editSupportLoading}>
                                                        Cập nhật
                                                    </Button>
                                                    <Button onClick={() => {
                                                        setEditSupportModalVisible(false);
                                                        setEditingSupportRequest(null);
                                                        editSupportForm.resetFields();
                                                    }}>
                                                        Hủy
                                                    </Button>
                                                </Space>
                                            </Form.Item>
                                        </Form>
                                    </Modal>
                                </>
                            )
                        },
                        {
                            key: 'hotlines',
                            label: '📞 Quản lý Hotline',
                            children: (
                                <Card>
                                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <Typography.Title level={4}>
                                                    📞 Quản lý Hotline
                                                </Typography.Title>
                                                <Typography.Text type="secondary">
                                                    Quản lý thông tin các hotline cứu hộ. Có thể upload hình ảnh để hiển thị trên trang báo cáo.
                                                </Typography.Text>
                                            </div>
                                            <Button
                                                type="primary"
                                                icon={<PlusOutlined />}
                                                onClick={() => openHotlineModal()}
                                            >
                                                + Thêm mới
                                            </Button>
                                        </div>

                                        <Table
                                            dataSource={hotlines}
                                            loading={loadingHotlines}
                                            rowKey="_id"
                                            columns={[
                                                {
                                                    title: 'Hình ảnh',
                                                    key: 'image',
                                                    width: 120,
                                                    render: (_, record) => (
                                                        record.imageUrl ? (
                                                            <Image
                                                                src={record.imageUrl.startsWith('http')
                                                                    ? record.imageUrl
                                                                    : `${API_URL}${record.imageUrl}`
                                                                }
                                                                alt={record.imageTitle || record.unit}
                                                                style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }}
                                                                preview
                                                            />
                                                        ) : (
                                                            <div style={{
                                                                width: '80px',
                                                                height: '80px',
                                                                background: '#f0f0f0',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: '#999',
                                                                fontSize: '12px',
                                                                borderRadius: '4px'
                                                            }}>
                                                                Chưa có
                                                            </div>
                                                        )
                                                    )
                                                },
                                                {
                                                    title: 'Tỉnh/Thành phố',
                                                    dataIndex: 'province',
                                                    key: 'province',
                                                    width: 150
                                                },
                                                {
                                                    title: 'Đơn vị',
                                                    dataIndex: 'unit',
                                                    key: 'unit',
                                                    ellipsis: true
                                                },
                                                {
                                                    title: 'Số điện thoại',
                                                    dataIndex: 'phone',
                                                    key: 'phone',
                                                    width: 150,
                                                    render: (phone) => (
                                                        <Text strong style={{ color: '#dc2626' }}>
                                                            📞 {phone}
                                                        </Text>
                                                    )
                                                },
                                                {
                                                    title: 'Ghi chú',
                                                    dataIndex: 'note',
                                                    key: 'note',
                                                    ellipsis: true
                                                },
                                                {
                                                    title: 'Tiêu đề ảnh',
                                                    dataIndex: 'imageTitle',
                                                    key: 'imageTitle',
                                                    ellipsis: true,
                                                    render: (title) => title || '-'
                                                },
                                                {
                                                    title: 'Thao tác',
                                                    key: 'action',
                                                    width: 150,
                                                    render: (_, record) => (
                                                        <Space>
                                                            <Button
                                                                size="small"
                                                                onClick={() => openHotlineModal(record)}
                                                            >
                                                                Sửa
                                                            </Button>
                                                            <Popconfirm
                                                                title="Xóa hotline này?"
                                                                description="Bạn có chắc chắn muốn xóa? Hành động này không thể hoàn tác."
                                                                icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                                                                onConfirm={() => handleDeleteHotline(record._id)}
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
                                                        </Space>
                                                    )
                                                }
                                            ]}
                                            pagination={{
                                                pageSize: 10,
                                                showSizeChanger: true,
                                                showTotal: (total) => `Tổng ${total} hotline`
                                            }}
                                        />
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
                        },
                        {
                            key: 'relief-points',
                            label: '📦 Quản lý Điểm tiếp nhận cứu trợ',
                            children: (
                                <Card>
                                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            flexWrap: 'wrap',
                                            gap: '16px',
                                            marginBottom: '16px'
                                        }}>
                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                <Typography.Title level={4} style={{ margin: 0, marginBottom: '4px' }}>
                                                    📦 Quản lý Điểm tiếp nhận cứu trợ
                                                </Typography.Title>
                                                <Typography.Text type="secondary">
                                                    Quản lý thông tin các điểm tiếp nhận cứu trợ
                                                </Typography.Text>
                                            </div>
                                            <Button
                                                type="primary"
                                                size="large"
                                                icon={<PlusOutlined />}
                                                onClick={() => openReliefPointModal()}
                                                style={{ whiteSpace: 'nowrap' }}
                                            >
                                                + Thêm mới
                                            </Button>
                                        </div>

                                        <div style={{
                                            overflowX: 'auto',
                                            width: '100%'
                                        }}>
                                            <Table
                                                dataSource={reliefPoints}
                                                loading={loadingReliefPoints}
                                                rowKey="_id"
                                                scroll={{ x: 1200 }}
                                                columns={[
                                                    {
                                                        title: 'Tên',
                                                        dataIndex: 'name',
                                                        key: 'name',
                                                        width: 180,
                                                        fixed: 'left',
                                                        ellipsis: {
                                                            showTitle: false
                                                        },
                                                        render: (text) => (
                                                            <Text strong style={{ fontSize: '14px' }} ellipsis={{ tooltip: text }}>
                                                                {text}
                                                            </Text>
                                                        )
                                                    },
                                                    {
                                                        title: 'Loại',
                                                        dataIndex: 'type',
                                                        key: 'type',
                                                        width: 140,
                                                        render: (type) => {
                                                            const typeStr = Array.isArray(type) ? type.join(', ') : (type || 'N/A');
                                                            return (
                                                                <Tag color="blue" style={{ margin: 0 }}>
                                                                    {typeStr.length > 20 ? `${typeStr.substring(0, 20)}...` : typeStr}
                                                                </Tag>
                                                            );
                                                        }
                                                    },
                                                    {
                                                        title: 'Loại cứu trợ',
                                                        dataIndex: 'reliefType',
                                                        key: 'reliefType',
                                                        width: 180,
                                                        render: (reliefType) => {
                                                            if (!reliefType) return <Tag color="default">Hỗn hợp</Tag>;
                                                            const types = Array.isArray(reliefType) ? reliefType : [reliefType];
                                                            if (types.length === 0) return <Tag color="default">Hỗn hợp</Tag>;

                                                            return (
                                                                <Space size={[4, 4]} wrap>
                                                                    {types.slice(0, 2).map((type, idx) => (
                                                                        <Tag key={idx} color="green" style={{ margin: 0 }}>
                                                                            {type}
                                                                        </Tag>
                                                                    ))}
                                                                    {types.length > 2 && (
                                                                        <Tag color="green" style={{ margin: 0 }}>
                                                                            +{types.length - 2}
                                                                        </Tag>
                                                                    )}
                                                                </Space>
                                                            );
                                                        }
                                                    },
                                                    {
                                                        title: 'Địa chỉ',
                                                        dataIndex: 'address',
                                                        key: 'address',
                                                        width: 250,
                                                        ellipsis: {
                                                            showTitle: false
                                                        },
                                                        render: (text) => (
                                                            <Text ellipsis={{ tooltip: text }} style={{ fontSize: '13px' }}>
                                                                {text || '-'}
                                                            </Text>
                                                        )
                                                    },
                                                    {
                                                        title: 'Tọa độ',
                                                        key: 'coords',
                                                        width: 160,
                                                        render: (_, record) => (
                                                            <Text
                                                                type="secondary"
                                                                style={{ fontSize: '12px', fontFamily: 'monospace' }}
                                                                copyable={{ text: `${record.lat}, ${record.lng}` }}
                                                            >
                                                                {record.lat?.toFixed(6)}, {record.lng?.toFixed(6)}
                                                            </Text>
                                                        )
                                                    },
                                                    {
                                                        title: 'Sức chứa',
                                                        key: 'capacity',
                                                        width: 130,
                                                        render: (_, record) => {
                                                            if (record.capacity > 0) {
                                                                const occupancy = record.currentOccupancy || 0;
                                                                const percentage = Math.round((occupancy / record.capacity) * 100);
                                                                const color = percentage >= 90 ? 'red' : percentage >= 70 ? 'orange' : 'green';
                                                                return (
                                                                    <div>
                                                                        <Tag color={color} style={{ margin: 0 }}>
                                                                            {occupancy}/{record.capacity}
                                                                        </Tag>
                                                                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                                                                            {percentage}%
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return <Tag color="default" style={{ margin: 0 }}>Không giới hạn</Tag>;
                                                        }
                                                    },
                                                    {
                                                        title: 'Liên hệ',
                                                        key: 'contact',
                                                        width: 160,
                                                        render: (_, record) => (
                                                            <div>
                                                                {record.phone && (
                                                                    <div style={{ marginBottom: '4px' }}>
                                                                        <PhoneOutlined style={{ marginRight: '4px', color: '#52c41a' }} />
                                                                        <Text
                                                                            copyable={{ text: record.phone }}
                                                                            style={{ fontSize: '13px' }}
                                                                        >
                                                                            {record.phone}
                                                                        </Text>
                                                                    </div>
                                                                )}
                                                                {record.contactPerson && (
                                                                    <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>
                                                                        👤 {record.contactPerson}
                                                                    </Text>
                                                                )}
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        title: 'Trạng thái',
                                                        dataIndex: 'status',
                                                        key: 'status',
                                                        width: 120,
                                                        render: (status) => {
                                                            const colorMap = {
                                                                'Hoạt động': 'green',
                                                                'Tạm ngưng': 'orange',
                                                                'Đầy': 'red',
                                                                'Đã đóng': 'default'
                                                            };
                                                            return (
                                                                <Tag color={colorMap[status] || 'default'} style={{ margin: 0 }}>
                                                                    {status || 'N/A'}
                                                                </Tag>
                                                            );
                                                        }
                                                    },
                                                    {
                                                        title: 'Thao tác',
                                                        key: 'action',
                                                        width: 140,
                                                        fixed: 'right',
                                                        render: (_, record) => (
                                                            <Space size="small" wrap>
                                                                <Button
                                                                    size="small"
                                                                    type="primary"
                                                                    icon={<EditOutlined />}
                                                                    onClick={() => openReliefPointModal(record)}
                                                                >
                                                                    Sửa
                                                                </Button>
                                                                <Popconfirm
                                                                    title="Xóa điểm tiếp nhận cứu trợ?"
                                                                    description="Bạn có chắc chắn muốn xóa điểm này? Hành động này không thể hoàn tác."
                                                                    icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                                                                    onConfirm={() => handleDeleteReliefPoint(record._id)}
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
                                                            </Space>
                                                        )
                                                    }
                                                ]}
                                                pagination={{
                                                    pageSize: 10,
                                                    showSizeChanger: true,
                                                    pageSizeOptions: ['10', '20', '50', '100'],
                                                    showTotal: (total) => `Tổng ${total} điểm tiếp nhận cứu trợ`,
                                                    showQuickJumper: true
                                                }}
                                            />
                                        </div>
                                    </Space>
                                </Card>
                            )
                        },
                        {
                            key: 'geo-features',
                            label: '🗺️ Quản lý Bản đồ',
                            children: <GeoFeatureManager />
                        },
                        {
                            key: 'news',
                            label: '📰 Quản lý Tin tức',
                            children: (
                                <Card>
                                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <Typography.Title level={4}>
                                                    📰 Quản lý Tin tức
                                                </Typography.Title>
                                                <Typography.Text type="secondary">
                                                    Đăng và quản lý tin tức cứu hộ
                                                </Typography.Text>
                                            </div>
                                            <Button
                                                type="primary"
                                                icon={<PlusOutlined />}
                                                onClick={() => openNewsModal(null)}
                                            >
                                                Đăng tin mới
                                            </Button>
                                        </div>

                                        <Table
                                            columns={[
                                                {
                                                    title: 'Tiêu đề',
                                                    dataIndex: 'title',
                                                    key: 'title',
                                                    ellipsis: true,
                                                    render: (text) => <Text strong>{text}</Text>
                                                },
                                                {
                                                    title: 'Phân loại',
                                                    dataIndex: 'category',
                                                    key: 'category',
                                                    width: 150,
                                                    render: (category) => {
                                                        const colors = {
                                                            'thông báo khẩn': 'red',
                                                            'hướng dẫn': 'blue',
                                                            'cập nhật tình hình': 'green'
                                                        };
                                                        const labels = {
                                                            'thông báo khẩn': 'Thông báo khẩn',
                                                            'hướng dẫn': 'Hướng dẫn',
                                                            'cập nhật tình hình': 'Cập nhật tình hình'
                                                        };
                                                        return (
                                                            <Tag color={colors[category] || 'default'}>
                                                                {labels[category] || category}
                                                            </Tag>
                                                        );
                                                    }
                                                },
                                                {
                                                    title: 'Tác giả',
                                                    dataIndex: 'author',
                                                    key: 'author',
                                                    width: 120
                                                },
                                                {
                                                    title: 'Thời gian',
                                                    dataIndex: 'createdAt',
                                                    key: 'createdAt',
                                                    width: 180,
                                                    render: (date) => {
                                                        if (!date) return '-';
                                                        const d = new Date(date);
                                                        return d.toLocaleString('vi-VN');
                                                    }
                                                },
                                                {
                                                    title: 'Lượt xem',
                                                    dataIndex: 'views',
                                                    key: 'views',
                                                    width: 100,
                                                    render: (views) => views || 0
                                                },
                                                {
                                                    title: 'Thao tác',
                                                    key: 'action',
                                                    width: 150,
                                                    render: (_, record) => (
                                                        <Space size="small">
                                                            <Button
                                                                size="small"
                                                                type="primary"
                                                                icon={<EditOutlined />}
                                                                onClick={() => openNewsModal(record)}
                                                            >
                                                                Sửa
                                                            </Button>
                                                            <Popconfirm
                                                                title="Xóa tin tức này?"
                                                                description="Bạn có chắc chắn muốn xóa tin tức này? Hành động này không thể hoàn tác."
                                                                icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                                                                onConfirm={() => handleDeleteNews(record._id)}
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
                                                        </Space>
                                                    )
                                                }
                                            ]}
                                            dataSource={news}
                                            rowKey="_id"
                                            loading={loadingNews}
                                            pagination={{
                                                current: newsPagination.page,
                                                pageSize: newsPagination.limit,
                                                total: newsPagination.total,
                                                showTotal: (total) => `Tổng ${total} tin tức`,
                                                onChange: (page) => fetchNews(page),
                                                onShowSizeChange: (current, size) => {
                                                    setNewsPagination({ ...newsPagination, limit: size, page: 1 });
                                                    fetchNews(1);
                                                }
                                            }}
                                            expandable={{
                                                expandedRowRender: (record) => (
                                                    <div style={{ padding: '16px', background: '#fafafa' }}>
                                                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                                            <div>
                                                                <Text strong>📝 Nội dung:</Text>
                                                                <div style={{ marginTop: 8, padding: 12, background: '#fff', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                                                                    {record.content}
                                                                </div>
                                                            </div>
                                                            {record.imagePath && (
                                                                <div>
                                                                    <Text strong>📷 Hình ảnh:</Text>
                                                                    <div style={{ marginTop: 8 }}>
                                                                        <img
                                                                            src={`${API_URL}${record.imagePath}`}
                                                                            alt={record.title}
                                                                            style={{ maxWidth: '400px', borderRadius: '8px', cursor: 'pointer' }}
                                                                            onClick={() => window.open(`${API_URL}${record.imagePath}`, '_blank')}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {record.sourceUrl && (
                                                                <div>
                                                                    <Text strong>🔗 Link nguồn:</Text>
                                                                    <div style={{ marginTop: 4 }}>
                                                                        <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer">
                                                                            {record.sourceUrl}
                                                                        </a>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </Space>
                                                    </div>
                                                ),
                                                rowExpandable: (record) => true
                                            }}
                                        />
                                    </Space>
                                </Card>
                            )
                        }
                    ]}
                />

                {/* Modal Hotline (Create/Edit) */}
                <Modal
                    title={editingHotline ? 'Sửa Hotline' : 'Thêm Hotline mới'}
                    open={hotlineModalVisible}
                    onCancel={() => {
                        setHotlineModalVisible(false);
                        setEditingHotline(null);
                        hotlineForm.resetFields();
                    }}
                    footer={null}
                    width={600}
                >
                    <Form
                        form={hotlineForm}
                        layout="vertical"
                        onFinish={handleHotlineSubmit}
                    >
                        <Form.Item
                            label="Tỉnh/Thành phố"
                            name="province"
                            rules={[{ required: true, message: 'Vui lòng nhập tỉnh/thành phố' }]}
                        >
                            <Input placeholder="Ví dụ: Phú Yên, Toàn quốc" />
                        </Form.Item>

                        <Form.Item
                            label="Đơn vị"
                            name="unit"
                            rules={[{ required: true, message: 'Vui lòng nhập đơn vị' }]}
                        >
                            <Input placeholder="Ví dụ: Cứu hộ, Cứu hỏa, PCLB Phú Yên" />
                        </Form.Item>

                        <Form.Item
                            label="Số điện thoại"
                            name="phone"
                            rules={[{ required: true, message: 'Vui lòng nhập số điện thoại' }]}
                        >
                            <Input placeholder="Ví dụ: 114, 115, 0257.3841234" />
                        </Form.Item>

                        <Form.Item
                            label="Ghi chú"
                            name="note"
                        >
                            <Input.TextArea rows={2} placeholder="Ví dụ: Cấp cứu y tế, Cứu hỏa" />
                        </Form.Item>

                        <Form.Item
                            label="Tiêu đề hình ảnh"
                            name="imageTitle"
                        >
                            <Input placeholder="Tiêu đề hiển thị trên hình ảnh (tùy chọn)" />
                        </Form.Item>

                        <Form.Item
                            label="Hình ảnh"
                            name="image"
                            valuePropName="fileList"
                            getValueFromEvent={(e) => {
                                if (Array.isArray(e)) {
                                    return e;
                                }
                                return e?.fileList;
                            }}
                        >
                            <Upload
                                listType="picture-card"
                                maxCount={1}
                                beforeUpload={() => false}
                                accept="image/*"
                            >
                                <div>
                                    <PlusOutlined />
                                    <div style={{ marginTop: 8 }}>Upload</div>
                                </div>
                            </Upload>
                        </Form.Item>

                        {editingHotline && editingHotline.imageUrl && (
                            <Form.Item label="Hình ảnh hiện tại">
                                <Image
                                    src={editingHotline.imageUrl.startsWith('http')
                                        ? editingHotline.imageUrl
                                        : `${API_URL}${editingHotline.imageUrl}`
                                    }
                                    alt={editingHotline.imageTitle || editingHotline.unit}
                                    style={{ width: '200px', height: 'auto' }}
                                    preview
                                />
                            </Form.Item>
                        )}

                        <Form.Item>
                            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                                <Button onClick={() => {
                                    setHotlineModalVisible(false);
                                    setEditingHotline(null);
                                    hotlineForm.resetFields();
                                }}>
                                    Hủy
                                </Button>
                                <Button type="primary" htmlType="submit">
                                    {editingHotline ? 'Cập nhật' : 'Tạo mới'}
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
                                    normalize={(value) => {
                                        if (value === '' || value === null || value === undefined) return undefined;
                                        const num = parseFloat(value);
                                        return isNaN(num) ? value : num;
                                    }}
                                    rules={[
                                        { required: true, message: 'Vui lòng nhập vĩ độ' },
                                        {
                                            type: 'number',
                                            message: 'Vĩ độ phải là số',
                                            transform: (value) => {
                                                if (value === '' || value === null || value === undefined) return undefined;
                                                const num = parseFloat(value);
                                                return isNaN(num) ? undefined : num;
                                            }
                                        },
                                        {
                                            validator: (_, value) => {
                                                if (!value && value !== 0) return Promise.resolve();
                                                if (typeof value === 'number' && value >= -90 && value <= 90) {
                                                    return Promise.resolve();
                                                }
                                                return Promise.reject(new Error('Vĩ độ phải từ -90 đến 90'));
                                            }
                                        }
                                    ]}
                                >
                                    <Input type="number" step="any" placeholder="12.75" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="Kinh độ (Longitude)"
                                    name="lng"
                                    normalize={(value) => {
                                        if (value === '' || value === null || value === undefined) return undefined;
                                        const num = parseFloat(value);
                                        return isNaN(num) ? value : num;
                                    }}
                                    rules={[
                                        { required: true, message: 'Vui lòng nhập kinh độ' },
                                        {
                                            type: 'number',
                                            message: 'Kinh độ phải là số',
                                            transform: (value) => {
                                                if (value === '' || value === null || value === undefined) return undefined;
                                                const num = parseFloat(value);
                                                return isNaN(num) ? undefined : num;
                                            }
                                        },
                                        {
                                            validator: (_, value) => {
                                                if (!value && value !== 0) return Promise.resolve();
                                                if (typeof value === 'number' && value >= -180 && value <= 180) {
                                                    return Promise.resolve();
                                                }
                                                return Promise.reject(new Error('Kinh độ phải từ -180 đến 180'));
                                            }
                                        }
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
                                    normalize={(value) => {
                                        if (value === '' || value === null || value === undefined) return undefined;
                                        const num = parseInt(value, 10);
                                        return isNaN(num) ? value : num;
                                    }}
                                    rules={[
                                        {
                                            type: 'number',
                                            message: 'Sức chứa phải là số',
                                            transform: (value) => {
                                                if (value === '' || value === null || value === undefined) return undefined;
                                                const num = parseInt(value, 10);
                                                return isNaN(num) ? undefined : num;
                                            }
                                        },
                                        {
                                            validator: (_, value) => {
                                                if (!value && value !== 0) return Promise.resolve();
                                                if (typeof value === 'number' && value >= 0) {
                                                    return Promise.resolve();
                                                }
                                                return Promise.reject(new Error('Sức chứa phải là số nguyên dương'));
                                            }
                                        }
                                    ]}
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

                {/* Modal Quản lý Relief Point */}
                <Modal
                    title={editingReliefPoint ? 'Sửa Điểm tiếp nhận cứu trợ' : 'Thêm Điểm tiếp nhận cứu trợ mới'}
                    open={reliefPointModalVisible}
                    onCancel={() => {
                        setReliefPointModalVisible(false);
                        reliefPointForm.resetFields();
                        setEditingReliefPoint(null);
                        setReliefPointGoogleMapsUrl('');
                        setReliefPointParsedCoords(null);
                    }}
                    footer={null}
                    width={600}
                >
                    <Form
                        form={reliefPointForm}
                        layout="vertical"
                        onFinish={handleReliefPointSubmit}
                    >
                        <Form.Item
                            label="Tên điểm tiếp nhận cứu trợ"
                            name="name"
                            rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
                        >
                            <Input placeholder="Ví dụ: Điểm tiếp nhận cứu trợ xã ABC" />
                        </Form.Item>

                        <Form.Item
                            label="Loại điểm"
                            name="type"
                            rules={[{ required: true, message: 'Vui lòng nhập hoặc chọn loại điểm' }]}
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
                            rules={[{ required: true, message: 'Vui lòng chọn ít nhất một loại cứu trợ' }]}
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
                            label="Địa chỉ"
                            name="address"
                            rules={[{ required: true, message: 'Vui lòng nhập địa chỉ' }]}
                        >
                            <Input placeholder="Ví dụ: Xã ABC, huyện XYZ, tỉnh Phú Yên" />
                        </Form.Item>

                        <Form.Item
                            label="Link Google Maps (tùy chọn - để lấy tọa độ chính xác)"
                            help="Paste link Google Maps để tự động lấy tọa độ. Hệ thống sẽ ưu tiên dùng tọa độ này."
                        >
                            <Input
                                placeholder="https://www.google.com/maps?q=13.08,109.30 hoặc https://maps.google.com/@13.08,109.30"
                                prefix={<GlobalOutlined />}
                                allowClear
                                value={reliefPointGoogleMapsUrl}
                                onChange={handleReliefPointGoogleMapsLinkChange}
                            />
                        </Form.Item>

                        {reliefPointParsedCoords && (
                            <Alert
                                message={`✅ Đã tìm thấy tọa độ: ${reliefPointParsedCoords.lat.toFixed(6)}, ${reliefPointParsedCoords.lng.toFixed(6)}`}
                                type="success"
                                showIcon
                                style={{ marginBottom: 16 }}
                                closable
                                onClose={() => {
                                    setReliefPointParsedCoords(null);
                                    setReliefPointGoogleMapsUrl('');
                                }}
                            />
                        )}

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    label="Vĩ độ (Latitude)"
                                    name="lat"
                                    normalize={(value) => {
                                        if (value === '' || value === null || value === undefined) return undefined;
                                        const num = parseFloat(value);
                                        return isNaN(num) ? value : num;
                                    }}
                                    rules={[
                                        {
                                            type: 'number',
                                            message: 'Vĩ độ phải là số',
                                            transform: (value) => {
                                                if (value === '' || value === null || value === undefined) return undefined;
                                                const num = parseFloat(value);
                                                return isNaN(num) ? undefined : num;
                                            }
                                        },
                                        {
                                            validator: (_, value) => {
                                                if (!value && value !== 0) {
                                                    // Nếu không có Google Maps URL thì bắt buộc
                                                    if (!reliefPointGoogleMapsUrl) {
                                                        return Promise.reject(new Error('Vui lòng nhập vĩ độ hoặc dán link Google Maps'));
                                                    }
                                                    return Promise.resolve();
                                                }
                                                if (typeof value === 'number' && value >= -90 && value <= 90) {
                                                    return Promise.resolve();
                                                }
                                                return Promise.reject(new Error('Vĩ độ phải từ -90 đến 90'));
                                            }
                                        }
                                    ]}
                                >
                                    <Input type="number" step="any" placeholder="12.75" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="Kinh độ (Longitude)"
                                    name="lng"
                                    normalize={(value) => {
                                        if (value === '' || value === null || value === undefined) return undefined;
                                        const num = parseFloat(value);
                                        return isNaN(num) ? value : num;
                                    }}
                                    rules={[
                                        {
                                            type: 'number',
                                            message: 'Kinh độ phải là số',
                                            transform: (value) => {
                                                if (value === '' || value === null || value === undefined) return undefined;
                                                const num = parseFloat(value);
                                                return isNaN(num) ? undefined : num;
                                            }
                                        },
                                        {
                                            validator: (_, value) => {
                                                if (!value && value !== 0) {
                                                    // Nếu không có Google Maps URL thì bắt buộc
                                                    if (!reliefPointGoogleMapsUrl) {
                                                        return Promise.reject(new Error('Vui lòng nhập kinh độ hoặc dán link Google Maps'));
                                                    }
                                                    return Promise.resolve();
                                                }
                                                if (typeof value === 'number' && value >= -180 && value <= 180) {
                                                    return Promise.resolve();
                                                }
                                                return Promise.reject(new Error('Kinh độ phải từ -180 đến 180'));
                                            }
                                        }
                                    ]}
                                >
                                    <Input type="number" step="any" placeholder="108.90" />
                                </Form.Item>
                            </Col>
                        </Row>

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
                                    label="Người phụ trách"
                                    name="contactPerson"
                                >
                                    <Input placeholder="Ví dụ: Ông Nguyễn Văn A" />
                                </Form.Item>
                            </Col>
                        </Row>


                        <Form.Item
                            label="Giờ hoạt động"
                            name="operatingHours"
                        >
                            <Input placeholder="Ví dụ: 7:00 - 18:00 hàng ngày" />
                        </Form.Item>

                        <Form.Item
                            label="Mô tả"
                            name="description"
                        >
                            <Input.TextArea rows={3} placeholder="Mô tả về điểm tiếp nhận cứu trợ" />
                        </Form.Item>

                        <Form.Item
                            label="Trạng thái"
                            name="status"
                            rules={[{ required: true, message: 'Vui lòng chọn trạng thái' }]}
                        >
                            <Select>
                                <Option value="Hoạt động">Hoạt động</Option>
                                <Option value="Tạm ngưng">Tạm ngưng</Option>
                                <Option value="Đầy">Đầy</Option>
                                <Option value="Đã đóng">Đã đóng</Option>
                            </Select>
                        </Form.Item>

                        <Form.Item
                            label="Ghi chú"
                            name="notes"
                        >
                            <Input.TextArea rows={2} placeholder="Ghi chú nội bộ (không hiển thị công khai)" />
                        </Form.Item>

                        <Form.Item>
                            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                                <Button onClick={() => {
                                    setReliefPointModalVisible(false);
                                    reliefPointForm.resetFields();
                                    setEditingReliefPoint(null);
                                }}>
                                    Hủy
                                </Button>
                                <Button type="primary" htmlType="submit">
                                    {editingReliefPoint ? 'Cập nhật' : 'Tạo mới'}
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
                            label="Link Google Maps"
                            name="googleMapsUrl"
                            help="Paste link Google Maps để tự động lấy tọa độ (nhanh nhất). Hệ thống sẽ tự động parse tọa độ từ link."
                        >
                            <Input
                                placeholder="https://www.google.com/maps?q=13.08,109.30 hoặc https://maps.google.com/@13.08,109.30"
                                onChange={(e) => {
                                    // Parse tọa độ từ Google Maps link khi user paste
                                    const url = e.target.value.trim();
                                    if (url) {
                                        const parseGoogleMapsCoords = (url) => {
                                            if (!url || typeof url !== 'string') return null;
                                            try {
                                                // Format 1: https://www.google.com/maps?q=lat,lng
                                                let match = url.match(/[?&]q=([^&]+)/);
                                                if (match) {
                                                    const coords = match[1].split(',');
                                                    if (coords.length >= 2) {
                                                        const lat = parseFloat(coords[0].trim());
                                                        const lng = parseFloat(coords[1].trim());
                                                        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                                            return [lng, lat];
                                                        }
                                                    }
                                                }
                                                // Format 2: https://www.google.com/maps/@lat,lng,zoom
                                                match = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                                                if (match) {
                                                    const lat = parseFloat(match[1]);
                                                    const lng = parseFloat(match[2]);
                                                    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                                        return [lng, lat];
                                                    }
                                                }
                                                // Format 4: https://www.google.com/maps/place/.../@lat,lng,zoom
                                                match = url.match(/\/place\/[^@]+@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                                                if (match) {
                                                    const lat = parseFloat(match[1]);
                                                    const lng = parseFloat(match[2]);
                                                    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                                        return [lng, lat];
                                                    }
                                                }
                                                return null;
                                            } catch (error) {
                                                return null;
                                            }
                                        };

                                        const coords = parseGoogleMapsCoords(url);
                                        if (coords) {
                                            // Tự động fill vào field coords
                                            editRequestForm.setFieldsValue({
                                                coords: `${coords[1]}, ${coords[0]}`
                                            });
                                            message.success(`✅ Đã tìm thấy tọa độ: ${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`);
                                        }
                                    }
                                }}
                            />
                        </Form.Item>

                        <Form.Item
                            label="Tọa độ GPS"
                            name="coords"
                            help="Nhập theo format: lat, lng hoặc lng, lat (ví dụ: 13.08, 109.30). Hoặc paste link Google Maps ở trên để tự động lấy tọa độ."
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

                {/* Modal Quản lý Tin tức */}
                <Modal
                    title={editingNews ? 'Sửa Tin tức' : 'Đăng Tin tức mới'}
                    open={newsModalVisible}
                    onCancel={() => {
                        setNewsModalVisible(false);
                        newsForm.resetFields();
                        setEditingNews(null);
                    }}
                    footer={null}
                    width={800}
                    destroyOnClose={true}
                >
                    <Form
                        form={newsForm}
                        layout="vertical"
                        onFinish={handleNewsSubmit}
                        initialValues={{
                            category: 'cập nhật tình hình',
                            author: 'Admin'
                        }}
                    >
                        <Form.Item
                            label="Tiêu đề"
                            name="title"
                            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}
                        >
                            <Input placeholder="Nhập tiêu đề tin tức" maxLength={500} showCount />
                        </Form.Item>

                        <Form.Item
                            label="Nội dung"
                            name="content"
                            rules={[{ required: true, message: 'Vui lòng nhập nội dung' }]}
                        >
                            <Input.TextArea
                                rows={8}
                                placeholder="Nhập nội dung tin tức"
                                showCount
                            />
                        </Form.Item>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    label="Phân loại"
                                    name="category"
                                    rules={[{ required: true, message: 'Vui lòng chọn phân loại' }]}
                                >
                                    <Select>
                                        <Option value="thông báo khẩn">Thông báo khẩn</Option>
                                        <Option value="hướng dẫn">Hướng dẫn</Option>
                                        <Option value="cập nhật tình hình">Cập nhật tình hình</Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="Tác giả"
                                    name="author"
                                >
                                    <Input placeholder="Admin" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item
                            label="Hình ảnh"
                            name="image"
                            valuePropName="fileList"
                            getValueFromEvent={(e) => {
                                if (Array.isArray(e)) {
                                    return e;
                                }
                                return e?.fileList || [];
                            }}
                        >
                            <Upload
                                beforeUpload={() => false}
                                accept="image/*"
                                maxCount={1}
                                listType="picture-card"
                            >
                                <div>
                                    <UploadOutlined />
                                    <div style={{ marginTop: 8 }}>Chọn ảnh</div>
                                </div>
                            </Upload>
                            {editingNews && editingNews.imagePath && (
                                <div style={{ marginTop: 8 }}>
                                    <Text type="secondary">Ảnh hiện tại:</Text>
                                    <div style={{ marginTop: 4 }}>
                                        <img
                                            src={`${API_URL}${editingNews.imagePath}`}
                                            alt="Current"
                                            style={{ maxWidth: '200px', borderRadius: '4px' }}
                                        />
                                    </div>
                                </div>
                            )}
                        </Form.Item>

                        <Form.Item
                            label="Link nguồn (tùy chọn)"
                            name="sourceUrl"
                        >
                            <Input placeholder="https://..." />
                        </Form.Item>

                        <Form.Item>
                            <Space>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={loadingNews}
                                >
                                    {editingNews ? 'Cập nhật' : 'Đăng tin'}
                                </Button>
                                <Button onClick={() => {
                                    setNewsModalVisible(false);
                                    newsForm.resetFields();
                                    setEditingNews(null);
                                }}>
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

