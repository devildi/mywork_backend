const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const tripSchema = new Schema({
	__v: { type: Number, select: false },
	uid: { type: String, required: true },
	tripName: { type: String, required: true},
	designer: { type: String, required: true},
	domestic: {type: Number, required: true},
	city: { type: String}, 
	country: { type: String},
	tags: { type: String},
	cover: { type: String},
	detail: [],
	enrichmentStatus: {
		type: String,
		enum: ['pending', 'processing', 'done', 'failed'],
		default: 'pending', // 记录后台补全过程的状态机
	},
	enrichmentErrors: {
		type: [String],
		default: [], // 存储补全失败时的错误信息，便于二次排查
	},
	createAt: { type: Date, default: Date.now() },
})

module.exports = model('Trip', tripSchema);
