/**
 * Utility để parse tọa độ từ Google Maps URL
 * Hỗ trợ nhiều format URL khác nhau và ưu tiên tọa độ chính xác nhất
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

/**
 * Parse tọa độ từ Google Maps URL
 * @param {string} url - Google Maps URL
 * @param {Object} options - Tùy chọn
 *   - outputFormat: 'array' | 'object' (mặc định: 'array' với format [lng, lat])
 * @returns {Array|Object|null} - Tọa độ đã parse hoặc null
 */
function parseGoogleMapsCoords(url, options = {}) {
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
                    return formatOutput(lat, lng, outputFormat);
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
                return formatOutput(dmsCoords.lat, dmsCoords.lng, outputFormat);
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
                return formatOutput(lat, lng, outputFormat);
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
                return formatOutput(lat, lng, outputFormat);
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
                return formatOutput(lat, lng, outputFormat);
            }
        }

        return null;
    } catch (error) {
        console.error('Lỗi parse Google Maps URL:', error);
        return null;
    }
}

/**
 * Format output theo yêu cầu
 */
function formatOutput(lat, lng, outputFormat) {
    if (outputFormat === 'object') {
        return { lat, lng };
    } else {
        // 'array' - trả về [lng, lat] (theo format của Mapbox)
        return [lng, lat];
    }
}

export { parseGoogleMapsCoords };

