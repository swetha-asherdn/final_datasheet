const fs = require('fs');
const { MongoClient } = require('mongodb');
try {
  const env = fs.readFileSync('.env', 'utf8');
  const m = env.match(/^MONGODB_URI=(.*)$/m);
  if (!m) { console.log('NO_URI'); process.exit(1); }
  let uri = m[1].trim();
  uri = uri.replace(/([?&])appName=(?=&|$)/g, '$1');
  (async () => {
    try {
      const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 5000 });
      const db = client.db();
      const rows = await db.collection('projects').find({}, { projection: { title: 1, createdAt:1, pdfFilename:1 } }).sort({ createdAt: -1 }).limit(20).toArray();
      if (!rows.length) { console.log('NO_PROJECTS'); await client.close(); process.exit(0); }
      for (const r of rows) {
        console.log(`${r._id.toString()} | ${r.title || ''} | ${r.pdfFilename || ''}`);
      }
      await client.close();
    } catch (e) {
      console.log('ERR:' + e.message);
      process.exit(2);
    }
  })();
} catch (e) { console.log('FS_ERR:' + e.message); process.exit(1); }
