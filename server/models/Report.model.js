import mongoose from 'mongoose';

/**
 * Schema cho báo cáo khẩn cấp (manual report)
 */
const reportSchema = new mongoose.Schema({
  name: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  location: {
    lat: Number,
    lng: Number
  },
  description: {
    type: String,
    required: true
  },
  imagePath: {
    type: String, // Path tới hình ảnh local
    default: null
  }
}, {
  timestamps: true
});

const Report = mongoose.model('Report', reportSchema);

export default Report;

