/**
 * Utility function để resize và compress ảnh trước khi upload
 * Giúp giảm kích thước file và tăng tốc độ upload
 */

/**
 * Resize và compress ảnh
 * @param {File} file - File ảnh gốc
 * @param {Object} options - Tùy chọn resize
 * @param {number} options.maxWidth - Chiều rộng tối đa (mặc định: 1920px)
 * @param {number} options.maxHeight - Chiều cao tối đa (mặc định: 1920px)
 * @param {number} options.quality - Chất lượng JPEG (0-1, mặc định: 0.85)
 * @param {number} options.maxSizeMB - Kích thước tối đa sau khi resize (MB, mặc định: 2MB)
 * @returns {Promise<string>} - Base64 string của ảnh đã resize
 */
export const resizeImage = (file, options = {}) => {
    return new Promise((resolve, reject) => {
        const {
            maxWidth = 1920,
            maxHeight = 1920,
            quality = 0.85,
            maxSizeMB = 2
        } = options;

        // Kiểm tra file có phải là ảnh không
        if (!file.type.startsWith('image/')) {
            reject(new Error('File không phải là ảnh'));
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                try {
                    // Tính toán kích thước mới (giữ nguyên tỷ lệ)
                    let width = img.width;
                    let height = img.height;

                    // Resize nếu ảnh quá lớn
                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    // Tạo canvas để resize
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    // Vẽ ảnh đã resize lên canvas
                    const ctx = canvas.getContext('2d');

                    // Cải thiện chất lượng render
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    ctx.drawImage(img, 0, 0, width, height);

                    // Xác định output format (JPEG cho ảnh lớn, giữ nguyên format cho ảnh nhỏ)
                    const isJPEG = file.type === 'image/jpeg' || file.type === 'image/jpg';
                    const outputType = isJPEG ? 'image/jpeg' : 'image/png';

                    // Convert sang base64 với quality (chỉ áp dụng cho JPEG)
                    let result = isJPEG
                        ? canvas.toDataURL(outputType, quality)
                        : canvas.toDataURL(outputType);

                    // Tính kích thước thực tế (base64 string length * 3/4 - padding)
                    let resultSizeMB = (result.length * 3) / 4 / 1024 / 1024;

                    // Nếu vẫn còn lớn và là JPEG, giảm quality thêm
                    let currentQuality = quality;
                    if (isJPEG && resultSizeMB > maxSizeMB && currentQuality > 0.5) {
                        while (resultSizeMB > maxSizeMB && currentQuality > 0.5) {
                            currentQuality -= 0.1;
                            result = canvas.toDataURL(outputType, currentQuality);
                            resultSizeMB = (result.length * 3) / 4 / 1024 / 1024;
                        }
                    } else if (!isJPEG && resultSizeMB > maxSizeMB) {
                        // Với PNG, convert sang JPEG để giảm kích thước
                        result = canvas.toDataURL('image/jpeg', 0.85);
                        resultSizeMB = (result.length * 3) / 4 / 1024 / 1024;

                        // Nếu vẫn lớn, giảm quality JPEG
                        currentQuality = 0.85;
                        while (resultSizeMB > maxSizeMB && currentQuality > 0.5) {
                            currentQuality -= 0.1;
                            result = canvas.toDataURL('image/jpeg', currentQuality);
                            resultSizeMB = (result.length * 3) / 4 / 1024 / 1024;
                        }
                    }

                    // Log thông tin (có thể bỏ trong production)
                    const originalSizeMB = (file.size / 1024 / 1024).toFixed(2);
                    const compressedSizeMB = resultSizeMB.toFixed(2);
                    const compressionRatio = ((1 - resultSizeMB / (file.size / 1024 / 1024)) * 100).toFixed(1);

                    console.log(`📸 Ảnh đã resize: ${originalSizeMB}MB → ${compressedSizeMB}MB (giảm ${compressionRatio}%)`);

                    resolve(result);
                } catch (error) {
                    console.error('❌ Lỗi resize ảnh:', error);
                    reject(error);
                }
            };

            img.onerror = (error) => {
                console.error('❌ Lỗi load ảnh:', error);
                reject(new Error('Không thể load ảnh'));
            };

            // Load ảnh từ FileReader result
            img.src = e.target.result;
        };

        reader.onerror = (error) => {
            console.error('❌ Lỗi đọc file:', error);
            reject(new Error('Không thể đọc file'));
        };

        reader.readAsDataURL(file);
    });
};

/**
 * Resize ảnh với cấu hình mặc định (phù hợp cho upload)
 * @param {File} file - File ảnh gốc
 * @returns {Promise<string>} - Base64 string của ảnh đã resize
 */
export const resizeImageForUpload = (file) => {
    return resizeImage(file, {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.85,
        maxSizeMB: 2
    });
};

