/**
 * Utility để chuyển đổi tọa độ giữa các hệ quy chiếu
 * 
 * Vấn đề: Google Maps ở Việt Nam sử dụng GCJ-02 (Mars coordinate system)
 * trong khi Mapbox sử dụng WGS84, gây ra độ lệch vài chục đến vài trăm mét.
 * 
 * Giải pháp: Chuyển đổi tọa độ từ GCJ-02 sang WGS84 khi lấy từ Google Maps
 */

/**
 * Chuyển đổi tọa độ từ GCJ-02 (Google Maps) sang WGS84 (Mapbox/GPS)
 * @param {number} gcjLat - Latitude trong hệ GCJ-02
 * @param {number} gcjLng - Longitude trong hệ GCJ-02
 * @returns {[number, number]} - [wgsLat, wgsLng] trong hệ WGS84
 */
export function gcj02ToWgs84(gcjLat, gcjLng) {
    const a = 6378245.0; // Bán kính trục lớn (m)
    const ee = 0.00669342162296594323; // Độ lệch tâm bình phương

    let dLat = transformLat(gcjLng - 105.0, gcjLat - 35.0);
    let dLng = transformLng(gcjLng - 105.0, gcjLat - 35.0);
    const radLat = (gcjLat / 180.0) * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);

    const wgsLat = gcjLat - dLat;
    const wgsLng = gcjLng - dLng;

    return [wgsLat, wgsLng];
}

/**
 * Chuyển đổi tọa độ từ WGS84 sang GCJ-02
 * @param {number} wgsLat - Latitude trong hệ WGS84
 * @param {number} wgsLng - Longitude trong hệ WGS84
 * @returns {[number, number]} - [gcjLat, gcjLng] trong hệ GCJ-02
 */
export function wgs84ToGcj02(wgsLat, wgsLng) {
    const a = 6378245.0;
    const ee = 0.00669342162296594323;

    let dLat = transformLat(wgsLng - 105.0, wgsLat - 35.0);
    let dLng = transformLng(wgsLng - 105.0, wgsLat - 35.0);
    const radLat = (wgsLat / 180.0) * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);

    const gcjLat = wgsLat + dLat;
    const gcjLng = wgsLng + dLng;

    return [gcjLat, gcjLng];
}

/**
 * Transform latitude (helper function)
 */
function transformLat(lng, lat) {
    let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat +
        0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 *
        Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 *
        Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 *
        Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

/**
 * Transform longitude (helper function)
 */
function transformLng(lng, lat) {
    let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng +
        0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 *
        Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 *
        Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 *
        Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}

/**
 * Chuyển đổi tọa độ từ Google Maps (GCJ-02) sang Mapbox (WGS84)
 * Hỗ trợ nhiều format input
 * 
 * @param {number|Array|Object} input - Tọa độ input
 *   - Nếu là number: [lat, lng] hoặc {lat, lng}
 *   - Nếu là Array: [lat, lng] hoặc [lng, lat]
 *   - Nếu là Object: {lat, lng}
 * @param {Object} options - Tùy chọn
 *   - format: 'latlng' | 'lnglat' (mặc định: tự động detect)
 *   - outputFormat: 'latlng' | 'lnglat' | 'object' (mặc định: giữ nguyên format input)
 * @returns {Array|Object} - Tọa độ đã chuyển đổi
 */
export function convertGoogleMapsToMapbox(input, options = {}) {
    let lat, lng;

    // Parse input
    if (Array.isArray(input)) {
        // Tự động detect format: nếu số đầu > 90 thì là lng,lat
        if (Math.abs(input[0]) > 90) {
            [lng, lat] = input;
        } else {
            [lat, lng] = input;
        }
    } else if (typeof input === 'object' && input !== null) {
        if (input.lat !== undefined && input.lng !== undefined) {
            lat = input.lat;
            lng = input.lng;
        } else if (input.latitude !== undefined && input.longitude !== undefined) {
            lat = input.latitude;
            lng = input.longitude;
        } else {
            throw new Error('Invalid coordinate format');
        }
    } else {
        throw new Error('Invalid input type');
    }

    // Chuyển đổi từ GCJ-02 sang WGS84
    const [wgsLat, wgsLng] = gcj02ToWgs84(lat, lng);

    // Format output
    const outputFormat = options.outputFormat || (Array.isArray(input) ? 'array' : 'object');

    if (outputFormat === 'object' || (typeof input === 'object' && !Array.isArray(input))) {
        return { lat: wgsLat, lng: wgsLng };
    } else if (outputFormat === 'lnglat' || (Array.isArray(input) && Math.abs(input[0]) > 90)) {
        return [wgsLng, wgsLat];
    } else {
        return [wgsLat, wgsLng];
    }
}

/**
 * Kiểm tra xem tọa độ có nằm trong vùng Việt Nam không
 * (để quyết định có cần chuyển đổi hay không)
 */
export function isInVietnam(lat, lng) {
    // Vùng biên giới Việt Nam (approximate)
    return lat >= 8.5 && lat <= 23.5 && lng >= 102.0 && lng <= 110.0;
}

/**
 * Cấu hình chuyển đổi tọa độ (có thể điều chỉnh)
 */
const COORDINATE_CONFIG = {
    // Tắt/bật chuyển đổi
    enabled: false, // Tắt chuyển đổi mặc định

    // Offset đơn giản (nếu cần)
    // Nếu lệch lên trên trái: tăng offsetLat và offsetLng (dịch xuống phải)
    // Nếu lệch xuống phải: giảm offsetLat và offsetLng (dịch lên trái)
    offsetLat: 0.0000, // 0.0001 độ ≈ 11m
    offsetLng: 0.0000, // 0.0001 độ ≈ 11m

    // Sử dụng chuyển đổi GCJ-02 → WGS84 (nếu enabled = true)
    useGcj02Conversion: false
};

/**
 * Parse và chuyển đổi tọa độ từ Google Maps URL
 * Tự động chuyển đổi từ GCJ-02 sang WGS84 nếu ở Việt Nam
 * 
 * @param {string} url - Google Maps URL
 * @param {Object} options - Tùy chọn
 *   - outputFormat: 'array' | 'object' | 'lnglat' (mặc định: 'array' với format [lng, lat])
 * @returns {Array|Object|null} - Tọa độ đã chuyển đổi hoặc null
 */
/**
 * Parse tọa độ từ định dạng độ/phút/giây (DMS)
 * Ví dụ: "12°58'00.2"N 109°12'59.2"E" hoặc "12°58'00.2"N+109°12'59.2"E"
 */
function parseDMS(dmsString) {
    // Pattern: độ°phút'giây" hướng (N/S/E/W) [dấu + hoặc khoảng trắng] độ°phút'giây" hướng (N/S/E/W)
    // Hỗ trợ cả format có dấu +, dấu phẩy, hoặc khoảng trắng giữa lat và lng
    // Hỗ trợ cả format có hoặc không có dấu ngoặc kép sau giây
    const dmsPattern = /(-?\d+)[°\s]+(\d+)['\s]+(\d+\.?\d*)["]?\s*([NS])?\s*[+\s,]*\s*(-?\d+)[°\s]+(\d+)['\s]+(\d+\.?\d*)["]?\s*([EW])?/i;
    const match = dmsString.match(dmsPattern);

    if (!match) return null;

    try {
        // Parse latitude
        const latDeg = parseFloat(match[1]);
        const latMin = parseFloat(match[2]);
        const latSec = parseFloat(match[3]);
        const latDir = (match[4] || '').toUpperCase();

        // Parse longitude
        const lngDeg = parseFloat(match[5]);
        const lngMin = parseFloat(match[6]);
        const lngSec = parseFloat(match[7]);
        const lngDir = (match[8] || '').toUpperCase();

        // Convert to decimal degrees
        let lat = latDeg + latMin / 60 + latSec / 3600;
        let lng = lngDeg + lngMin / 60 + lngSec / 3600;

        // Apply direction (mặc định N và E nếu không có hướng)
        if (latDir === 'S') lat = -lat;
        if (lngDir === 'W') lng = -lng;

        // Validate
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return null;
        }

        return { lat, lng };
    } catch (e) {
        return null;
    }
}

export function parseAndConvertGoogleMapsCoords(url, options = {}) {
    if (!url || typeof url !== 'string') return null;

    const outputFormat = options.outputFormat || 'array';

    try {
        // Decode URL để đảm bảo regex hoạt động với các ký tự đặc biệt
        let decodedUrl = url;
        try {
            decodedUrl = decodeURIComponent(url);
        } catch (e) {
            // Nếu decode lỗi, dùng URL gốc
            decodedUrl = url;
        }

        let lat, lng;
        let match;

        // Format 1: https://www.google.com/maps?q=lat,lng
        match = decodedUrl.match(/[?&]q=([^&]+)/);
        if (match) {
            const coords = match[1].split(',');
            if (coords.length >= 2) {
                lat = parseFloat(coords[0].trim());
                lng = parseFloat(coords[1].trim());
                if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    return convertCoords(lat, lng, outputFormat);
                }
            }
        }

        // Format 6: Parse từ place name dạng độ/phút/giây (DMS) - ƯU TIÊN CAO NHẤT
        // Ví dụ: /place/12°58'00.2"N+109°12'59.2"E/...
        // Đây là tọa độ chính xác nhất từ place name
        match = decodedUrl.match(/\/place\/([^/@]+)/);
        if (match) {
            const placeName = match[1];
            const dmsCoords = parseDMS(placeName);
            if (dmsCoords) {
                return convertCoords(dmsCoords.lat, dmsCoords.lng, outputFormat);
            }
        }

        // Format 5: Parse từ data parameter: !3d{lat}!4d{lng} - ƯU TIÊN CAO
        // Tọa độ này thường chính xác hơn tọa độ sau @
        // Thử cả URL gốc và decoded URL vì data parameter có thể không được decode
        match = url.match(/[!&]3d(-?\d+\.?\d*)[!&]4d(-?\d+\.?\d*)/) || decodedUrl.match(/[!&]3d(-?\d+\.?\d*)[!&]4d(-?\d+\.?\d*)/);
        if (match) {
            lat = parseFloat(match[1]);
            lng = parseFloat(match[2]);
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return convertCoords(lat, lng, outputFormat);
            }
        }

        // Format 4: https://www.google.com/maps/place/.../@lat,lng,zoom
        // LƯU Ý: Tọa độ sau @ có thể là view center, không phải tọa độ chính xác của địa điểm
        // Chỉ dùng khi không có format khác
        match = decodedUrl.match(/\/place\/[^@]+@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:[,/]|$|m\/)/);
        if (match) {
            lat = parseFloat(match[1]);
            lng = parseFloat(match[2]);
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return convertCoords(lat, lng, outputFormat);
            }
        }

        // Format 2: https://www.google.com/maps/@lat,lng,zoom hoặc @lat,lng,771m
        // Chỉ dùng nếu Format 4 không match (fallback)
        // Cải thiện regex để match cả khi có thêm ký tự sau dấu phẩy thứ 2 (như ,771m hoặc /data)
        match = decodedUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:[,/]|$|m\/)/);
        if (match) {
            lat = parseFloat(match[1]);
            lng = parseFloat(match[2]);
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return convertCoords(lat, lng, outputFormat);
            }
        }

        return null;
    } catch (error) {
        console.error('Lỗi parse Google Maps URL:', error);
        return null;
    }
}

/**
 * Helper function để chuyển đổi và format tọa độ
 * 
 * VẤN ĐỀ: Sau khi test, phát hiện chuyển đổi GCJ-02 → WGS84 làm lệch xa hơn
 * Có thể Google Maps ở Việt Nam đã dùng WGS84 hoặc cần chuyển đổi ngược lại
 * 
 * GIẢI PHÁP: Thử nhiều phương án và cho phép điều chỉnh
 */
function convertCoords(lat, lng, outputFormat) {
    // Nếu không bật chuyển đổi, trả về tọa độ gốc
    if (!COORDINATE_CONFIG.enabled) {
        return originalCoords(lat, lng, outputFormat);
    }

    if (isInVietnam(lat, lng)) {
        let adjustedLat = lat;
        let adjustedLng = lng;

        // Áp dụng offset nếu có
        if (COORDINATE_CONFIG.offsetLat !== 0 || COORDINATE_CONFIG.offsetLng !== 0) {
            adjustedLat = lat + COORDINATE_CONFIG.offsetLat;
            adjustedLng = lng + COORDINATE_CONFIG.offsetLng;
        }

        // Chuyển đổi GCJ-02 → WGS84 nếu bật
        if (COORDINATE_CONFIG.useGcj02Conversion) {
            const [wgsLat, wgsLng] = gcj02ToWgs84(adjustedLat, adjustedLng);
            adjustedLat = wgsLat;
            adjustedLng = wgsLng;
        }

        if (outputFormat === 'object') {
            return { lat: adjustedLat, lng: adjustedLng };
        } else if (outputFormat === 'lnglat') {
            return [adjustedLng, adjustedLat];
        } else {
            // 'array' hoặc format khác - trả về [lng, lat]
            return [adjustedLng, adjustedLat];
        }
    }

    // Nếu không ở Việt Nam, trả về tọa độ gốc
    return originalCoords(lat, lng, outputFormat);
}

/**
 * Trả về tọa độ gốc không chuyển đổi
 */
function originalCoords(lat, lng, outputFormat) {
    if (outputFormat === 'object') {
        return { lat, lng };
    } else if (outputFormat === 'lnglat') {
        return [lng, lat];
    } else {
        // 'array' hoặc format khác - trả về [lng, lat]
        return [lng, lat];
    }
}

