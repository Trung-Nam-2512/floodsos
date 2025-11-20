/**
 * Test script cho duplicate check
 * Chạy: node test-duplicate-check.js
 */

import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:5000';

async function testDuplicateCheck() {
    console.log('🧪 Bắt đầu test duplicate check...\n');

    try {
        // Test 1: Check duplicate với dữ liệu mẫu
        console.log('📝 Test 1: Check duplicate với dữ liệu mẫu');
        const testData1 = {
            rawText: 'Cần cứu hộ khẩn cấp tại Phú Yên, có 5 người bị mắc kẹt. Liên hệ: 0912345678',
            description: 'Cần cứu hộ khẩn cấp tại Phú Yên, có 5 người bị mắc kẹt. Liên hệ: 0912345678',
            contact: '0912345678',
            coords: [109.3, 13.08],
            location: 'Phú Yên'
        };

        const response1 = await axios.post(`${API_URL}/api/rescue-requests/check-duplicate`, testData1);
        console.log('✅ Response:', JSON.stringify(response1.data, null, 2));
        console.log('');

        // Test 2: Tạo request mới (để có dữ liệu duplicate)
        console.log('📝 Test 2: Tạo request mới');
        const createData = {
            rawText: 'Cần cứu hộ khẩn cấp tại Phú Yên, có 5 người bị mắc kẹt. Liên hệ: 0912345678',
            facebookUrl: 'https://www.facebook.com/test123',
            coords: [109.3, 13.08]
        };

        const createResponse = await axios.post(`${API_URL}/api/ai-report`, createData);
        console.log('✅ Created request:', createResponse.data.data?._id);
        console.log('   Duplicate check:', createResponse.data.duplicateCheck);
        console.log('');

        // Đợi 1 giây để đảm bảo request đã được lưu
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test 3: Check duplicate với dữ liệu tương tự (sau khi đã tạo)
        console.log('📝 Test 3: Check duplicate với dữ liệu tương tự (sau khi đã tạo)');
        const testData2 = {
            rawText: 'Cần cứu hộ khẩn cấp tại Phú Yên, có 5 người bị mắc kẹt. Liên hệ: 0912345678',
            description: 'Cần cứu hộ khẩn cấp tại Phú Yên, có 5 người bị mắc kẹt. Liên hệ: 0912345678',
            contact: '0912345678',
            coords: [109.3, 13.08],
            location: 'Phú Yên',
            facebookUrl: 'https://www.facebook.com/test123' // Cùng Facebook URL
        };

        const response2 = await axios.post(`${API_URL}/api/rescue-requests/check-duplicate`, testData2);
        console.log('✅ Response:', JSON.stringify(response2.data, null, 2));
        
        if (response2.data.isDuplicate) {
            console.log('✅ ✅ ✅ DUPLICATE DETECTED! Hệ thống hoạt động đúng!');
            console.log(`   Similarity: ${response2.data.maxSimilarity * 100}%`);
            console.log(`   Số lượng duplicate: ${response2.data.duplicates.length}`);
        } else {
            console.log('⚠️  Không phát hiện duplicate (có thể do chưa có dữ liệu trong DB)');
        }

        console.log('\n✅ Test hoàn thành!');

    } catch (error) {
        console.error('❌ Lỗi test:', error.message);
        if (error.response) {
            console.error('   Response:', error.response.data);
        }
        process.exit(1);
    }
}

// Chạy test
testDuplicateCheck();

