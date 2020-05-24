const jwt = require('koa-jwt');
const Router = require('koa-router');
const router = new Router({ prefix: '/api/work' });

const { secret } = require('../config');
const auth = jwt({ secret });

const {
	create,
	count,
} = require('../controllers/work');

router.post('/submit', auth, create);
router.get('/count', count);

module.exports = router;