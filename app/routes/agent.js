const Router = require('koa-router');
const router = new Router({ prefix: '/api/chat' });

const {
	chat,
	getDes,
	getInfos
} = require('../controllers/agent');

router.post('/bot', chat)
router.get('/getDes', getDes)
router.get('/getInfos', getInfos)

module.exports = router;