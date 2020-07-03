const jwt = require('koa-jwt');
const Router = require('koa-router');
const router = new Router({ prefix: '/api/trip' });

const { secret } = require('../config');
const auth = jwt({ secret });

const {
	create,
	createItem,
	get
} = require('../controllers/trip');

router.post('/new', create);
router.post('/newItem', createItem);
router.get('/get', get);

module.exports = router;