const Router = require('koa-router');
const router = new Router({ prefix: '/api/treasure' });
const {
	create,
	login,
	createItem,
	getAllTreasures,
	getTotalPriceAndCount,
	search,
	getIP,
	modify,
	deleteItem
} = require('../controllers/treasure');

router.post('/register', create)
router.post('/login', login)
router.post('/newItem', createItem)
router.get('/getAllTreasures', getAllTreasures)
router.get('/getTotalPriceAndCount', getTotalPriceAndCount)
router.get('/search', search)
router.get('/getIP', getIP)
router.post('/modify', modify)
router.post('/delete', deleteItem)

module.exports = router;