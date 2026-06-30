const mongoose = require('mongoose');
const db = 'mongodb://woody:41538bc6dd@127.0.0.1/davinci';

mongoose.connect(db, {useNewUrlParser: true, useUnifiedTopology: true}, async (err) => {
  if (err) {
    console.error('连接失败', err);
    process.exit(1);
  }
  try {
    const Item = mongoose.model('Item', new mongoose.Schema({}, { strict: false }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const users = await User.find();
    console.log('All Users:', JSON.stringify(users.map(u => {
      const doc = u.toObject();
      return { _id: doc._id, name: doc.name, avatar: doc.avatar };
    }), null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    mongoose.connection.close();
  }
});

