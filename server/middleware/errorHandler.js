import logger from '../utils/logger.js';

/**
 * Global error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Xử lý CORS errors - không log như ERROR vì đây là hành vi bình thường
  if (err.message === 'Not allowed by CORS') {
    // Chỉ log ở mức WARN và chỉ log một lần mỗi 10 giây để tránh spam
    const corsLogKey = `cors_${req.ip}_${req.get('origin') || 'no-origin'}`;
    const lastLogTime = errorHandler._corsLogTimes || {};
    const now = Date.now();

    if (!lastLogTime[corsLogKey] || (now - lastLogTime[corsLogKey]) > 10000) {
      logger.warn(`⚠️  CORS blocked: ${req.get('origin') || 'no-origin'} from ${req.ip}`);
      errorHandler._corsLogTimes = errorHandler._corsLogTimes || {};
      errorHandler._corsLogTimes[corsLogKey] = now;
    }

    return res.status(403).json({
      success: false,
      message: 'Not allowed by CORS'
    });
  }

  // Log error với thông tin chi tiết cho các lỗi khác
  logger.error('Unhandled error occurred', err, req);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Lỗi server';

  res.status(statusCode).json({
    success: false,
    message: message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} không tồn tại`
  });
};


