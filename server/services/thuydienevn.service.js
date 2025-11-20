import https from "https";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let url = `https://hochuathuydien.evn.com.vn/PageHoChuaThuyDienEmbedEVN.aspx`;

// Danh sách các hồ cần lấy dữ liệu (theo slug)
export const TARGET_RESERVOIRS = ["song_hinh", "song_ba_ha"];

const tDic = {
    "Tuyên Quang": "tuyen_quang",
    "Lai Châu": "lai_chau",
    "Bản Chát": "ban_chat",
    "Huội Quảng": "huoi_quang",
    "Sơn La": "son_la",
    "Hòa Bình": "hoa_binh",
    "Thác Bà": "thac_ba",
    "Trung Sơn": "trung_son",
    "Bản Vẽ": "ban_ve",
    "Quảng Trị": "quang_tri",
    "A Vương": "a_vuong",
    "Sông Bung 2": "song_bung_2",
    "Vĩnh Sơn A": "vinh_son_a",
    "Sông Bung 4": "song_bung_4",
    "Vĩnh Sơn B": "vinh_son_b",
    "Vĩnh Sơn C": "vinh_son_c",
    "Sông Tranh 2": "song_tranh_2",
    "Sông Ba Hạ": "song_ba_ha",
    "Sông Hinh": "song_hinh",
    "Thượng Kon Tum": "thuong_kon_tum",
    Pleikrông: "pleikrong",
    Ialy: "ialy",
    "Sê San 3": "se_san_3",
    "Sê San 3A": "se_san_3a",
    "Sê San 4": "se_san_4",
    Kanak: "kanak",
    "An Khê": "an_khe",
    "Srêpốk 3": "srepok_3",
    "Buôn Kuốp": "buon_kuop",
    "Buôn Tua Srah": "buon_tua_srah",
    "Đồng Nai 3": "dong_nai_3",
    "Đồng Nai 4": "dong_nai_4",
    "Đơn Dương": "don_duong",
    "Đại Ninh": "dai_ninh",
    "Hàm Thuận": "ham_thuan",
    "Đa Mi": "da_mi",
    "Trị An": "tri_an",
    "Thác Mơ": "thac_mo",
};

const reversed = {
    tuyen_quang: "Tuyên Quang",
    lai_chau: "Lai Châu",
    ban_chat: "Bản Chát",
    huoi_quang: "Huội Quảng",
    son_la: "Sơn La",
    hoa_binh: "Hòa Bình",
    thac_ba: "Thác Bà",
    trung_son: "Trung Sơn",
    ban_ve: "Bản Vẽ",
    quang_tri: "Quảng Trị",
    a_vuong: "A Vương",
    song_bung_2: "Sông Bung 2",
    vinh_son_a: "Vĩnh Sơn A",
    song_bung_4: "Sông Bung 4",
    vinh_son_b: "Vĩnh Sơn B",
    vinh_son_c: "Vĩnh Sơn C",
    song_tranh_2: "Sông Tranh 2",
    song_ba_ha: "Sông Ba Hạ",
    song_hinh: "Sông Hinh",
    thuong_kon_tum: "Thượng Kon Tum",
    pleikrong: "Pleikrông",
    ialy: "Ialy",
    se_san_3: "Sê San 3",
    se_san_3a: "Sê San 3A",
    se_san_4: "Sê San 4",
    kanak: "Kanak",
    an_khe: "An Khê",
    srepok_3: "Srêpốk 3",
    buon_kuop: "Buôn Kuốp",
    buon_tua_srah: "Buôn Tua Srah",
    dong_nai_3: "Đồng Nai 3",
    dong_nai_4: "Đồng Nai 4",
    don_duong: "Đơn Dương",
    dai_ninh: "Đại Ninh",
    ham_thuan: "Hàm Thuận",
    da_mi: "Đa Mi",
    tri_an: "Trị An",
    thac_mo: "Thác Mơ",
};

function formatDateTime() {
    const now = new Date();

    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0"); // months are 0-based
    const year = now.getFullYear();

    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function convertToFullDate(input) {
    if (!input || typeof input !== "string") return null;
    const tokens = input.trim().split(/\s+/);
    let timeToken = null;
    let dateToken = null;

    for (const token of tokens) {
        if (!timeToken && /^\d{1,2}:\d{2}$/.test(token)) timeToken = token;
        if (!dateToken && /^\d{1,2}\/\d{1,2}$/.test(token)) dateToken = token;
    }

    if (!timeToken || !dateToken) return null;

    const [hour, minute] = timeToken.split(":").map(Number);
    const [day, month] = dateToken.split("/").map(Number);
    if (
        isNaN(hour) || isNaN(minute) || isNaN(day) || isNaN(month) ||
        hour > 23 || minute > 59 || day < 1 || day > 31 || month < 1 || month > 12
    ) {
        return null;
    }

    const now = new Date();
    let year = now.getFullYear();
    if (month > now.getMonth() + 1) {
        year -= 1;
    }

    const paddedMonth = String(month).padStart(2, "0");
    const paddedDay = String(day).padStart(2, "0");
    const paddedHour = String(hour).padStart(2, "0");
    const paddedMinute = String(minute).padStart(2, "0");
    return `${year}-${paddedMonth}-${paddedDay} ${paddedHour}:${paddedMinute}:00`;
}

function sanitizeFileName(input) {
    if (!input) return "unknown";
    // Remove suffix like "Đồng bộ lúc: ..."
    let nameOnly = String(input).split("Đồng bộ lúc:")[0].trim();
    // Normalize and strip diacritics
    nameOnly = nameOnly.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Replace invalid characters with underscore
    nameOnly = nameOnly.replace(/[\\/:*?"<>|]/g, "_");
    // Collapse spaces to underscores
    nameOnly = nameOnly.replace(/\s+/g, "_");
    return nameOnly.toLowerCase();
}

function appendIfDifferent(filePath, newRow) {
    // Read existing file
    const content = fs.readFileSync(filePath, "utf8").trim();
    const lines = content.split("\n");

    const lastRow = lines[lines.length - 1];

    // Compare and append if different
    if (lastRow !== newRow) {
        fs.appendFileSync(filePath, newRow + "\n");
        console.log(filePath, " New row appended.");
    } else {
        console.log(filePath, " Row is the same as last one. Skipped appending.");
    }
}

function fetchData1() {
    const currentURL = `${url}?td=${encodeURIComponent(formatDateTime())}`;
    https
        .get(currentURL, (res) => {
            let data = "";

            // Set encoding to get text
            res.setEncoding("utf8");

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                // console.log(data); // HTML content
                const $ = cheerio.load(data);

                const table = $("table.tblgridtd").first();
                const rows = table.find("tr");
                let result = [];

                rows.each((i, row) => {
                    const cells = $(row).find("td, th"); // both header and normal cells

                    const rowData = [];
                    cells.each((j, cell) => {
                        const text = $(cell).text().trim();
                        rowData.push(text);
                    });
                    if (rowData.length > 0) {
                        result.push(rowData);
                    }
                });
                // console.log("Dữ liệu sau khi bocsh tách")
                // console.log(result)

                // Convert to array of objects if headers exist
                let json = result;
                // console.log("json", json)
                if (result.length > 1) {
                    const headers = result[0];
                    json = result.slice(1).map((row) => {
                        const obj = {};
                        row.forEach((val, i) => {
                            obj[headers[i] || `col${i + 1}`] = val;
                        });
                        return obj;
                    });
                }
                const cnow = new Date();
                let cyear = cnow.getFullYear();
                let cmonth = String(cnow.getMonth() + 1).padStart(2, "0");
                let cday = String(cnow.getDate()).padStart(2, "0");
                for (let i = 2; i < json.length; i++) {
                    if (json[i].hasOwnProperty("Htl")) {
                        const rawTenHo = json[i]["Tên hồ"];
                        const thoiDiemRaw = json[i]["Thời điểm"] || "";
                        const outputTimeDongBo = convertToFullDate(thoiDiemRaw);

                        const tenHoClean = (rawTenHo || "").split("Đồng bộ lúc:")[0].trim();
                        const mappedSlug = tDic[tenHoClean];
                        const safeFileName = mappedSlug || sanitizeFileName(tenHoClean);

                        // Chỉ lấy dữ liệu cho các hồ trong danh sách TARGET_RESERVOIRS
                        if (!TARGET_RESERVOIRS.includes(safeFileName)) {
                            continue;
                        }

                        // console.log("debug 1", tenHoClean, mappedSlug, outputTimeDongBo);
                        //console.log(json[i]);

                        // Keys to exclude
                        const excludeKeys = ["Tên hồ", "Thời điểm"];

                        // Filter keys
                        const keys = Object.keys(json[i]).filter((key) => !excludeKeys.includes(key));
                        // console.log(keys)
                        // Create CSV string
                        const header = "Time;" + keys.join(";"); // CSV header
                        const row = outputTimeDongBo + ";" + keys.map((key) => json[i][key]).join(";"); // CSV data row
                        //Kiểm tra file có tồn tại không

                        const filePath = path.join(__dirname, `data/${cyear}/${cmonth}/${cday}/${safeFileName}.csv`);
                        if (!fs.existsSync(filePath)) {
                            // Create directory if it doesn't exist
                            fs.mkdirSync(path.dirname(filePath), { recursive: true });
                            // Write header to new file
                            fs.writeFileSync(filePath, header + "\n" + row + "\n", "utf8");
                        } else {
                            // Append to existing file
                            appendIfDifferent(filePath, row);
                        }

                        // console.log(filePath, "updated");
                    }
                }

                //console.log(JSON.stringify(json, null, 2));
            });
        })
        .on("error", (err) => {
            console.error("Error:", err.message);
        });
}

/**
 * Khởi động service để fetch dữ liệu định kỳ
 * @returns {Object} Object chứa intervalId và function stop
 */
export function startDataFetching() {
    // Fetch ngay lập tức
    fetchData1();

    // Set interval để fetch mỗi phút
    const intervalId = setInterval(fetchData1, 1 * 60 * 1000);

    console.log("✅ Thuỷ điện EVN service đã khởi động. Fetching data từ", url, "mỗi 1 phút...");

    return {
        intervalId,
        stop: () => {
            clearInterval(intervalId);
            console.log("⏹️  Thuỷ điện EVN service đã dừng.");
        }
    };
}

// Export các constants và functions cần thiết
export const RESERVOIR_NAMES = {
    song_ba_ha: "Sông Ba Hạ",
    song_hinh: "Sông Hinh"
};

// Thông tin chi tiết về các hồ thủy điện (tên, tọa độ)
export const RESERVOIR_INFO = {
    song_ba_ha: {
        name: "Sông Ba Hạ",
        slug: "song_ba_ha",
        coordinates: {
            lat: 13.0230809,
            lng: 108.9037585
        },
        location: "Sơn Hòa, Phú Yên, Việt Nam"
    },
    song_hinh: {
        name: "Sông Hinh",
        slug: "song_hinh",
        coordinates: {
            lat: 12.926851,
            lng: 108.946318
        },
        location: "Sông Hinh, Phú Yên, Việt Nam"
    }
};
