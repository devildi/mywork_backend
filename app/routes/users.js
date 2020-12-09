const jwt = require('koa-jwt');
const Router = require('koa-router');
const router = new Router({ prefix: '/api/users' });

const {
	create,
	login,
	logout,
	newClient,
	getClient
} = require('../controllers/users');

const { secret } = require('../config');
const auth = jwt({ secret });

router.post('/', create);
router.post('/login', login);
router.post('/logout', logout);
router.post('/newClient', newClient);
router.get('/getClient', getClient);

module.exports = router;