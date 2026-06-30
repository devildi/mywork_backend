const Router = require('koa-router');
const router = new Router({ prefix: '/api/flight' });
const { startCrawler, getStatus, stopCrawler, clearCache } = require('../controllers/flight');

router.post('/start', startCrawler);
router.post('/stop', stopCrawler);
router.post('/clear', clearCache);
router.get('/status', getStatus);

module.exports = router;
