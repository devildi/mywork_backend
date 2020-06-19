const jwt = require('koa-jwt');
const Router = require('koa-router');
const router = new Router({ prefix: '/api/trip' });

const { secret } = require('../config');
const auth = jwt({ secret });

const {
	create,
	get
} = require('../controllers/trip');

router.post('/new', create);
router.get('/get', get);

module.exports = router;