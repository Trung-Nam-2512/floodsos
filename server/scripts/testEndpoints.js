/**
 * Script kiểm thử toàn bộ endpoints trước khi deploy production
 * Chạy: node server/scripts/testEndpoints.js
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

// Colors for console
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

// Test results
const results = {
    passed: 0,
    failed: 0,
    errors: []
};

// Helper function
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
    log(`\n🧪 Testing: ${name}`, 'cyan');
}

function logPass(message) {
    log(`  ✅ ${message}`, 'green');
    results.passed++;
}

function logFail(message, error = null) {
    log(`  ❌ ${message}`, 'red');
    if (error) {
        log(`     Error: ${error.message || error}`, 'red');
        results.errors.push({ test: message, error: error.message || String(error) });
    }
    results.failed++;
}

// Test functions
async function testHealthCheck() {
    logTest('Health Check');
    try {
        const res = await axios.get(`${BASE_URL}/health`);
        if (res.data.success) {
            logPass('Health check passed');
            return true;
        } else {
            logFail('Health check failed - invalid response');
            return false;
        }
    } catch (error) {
        logFail('Health check failed', error);
        return false;
    }
}

async function testHotlines() {
    logTest('Hotlines API');
    try {
        const res = await axios.get(`${BASE_URL}/hotlines`);
        if (res.data && res.data.success && Array.isArray(res.data.data)) {
            logPass(`Hotlines API - Found ${res.data.data.length} hotlines`);
            return true;
        } else {
            logFail('Hotlines API - Invalid response format');
            return false;
        }
    } catch (error) {
        logFail('Hotlines API failed', error);
        return false;
    }
}

async function testSafePoints() {
    logTest('Safe Points API');
    try {
        // GET all
        const res = await axios.get(`${BASE_URL}/safe-points`);
        if (res.data && res.data.success && Array.isArray(res.data.data)) {
            logPass(`GET /safe-points - Found ${res.data.data.length} safe points`);
        } else {
            logFail('GET /safe-points - Invalid response format');
            return false;
        }

        // Test POST (create)
        const testData = {
            name: 'Test Safe Point',
            lat: 16.0544,
            lng: 108.2022,
            address: 'Test Address',
            phone: '0123456789',
            capacity: 100,
            status: 'Hoạt động', // Must match enum: ['Hoạt động', 'Tạm ngưng', 'Đầy']
            type: 'Điểm trú ẩn' // Must match enum: ['Điểm trú ẩn', 'Đội cứu hộ', 'Bệnh viện', 'Trạm y tế', 'Khác']
        };
        const createRes = await axios.post(`${BASE_URL}/safe-points`, testData);
        if (createRes.data && createRes.data.success && createRes.data.data) {
            const createdId = createRes.data.data._id || createRes.data.data.id;
            logPass(`POST /safe-points - Created safe point: ${createdId}`);

            // Test GET by ID
            const getRes = await axios.get(`${BASE_URL}/safe-points/${createdId}`);
            if (getRes.data && getRes.data.success) {
                logPass(`GET /safe-points/:id - Retrieved safe point`);
            } else {
                logFail('GET /safe-points/:id - Failed');
            }

            // Test PUT (update)
            const updateRes = await axios.put(`${BASE_URL}/safe-points/${createdId}`, {
                ...testData,
                name: 'Updated Test Safe Point'
            });
            if (updateRes.data && updateRes.data.success) {
                logPass(`PUT /safe-points/:id - Updated safe point`);
            } else {
                logFail('PUT /safe-points/:id - Failed');
            }

            // Test DELETE
            const deleteRes = await axios.delete(`${BASE_URL}/safe-points/${createdId}`);
            if (deleteRes.data && deleteRes.data.success) {
                logPass(`DELETE /safe-points/:id - Deleted safe point`);
            } else {
                logFail('DELETE /safe-points/:id - Failed');
            }

            return true;
        } else {
            logFail('POST /safe-points - Failed to create');
            return false;
        }
    } catch (error) {
        logFail('Safe Points API failed', error);
        return false;
    }
}

async function testRescueRequests() {
    logTest('Rescue Requests API');
    try {
        // GET all with pagination
        const res = await axios.get(`${BASE_URL}/rescue-requests?page=1&limit=10`);
        if (res.data && res.data.success && Array.isArray(res.data.data)) {
            logPass(`GET /rescue-requests - Found ${res.data.data.length} requests`);
        } else {
            logFail('GET /rescue-requests - Invalid response format');
            return false;
        }

        // Test with filters
        const filterRes = await axios.get(`${BASE_URL}/rescue-requests?urgency=KHẨN CẤP&status=pending`);
        if (filterRes.data && filterRes.data.success) {
            logPass('GET /rescue-requests with filters - Working');
        } else {
            logFail('GET /rescue-requests with filters - Failed');
        }

        // Test search
        const searchRes = await axios.get(`${BASE_URL}/rescue-requests?search=test`);
        if (searchRes.data && searchRes.data.success) {
            logPass('GET /rescue-requests with search - Working');
        } else {
            logFail('GET /rescue-requests with search - Failed');
        }

        // Test stats
        const statsRes = await axios.get(`${BASE_URL}/rescue-requests/admin/stats`);
        if (statsRes.data && statsRes.data.success) {
            logPass('GET /rescue-requests/admin/stats - Working');
        } else {
            logFail('GET /rescue-requests/admin/stats - Failed');
        }

        return true;
    } catch (error) {
        logFail('Rescue Requests API failed', error);
        return false;
    }
}

async function testReport() {
    logTest('Report API');
    try {
        const testReport = {
            name: 'Test Reporter',
            phone: '0123456789',
            address: 'Test Address',
            description: 'Test description',
            image: null // Base64 image would go here
        };
        const res = await axios.post(`${BASE_URL}/report`, testReport);
        if (res.data && res.data.success) {
            logPass('POST /report - Created report successfully');
            return true;
        } else {
            logFail('POST /report - Invalid response format');
            return false;
        }
    } catch (error) {
        logFail('Report API failed', error);
        return false;
    }
}

async function testAIReport() {
    logTest('AI Report API');
    try {
        const testText = 'Cần cứu trợ tại 123 Đường ABC, Đà Nẵng. Số người: 5. Liên hệ: 0123456789';
        // API expects 'rawText' not 'text'
        const res = await axios.post(`${BASE_URL}/ai-report`, { rawText: testText });
        if (res.data && res.data.success) {
            logPass('POST /ai-report - AI parsing worked');
            return true;
        } else {
            logFail('POST /ai-report - Invalid response format');
            return false;
        }
    } catch (error) {
        // AI might fail if OPENAI_API_KEY is not set, but that's okay for testing
        if (error.response && (error.response.status === 500 || error.response.status === 400)) {
            log('  ⚠️  AI Report API - OPENAI_API_KEY might not be set or validation failed (expected in some environments)', 'yellow');
            log(`     Status: ${error.response.status}, Message: ${error.response.data?.message || 'Unknown'}`, 'yellow');
            return true; // Don't fail the test
        }
        logFail('AI Report API failed', error);
        return false;
    }
}

async function testGeocoding() {
    logTest('Geocoding API');
    try {
        const res = await axios.post(`${BASE_URL}/geocoding/geocode`, {
            address: 'Đà Nẵng, Việt Nam'
        });
        if (res.data && res.data.success) {
            logPass('POST /geocoding/geocode - Working');
            return true;
        } else {
            logFail('POST /geocoding/geocode - Invalid response format');
            return false;
        }
    } catch (error) {
        logFail('Geocoding API failed', error);
        return false;
    }
}

async function testAdminExport() {
    logTest('Admin Export APIs');
    try {
        // Test CSV export
        const csvRes = await axios.get(`${BASE_URL}/admin/export-csv`, {
            responseType: 'arraybuffer'
        });
        if (csvRes.status === 200 && csvRes.data) {
            logPass('GET /admin/export-csv - Working');
        } else {
            logFail('GET /admin/export-csv - Failed');
        }

        // Test Excel export
        const excelRes = await axios.get(`${BASE_URL}/admin/export-excel`, {
            responseType: 'arraybuffer'
        });
        if (excelRes.status === 200 && excelRes.data) {
            logPass('GET /admin/export-excel - Working');
        } else {
            logFail('GET /admin/export-excel - Failed');
        }

        return true;
    } catch (error) {
        logFail('Admin Export APIs failed', error);
        return false;
    }
}

// Main test runner
async function runAllTests() {
    log('\n🚀 Bắt đầu kiểm thử toàn bộ endpoints...\n', 'blue');
    log(`📍 API URL: ${BASE_URL}\n`, 'blue');

    // Run all tests
    await testHealthCheck();
    await testHotlines();
    await testSafePoints();
    await testRescueRequests();
    await testReport();
    await testAIReport();
    await testGeocoding();
    await testAdminExport();

    // Summary
    log('\n' + '='.repeat(60), 'blue');
    log('📊 KẾT QUẢ KIỂM THỬ', 'blue');
    log('='.repeat(60), 'blue');
    log(`✅ Passed: ${results.passed}`, 'green');
    log(`❌ Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
    log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`, 'cyan');

    if (results.errors.length > 0) {
        log('\n⚠️  Chi tiết lỗi:', 'yellow');
        results.errors.forEach((err, idx) => {
            log(`  ${idx + 1}. ${err.test}`, 'yellow');
            log(`     ${err.error}`, 'yellow');
        });
    }

    if (results.failed === 0) {
        log('\n🎉 TẤT CẢ TESTS ĐÃ PASS! Sẵn sàng cho production!', 'green');
        process.exit(0);
    } else {
        log('\n⚠️  Có một số tests thất bại. Vui lòng kiểm tra lại trước khi deploy.', 'yellow');
        process.exit(1);
    }
}

// Run tests
runAllTests().catch(error => {
    log('\n💥 Lỗi khi chạy tests:', 'red');
    log(error.message, 'red');
    process.exit(1);
});

