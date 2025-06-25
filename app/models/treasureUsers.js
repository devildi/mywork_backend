const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId

const treasureUserSchema = new Schema({
    __v: { type: Number, select: false },
    name: { type: String, required: true },
    password: { type: String, required: true, select: false },
    avatar: {type: String},
    uid: { type: String, required: true, unique: true },
})
module.exports = model('TreasureUser', treasureUserSchema);