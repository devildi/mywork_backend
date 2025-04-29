const Router = require('koa-router');
const router = new Router({ prefix: '/api/chat' });
const {
	chat,
	getDes,
	getInfos,
	formatTripFromLLM,
	meg,
	copyMeg
} = require('../controllers/agent');

router.post('/bot', chat)
router.get('/getDes', getDes)
router.get('/getInfos', getInfos)
router.get('/formatTripFromLLM', formatTripFromLLM)
router.post('/meg', meg)
router.get('/copyMeg', copyMeg)

module.exports = router;