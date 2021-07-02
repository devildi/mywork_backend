const Koa = require('koa')
const koaBody = require('koa-body')
const koaStatic = require('koa-static')
const error = require('koa-json-error')
const parameter = require('koa-parameter')
const mongoose = require('mongoose')
var logger = require('koa-logger')
const path = require('path');
const db = 'mongodb://localhost/davinci'
const app = new Koa();

// const server = require('http').createServer(app.callback())
// const io = require('socket.io')(server)

app.use(logger())
mongoose.connect(db,{useNewUrlParser: true, useUnifiedTopology: true})
const routing = require('./routes')
const { port } = require('./config')
app.use(koaStatic(path.join(__dirname, 'public')))
app.use(error({
  postFormat: (e, { stack, ...rest }) => process.env.NODE_ENV === 'production' ? rest : { stack, ...rest }
}));
app.use(koaBody({
  multipart: true,
  formidable: {
    keepExtensions: true,
  },
}))

app.use(async(ctx, next) => {
  if (ctx.path == "/api/users/newClient") {
    // console.log('client')
    // ctx.state.io = io
    return await next();
  }
  return await next()
})

app.use(parameter(app))
routing(app)

// io.on('connection', (socket) => {
//   console.log('socket已连接！',socket.id)
// });

// server.listen(port, () => console.log(`程序启动在 ${port} 端口`))
app.listen(port, () => console.log(`程序启动在 ${port} 端口`))