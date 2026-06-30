const mongoose = require('mongoose');
const db = 'mongodb://woody:41538bc6dd@127.0.0.1/davinci';

const newCoverUrl = 'https://img.zcool.cn/community/012tr8y3etpoii4oqfnyw33039.jpg?x-oss-process=image/auto-orient,1/resize,m_lfit,w_1280,limit_1/sharpen,100';

mongoose.connect(db, {useNewUrlParser: true, useUnifiedTopology: true}, async (err) => {
  if (err) {
    console.error('连接失败', err);
    process.exit(1);
  }
  try {
    const Trip = mongoose.model('Trip', new mongoose.Schema({}, { strict: false }));
    const result = await Trip.updateOne(
      { tripName: '特种兵在南京' },
      { $set: { cover: newCoverUrl } }
    );
    console.log('Update result:', result);
    
    // Verify update
    const trip = await Trip.findOne({ tripName: '特种兵在南京' });
    if (trip) {
      console.log('Verified cover URL in DB:', trip.cover);
    }
  } catch (e) {
    console.error(e);
  } finally {
    mongoose.connection.close();
  }
});
