const Koa = require('koa')
const koaBody = require('koa-body')
const koaStatic = require('koa-static')
const error = require('koa-json-error')
const parameter = require('koa-parameter')
const mongoose = require('mongoose')
const logger = require('koa-logger')
const path = require('path')
const routing = require('./routes')
const { port } = require('./config')
const db = 'mongodb://woody:41538bc6dd@127.0.0.1/davinci'
const app = new Koa()

const server = require('http').createServer(app.callback())
const { Server } = require("socket.io");
const io = new Server(server);
var connected = 0

app.use(logger())
mongoose.connect(db,{useNewUrlParser: true, useUnifiedTopology: true}, (err) => {
  if(err){
    console.log('数据库连接失败', err)
  }
})

app.use(koaStatic(path.join(__dirname, 'public')))
app.use(error({
  postFormat: (e, { stack, ...rest }) => process.env.NODE_ENV === 'production' ? rest : { stack, ...rest }
}))
app.use(koaBody({
  multipart: true,
  formidable: {
    keepExtensions: true,
  },
}))

app.use(async(ctx, next) => {
  console.log('进入中间件', connected)
  ctx.state.io = io
  if (ctx.path == '/api/users/newClient') {
    return await next()
  }
  return await next()
})

app.use(parameter(app))
routing(app)
io.on('connection', (socket) => {
  console.log('有新的socket已连接！',socket.id)
  io.emit('increase', ++connected);
  socket.on('chat message', (msg) => {
    //socket.broadcast.emit('data', msg);
    io.emit('data', msg);
  })
  socket.on("disconnect", (reason) => {
    console.log('disconnect')
    io.emit('decrease', --connected);
  })
})

server.listen(port, () => console.log(`程序启动在 ${port} 端口`))
//app.listen(port, () => console.log(`程序启动在 ${port} 端口`))