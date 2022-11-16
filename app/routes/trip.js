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
	findPhotoById,
	getAllTripByPage,
	logWeapp,
	weappUser,
	ticketsInfo,
	getStoryById,
	getDescriptedTrip1,
	getStoryDetailByGRPC,
	getUploadToken
} = require('../controllers/trip');

router.get('/getUploadToken', getUploadToken);
router.post('/new', create);
router.post('/newItem', createItem);
router.post('/updateItem', updateItem);
router.get('/getStoryById', getStoryById)
router.get('/get', get);
router.get('/getAllTrip', getAllTrip);
router.get('/getAllTripByPage', getAllTripByPage);
router.get('/getDescriptedTrip', getDescriptedTrip);
router.get('/getDescriptedTrip1', getDescriptedTrip1);
router.get('/getAllStory', getAllStory)
router.get('/getStoryByPage', getStoryByPage)
router.get('/getImgWAH', getImgWAH)
router.post('/photoInput', postPhoto)
router.get('/getPhotos', getPhotosByPage)
router.get('/findPhotoById', findPhotoById)
router.post('/updatePhoto', updatePhoto);
router.post('/deletePhoto', deletePhoto);
router.get('/logWeapp', logWeapp)
router.post('/weappUser', weappUser)

router.get('/ticketsInfo', ticketsInfo)

router.get('/getStoryDetailByGRPC', getStoryDetailByGRPC)

module.exports = router;