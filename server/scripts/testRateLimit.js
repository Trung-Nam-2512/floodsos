/**
 * Script test rate limiting
 * Chạy: node server/scripts/testRateLimit.js
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootPath = join(__dirname, '..', '..');
const envPath = join(rootPath, '.env');
dotenv.config({ path: envPath });

const API_URL = process.env.API_URL || 'http://localhost:5000';
const BASE_URL = `${API_URL}/api`;

// Colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testRateLimit() {
    log('\n🧪 Testing Rate Limiting...\n', 'blue');
    log(`📍 API URL: ${BASE_URL}\n`, 'blue');

    const testEndpoint = `${BASE_URL}/hotlines`; // Test với endpoint khác (không phải health check)
    const maxRequests = 105; // Test vượt quá limit 100

    log(`📊 Sending ${maxRequests} requests to ${testEndpoint}...`, 'cyan');
    log('   (Rate limit: 100 requests per 15 minutes)\n', 'yellow');

    let successCount = 0;
    let rateLimitedCount = 0;
    let errorCount = 0;

    const startTime = Date.now();

    // Gửi requests nhanh
    const promises = [];
    for (let i = 1; i <= maxRequests; i++) {
        promises.push(
            axios.get(testEndpoint)
                .then(() => {
                    successCount++;
                    if (i <= 5 || i > maxRequests - 5) {
                        log(`  ✅ Request ${i}: Success`, 'green');
                    }
                })
                .catch(error => {
                    if (error.response && error.response.status === 429) {
                        rateLimitedCount++;
                        if (rateLimitedCount <= 5) {
                            log(`  ⚠️  Request ${i}: Rate Limited (429)`, 'yellow');
                            if (error.response.data) {
                                log(`     Message: ${error.response.data.message}`, 'yellow');
                            }
                        }
                    } else {
                        errorCount++;
                        log(`  ❌ Request ${i}: Error - ${error.message}`, 'red');
                    }
                })
        );
    }

    await Promise.all(promises);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Summary
    log('\n' + '='.repeat(60), 'blue');
    log('📊 KẾT QUẢ TEST RATE LIMITING', 'blue');
    log('='.repeat(60), 'blue');
    log(`✅ Success: ${successCount}`, 'green');
    log(`⚠️  Rate Limited (429): ${rateLimitedCount}`, 'yellow');
    log(`❌ Errors: ${errorCount}`, errorCount > 0 ? 'red' : 'green');
    log(`⏱️  Duration: ${duration}s`, 'cyan');
    log(`📈 Total Requests: ${maxRequests}`, 'cyan');

    // Kiểm tra kết quả
    if (rateLimitedCount > 0) {
        log('\n✅ Rate limiting đang hoạt động!', 'green');
        log(`   Đã chặn ${rateLimitedCount} requests vượt quá limit.`, 'green');
    } else {
        log('\n⚠️  Rate limiting có thể chưa hoạt động đúng.', 'yellow');
        log('   Không có requests nào bị rate limit.', 'yellow');
    }

    if (successCount <= 100) {
        log('\n✅ Số lượng requests thành công hợp lý (≤ 100).', 'green');
    } else {
        log('\n⚠️  Có thể có vấn đề với rate limiting.', 'yellow');
        log(`   Có ${successCount} requests thành công (nên ≤ 100).`, 'yellow');
    }

    log('\n');
}

// Test health check có bị rate limit không
async function testHealthCheckExemption() {
    log('\n🧪 Testing Health Check Exemption...\n', 'blue');
    
    const testEndpoint = `${BASE_URL}/health`;
    const testCount = 10;

    log(`📊 Sending ${testCount} requests to health check endpoint...`, 'cyan');
    log('   (Health check should NOT be rate limited)\n', 'yellow');

    let successCount = 0;
    let rateLimitedCount = 0;

    for (let i = 1; i <= testCount; i++) {
        try {
            await axios.get(testEndpoint);
            successCount++;
            log(`  ✅ Request ${i}: Success`, 'green');
        } catch (error) {
            if (error.response && error.response.status === 429) {
                rateLimitedCount++;
                log(`  ⚠️  Request ${i}: Rate Limited (429) - KHÔNG ĐÚNG!`, 'red');
            } else {
                log(`  ❌ Request ${i}: Error - ${error.message}`, 'red');
            }
        }
    }

    log('\n' + '='.repeat(60), 'blue');
    log('📊 KẾT QUẢ TEST HEALTH CHECK EXEMPTION', 'blue');
    log('='.repeat(60), 'blue');
    log(`✅ Success: ${successCount}/${testCount}`, 'green');
    log(`⚠️  Rate Limited: ${rateLimitedCount}`, rateLimitedCount > 0 ? 'red' : 'green');

    if (rateLimitedCount === 0) {
        log('\n✅ Health check được exempt khỏi rate limiting đúng!', 'green');
    } else {
        log('\n❌ Health check vẫn bị rate limit - CẦN SỬA!', 'red');
    }

    log('\n');
}

// Run tests
async function runAllTests() {
    try {
        await testHealthCheckExemption();
        await testRateLimit();
        
        log('🎉 Hoàn thành test rate limiting!', 'green');
        process.exit(0);
    } catch (error) {
        log('\n💥 Lỗi khi chạy tests:', 'red');
        log(error.message, 'red');
        process.exit(1);
    }
}

runAllTests();

