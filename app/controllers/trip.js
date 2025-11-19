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
const { v4: uuidv4 } = require('uuid');

const client = require('../../GRPC/story_client')

const { 
	getWidthAndHeight, 
	appid, 
	wesecret, 
	stationsURL, 
	mockData,
	crawler,
	crawler_child_process,
	accessKey,
	secretKey,
	bucket,
	outerURL,
	getInfoFromGoogleTravel,
	getPicsFromGoogleTravel,
	pageMock,
	flattenArray,
	getBingFirstImage,
	promise1,
	promise2,
	gaodeWebKey,
	getLocation,
	isImageUrlValid,
	isImageUrlValid2,
	defaultPicUrl,
	getFirstBaiduImage,
	deleteQiniu
} = require('../config');
const fileUrl = path.join(__dirname, '../stations.txt')
const taskQueue = require('../tools/taskQueue')
const agenda = require('../lib/agenda') // Agenda 队列实例，用于调度行程异步补全任务

class TripCtl {
	async create(ctx){
		const trip = ctx.request.body
		if(!trip.uid){
			trip.uid = uuidv4()
		}
		const tripData = await Trip.findOne({ uid: trip.uid })
		let savedTrip
		if(tripData){
			tripData.cover = trip.cover
			tripData.detail = trip.detail
			tripData.city = trip.city
			tripData.country = trip.country
			tripData.tags = trip.tags
			tripData.enrichmentStatus = 'pending' // 更新时重置补全状态，等待后台任务处理
			tripData.enrichmentErrors = [] // 清空上次补全过程的错误信息
			savedTrip = await tripData.save()
			ctx.body = savedTrip
		} else {
			const newTrip = new Trip({
				...trip,
				enrichmentStatus: 'pending', // 新建行程默认进入待补全状态
				enrichmentErrors: [], // 初始化为空，记录补全过程的错误堆栈
			})
			savedTrip = await newTrip.save()
			ctx.body = savedTrip
		}
		this.scheduleTripEnrichment(savedTrip).catch((error) => {
			console.error('行程异步补全任务调度失败：', error)
		})
	}

	async scheduleTripEnrichment(tripDoc) {
		if (!tripDoc || !tripDoc.uid) return
		if (typeof agenda._ready === 'object' && typeof agenda._ready.then === 'function') {
			await agenda._ready // 确保 Agenda 已完成初始化再调度任务
		}
		await agenda.now('trip.enrich', { uid: tripDoc.uid }) // 立即投递行程补全任务到队列
		console.log(`已调度行程 ${tripDoc.uid} 的补全任务`)
	}

	async updateSinglePoint(ctx){
		const {uid, nameOfScence, des, picURL} = ctx.request.body
		let oldTrip = await Trip.findOne({uid: uid})
		for (const subArr of oldTrip.detail) {        
			for (const obj of subArr) {       
				if (obj.nameOfScence === nameOfScence) {
					obj.picURL = picURL;          
					obj.des = des ?? obj.des;       
					break;
				}
			}
		}
		oldTrip.markModified('detail');
		let newTrip = await oldTrip.save()
		console.log(`已更新${nameOfScence}的后台信息`);
		ctx.body = newTrip
	}

	async deleteTrip(ctx){
		const {uid} = ctx.request.body
		console.log('准备删除Trip，uid:', uid);
		try {
			const result = await Trip.deleteOne({ uid: uid });
			console.log('删除结果:', result);
			ctx.body = result
		} catch (err) {
			console.error('删除失败:', err);
			ctx.body = err
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
		let newItem = await oldItem.save()
		ctx.body = newItem
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
		const trips = await Trip.find().limit(page * perPage).sort({'createAt':-1})
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
		const perPage = 30
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
		const url = ctx.request.query.url ?? 'https://mp.weixin.qq.com/s?__biz=MzIyMTM3MzE1MA==&mid=2247484651&idx=1&sn=2cbf9de89735555acbd30f456ec68b90&chksm=e83cf35adf4b7a4c25c72bdffc6b4c6bfa751d74a47a51b541b70f67bdc0ca020663fef050c2&token=1642341609&lang=zh_CN#rd'
		console.log(url)
		const data = await promise1(client, url)
		ctx.body = data
	}

	async getImgGRPC(ctx){
		const data = await promise2(client, 'wudi')
		ctx.body = data
	}

	async getUploadToken(ctx){
		let mac = new qiniu.auth.digest.Mac(accessKey, secretKey)
		let type = ctx.request.query.type
		let options = null
		if(type !== '3'){
			options = {
				scope: bucket,
				returnBody: '{"width":"$(imageInfo.width)","mimeType":"$(mimeType)","height":"$(imageInfo.height)","key":"$(key)"}'
			}
		} else {
			options = {
				scope: bucket,
				returnBody: '{"width":"$(avinfo.video.width)","mimeType":"$(mimeType)","height":"$(avinfo.video.height)","key":"$(key)"}'
			}
		}
		var putPolicy = new qiniu.rs.PutPolicy(options)
		var uploadToken = putPolicy.uploadToken(mac)
		//console.log(uploadToken)
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

	async getBingImg(ctx){
		const point = ctx.request.query.point
		console.log(`准备获取${point}的图片链接`);
		const imageUrl = await getBingFirstImage(point);
		console.log(`已获取${point}的图片链接：${imageUrl}`);
		ctx.body = imageUrl
	}

	async location(ctx){
		const point = ctx.request.query.point
		console.log(`准备获取${point}的经纬度信息`);
		let location = await getLocation(gaodeWebKey, point)
		console.log(`已获取${point}的经纬度信息：${location}`);
		ctx.body = location
	}

	async previewImgs(ctx){
		const trips = await Trip.find()
		let pics = []
		trips.forEach(function(trip){
			//console.log(trip.tripName ,trip.cover)
			if(trip.cover){
				pics.push({
					"url":trip.cover, 
					"tripName": trip.tripName,
					"nameOfScence": null,
					"cover": true
				})
			}
			
			let points = flattenArray(trip.detail)
			
			points.forEach(function(item){
				pics.push({
					"url":item.picURL, 
					"tripName": trip.tripName,
					"nameOfScence": item.nameOfScence,
					"cover": false
				})
			})
		})
		ctx.body = pics
	}

	async updatePointImg(ctx){
		const {url, nameOfScence, tripName, cover} = ctx.request.body
		let oldItem = await Trip.findOne({tripName: tripName})
		if (!oldItem) {
			ctx.body = { success: false, message: 'Trip not found' }
			return
		}
		
		if(cover){
			oldItem.cover = url
		} else {
			let flag = false
			let updated = false
			let detail = JSON.parse(JSON.stringify(oldItem.detail));//二维数组深拷贝
			//const deepCopiedArray = structuredClone(originalArray);
			for (let i = 0; i < detail.length; i++){
				if(flag) break
				for (let j = 0; j < detail[i].length; j++){
					if(detail[i][j].nameOfScence === nameOfScence){
						const oldUrl = detail[i][j].picURL
						detail[i][j].picURL = url
						flag = true
						updated = true
						break
					}
				}
			}
			if (!updated) {
				ctx.body = { success: false, message: 'Scene not found' }
				return
			}
			oldItem.detail = detail
		}
		
		try {
			let newTrip = await oldItem.save()
			ctx.body = { success: true, data: newTrip }
		} catch (error) {
			console.error('Error saving trip:', error)
			ctx.body = { success: false, message: 'Error saving changes', error: error.message }
		}
	}

	async deleteItem(ctx){
		let {uid} = ctx.request.body
		let result = await Trip.findOneAndDelete({ uid: uid })
		ctx.body = result
	}

	async chechUrl(ctx){
		const uid = ctx.request.query.uid || '1' //默认测试用的uid
		const trips = await Trip.find({ uid: uid })
		let array = []
		for (let i = 0; i < trips.length; i++) {
			let trip = trips[i]
			let detail = trip.detail
			let name = trip.tripName
			console.log(`==================准备检查${name}下的景点图片链接：==================`)
			for (let j = 0; j < detail.length; j++) {
				let day = detail[j]
				for (let k = 0; k < day.length; k++) {
					let point = day[k]
					if(point.picURL === defaultPicUrl) {
						console.log(`${name}的【${point.nameOfScence}】的图片为【默认链接】！即将重置图片链接！！`);
						const imageUrl = await getBingFirstImage(point.nameOfScence);
						point.picURL = imageUrl
						trip.markModified('detail');
						await trip.save()
						array.push({
							whichTrip: i,
							whichDay: j,
							whichPoint: k,
							nameOfScence: point.nameOfScence,
							picURL:imageUrl,
						})
					} else {
						let {isValid, width, height }= await isImageUrlValid2(point.picURL)
						console.log(point.nameOfScence, isValid, width, height)
						if(!isValid || (width < 100 && height < 100 && width == height)){
							console.log(`${name}的【${point.nameOfScence}】的图片链接【有问题】！即将重置图片链接！！`);
							const imageUrl = await getBingFirstImage(point.nameOfScence);
							if(imageUrl !== defaultPicUrl && imageUrl !== null && imageUrl !== undefined){
								console.log(`已获取【${point.nameOfScence}】的新图片链接：${imageUrl}`);
								point.picURL = imageUrl
								trip.markModified('detail');
								await trip.save()
								array.push({
									whichTrip: i,
									whichDay: j,
									whichPoint: k,
									nameOfScence: point.nameOfScence,
									picURL:imageUrl,
								})
							}
						}
					}
				}
			}
		}
		for (let i = 0; i < array.length; i++) {
			console.log(`再次检验的【${array[i].nameOfScence}】的图片链接有效性！！`);
			let {isValid, width, height }= await isImageUrlValid2(array[i].picURL)
			if(!isValid || (width < 100 && height < 100 && width == height)){
				console.log(`${array[i].nameOfScencename}的图片链接【有问题】！即将重置图片链接！！`);
				const imageUrl = await getFirstBaiduImage(point.nameOfScence);
				if(imageUrl !== defaultPicUrl && imageUrl !== null && imageUrl !== undefined){
					trips[array[i].whichTrip][array[i].whichDay][array[i].whichPoint].picURL = imageUrl
					trip.markModified('detail');
					await trip.save()
				}
			} else{
				console.log(`【${array[i].nameOfScence}】的图片链接有效！！`);
			}
		}
		ctx.body = array
	}

	async checkUrlQueue(ctx) {
		const uid = ctx.request.query.uid;
		let trips
		if(uid){
			trips = await Trip.find({ uid })
		}else {
			trips = await Trip.find();
		}
		const io = ctx.state.io;

		for (let i = 0; i < trips.length; i++) {
			let trip = trips[i];
			let detail = trip.detail;
			let name = trip.tripName;

			for (let j = 0; j < detail.length; j++) {
				let day = detail[j];
				for (let k = 0; k < day.length; k++) {
					let point = day[k];
					// 每个景点生成一个后台任务
					taskQueue.add(async () => {
						console.log(`准备检查 ${name} - ${point.nameOfScence}`);
						io.emit('progress', { tripName: name, pointName: point.nameOfScence, status: '开始检测' });
						let needUpdate = false;
						// === 第一次校验：原始链接 ===
						if (point.picURL === defaultPicUrl) {
							console.log(`${name} 的【${point.nameOfScence}】使用了默认链接，需要更新`);
							needUpdate = true;
						} else {
							let { isValid, width, height } = await isImageUrlValid2(point.picURL);
							console.log(`第一次校验: ${point.nameOfScence} -> ${isValid}, ${width}x${height}`);
							if (!isValid || (width < 100 && height < 100 && width === height)) {
								console.log(`${name} 的【${point.nameOfScence}】图片无效，需要更新`);
								needUpdate = true;
							}
						}

						let finalUrl = point.picURL;

						// === 如果需要更新，先从 Bing 获取新图 ===
						if (needUpdate) {
							const bingUrl = await getBingFirstImage(point.nameOfScence);

							if (bingUrl) {
								let { isValid, width, height } = await isImageUrlValid2(bingUrl);
								console.log(`二次校验 Bing: ${point.nameOfScence} -> ${isValid}, ${width}x${height}`);
								if (isValid && !(width < 100 && height < 100 && width === height)) {
									finalUrl = bingUrl;
									console.log(`已使用 Bing 图片: ${point.nameOfScence} => ${bingUrl}`);
								} else{
									const baiduUrl = await getFirstBaiduImage(point.nameOfScence);
									if (baiduUrl) {
										let { isValid, width, height } = await isImageUrlValid2(baiduUrl);
										console.log(`三次校验 Baidu: ${point.nameOfScence} -> ${isValid}, ${width}x${height}`);
										if (isValid && !(width < 100 && height < 100 && width === height)) {
											finalUrl = baiduUrl;
											console.log(`已使用 Baidu 图片: ${point.nameOfScence} => ${baiduUrl}`);
										}
									} else {
										finalUrl = defaultPicUrl;
										console.log(`最终回退为默认链接: ${point.nameOfScence}`);
									}
								}
							}
							// 保存修改
							point.picURL = finalUrl;
							trip.markModified('detail');
							await trip.save();
						}
						io.emit('progress', { tripName: name, pointName: point.nameOfScence, status: `完成: ${finalUrl}` });
					});
				}
			}
		}

		// ⚡ 前端立刻返回：任务已加入后台队列
		ctx.body = { message: "任务已加入后台队列" };
	}

	async deleStory(ctx) {
		const {id, key} = ctx.request.body
		console.log(id)
		console.log(key)
		if(key && key.length > 0){
			const paths = key.map(url => {
				return url.replace(outerURL, '');
			});
			const asyncTasks = paths.map(path => {
				return deleteQiniu(accessKey, secretKey, bucket, path);
			});
			try{
				let results = await Promise.all(asyncTasks)
				console.log(results)
			}catch(err){
				console.error('任务执行出错:', error);
			}
			console.log('七牛云文件删除成功');
		}
		
		try {
			const result = await Item.deleteOne({ _id: id });
			
			console.log('删除结果:', result);
			ctx.body = result
		} catch (err) {
			console.error('删除失败:', err);
			ctx.body = err
		}
	}
}

const tripCtl = new TripCtl();

const proto = Object.getPrototypeOf(tripCtl);
Object.getOwnPropertyNames(proto)
	.filter((name) => name !== 'constructor' && typeof tripCtl[name] === 'function')
	.forEach((name) => {
		tripCtl[name] = tripCtl[name].bind(tripCtl);
	});

module.exports = tripCtl;
