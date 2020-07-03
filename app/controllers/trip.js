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
		let newItem = await new Item(item).save()
		ctx.body = newItem
	}

	async get(ctx){
		const uid = ctx.request.query.uid
		const trip = await Trip.findOne({ uid: uid });
		ctx.body = trip;
	}
}

module.exports = new TripCtl();