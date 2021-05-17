const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId

const photoSchema = new Schema({
	__v: { type: Number, select: false },
	tags: { type: String},
	picURL: { type: String, required: true},
	des: { type: String},
	width: { type: Number},
	height: { type: Number},
	likes: [{type: ObjectId, ref: 'WeappUser'}]
})
module.exports = model('Photo', photoSchema);