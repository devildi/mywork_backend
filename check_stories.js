const mongoose = require('mongoose');
const db = 'mongodb://woody:41538bc6dd@127.0.0.1/davinci';

mongoose.connect(db, {useNewUrlParser: true, useUnifiedTopology: true}, async (err) => {
  if (err) {
    console.error('连接失败', err);
    process.exit(1);
  }
  try {
    const Item = mongoose.model('Item', new mongoose.Schema({}, { strict: false }));
    const items = await Item.find();
    console.log(`Total stories in database: ${items.length}`);
    
    let issues = [];
    
    items.forEach((item, idx) => {
      const doc = item.toObject();
      const id = doc._id;
      const title = doc.articleName || '(No Title)';
      
      // Check for missing picURL
      if (!doc.picURL) {
        issues.push({ id, title, issue: 'Missing or empty picURL' });
      } else if (!doc.picURL.startsWith('http://') && !doc.picURL.startsWith('https://')) {
        issues.push({ id, title, issue: `picURL does not start with http/https: "${doc.picURL}"` });
      }
      
      // Check width and height
      const w = doc.width;
      const h = doc.height;
      if (w === undefined || w === null || Number.isNaN(w) || !Number.isFinite(w)) {
        issues.push({ id, title, issue: `width is invalid: ${w} (type=${typeof w})` });
      }
      if (h === undefined || h === null || Number.isNaN(h) || !Number.isFinite(h)) {
        issues.push({ id, title, issue: `height is invalid: ${h} (type=${typeof h})` });
      }
      
      // Check author field
      if (doc.author === undefined || doc.author === null) {
        // missing author is handled in client via fallback to 'DevilDI'
      } else if (typeof doc.author === 'string' && doc.author.trim() === '') {
        issues.push({ id, title, issue: 'Author is empty string' });
      }
      
      // Check comments
      if (doc.comments !== undefined && doc.comments !== null) {
        if (!Array.isArray(doc.comments)) {
          issues.push({ id, title, issue: 'comments field is not an array' });
        } else {
          doc.comments.forEach((c, cIdx) => {
            if (typeof c !== 'object') {
              issues.push({ id, title, issue: `Comment at index ${cIdx} is not an object: type=${typeof c}` });
            }
          });
        }
      }
      
      // Check album
      if (doc.album !== undefined && doc.album !== null) {
        if (!Array.isArray(doc.album)) {
          issues.push({ id, title, issue: 'album field is not an array' });
        } else {
          doc.album.forEach((a, aIdx) => {
            if (typeof a !== 'object') {
              issues.push({ id, title, issue: `Album item at index ${aIdx} is not an object: type=${typeof a}` });
            }
          });
        }
      }
    });
    
    if (issues.length > 0) {
      console.log('Found issues in stories:');
      console.log(JSON.stringify(issues, null, 2));
    } else {
      console.log('No schema/structural issues found in database stories.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    mongoose.connection.close();
  }
});
