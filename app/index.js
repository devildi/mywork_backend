const Koa = require('koa');
const koaBody = require('koa-body');
const koaStatic = require('koa-static');
const error = require('koa-json-error');
const parameter = require('koa-parameter');
const mongoose = require('mongoose');
var logger = require('koa-logger')
const path = require('path');
const db = 'mongodb://localhost/davinci'
const app = new Koa();
app.use(logger())
mongoose.connect(db,{useNewUrlParser: true, useUnifiedTopology: true})
const routing = require('./routes');
const { port } = require('./config');
app.use(koaStatic(path.join(__dirname, 'public')));
app.use(error({
  postFormat: (e, { stack, ...rest }) => process.env.NODE_ENV === 'production' ? rest : { stack, ...rest }
}));
app.use(koaBody({
  multipart: true,
  formidable: {
    keepExtensions: true,
  },
}));
app.use(parameter(app));
routing(app);
app.listen(port, () => console.log(`程序启动在 ${port} 端口`));