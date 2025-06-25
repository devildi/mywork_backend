const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId

const treasureSchema = new Schema({
    __v: { type: Number, select: false },
    id: { type: String, required: true, unique: true },
    toyName: { type: String, required: true },
    toyPicUrl: { type: String, required: true },
    picWidth: { type: Number, required: true },
    picHeight: { type: Number, required: true },
    description: { type: String},
    labels: { type: String, required: true },
    owner: { type: ObjectId,ref: 'TreasureUser'},
    price: { type: Number, required: true },
    sellPrice: { type: Number},
    createAt: { type: Date, required: true, default: Date.now()},
    sellAt: { type: Date},
    isSelled: { type: Boolean, required: true, default: false},
})
module.exports = model('Treasure', treasureSchema);