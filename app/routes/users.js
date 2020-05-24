const jwt = require('koa-jwt');
const Router = require('koa-router');
const router = new Router({ prefix: '/api/users' });

const {
	create,
	login,
	logout,
} = require('../controllers/users');

const { secret } = require('../config');
const auth = jwt({ secret });

router.post('/', create);
router.post('/login', login);
router.post('/logout', logout);

module.exports = router;