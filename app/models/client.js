const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const clientSchema = new Schema({
	__v: { type: Number, select: false },
	destination: { type: String, required: true },
	wechat: { type: String, required: true },
})

module.exports = model('Client', clientSchema);