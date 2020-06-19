const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const detailSchema = new Schema({
	__v: { type: Number, select: false },
	nameOfScence: { type: String, required: true },
	longitude: { type: String, required: true},
	latitude: { type: String, required: true},
	des: { type: String, required: true},
	picURL: { type: String, required: true},
	pointOrNot: {type: Boolean, require: true, default: true},
	contructor: String,
	category: {type: Number, require: true, default: 0},
	done: {type: Boolean, require: true, default: false},
})

module.exports = model('Detail', detailSchema);