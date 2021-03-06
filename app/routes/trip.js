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
	getImgWAH,
	postPhoto,
	getPhotosByPage,
	updatePhoto,
	deletePhoto,
	getAllTripByPage,
	logWeapp,
	weappUser,
	ticketsInfo
} = require('../controllers/trip');

router.post('/new', create);
router.post('/newItem', createItem);
router.post('/updateItem', updateItem);
router.get('/get', get);
router.get('/getAllTrip', getAllTrip);
router.get('/getAllTripByPage', getAllTripByPage);
router.get('/getDescriptedTrip', getDescriptedTrip);
router.get('/getAllStory', getAllStory)
router.get('/getStoryByPage', getStoryByPage)
router.get('/getImgWAH', getImgWAH)
router.post('/photoInput', postPhoto)
router.get('/getPhotos', getPhotosByPage)
router.post('/updatePhoto', updatePhoto);
router.post('/deletePhoto', deletePhoto);
router.get('/logWeapp', logWeapp)
router.post('/weappUser', weappUser)

router.get('/ticketsInfo', ticketsInfo)

module.exports = router;