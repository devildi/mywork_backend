const mongoose = require('mongoose');
const Item = require('./app/models/item');
const db = 'mongodb://woody:41538bc6dd@127.0.0.1/davinci';

mongoose.connect(db, { useNewUrlParser: true, useUnifiedTopology: true }, async (err) => {
  if (err) {
    console.error('连接失败', err);
    process.exit(1);
  }
  
  try {
    const items = await Item.find({});
    console.log(`Found ${items.length} total items in database.`);
    
    let updateCount = 0;
    
    const cleanUrl = (url) => {
      if (!url) return '';
      let cleaned = url;
      while (cleaned.startsWith('https://cdn.nextsticker.cn/https://cdn.nextsticker.cn/')) {
        cleaned = cleaned.substring('https://cdn.nextsticker.cn/'.length);
      }
      return cleaned;
    };

    for (let item of items) {
      let changed = false;
      
      const newPic = cleanUrl(item.picURL);
      if (newPic !== item.picURL) {
        item.picURL = newPic;
        changed = true;
      }
      
      const newVideo = cleanUrl(item.videoURL);
      if (newVideo !== item.videoURL) {
        item.videoURL = newVideo;
        changed = true;
      }
      
      if (item.album && Array.isArray(item.album)) {
        for (let i = 0; i < item.album.length; i++) {
          const albumItem = item.album[i];
          if (albumItem && albumItem.key) {
            const newKey = cleanUrl(albumItem.key);
            if (newKey !== albumItem.key) {
              albumItem.key = newKey;
              item.markModified('album');
              changed = true;
            }
          }
        }
      }
      
      if (changed) {
        await item.save();
        updateCount++;
        console.log(`Updated item: ${item._id} (${item.articleName})`);
      }
    }
    
    console.log(`Successfully repaired ${updateCount} items.`);
  } catch (e) {
    console.error('An error occurred during database migration:', e);
  } finally {
    mongoose.connection.close();
  }
});
