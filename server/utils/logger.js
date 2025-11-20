/**
 * Simple logging utility
 * Có thể nâng cấp lên winston/sentry sau nếu cần
 */

const logLevels = {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG'
};

class Logger {
    constructor() {
        this.isDevelopment = process.env.NODE_ENV === 'development';
    }

    /**
     * Format log message với timestamp
     */
    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...(data && { data })
        };
        return logEntry;
    }

    /**
     * Log error
     */
    error(message, error = null, req = null) {
        const logData = {
            message,
            ...(error && {
                error: {
                    name: error.name,
                    message: error.message,
                    stack: this.isDevelopment ? error.stack : undefined
                }
            }),
            ...(req && {
                request: {
                    method: req.method,
                    url: req.originalUrl,
                    ip: req.ip || req.connection?.remoteAddress,
                    userAgent: req.get('user-agent')
                }
            })
        };

        const logEntry = this.formatMessage(logLevels.ERROR, message, logData);
        console.error('❌ [ERROR]', JSON.stringify(logEntry, null, 2));
        
        // TODO: Có thể gửi lên Sentry/LogRocket ở đây
        // if (process.env.SENTRY_DSN) {
        //     Sentry.captureException(error);
        // }
    }

    /**
     * Log warning
     */
    warn(message, data = null) {
        const logEntry = this.formatMessage(logLevels.WARN, message, data);
        console.warn('⚠️  [WARN]', JSON.stringify(logEntry, null, 2));
    }

    /**
     * Log info
     */
    info(message, data = null) {
        const logEntry = this.formatMessage(logLevels.INFO, message, data);
        console.log('ℹ️  [INFO]', JSON.stringify(logEntry, null, 2));
    }

    /**
     * Log debug (chỉ trong development)
     */
    debug(message, data = null) {
        if (this.isDevelopment) {
            const logEntry = this.formatMessage(logLevels.DEBUG, message, data);
            console.log('🔍 [DEBUG]', JSON.stringify(logEntry, null, 2));
        }
    }
}

// Export singleton instance
const logger = new Logger();
export default logger;

