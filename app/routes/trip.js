const jwt = require('koa-jwt');
const Router = require('koa-router');
const router = new Router({ prefix: '/api/trip' });

const { secret } = require('../config');
const auth = jwt({ secret });

const {
	create,
	createItem,
	get,
	getAllStory,
	getAllTrip,
	getDescriptedTrip,
	getStoryByPage,
	updateItem,
	getImgWAH
} = require('../controllers/trip');

router.post('/new', create);
router.post('/newItem', createItem);
router.post('/updateItem', updateItem);
router.get('/get', get);
router.get('/getAllTrip', getAllTrip);
router.get('/getDescriptedTrip', getDescriptedTrip);
router.get('/getAllStory', getAllStory)
router.get('/getStoryByPage', getStoryByPage)
router.get('/getImgWAH', getImgWAH)

module.exports = router;