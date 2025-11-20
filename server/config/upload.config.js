import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tạo thư mục uploads nếu chưa có
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('✅ Đã tạo thư mục uploads');
}

/**
 * Cấu hình Multer để lưu hình ảnh local
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Tạo tên file unique: timestamp-randomstring-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'rescue-' + uniqueSuffix + ext);
  }
});

// Filter chỉ cho phép hình ảnh
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép upload hình ảnh (jpg, png, gif, webp)'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/**
 * Lưu base64 image thành file
 * @param {string} base64String - Image dạng base64
 * @returns {string} - Path tới file đã lưu
 */
export const saveBase64Image = (base64String) => {
  try {
    // Parse base64 string
    const matches = base64String.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 image format');
    }

    const imageType = matches[1]; // png, jpg, etc
    const imageData = matches[2];
    const buffer = Buffer.from(imageData, 'base64');

    // Tạo tên file unique
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `rescue-${uniqueSuffix}.${imageType}`;
    const filepath = path.join(uploadDir, filename);

    // Lưu file
    fs.writeFileSync(filepath, buffer);
    
    // Trả về relative path (để serve qua Express)
    return `/uploads/${filename}`;
  } catch (error) {
    console.error('Lỗi lưu hình ảnh:', error);
    throw error;
  }
};

/**
 * Xóa file hình ảnh
 * @param {string} imagePath - Path tới file (ví dụ: /uploads/rescue-123.jpg)
 */
export const deleteImage = (imagePath) => {
  try {
    if (!imagePath) return;
    
    const filename = path.basename(imagePath);
    const filepath = path.join(uploadDir, filename);
    
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`✅ Đã xóa hình ảnh: ${filename}`);
    }
  } catch (error) {
    console.error('Lỗi xóa hình ảnh:', error);
  }
};

export default upload;


