import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Service để đọc và parse dữ liệu CSV từ thủy điện EVN
 */
class ThuydienDataService {
    /**
     * Lấy đường dẫn thư mục data
     */
    getDataDirectory() {
        return path.join(__dirname, "data");
    }

    /**
     * Parse CSV file với delimiter là semicolon (;)
     * @param {string} filePath - Đường dẫn đến file CSV
     * @returns {Array<Object>} Array of objects với keys là header columns, đã được sắp xếp theo thời gian từ cũ đến mới
     */
    parseCSV(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                return [];
            }

            const content = fs.readFileSync(filePath, "utf8").trim();
            if (!content) {
                return [];
            }

            const lines = content.split("\n").filter(line => line.trim());
            if (lines.length < 2) {
                return []; // Cần ít nhất header và 1 row data
            }

            // Parse header (dòng đầu tiên)
            const headers = lines[0].split(";").map(h => h.trim());

            // Parse data rows
            const data = [];
            const seenTimes = new Set(); // Để loại bỏ trùng lặp

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(";").map(v => v.trim());
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || "";
                });

                // Chỉ thêm nếu có Time và chưa tồn tại (loại bỏ trùng lặp)
                if (row.Time && !seenTimes.has(row.Time)) {
                    seenTimes.add(row.Time);
                    data.push(row);
                }
            }

            // Sắp xếp theo thời gian từ cũ đến mới (tăng dần)
            data.sort((a, b) => {
                if (!a.Time || !b.Time) return 0;
                const timeA = new Date(a.Time);
                const timeB = new Date(b.Time);

                // Nếu không parse được Date, so sánh string
                if (isNaN(timeA.getTime()) || isNaN(timeB.getTime())) {
                    return a.Time.localeCompare(b.Time);
                }

                return timeA - timeB;
            });

            return data;
        } catch (error) {
            console.error(`Lỗi khi parse CSV file ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Lấy file path cho một hồ cụ thể theo ngày
     * @param {string} reservoirSlug - Slug của hồ (ví dụ: "song_hinh", "song_ba_ha")
     * @param {Date} date - Ngày cần lấy dữ liệu (mặc định là hôm nay)
     * @returns {string} Đường dẫn file CSV
     */
    getFilePathForDate(reservoirSlug, date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return path.join(
            this.getDataDirectory(),
            String(year),
            month,
            day,
            `${reservoirSlug}.csv`
        );
    }

    /**
     * Lấy dữ liệu mới nhất của một hồ
     * @param {string} reservoirSlug - Slug của hồ
     * @returns {Object|null} Dữ liệu mới nhất hoặc null nếu không có
     */
    getLatestData(reservoirSlug) {
        // Thử lấy từ hôm nay trước
        let filePath = this.getFilePathForDate(reservoirSlug, new Date());

        // Nếu không có, thử lấy từ hôm qua
        if (!fs.existsSync(filePath)) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            filePath = this.getFilePathForDate(reservoirSlug, yesterday);
        }

        if (!fs.existsSync(filePath)) {
            return null;
        }

        const data = this.parseCSV(filePath);
        if (data.length === 0) {
            return null;
        }

        // Trả về record mới nhất (cuối cùng trong file)
        return data[data.length - 1];
    }

    /**
     * Lấy tất cả dữ liệu của một hồ trong một ngày
     * @param {string} reservoirSlug - Slug của hồ
     * @param {Date} date - Ngày cần lấy dữ liệu
     * @returns {Array<Object>} Array of data records
     */
    getDataByDate(reservoirSlug, date) {
        const filePath = this.getFilePathForDate(reservoirSlug, date);
        return this.parseCSV(filePath);
    }

    /**
     * Lấy dữ liệu của một hồ trong khoảng thời gian
     * @param {string} reservoirSlug - Slug của hồ
     * @param {Date} startDate - Ngày bắt đầu
     * @param {Date} endDate - Ngày kết thúc
     * @returns {Array<Object>} Array of data records
     */
    getDataByDateRange(reservoirSlug, startDate, endDate) {
        const allData = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const dayData = this.getDataByDate(reservoirSlug, new Date(currentDate));
            allData.push(...dayData);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Sắp xếp theo thời gian (Time column)
        return allData.sort((a, b) => {
            if (!a.Time || !b.Time) return 0;
            return new Date(a.Time) - new Date(b.Time);
        });
    }

    /**
     * Lấy danh sách các ngày có dữ liệu cho một hồ
     * @param {string} reservoirSlug - Slug của hồ
     * @returns {Array<string>} Array of date strings (YYYY-MM-DD)
     */
    getAvailableDates(reservoirSlug) {
        const dataDir = this.getDataDirectory();
        const availableDates = [];

        try {
            // Duyệt qua các năm
            if (!fs.existsSync(dataDir)) {
                return [];
            }

            const years = fs.readdirSync(dataDir).filter(item => {
                const itemPath = path.join(dataDir, item);
                return fs.statSync(itemPath).isDirectory() && /^\d{4}$/.test(item);
            });

            for (const year of years) {
                const yearPath = path.join(dataDir, year);
                const months = fs.readdirSync(yearPath).filter(item => {
                    const itemPath = path.join(yearPath, item);
                    return fs.statSync(itemPath).isDirectory() && /^\d{2}$/.test(item);
                });

                for (const month of months) {
                    const monthPath = path.join(yearPath, month);
                    const days = fs.readdirSync(monthPath).filter(item => {
                        const itemPath = path.join(monthPath, item);
                        return fs.statSync(itemPath).isDirectory() && /^\d{2}$/.test(item);
                    });

                    for (const day of days) {
                        const dayPath = path.join(monthPath, day);
                        const csvFile = path.join(dayPath, `${reservoirSlug}.csv`);

                        if (fs.existsSync(csvFile)) {
                            availableDates.push(`${year}-${month}-${day}`);
                        }
                    }
                }
            }

            return availableDates.sort();
        } catch (error) {
            console.error(`Lỗi khi lấy danh sách ngày có dữ liệu cho ${reservoirSlug}:`, error);
            return [];
        }
    }

    /**
     * Lấy thông tin tổng quan về dữ liệu của một hồ
     * @param {string} reservoirSlug - Slug của hồ
     * @returns {Object} Thông tin tổng quan
     */
    getReservoirInfo(reservoirSlug) {
        const latestData = this.getLatestData(reservoirSlug);
        const availableDates = this.getAvailableDates(reservoirSlug);

        return {
            slug: reservoirSlug,
            hasData: latestData !== null,
            latestData: latestData,
            availableDates: availableDates,
            totalDays: availableDates.length,
            lastUpdated: latestData ? latestData.Time : null
        };
    }
}

export default new ThuydienDataService();

