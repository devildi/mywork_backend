const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const workSchema = new Schema({
	__v: { type: Number, select: false },
	shootnums: { type: Number, required: true },
	program: { type: String, required: true},
	des: { type: String},
	date: { type: Number, required: true},
	whose: { type: Schema.Types.ObjectId, ref: 'User', required: true },
})

module.exports = model('Work', workSchema);