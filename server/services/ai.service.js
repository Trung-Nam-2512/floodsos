import openai from '../config/openai.config.js';
import logger from '../utils/logger.js';

/**
 * Service xử lý AI cho cầu cứu lũ lụt
 */
class AIService {
    /**
     * Xử lý cầu cứu bằng OpenAI (có thể bao gồm cả ảnh)
     * @param {string} rawText - Nội dung cầu cứu gốc
     * @param {string|null} imageBase64 - Ảnh dạng base64 (nếu có)
     * @param {string|null} facebookUrl - Link Facebook (nếu có)
     * @returns {Promise<Object>} - Dữ liệu đã parse
     */
    async processRescueRequest(rawText, imageBase64 = null, facebookUrl = null) {
        console.log('🚀 AI Service: Bắt đầu xử lý cầu cứu...');
        console.log('   Raw text length:', rawText?.length || 0);
        console.log('   Facebook URL:', facebookUrl || 'Không có');

        // Prompt chuẩn cho OpenAI - CẢI THIỆN để parse tốt hơn
        const prompt = `Bạn là AI chuyên xử lý cầu cứu lũ lụt miền Trung Việt Nam 2025. Phân tích CỰC KỲ KỸ LƯỠNG từng từ trong nội dung để trích xuất CHÍNH XÁC mọi thông tin.

QUAN TRỌNG:
- Đọc KỸ từng dòng, từng từ
- Tìm địa chỉ: thôn/xóm, xã/phường, huyện, tỉnh (ví dụ: "Tuy An Tây", "An nghiệp", "Phú Yên")
- Tìm số điện thoại: bất kỳ số nào có 10-11 chữ số (ví dụ: 0369090364, 0386543644)
- Tìm số người: "2 ông bà già", "5 người", "cả xóm", "gia đình"
- Đánh giá độ khẩn cấp: "ngập lút", "nước đang lớn", "kẹt trên gác" = CỰC KỲ KHẨN CẤP
- Tìm nhu cầu: "cứu hộ", "ca nô", "thuyền", "thực phẩm", "nước uống"

Trích xuất thành JSON đúng định dạng sau, CHỈ TRẢ JSON THUẦN, không giải thích:

{
  "location": "địa chỉ đầy đủ" (ví dụ: "Tuy An Tây, Vùng 3, An nghiệp, huyện Tuy An, tỉnh Phú Yên"),
  "coords": [kinh độ, vĩ độ] hoặc [null, null] nếu không rõ,
  "urgency": "CỰC KỲ KHẨN CẤP" | "KHẨN CẤP" | "CẦN CỨU TRỢ",
  "people": "mô tả số người" (ví dụ: "2 ông bà già"),
  "needs": "nhu cầu" (ví dụ: "cứu hộ, ca nô"),
  "description": "tóm tắt tình trạng",
  "contact": "số điện thoại đầu tiên tìm thấy" hoặc null,
  "timestamp": ${Math.floor(Date.now() / 1000)}
}

Nội dung cần xử lý:
${rawText}`;

        // Kiểm tra API key (debug chi tiết)
        const apiKeyValue = openai.apiKey || process.env.OPENAI_API_KEY || '';
        console.log('🔑 Kiểm tra OpenAI API key:', {
            hasOpenAIApiKey: !!openai.apiKey,
            openAIApiKeyLength: openai.apiKey?.length || 0,
            hasProcessEnvKey: !!process.env.OPENAI_API_KEY,
            processEnvKeyLength: process.env.OPENAI_API_KEY?.length || 0,
            finalApiKeyLength: apiKeyValue.length
        });

        if (!apiKeyValue || apiKeyValue.length === 0) {
            console.log('⚠️  Không có OpenAI API key, dùng fallback parsing');
            console.log('   Vui lòng kiểm tra file .env có OPENAI_API_KEY không?');
            const fallbackData = await this.createFallbackData(rawText);
            console.log('📋 Fallback data:', {
                location: fallbackData.location
            });
            return fallbackData;
        }

        try {
            console.log('🤖 Đang gọi OpenAI API...');
            // Xây dựng messages cho OpenAI (CHỈ xử lý text, KHÔNG xử lý ảnh)
            const messages = [
                {
                    role: 'system',
                    content: 'Bạn là AI chuyên xử lý cầu cứu lũ lụt miền Trung Việt Nam. Phân tích TEXT để trích xuất thông tin chính xác nhất. Chỉ trả về JSON thuần, không giải thích gì thêm.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ];

            const completion = await openai.chat.completions.create({
                model: 'gpt-4o', // GPT-4o hỗ trợ cả Vision
                messages: messages,
                temperature: 0.3,
                max_tokens: 500
            });

            const responseText = completion.choices[0].message.content.trim();
            console.log('📥 OpenAI response length:', responseText.length);
            console.log('📥 OpenAI response preview:', responseText.substring(0, 200));

            // Parse JSON từ response (xử lý markdown code block)
            let jsonText = responseText;
            if (responseText.startsWith('```json')) {
                jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            } else if (responseText.startsWith('```')) {
                jsonText = responseText.replace(/```\n?/g, '').trim();
            }

            console.log('📋 Đang parse JSON từ OpenAI response...');
            const parsedData = JSON.parse(jsonText);
            console.log('✅ Parse JSON thành công:', {
                location: parsedData.location,
                coords: parsedData.coords
            });

            // Validate và fix dữ liệu
            const validatedData = this.validateAndFixData(parsedData);

            // KHÔNG geocode nữa - tọa độ sẽ lấy từ Google Maps link hoặc user cập nhật thủ công
            // AI chỉ cần parse địa chỉ text, không cần tọa độ
            validatedData.coords = [null, null]; // Luôn set về null, để user cập nhật từ Google Maps link

            console.log('📋 AI parsed data (KHÔNG geocode):', {
                location: validatedData.location,
                urgency: validatedData.urgency
            });

            return validatedData;

        } catch (error) {
            logger.error('Lỗi OpenAI API', error);
            console.log('🔄 Chuyển sang fallback parsing...');
            const fallbackData = await this.createFallbackData(rawText);
            console.log('📋 Fallback data:', {
                location: fallbackData.location
            });

            return fallbackData;
        }
    }

    /**
     * Validate và fix dữ liệu từ AI
     * @param {Object} data - Dữ liệu cần validate
     * @returns {Object} - Dữ liệu đã validate
     */
    validateAndFixData(data) {
        // Đảm bảo timestamp là hiện tại
        data.timestamp = Math.floor(Date.now() / 1000);

        // Validate coords
        if (!data.coords || !Array.isArray(data.coords) || data.coords.length !== 2) {
            data.coords = [null, null];
        }

        // Đảm bảo các field bắt buộc
        data.location = data.location || "Không rõ vị trí";
        data.urgency = data.urgency || "CẦN CỨU TRỢ";
        data.people = data.people || "không rõ";
        data.needs = data.needs || "cần xác minh";
        data.description = data.description || "Không có mô tả";
        data.contact = data.contact || null;
        data.contactFull = data.contactFull || data.contact; // Tất cả số điện thoại

        return data;
    }

    /**
     * Parse thông tin cơ bản từ text bằng regex (fallback khi AI lỗi)
     * @param {string} rawText - Nội dung gốc
     * @returns {Object} - Dữ liệu đã parse
     */
    parseBasicInfo(rawText) {
        // Tìm TẤT CẢ số điện thoại (10-11 chữ số)
        const phoneRegex = /(?:0|\+84)[3-9]\d{8,9}/g;
        const phones = rawText.match(phoneRegex) || [];
        const allPhones = phones.map(p => p.replace(/\s+/g, ''));
        // Lấy số đầu tiên làm contact chính, lưu tất cả vào contactFull
        const contact = allPhones.length > 0 ? allPhones[0] : null;
        const contactFull = allPhones.length > 1 ? allPhones.join(', ') : contact;

        // Tìm địa chỉ (các từ khóa địa danh)
        const locationKeywords = [
            'Tuy An', 'Sông Hinh', 'Ea H\'leo', 'Krông Búk', 'Tuy Hòa',
            'Phú Yên', 'Đắk Lắk', 'Khánh Hòa', 'Bình Định', 'Quảng Ngãi',
            'thôn', 'xã', 'phường', 'huyện', 'tỉnh', 'An nghiệp', 'Tuy An Tây'
        ];
        let location = '';
        for (const keyword of locationKeywords) {
            if (rawText.includes(keyword)) {
                // Lấy câu chứa keyword
                const sentences = rawText.split(/[.!?\n]/);
                const relevantSentence = sentences.find(s => s.includes(keyword));
                if (relevantSentence) {
                    location = relevantSentence.trim();
                    break;
                }
            }
        }
        if (!location) {
            location = "Không rõ vị trí - cần xác minh thủ công";
        }

        // Tìm số người
        let people = "không rõ";
        const peoplePatterns = [
            /(\d+)\s*(?:ông|bà|người|trẻ em|trẻ)/gi,
            /(?:cả|toàn)\s*(?:xóm|nhà|gia đình)/gi,
            /(?:ông|bà)\s*(?:già|trẻ)/gi
        ];
        for (const pattern of peoplePatterns) {
            const match = rawText.match(pattern);
            if (match) {
                people = match[0];
                break;
            }
        }
        if (rawText.includes('2 ông bà già')) {
            people = "2 ông bà già";
        }

        // Đánh giá độ khẩn cấp
        let urgency = "CẦN CỨU TRỢ";
        if (rawText.includes('ngập lút') || rawText.includes('nước đang lớn') ||
            rawText.includes('kẹt') || rawText.includes('SOS') || rawText.includes('cứu')) {
            urgency = "CỰC KỲ KHẨN CẤP";
        } else if (rawText.includes('ngập') || rawText.includes('cần')) {
            urgency = "KHẨN CẤP";
        }

        // Tìm nhu cầu
        let needs = "cứu hộ";
        if (rawText.includes('ca nô') || rawText.includes('thuyền')) {
            needs = "ca nô, cứu hộ";
        }
        if (rawText.includes('thực phẩm') || rawText.includes('nước')) {
            needs += ", thực phẩm, nước uống";
        }

        // Mô tả
        const description = rawText.substring(0, 200).replace(/\n/g, ' ').trim();

        return {
            location: location,
            coords: [null, null],
            urgency: urgency,
            people: people,
            needs: needs,
            description: description,
            contact: contact,
            contactFull: contactFull || contact, // Tất cả số điện thoại
            timestamp: Math.floor(Date.now() / 1000)
        };
    }

    /**
     * Tạo dữ liệu fallback khi AI lỗi
     * @param {string} rawText - Nội dung gốc
     * @returns {Promise<Object>} - Dữ liệu fallback (đã parse cơ bản + geocode)
     */
    async createFallbackData(rawText) {
        // Dùng regex để parse thông tin cơ bản
        const fallbackData = this.parseBasicInfo(rawText);

        // KHÔNG geocode nữa - tọa độ sẽ lấy từ Google Maps link hoặc user cập nhật thủ công
        fallbackData.coords = [null, null]; // Luôn set về null

        return fallbackData;
    }
}

export default new AIService();

