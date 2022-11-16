const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const itemSchema = new Schema({
	__v: { type: Number, select: false },
	articleName: { type: String},
	articleContent: { type: String},//图文内容
	picURL: { type: String, required: true},
	articleURL: { type: String},//公众号专有
	width: { type: Number},
	height: { type: Number},
	articleType: {type: Number},
	album: []
})
module.exports = model('Item', itemSchema);