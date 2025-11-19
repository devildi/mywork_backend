const TreasureUser = require('../models/treasureUsers');
const Treasure = require('../models/treasure');
const { 
    authority, 
    outerURL, 
    getWirelessIP,
    accessKey,
    secretKey,
    bucket,
    deleteQiniu } = require('../config')
const { v4: uuidv4 } = require('uuid');

class TreasureCtl {
    //注册
    async create(ctx){
        const { name, password, auth} = ctx.request.body;
        console.log(ctx.request.body)
        if(auth !== authority){
            console.log('未授权！')
            ctx.body = '未授权！'
            return
        }
        const repeatedUser = await TreasureUser.findOne({ name });
        console.log(repeatedUser)
        if (repeatedUser) {
            console.log('此用户名已经注册！')
            ctx.body = '此用户名已经注册！'
            return
        }
        const user = await new TreasureUser({
            name, 
            password,
            avatar: '',
            uid: uuidv4() 
        }).save();
        console.log(user)
        ctx.body = user;
    }
    //登录
    async login(ctx){
        const { name, password} = ctx.request.body;
        const user = await TreasureUser.findOne({name, password})
        if(user){
            ctx.body = user;
        } else {
            ctx.body = '';
        }
    }
    //PO
    async createItem(ctx){
        const item = ctx.request.body
        console.log(item)
        const {
            toyName,description,toyPicUrl,picWidth,picHeight,labels,owner,price
        } = item
        item.toyPicUrl = outerURL + toyPicUrl
        item.id = uuidv4()
        let newItem = await new Treasure(item).save()
        ctx.body = newItem
    }
    // 根据用户查找全部的数据
    async getAllTreasures(ctx) {
        const uid = ctx.request.query.uid
        const query = {};
        if (uid) {
            query.owner = uid; // 如果 uid 存在，则添加到查询条件
        }
        const perPage = 20
        const page = ctx.request.query.page || 1
        const toys = await Treasure.find(query).limit(page * perPage).sort({'createAt':-1}).populate({path: 'owner'})
        console.log("getAllTreasures",toys.length)
        ctx.body = toys;
    }

    // 在getAllTreasures的基础上，将price字段的值相加
    async getTotalPriceAndCount(ctx) {
        const uid = ctx.request.query.uid
        const query = {};
        if (uid) {
            query.owner = uid; // 如果 uid 存在，则添加到查询条件
        }
        const trips = await Treasure.find(query).sort({'createAt':-1})
        let totalPrice = 0;
        trips.forEach((item) => {
            totalPrice += (item.sellPrice > 0 ? item.sellPrice : item.price)
        })
        console.log("getTotalPriceAndCount", totalPrice, trips.length)
        ctx.body = {totalPrice: parseFloat(totalPrice), count: trips.length};
    }
    //模糊搜索
    async search(ctx){
        const {keyword, uid} = ctx.request.query
        const query = {};
        if (uid) {
            query.owner = uid;
        }
        if (keyword) {
            query.$or = [
                { toyName: { $regex: keyword, $options: 'i' } }, // 不区分大小写
                { labels: { $regex: keyword, $options: 'i' } },
                { description: { $regex: keyword, $options: 'i' } }
            ];
        }
        const toys = await Treasure.find(query).sort({'createAt':-1}).populate({path: 'owner'})
        console.log("search",toys.length)
        ctx.body = toys;
    }

    async getIP(ctx){
        const result = getWirelessIP();
        console.log(`无线网卡的 IP 是: ${result}`);
        ctx.body = result
    }

    async modify(ctx){
        const item = ctx.request.body
        const {id} = item
        const result = await Treasure.updateOne({_id: id}, item)
        console.log(result)
        ctx.body = result
    }

    async deleteItem(ctx){
        const {_id, key, toyPicUrl} = ctx.request.body
        await deleteQiniu(accessKey, secretKey, bucket, key ? key : toyPicUrl.replace(outerURL, ''))
        console.log('删除七牛云文件成功')
        try {
            const result = await Treasure.deleteOne({ _id: _id });
            console.log('删除结果:', result);
            ctx.body = result
        } catch (err) {
            console.error('删除失败:', err);
            ctx.body = err
        }
    }
}

module.exports = new TreasureCtl();