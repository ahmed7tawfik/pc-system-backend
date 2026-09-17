const mongoose = require('mongoose');

const dailyRecordSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // Format: YYYY-MM-DD
  devicesIncome: { type: Number, default: 0 },
  drinksIncome: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('DailyRecord', dailyRecordSchema);