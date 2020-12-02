const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const itemSchema = new Schema({
	__v: { type: Number, select: false },
	articleName: { type: String, required: true },
	picURL: { type: String, required: true},
	articleURL: { type: String, required: true}
})
module.exports = model('Item', itemSchema);