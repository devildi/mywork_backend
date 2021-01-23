const jsonwebtoken = require('jsonwebtoken');
const User = require('../models/users');
const Client = require('../models/client')
const { secret, authority, sendMail } = require('../config');

class UsersCtl {
	async create(ctx){
    ctx.verifyParams({
      name: { type: 'string', required: true },
      password: { type: 'string', required: true },
      auth: { type: 'string', required: true }
    });
    const { name, auth} = ctx.request.body;
    if(auth !== authority){
      ctx.throw(401, '未授权');
    }
    const repeatedUser = await User.findOne({ name });
    if (repeatedUser) {
      ctx.body = '此工号已经注册，请直接登录！'
      return
    }
    const user = await new User(ctx.request.body).save();
    ctx.body = user;
  }

  async login(ctx){
    ctx.verifyParams({
      name: { type: 'string', required: true },
      password: { type: 'string', required: true },
    });
    const user = await User.findOne(ctx.request.body);
    if(user){
      const { _id, name } = user;
      const token = jsonwebtoken.sign({ _id, name }, secret, { expiresIn: '1d' });
      ctx.body = { name, token };
    } else {
      ctx.body = user;
    }
  }
  
  async logout(ctx){
    ctx.state.user = null
    ctx.body = {user: null};
  }

  async newClient(ctx){
    const newClient = await new Client(ctx.request.body).save()
    const{wechat, destination} = ctx.request.body
    try {
      sendMail(wechat, destination)
      ctx.body = JSON.stringify(newClient)
    } catch (error) {
      console.log(error)
    }
  }

  async getClient(ctx){
    const allClients = await Client.find({}).sort({"_id": -1})
    ctx.body = allClients
  }
}

module.exports = new UsersCtl();