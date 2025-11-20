import RescueRequest from '../models/RescueRequest.model.js';

/**
 * Service để check duplicate rescue requests
 */
class DuplicateCheckService {
    /**
     * Tính độ tương đồng giữa 2 chuỗi (Levenshtein distance)
     * @param {string} str1 
     * @param {string} str2 
     * @returns {number} Similarity score (0-1, 1 = giống hệt)
     */
    calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();
        
        if (s1 === s2) return 1;
        if (s1.length === 0 || s2.length === 0) return 0;
        
        // Tính Levenshtein distance
        const matrix = [];
        for (let i = 0; i <= s2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= s1.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= s2.length; i++) {
            for (let j = 1; j <= s1.length; j++) {
                if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        const distance = matrix[s2.length][s1.length];
        const maxLength = Math.max(s1.length, s2.length);
        return 1 - (distance / maxLength);
    }

    /**
     * Tính khoảng cách giữa 2 tọa độ (Haversine formula)
     * @param {number[]} coords1 [lng, lat]
     * @param {number[]} coords2 [lng, lat]
     * @returns {number} Distance in meters
     */
    calculateDistance(coords1, coords2) {
        if (!coords1 || !coords2 || 
            coords1.length < 2 || coords2.length < 2 ||
            !coords1[0] || !coords1[1] || !coords2[0] || !coords2[1]) {
            return Infinity;
        }

        const [lng1, lat1] = coords1;
        const [lng2, lat2] = coords2;

        const R = 6371000; // Earth radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Normalize phone number để so sánh
     * @param {string} phone 
     * @returns {string} Normalized phone
     */
    normalizePhone(phone) {
        if (!phone) return '';
        // Chỉ lấy số
        return phone.replace(/\D/g, '');
    }

    /**
     * Check duplicate rescue request
     * @param {Object} newRequestData - Dữ liệu request mới
     * @returns {Object} { isDuplicate: boolean, duplicates: Array, similarity: number }
     */
    async checkDuplicate(newRequestData) {
        try {
            const {
                rawText,
                description,
                contact,
                contactFull,
                coords,
                facebookUrl,
                location
            } = newRequestData;

            // Tìm các request trong vòng 2 giờ gần đây
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            
            const recentRequests = await RescueRequest.find({
                createdAt: { $gte: twoHoursAgo }
            }).sort({ createdAt: -1 }).limit(50);

            if (recentRequests.length === 0) {
                return {
                    isDuplicate: false,
                    duplicates: [],
                    maxSimilarity: 0
                };
            }

            const duplicates = [];
            let maxSimilarity = 0;

            for (const existing of recentRequests) {
                let similarity = 0;
                let matchReasons = [];

                // 1. Check Facebook URL (exact match)
                if (facebookUrl && existing.facebookUrl) {
                    if (facebookUrl === existing.facebookUrl) {
                        similarity += 0.5;
                        matchReasons.push('Cùng link Facebook');
                    }
                }

                // 2. Check phone number
                const newPhone = this.normalizePhone(contact || contactFull);
                const existingPhone = this.normalizePhone(existing.contact || existing.contactFull);
                if (newPhone && existingPhone && newPhone.length >= 8) {
                    if (newPhone === existingPhone) {
                        similarity += 0.3;
                        matchReasons.push('Cùng số điện thoại');
                    } else if (newPhone.includes(existingPhone) || existingPhone.includes(newPhone)) {
                        similarity += 0.15;
                        matchReasons.push('Số điện thoại tương tự');
                    }
                }

                // 3. Check text similarity (description hoặc rawText)
                const newText = (rawText || description || '').trim();
                const existingText = (existing.rawText || existing.description || '').trim();
                
                if (newText.length > 20 && existingText.length > 20) {
                    const textSimilarity = this.calculateSimilarity(newText, existingText);
                    if (textSimilarity > 0.7) {
                        similarity += textSimilarity * 0.4;
                        matchReasons.push(`Nội dung giống ${Math.round(textSimilarity * 100)}%`);
                    } else if (textSimilarity > 0.5) {
                        similarity += textSimilarity * 0.2;
                        matchReasons.push(`Nội dung tương tự ${Math.round(textSimilarity * 100)}%`);
                    }
                }

                // 4. Check location (nếu có tọa độ)
                if (coords && coords[0] && coords[1] && 
                    existing.coords && existing.coords[0] && existing.coords[1]) {
                    const distance = this.calculateDistance(coords, existing.coords);
                    if (distance < 100) { // Trong vòng 100m
                        similarity += 0.3;
                        matchReasons.push(`Cùng vị trí (${Math.round(distance)}m)`);
                    } else if (distance < 500) { // Trong vòng 500m
                        similarity += 0.15;
                        matchReasons.push(`Gần vị trí (${Math.round(distance)}m)`);
                    }
                } else if (location && existing.location) {
                    // Check location string similarity
                    const locationSimilarity = this.calculateSimilarity(location, existing.location);
                    if (locationSimilarity > 0.8) {
                        similarity += 0.2;
                        matchReasons.push(`Cùng địa điểm`);
                    }
                }

                // 5. Check thời gian (nếu tạo trong vòng 30 phút)
                const timeDiff = Math.abs(new Date(existing.createdAt).getTime() - Date.now());
                if (timeDiff < 30 * 60 * 1000) { // 30 phút
                    similarity += 0.1;
                    matchReasons.push('Tạo gần thời điểm');
                }

                if (similarity > 0.5) { // Threshold: 50% similarity
                    duplicates.push({
                        _id: existing._id,
                        similarity: Math.round(similarity * 100) / 100,
                        matchReasons,
                        data: {
                            location: existing.location,
                            description: existing.description || existing.rawText?.substring(0, 100),
                            contact: existing.contact || existing.contactFull,
                            createdAt: existing.createdAt,
                            coords: existing.coords
                        }
                    });
                    maxSimilarity = Math.max(maxSimilarity, similarity);
                }
            }

            // Sắp xếp theo similarity giảm dần
            duplicates.sort((a, b) => b.similarity - a.similarity);

            return {
                isDuplicate: maxSimilarity > 0.6, // > 60% = duplicate
                duplicates: duplicates.slice(0, 5), // Chỉ trả về top 5
                maxSimilarity: Math.round(maxSimilarity * 100) / 100
            };
        } catch (error) {
            console.error('Lỗi khi check duplicate:', error);
            // Nếu lỗi, không block việc tạo request mới
            return {
                isDuplicate: false,
                duplicates: [],
                maxSimilarity: 0,
                error: error.message
            };
        }
    }
}

export default new DuplicateCheckService();

