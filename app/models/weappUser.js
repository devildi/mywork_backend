const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const weappUserSchema = new Schema({
	__v: { type: Number, select: false },
	openid: { type: String, required: true },
	avatarUrl: { type: String, required: true },
    nickName: { type: String, required: true },
})

module.exports = model('WeappUser', weappUserSchema);