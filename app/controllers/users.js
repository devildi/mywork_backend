const jsonwebtoken = require('jsonwebtoken');
const User = require('../models/users');
const Client = require('../models/client')
const { secret, authority, sendMail } = require('../config');
const axios = require('axios')
//const PassThrough = require('stream').PassThrough;

class UsersCtl {
	async create(ctx){
    ctx.verifyParams({
      name: { type: 'string', required: true },
      password: { type: 'string', required: true },
      auth: { type: 'string', required: true }
    });
    const { name, auth} = ctx.request.body;
    if(auth !== authority){
      //ctx.throw(401, '未授权');
      ctx.body = '未授权！'
      return
    }
    const repeatedUser = await User.findOne({ name });
    if (repeatedUser) {
      ctx.body = '此用户名已经注册！'
      return
    }
    const user = await new User(ctx.request.body).save();
    ctx.body = user;
  }

  async login(ctx){
    ctx.verifyParams({
      name: { type: 'string', required: true },
      password: { type: 'string', required: true },
      from: { type: 'string', required: false },
    });
    const {name, password, from} = ctx.request.body
    console.log(from)
    const user = await User.findOne({name, password}).populate({path: 'like'})
    if(user){
      console.log(1)
      const { _id, name } = user;
      const token = jsonwebtoken.sign({ _id, name }, secret, { expiresIn: '1d' });
      if(from === 'app') {
        ctx.body = user;
      } else {
        ctx.body = { name, token };
      }
    } else {
      console.log(2)
      ctx.body = user;
    }
  }
  
  async logout(ctx){
    ctx.state.user = null
    ctx.body = {user: null};
  }

  async newClient(ctx){
    console.log(ctx.request.body)
    const newClient = await new Client(ctx.request.body).save()
    const{wechat, destination} = ctx.request.body
    try {
      sendMail(wechat, destination)
      let io = ctx.state.io
    	io.emit('notification', JSON.stringify(newClient))
      ctx.body = JSON.stringify(newClient)
    } catch (error) {
      console.log(error)
    }
  }

  // async sse(ctx){
  //   ctx.status = 200
  //   const stream = new PassThrough()
  //   ctx.set('Content-Type', 'text/event-stream')
  //   ctx.set('Cache-Control', 'no-cache')
  //   ctx.set('Connection', 'keep-alive')
  //   ctx.set('Access-Control-Allow-Origin', '*')
  //   //stream.write(`data: This is test data\n\n`)
  //   //ctx.res.write(`data: This is test data\n\n`)
  //   if(ctx.request.query.data){
  //     console.log("sending")
  //     ctx.res.write(`data: This is test data\n\n`)
  //     console.log("sended")
  //     ctx.res.write(`data: This is test data\n\n`);
  //   }
  //   ctx.body = stream
  // }

  async getClient(ctx){
    const allClients = await Client.find({}).sort({"_id": -1})
    ctx.body = allClients
  }
}

module.exports = new UsersCtl();