import express from 'express';
import RescueRequest from '../models/RescueRequest.model.js';
import { Parser } from 'json2csv';

const router = express.Router();

/**
 * Export CSV
 * GET /api/admin/export-csv
 */
router.get('/export-csv', async (req, res) => {
  try {
    const requests = await RescueRequest.find()
      .sort({ timestamp: -1 })
      .lean();

    // Chọn fields cần export
    const fields = [
      { label: 'ID', value: '_id' },
      { label: 'Vị trí', value: 'location' },
      { label: 'Độ khẩn cấp', value: 'urgency' },
      { label: 'Số người', value: 'people' },
      { label: 'Nhu cầu', value: 'needs' },
      { label: 'Liên hệ', value: 'contactFull' },
      { label: 'Status', value: 'status' },
      { label: 'Người xử lý', value: 'assignedTo' },
      { label: 'Mô tả', value: 'description' },
      { label: 'Link Facebook', value: 'facebookUrl' },
      { label: 'Ghi chú', value: 'notes' },
      { label: 'Thời gian', value: (row) => new Date(row.timestamp * 1000).toLocaleString('vi-VN') }
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(requests);

    // BOM cho Excel hiển thị tiếng Việt đúng
    const csvWithBOM = '\uFEFF' + csv;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=rescue-requests-${Date.now()}.csv`);
    res.send(csvWithBOM);

    console.log(`📊 Exported ${requests.length} requests to CSV`);
  } catch (error) {
    console.error('Lỗi export CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi export CSV',
      error: error.message
    });
  }
});

/**
 * Export Excel-friendly CSV (với delimiter phù hợp)
 * GET /api/admin/export-excel
 */
router.get('/export-excel', async (req, res) => {
  try {
    const requests = await RescueRequest.find()
      .sort({ timestamp: -1 })
      .lean();

    const fields = [
      { label: 'ID', value: '_id' },
      { label: 'Vị trí', value: 'location' },
      { label: 'Độ khẩn cấp', value: 'urgency' },
      { label: 'Số người', value: 'people' },
      { label: 'Nhu cầu', value: 'needs' },
      { label: 'Liên hệ', value: 'contactFull' },
      { label: 'Status', value: 'status' },
      { label: 'Người xử lý', value: 'assignedTo' },
      { label: 'Thời gian', value: (row) => new Date(row.timestamp * 1000).toLocaleString('vi-VN') }
    ];

    const json2csvParser = new Parser({ 
      fields,
      delimiter: ';' // Excel thích delimiter này hơn
    });
    const csv = json2csvParser.parse(requests);
    const csvWithBOM = '\uFEFF' + csv;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=rescue-requests-excel-${Date.now()}.csv`);
    res.send(csvWithBOM);

    console.log(`📊 Exported ${requests.length} requests to Excel CSV`);
  } catch (error) {
    console.error('Lỗi export Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi export Excel',
      error: error.message
    });
  }
});

export default router;


