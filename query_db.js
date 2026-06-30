const mongoose = require('mongoose');
const db = 'mongodb://woody:41538bc6dd@127.0.0.1/davinci';

mongoose.connect(db, {useNewUrlParser: true, useUnifiedTopology: true}, async (err) => {
  if (err) {
    console.error('连接失败', err);
    process.exit(1);
  }
  try {
    const Trip = mongoose.model('Trip', new mongoose.Schema({}, { strict: false }));
    const trip = await Trip.findOne({ tripName: '特种兵在南京' });
    if (trip) {
      console.log(JSON.stringify(trip, null, 2));
    } else {
      console.log('未找到 "特种兵在南京" 行程');
    }
  } catch (e) {
    console.error(e);
  } finally {
    mongoose.connection.close();
  }
});
