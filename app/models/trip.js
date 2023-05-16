const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const tripSchema = new Schema({
	__v: { type: Number, select: false },
	uid: { type: String, required: true },
	tripName: { type: String, required: true},
	designer: { type: String, required: true},
	domestic: {type: Number, required: true},
	city: { type: String, required: true},
	country: { type: String, required: true},
	tags: { type: String},
	cover: { type: String},
	detail: []
})

module.exports = model('Trip', tripSchema);