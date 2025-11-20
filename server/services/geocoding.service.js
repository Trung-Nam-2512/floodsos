import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Service xử lý Geocoding - Chuyển địa chỉ text thành tọa độ GPS
 */
class GeocodingService {
    constructor() {
        // OpenStreetMap Nominatim (PRIMARY - FREE, không cần API key, không cần thẻ)
        // Rate limit: 1 request/second (tự động delay trong code)
        this.nominatimBaseUrl = 'https://nominatim.openstreetmap.org';

        // Mapbox Geocoding API (backup - nếu có token)
        this.mapboxToken = process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN || '';
        this.mapboxBaseUrl = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

        // Google Geocoding API (optional - chỉ dùng nếu có API key)
        this.googleApiKey = process.env.GOOGLE_GEOCODING_API_KEY || '';
        this.googleBaseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
        this.googlePlacesBaseUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
    }

    /**
     * Geocode địa chỉ text thành tọa độ [lng, lat]
     * @param {string} address - Địa chỉ text (ví dụ: "thôn Diêm Điền, xã Xuân Lộc, huyện Sông Hinh, tỉnh Phú Yên")
     * @returns {Promise<[number, number]|null>} - [longitude, latitude] hoặc null nếu không tìm thấy
     */
    async geocode(address) {
        if (!address || address.trim().length === 0) {
            return null;
        }

        // Ưu tiên 1: OpenStreetMap Nominatim (PRIMARY - FREE, không cần API key)
        try {
            const coords = await this.geocodeWithNominatim(address);
            if (coords) return coords;
        } catch (error) {
            console.error('Nominatim geocoding error:', error.message);
        }

        // Ưu tiên 2: Mapbox Geocoding API (backup - nếu có token)
        if (this.mapboxToken) {
            try {
                const coords = await this.geocodeWithMapbox(address);
                if (coords) return coords;
            } catch (error) {
                console.error('Mapbox geocoding error:', error.message);
            }
        }

        // Fallback: Google APIs (chỉ dùng nếu có API key)
        if (this.googleApiKey) {
            try {
                const coords = await this.geocodeWithGoogle(address);
                if (coords) return coords;
            } catch (error) {
                console.error('Google geocoding error:', error.message);
            }

            try {
                const coords = await this.geocodeWithGooglePlaces(address);
                if (coords) return coords;
            } catch (error) {
                console.error('Google Places error:', error.message);
            }
        }

        return null;
    }

    /**
     * Geocode với OpenAI GPT-4o (DISABLED - Không dùng nữa, chuyển sang Nominatim)
     * @deprecated Sử dụng geocodeWithNominatim thay thế
     */
    async geocodeWithOpenAI(address) {
        // Disabled - không dùng GPT nữa, chỉ dùng Nominatim
        return null;
    }

    /**
     * Geocode với Mapbox API
     */
    async geocodeWithMapbox(address) {
        const encodedAddress = encodeURIComponent(address);
        const url = `${this.mapboxBaseUrl}/${encodedAddress}.json?access_token=${this.mapboxToken}&country=VN&limit=1`;

        const response = await axios.get(url, { timeout: 5000 });

        if (response.data.features && response.data.features.length > 0) {
            const [lng, lat] = response.data.features[0].center;
            console.log(`✅ Mapbox geocoded: "${address}" → [${lng}, ${lat}]`);
            return [lng, lat];
        }

        return null;
    }

    /**
     * Geocode với Google Geocoding API (primary)
     */
    async geocodeWithGoogle(address) {
        const encodedAddress = encodeURIComponent(address);
        const url = `${this.googleBaseUrl}?address=${encodedAddress}&key=${this.googleApiKey}&region=vn&language=vi&components=country:VN`;

        const response = await axios.get(url, { timeout: 5000 });

        if (response.data.status === 'OK' && response.data.results.length > 0) {
            const location = response.data.results[0].geometry.location;
            const [lng, lat] = [location.lng, location.lat];
            const formattedAddress = response.data.results[0].formatted_address;
            console.log(`✅ Google geocoded: "${address}" → [${lng}, ${lat}]`);
            console.log(`   Formatted: ${formattedAddress}`);
            return [lng, lat];
        }

        // Nếu status là ZERO_RESULTS, thử không có components
        if (response.data.status === 'ZERO_RESULTS') {
            const url2 = `${this.googleBaseUrl}?address=${encodedAddress}&key=${this.googleApiKey}&region=vn&language=vi`;
            const response2 = await axios.get(url2, { timeout: 5000 });
            if (response2.data.status === 'OK' && response2.data.results.length > 0) {
                const location = response2.data.results[0].geometry.location;
                const [lng, lat] = [location.lng, location.lat];
                console.log(`✅ Google geocoded (no components): "${address}" → [${lng}, ${lat}]`);
                return [lng, lat];
            }
        }

        return null;
    }

    /**
     * Geocode với Google Places API Text Search (backup - tìm địa chỉ tốt hơn)
     */
    async geocodeWithGooglePlaces(address) {
        const encodedAddress = encodeURIComponent(address + ', Vietnam');
        const url = `${this.googlePlacesBaseUrl}?query=${encodedAddress}&key=${this.googleApiKey}&language=vi&region=vn`;

        const response = await axios.get(url, { timeout: 5000 });

        if (response.data.status === 'OK' && response.data.results.length > 0) {
            const location = response.data.results[0].geometry.location;
            const [lng, lat] = [location.lng, location.lat];
            const placeName = response.data.results[0].name;
            console.log(`✅ Google Places geocoded: "${address}" → [${lng}, ${lat}]`);
            console.log(`   Place: ${placeName}`);
            return [lng, lat];
        }

        return null;
    }

    /**
     * Geocode với OpenStreetMap Nominatim (PRIMARY - FREE, không cần API key, không cần thẻ)
     * Rate limit: 1 request/second (tự động delay)
     * Cải thiện: Tối ưu cho địa chỉ Việt Nam
     */
    async geocodeWithNominatim(address) {
        // Thêm delay để tránh rate limit (1 request/second)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Strategy 1: Thử với địa chỉ đầy đủ + Vietnam
        let encodedAddress = encodeURIComponent(address + ', Vietnam');
        let url = `${this.nominatimBaseUrl}/search?q=${encodedAddress}&format=json&countrycodes=vn&limit=5&addressdetails=1&extratags=1`;

        let response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'RescueApp/1.0', // Required by Nominatim
                'Accept-Language': 'vi,en'
            }
        });

        if (response.data && response.data.length > 0) {
            // Ưu tiên kết quả có importance cao nhất (độ chính xác cao)
            const bestResult = response.data.sort((a, b) => (b.importance || 0) - (a.importance || 0))[0];
            const [lng, lat] = [parseFloat(bestResult.lon), parseFloat(bestResult.lat)];
            const displayName = bestResult.display_name;
            console.log(`✅ Nominatim geocoded: "${address}" → [${lng}, ${lat}]`);
            console.log(`   Display: ${displayName}`);
            console.log(`   Importance: ${bestResult.importance || 'N/A'}`);
            return [lng, lat];
        }

        // Strategy 2: Nếu không có "Vietnam", thử thêm vào
        if (!address.toLowerCase().includes('vietnam') && !address.includes('Việt Nam')) {
            encodedAddress = encodeURIComponent(address + ', Vietnam');
            url = `${this.nominatimBaseUrl}/search?q=${encodedAddress}&format=json&countrycodes=vn&limit=5&addressdetails=1`;

            response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'RescueApp/1.0',
                    'Accept-Language': 'vi,en'
                }
            });

            if (response.data && response.data.length > 0) {
                const bestResult = response.data.sort((a, b) => (b.importance || 0) - (a.importance || 0))[0];
                const [lng, lat] = [parseFloat(bestResult.lon), parseFloat(bestResult.lat)];
                console.log(`✅ Nominatim geocoded (with Vietnam): "${address}" → [${lng}, ${lat}]`);
                return [lng, lat];
            }
        }

        // Strategy 3: Thử không có "Vietnam" (đôi khi Nominatim tìm tốt hơn)
        if (address.toLowerCase().includes('vietnam') || address.includes('Việt Nam')) {
            const addressWithoutCountry = address.replace(/,?\s*Vietnam/gi, '').replace(/,?\s*Việt Nam/gi, '').trim();
            if (addressWithoutCountry.length > 5) {
                encodedAddress = encodeURIComponent(addressWithoutCountry);
                url = `${this.nominatimBaseUrl}/search?q=${encodedAddress}&format=json&countrycodes=vn&limit=5&addressdetails=1`;

                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'RescueApp/1.0',
                        'Accept-Language': 'vi,en'
                    }
                });

                if (response.data && response.data.length > 0) {
                    const bestResult = response.data.sort((a, b) => (b.importance || 0) - (a.importance || 0))[0];
                    const [lng, lat] = [parseFloat(bestResult.lon), parseFloat(bestResult.lat)];
                    console.log(`✅ Nominatim geocoded (without Vietnam): "${addressWithoutCountry}" → [${lng}, ${lat}]`);
                    return [lng, lat];
                }
            }
        }

        return null;
    }

    /**
     * Geocode với fallback strategies (tối ưu cho Nominatim - FREE)
     * - Thử địa chỉ đầy đủ
     * - Nếu fail, thử thêm "Vietnam" vào cuối
     * - Nếu fail, thử chỉ tỉnh/huyện
     * - Nếu fail, thử chỉ tỉnh
     */
    async geocodeWithFallback(address) {
        // Strategy 1: Địa chỉ đầy đủ
        let coords = await this.geocode(address);
        if (coords) return coords;

        // Strategy 2: Thêm "Vietnam" vào cuối (Nominatim thích điều này)
        if (!address.toLowerCase().includes('vietnam') && !address.includes('Việt Nam')) {
            const addressWithCountry = `${address}, Vietnam`;
            coords = await this.geocode(addressWithCountry);
            if (coords) {
                console.log(`⚠️  Geocoded với "Vietnam": "${addressWithCountry}"`);
                return coords;
            }
        }

        // Strategy 3: Tách địa chỉ và thử từng phần (từ lớn đến nhỏ)
        const parts = address.split(',').map(p => p.trim()).filter(p => p.length > 0);

        // Thử từ phần lớn đến nhỏ: tỉnh → huyện → xã → thôn
        for (let i = parts.length - 1; i >= 0; i--) {
            const partialAddress = parts.slice(i).join(', ');
            if (partialAddress.length > 5) { // Ít nhất 5 ký tự
                coords = await this.geocode(partialAddress + ', Vietnam');
                if (coords) {
                    console.log(`⚠️  Geocoded với địa chỉ rút gọn: "${partialAddress}"`);
                    return coords;
                }
                // Delay để tránh rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Strategy 4: Tìm tỉnh trong địa chỉ và geocode tỉnh đó
        const provinces = [
            'Phú Yên', 'Đắk Lắk', 'Khánh Hòa', 'Bình Định', 'Quảng Ngãi',
            'Quảng Nam', 'Thừa Thiên Huế', 'Quảng Trị', 'Quảng Bình',
            'Kon Tum', 'Gia Lai', 'Đắk Nông', 'Lâm Đồng'
        ];
        for (const province of provinces) {
            if (address.includes(province)) {
                coords = await this.geocode(`${province}, Vietnam`);
                if (coords) {
                    console.log(`⚠️  Geocoded với tỉnh: "${province}"`);
                    return coords;
                }
                // Delay để tránh rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Strategy 5: Tìm huyện/thành phố trong địa chỉ
        const districts = [
            'Tuy An', 'Sông Hinh', 'Tuy Hòa', 'Ea H\'leo', 'Krông Búk',
            'Nha Trang', 'Quy Nhon', 'Quảng Ngãi', 'Huế', 'Đà Nẵng'
        ];
        for (const district of districts) {
            if (address.includes(district)) {
                coords = await this.geocode(`${district}, Vietnam`);
                if (coords) {
                    console.log(`⚠️  Geocoded với huyện/thành phố: "${district}"`);
                    return coords;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return null;
    }
}

export default new GeocodingService();

