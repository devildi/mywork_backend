const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId

const userSchema = new Schema({
	__v: { type: Number, select: false },
	name: { type: String, required: true },
	password: { type: String, required: true, select: false },
	avatar: {type: String},
	like: [{type: ObjectId, ref: 'Item'}],
	comment: [{type: ObjectId, ref: 'Item'}],
	collect: [{type: ObjectId, ref: 'Item'}],
	follow: [{type: ObjectId, ref: 'User'}],
	followed: [{type: ObjectId, ref: 'User'}],
})
module.exports = model('User', userSchema);