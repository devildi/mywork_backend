const Trip = require('../models/trip');
const Item = require('../models/item');

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
}

module.exports = new TripCtl();