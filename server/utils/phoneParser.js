/**
 * Utility để parse số điện thoại từ text
 */

/**
 * Parse số điện thoại từ text
 * @param {string} text - Text cần parse
 * @returns {string[]} - Mảng các số điện thoại tìm được
 */
export function parsePhoneNumbers(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    // Pattern để tìm số điện thoại Việt Nam
    // Hỗ trợ các format: 0912345678, 0912 345 678, 0912-345-678, +84912345678, 84912345678
    const phonePattern = /(\+?84|0)(3[2-9]|5[6|8|9]|7[0|6-9]|8[1-6|8|9]|9[0-9])([0-9]{7,8})/g;
    
    const matches = text.match(phonePattern);
    if (!matches) {
        return [];
    }

    // Normalize số điện thoại (loại bỏ +84, thay bằng 0)
    const normalizedPhones = matches.map(phone => {
        // Loại bỏ khoảng trắng, dấu gạch ngang
        let cleaned = phone.replace(/[\s\-]/g, '');
        
        // Nếu bắt đầu bằng +84 hoặc 84, thay bằng 0
        if (cleaned.startsWith('+84')) {
            cleaned = '0' + cleaned.substring(3);
        } else if (cleaned.startsWith('84') && cleaned.length === 11) {
            cleaned = '0' + cleaned.substring(2);
        }
        
        return cleaned;
    });

    // Loại bỏ duplicates
    const uniquePhones = [...new Set(normalizedPhones)];

    // Validate số điện thoại (phải có 10 số và bắt đầu bằng 0)
    return uniquePhones.filter(phone => {
        return /^0[3-9]\d{8,9}$/.test(phone);
    });
}

/**
 * Lấy số điện thoại đầu tiên từ text
 * @param {string} text - Text cần parse
 * @returns {string|null} - Số điện thoại đầu tiên hoặc null
 */
export function getFirstPhoneNumber(text) {
    const phones = parsePhoneNumbers(text);
    return phones.length > 0 ? phones[0] : null;
}

/**
 * Format số điện thoại để hiển thị
 * @param {string} phone - Số điện thoại
 * @returns {string} - Số điện thoại đã format
 */
export function formatPhoneNumber(phone) {
    if (!phone) return '';
    
    // Format: 0912 345 678
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return `${cleaned.substring(0, 4)} ${cleaned.substring(4, 7)} ${cleaned.substring(7)}`;
    }
    return phone;
}

