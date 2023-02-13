const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId

const commentSchema = new Schema({
	__v: { type: Number, select: false },
	content: { type: String},
	whoseContent: {type: ObjectId, ref: 'User'},
	//whichArticle: {type: ObjectId, ref: 'Item'}
})

module.exports = model('Comment', commentSchema);