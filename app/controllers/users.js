const jsonwebtoken = require('jsonwebtoken');
const User = require('../models/users');
const { secret, authority } = require('../config');

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
}

module.exports = new UsersCtl();