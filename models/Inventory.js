const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Inventory', inventorySchema);