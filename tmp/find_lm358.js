const fs = require('fs');
const { MongoClient } = require('mongodb');
try {
  const env = fs.readFileSync('.env', 'utf8');
  const m = env.match(/^MONGODB_URI=(.*)$/m);
  if (!m) {
    console.log('NO_URI');
    process.exit(1);
  }
  let uri = m[1].trim();
  uri = uri.replace(/([?&])appName=(?=&|$)/g, '$1');
  (async () => {
    try {
      const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 5000 });
      const db = client.db();
      const proj = await db.collection('projects').findOne({ title: /LM358/i });
      if (proj) {
        console.log('FOUND:' + proj._id.toString());
        console.log('TITLE:' + (proj.title || ''));
        console.log('OWNER:' + (proj.ownerId ? proj.ownerId.toString() : 'none'));
      } else {
        console.log('NOT_FOUND');
      }
      await client.close();
    } catch (e) {
      console.log('ERR:' + e.message);
      process.exit(2);
    }
  })();
} catch (e) {
  console.log('FS_ERR:' + e.message);
  process.exit(1);
}
