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
//const IO = require('koa-socket')
const db = 'mongodb://woody:41538bc6dd@localhost/davinci'
const app = new Koa()

const server = require('http').createServer(app.callback())
const { Server } = require("socket.io");
const io = new Server(server);

//const io = new IO()

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
  if (ctx.path == '/api/users/newClient') {
    // console.log('client')
    // ctx.state.io = io
    return await next()
  }
  return await next()
})

app.use(parameter(app))
routing(app)
//io.attach(app)
// app._io.on( 'connection', socket => {
//   console.log('建立连接了');
//   let roomid=url.parse(socket.request.url,true).query.roomid;   /*获取房间号/ 获取桌号需要引入url模块*/
//   socket.join(roomid);  /*加入房间/加入分组*/
//   socket.on('message',function(data){
//   console.log(data);
//     //socket.emit('serverEmit','我接收到消息了');  /*发给指定用户*/
//     //app._io.emit('serverEmit','我接收到消息了');  /*广播*/
//     //app._io.to(roomid).emit('serverEmit','我接收到消息了'); 发送给房间内的所有人
//     socket.broadcast.to(roomid).emit('serverEmit','我接收到消息了');/*发送给除了自己以外房间内的所有人*/
//   })
// })
io.on('connection', (socket) => {
  console.log('socket已连接！',socket.id)
})

server.listen(port, () => console.log(`程序启动在 ${port} 端口`))
//app.listen(port, () => console.log(`程序启动在 ${port} 端口`))