const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId

const itemSchema = new Schema({
	__v: { type: Number, select: false },
	articleName: { type: String},
	articleContent: { type: String},//图文内容
	picURL: { type: String, required: true},
	videoURL: { type: String},
	articleURL: { type: String},//公众号专有
	width: { type: Number},
	height: { type: Number},
	articleType: {type: Number},
	album: [],
	author: {type: ObjectId, ref: 'User'},
	likes: [{type: ObjectId, ref: 'User'}],
	collects: [{type: ObjectId, ref: 'User'}],
	comments: [{type: ObjectId, ref: 'Comment'}],
	createAt: {type: Date,default: Date.now()},
	updateAt: {type: Date,default: Date.now()}
})

itemSchema.pre('save',function(next){
	//this.updateAt = Date.now()
	next()
})

module.exports = model('Item', itemSchema);