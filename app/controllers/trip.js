const axios = require('axios')
const qiniu = require('qiniu')
const Trip = require('../models/trip')
const Item = require('../models/item')
const Photo = require('../models/photo')
const User = require('../models/users');
const Comment = require('../models/comment');
const WeappUser = require('../models/weappUser')
const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const util = require('util')

const client = require('../../GRPC/story_client')

const { 
	getWidthAndHeight, 
	appid, 
	wesecret, 
	stationsURL, 
	mockData,
	crawler,
	crawler_child_process,
	promise1,
	accessKey,
	secretKey,
	bucket,
	outerURL,
	getInfoFromGoogleTravel,
	getPicsFromGoogleTravel,
	pageMock
} = require('../config');
const fileUrl = path.join(__dirname, '../stations.txt')

class TripCtl {
	async create(ctx){
		const trip = ctx.request.body
		const tripData = await Trip.findOne({ uid: trip.uid });
		if(tripData){
			tripData.detail = trip.detail
			let trip1 = await tripData.save()
			ctx.body = trip1
		} else {
			let trip2 = await new Trip(trip).save()
			ctx.body = trip2
		}
	}

	async createItem(ctx){
		const item = ctx.request.body
		console.log(item)
		const {articleURL, picURL, articleType, album, author, videoURL} = item
		if(articleType === 2){
			item.picURL = outerURL + picURL
			album.forEach((item, index) => {
				item.key = outerURL + item.key
			})
		} else if(articleType === 3){
			item.picURL = outerURL + picURL
			item.videoURL = outerURL + videoURL
		}
		if(articleURL){
			const article = await Item.findOne({articleURL: articleURL})
			if(!article){
				let newItem = await new Item(item).save()
				ctx.body = newItem
			} else {
				ctx.body = null
			}
		}else{
			let newItem = await new Item(item).save()
			ctx.body = 'newItem'
		}
	}

	async updateItem(ctx){
		const item = ctx.request.body
		let oldItem = await Item.findOne({_id: item._id})
		oldItem.articleName = item.articleName
		oldItem.picURL = item.picURL
		oldItem.articleURL = item.articleURL
		oldItem.width = item.width
		oldItem.height = item.height
		let newIten = await oldItem.save()
		ctx.body = item
	}

	async getStoryById(ctx){
		const uid = ctx.request.query._id
		const story = await Item.findOne({ _id: uid }).populate({path: 'likes'}).populate({path: 'author'}).populate({path: 'collects'}).populate({path: 'comments', populate: { path: 'whoseContent' }})
		ctx.body = story;
	}

	async get(ctx){
		const uid = ctx.request.query.uid
		const trip = await Trip.findOne({ uid: uid });
		ctx.body = trip;
	}

	async getAllTrip(ctx){
		const perPage = 20
		const uid = ctx.request.query.uid
		const page = ctx.request.query.page || 1
		const trips = await Trip.find().limit(page * perPage)
		if(uid){
			let newArray = trips.filter(function(i){
				return i.uid == uid
			})
			let newArray1 = trips.filter(function(i){
				return i.uid != uid
			})
			ctx.body = [...newArray, ...newArray1];
		} else {
			ctx.body = trips;
		}
	}

	async getAllTripByPage(ctx){
		const perPage = 14
		//console.log(ctx.request.query.page)
		const page = ctx.request.query.page || 1
		const index = page - 1
		const items = await Trip.find().sort({"_id": -1}).skip(index * perPage).limit(perPage)
		const allItems = await Trip.find()
		const total = Math.ceil(allItems.length / perPage)
		ctx.body = {items, total};
	}

	async getDescriptedTrip(ctx){
		const tag = ctx.request.query.description
		const trips = await Trip.find({
			$or : [
				{city: {$regex : tag}},
				{country: {$regex : tag}},
				{tags: {$regex : tag}}
			]
		})
		ctx.body = trips;
	}

	async getDescriptedTrip1(ctx){
		const tag = ctx.request.query.description
		const trips = await Trip.find({
			$or : [
				{city: {$regex : tag}},
				{country: {$regex : tag}},
				{tags: {$regex : tag}},
				{uid: {$regex : tag}}
			]
		})
		ctx.body = trips;
	}

	async getAllStory(ctx){
		const perPage = 20
		const page = ctx.request.query.page || 1
		const items = await Item.find().sort({"_id": -1}).limit(page * perPage).populate({path: 'author'}).populate({path: 'likes'}).populate({path: 'collects'}).populate({path: 'comments', populate: { path: 'whoseContent' }})
		ctx.body = items;
	}

	async getStoryByAuthor(ctx){
		const page = ctx.request.query.page || 1
		const perPage = 20
		const uid = ctx.request.query.uid
		const items = await Item.find({"author": uid}).sort({"_id": -1}).limit(page * perPage).populate({path: 'author'}).populate({path: 'likes'}).populate({path: 'collects'}).populate({path: 'comments', populate: { path: 'whoseContent' }})
		ctx.body = items;
	}

	async getLikeOrCollectStoryByAuthor(ctx){
		let items = null
		const page = ctx.request.query.page || 1
		const perPage = 20
		const {uid, type} = ctx.request.query
		if(type === 'likes'){
			items = await Item.find({likes: uid}).sort({"_id": -1}).limit(page * perPage).populate({path: 'author'}).populate({path: 'likes'}).populate({path: 'collects'}).populate({path: 'comments', populate: { path: 'whoseContent' }})
		} else {
			items = await Item.find({collects: uid}).sort({"_id": -1}).limit(page * perPage).populate({path: 'author'}).populate({path: 'likes'}).populate({path: 'collects'}).populate({path: 'comments', populate: { path: 'whoseContent' }})
		}
		ctx.body = items;
	}

	async getStoryByPage(ctx){
		const perPage = 14
		const page = ctx.request.query.page || 1
		const index = page - 1
		const items = await Item.find().sort({"_id": -1}).skip(index * perPage).limit(perPage).populate({path: 'author'}).populate({path: 'likes'}).populate({path: 'collects'}).populate({path: 'comments', populate: { path: 'whoseContent' }})
		const allItems = await Item.find()
		const total = Math.ceil(allItems.length / perPage)
		ctx.body = {items, total};
	}

	async getImgWAH(ctx){
		try {
			let string = await getWidthAndHeight(ctx.request.query.url)
			let array = string.split('(')
			let array1 = array[1].split(')')
			let array2 = array1[0].split('×')
			console.log(array2)
			ctx.body = {
				width: parseInt(array2[0]),
				height: parseInt(array2[1])
			};
		} catch (error) {
			ctx.body = error
		}
	}

	async postPhoto(ctx){
		let photo = await new Photo(ctx.request.body).save()
		ctx.body = photo
	}

	async getPhotosByPage(ctx){
		const perPage = 32
		//console.log(ctx.request.query.page)
		const page = ctx.request.query.page || 1
		const index = page - 1
		const items = await Photo.find().sort({"_id": -1}).skip(index * perPage).limit(perPage).populate({path: 'likes',select: 'openid avatarUrl nickName'})
		const allItems = await Photo.find()
		const total = Math.ceil(allItems.length / perPage)
		ctx.body = {items, total, allItems};
	}

	async updatePhoto(ctx){
		const item = ctx.request.body
		let oldItem = await Photo.findOne({_id: item._id})
		oldItem.tags = item.tags
		oldItem.picURL = item.picURL
		oldItem.des = item.des
		oldItem.width = item.width
		oldItem.height = item.height
		let newIten = await oldItem.save()
		ctx.body = item
	}

	async findPhotoById(ctx){
		const item = await Photo.findOne({_id: ctx.query.id}).populate({path: 'likes',select: 'openid avatarUrl nickName'})
		ctx.body = item
	}

	async deletePhoto(ctx){
		const item = ctx.request.body
		let data = await Photo.findOneAndDelete({_id: item.id})
		ctx.body = data
	}

	async logWeapp(ctx){
		const code = ctx.request.query.code
		const openid = await axios.get(`https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${wesecret}&js_code=${code}&grant_type=authorization_code`)
		ctx.body = openid.data.openid
	}

	async weappUser(ctx){
		const {openid, avatarUrl, nickName, articleId, pageIndex} = ctx.request.body
		let userData = {
			openid: openid,
			avatarUrl: avatarUrl,
			nickName: nickName
		}
		const user = await WeappUser.findOne({openid: openid})
		let photo = await Photo.findById({_id: articleId}).populate({path: 'likes',select: 'openid avatarUrl nickName'})
		if(!user){
			let user1 = await new WeappUser(userData).save()
			photo.likes.push(user1)
			await photo.save()
		}
		let array = photo.likes.filter((i) => {
			return i.openid === user.openid
		})
		if(array.length === 0){
			photo.likes.push(user)
			await photo.save()
		}else{
			photo.likes.forEach((row, index) => {
				if(row.openid === user.openid){
					photo.likes.splice(index, 1)
				}
			})
			await photo.save()
		}
		const perPage = 32
		const page = pageIndex
		const index = page - 1
		const items = await Photo.find().sort({"_id": -1}).skip(index * perPage).limit(perPage).populate({path: 'likes',select: 'openid avatarUrl nickName'})
		ctx.body = items
	}

	async poComment(ctx){
		const {content, uid, articleId} = ctx.request.body
		let user = await User.findOne({_id: uid}).populate({path: 'like'})
		let article1 = await Item.findOne({_id: articleId})
		let article = await Item.findOne({_id: articleId}).populate({path: 'likes'}).populate({path: 'author'}).populate({path: 'collects'}).populate({path: 'comments', populate: { path: 'whoseContent' }})
		let comment = await new Comment({content, whoseContent: user}).save()
		article.comments.push(comment)
		let item = await article.save()
		ctx.body = item
	}

	async clickLike(ctx){
		const {type, uid, articleId} = ctx.request.body
		let user = await User.findOne({_id: uid}).populate({path: 'like'})
		let article = await Item.findOne({_id: articleId}).populate({path: 'likes'}).populate({path: 'author'}).populate({path: 'collects'}).populate({path: 'comments', populate: { path: 'whoseContent' }})
		if(type === 'like'){
			let array = article.likes.filter((i) => {
				return i._id + '' === user._id + ''
			})
			if(array.length === 0){
				article.likes.push(user)
				article = await article.save()
			}else{
				article.likes.forEach((row, index) => {
					if(row._id + '' === uid + ''){
						article.likes.splice(index, 1)
					}
				})
				article = await article.save()
			}
		} else {
			let array = article.collects.filter((i) => {
				return i._id + '' === user._id + ''
			})
			if(array.length === 0){
				article.collects.push(user)
				article = await article.save()
			}else{
				article.collects.forEach((row, index) => {
					if(row._id + '' === uid + ''){
						article.collects.splice(index, 1)
					}
				})
				article = await article.save()
			}
		}
		ctx.body = article
	}

	async ticketsInfo(ctx){
		let stationsArray = []
		let Info = []
		let from = 'shenyang'
		try{
			const data = fs.readFileSync(fileUrl)
			console.log('读车站信息文件成功！')
			stationsArray = JSON.parse(data.toString('utf-8'))
		}catch(err){
			console.log('文件不存在或者文件打不开！重新获取文件！')
			const stations = await axios.get(stationsURL)
			const array = stations.data.split('@')
			array.splice(0,1)
			array.forEach(function(item){
				const array1 = item.split('|')
				stationsArray.push({
					stationsName: array1[1],
					stationsNameCHN: array1[3]
				})
			})
			fs.writeFile(fileUrl, JSON.stringify(stationsArray), err => {
				if(err){
					console.log('文件写入失败！',err)
				}else {
					console.log('文件写入成功！')
				}
			})
		}
		//数据源：————————————————————————————————————————————————
		let dataForCrawler = stationsArray
		//let dataForCrawler = mockData

		let flag = dataForCrawler.length
		await crawler(dataForCrawler, Info, from, flag)
		//await crawler_child_process(dataForCrawler, Info, from, flag)
		ctx.body = Info
	}
	//GRPC below
	async getStoryDetailByGRPC(ctx){
		const url = ctx.request.query.url
		console.log(url)
		const data = await promise1(client, url)
		ctx.body = data
	}

	async getUploadToken(ctx){
		let mac = new qiniu.auth.digest.Mac(accessKey, secretKey)
		let type = ctx.request.query.type
		console.log(type)
		let options = null
		if(type !== '3'){
			options = {
				scope: bucket,
				returnBody: '{"width":"$(imageInfo.width)","height":"$(imageInfo.height)","key":"$(key)"}'
			}
		} else {
			options = {
				scope: bucket,
				returnBody: '{"width":"$(avinfo.video.width)","height":"$(avinfo.video.height)","key":"$(key)"}'
			}
		}
		var putPolicy = new qiniu.rs.PutPolicy(options)
		var uploadToken = putPolicy.uploadToken(mac)
		ctx.body = uploadToken
	}

	async fetchInfo(ctx){
		const des = ctx.request.query.des
		let info = await getInfoFromGoogleTravel(des)
		ctx.body = info
	}

	async fetchImgs(ctx){
		const des = ctx.request.query.des
		let info = await getPicsFromGoogleTravel(des)
		let res = info.filter((num) => {
			return num !== '';
		});
		ctx.body = res
	}
}

module.exports = new TripCtl();