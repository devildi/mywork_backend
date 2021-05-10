const Trip = require('../models/trip');
const Item = require('../models/item');
const Photo = require('../models/photo');
const { getWidthAndHeight } = require('../config');

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
		const {articleURL} = item
		const article = await Item.findOne({articleURL: articleURL})
		console.log(article)
		if(!article){
			let newItem = await new Item(item).save()
			ctx.body = newItem
		} else {
			ctx.body = null
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

	async getAllStory(ctx){
		const perPage = 20
		const page = ctx.request.query.page || 1
		const items = await Item.find().sort({"_id": -1}).limit(page * perPage)
		ctx.body = items;
	}

	async getStoryByPage(ctx){
		const perPage = 14
		//console.log(ctx.request.query.page)
		const page = ctx.request.query.page || 1
		const index = page - 1
		const items = await Item.find().sort({"_id": -1}).skip(index * perPage).limit(perPage)
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
			ctx.body = 'error'
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
		const items = await Photo.find().sort({"_id": -1}).skip(index * perPage).limit(perPage)
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

	async deletePhoto(ctx){
		const item = ctx.request.body
		let data = await Photo.findOneAndDelete({_id: item.id})
		ctx.body = data
	}
}

module.exports = new TripCtl();