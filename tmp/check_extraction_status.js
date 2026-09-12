const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const projectId = '6a9e7ffd7d613d58ab9b9b74';
(async ()=>{
  try{
    const env = fs.readFileSync('.env','utf8');
    const m = env.match(/^MONGODB_URI=(.*)$/m);
    if(!m){ console.log('NO_URI'); process.exit(1); }
    let uri = m[1].trim(); uri = uri.replace(/([?&])appName=(?=&|$)/g,'$1');
    const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const db = client.db();
    const proj = await db.collection('projects').findOne({ _id: new ObjectId(projectId) });
    console.log('project_exists:', !!proj);
    if(proj) console.log('status:', proj.status, 'extractionProgress:', proj.extractionProgress || 0, 'latestRun:', proj.latestExtractionRunId || null);
    const job = await db.collection('processingjobs').findOne({ projectId: new ObjectId(projectId) });
    console.log('processing_job:', job ? `${job.status} attempts=${job.attempts} bullJobId=${job.bullJobId||null}` : 'none');
    const run = await db.collection('extractionruns').findOne({ projectId: new ObjectId(projectId) }, { sort: { createdAt: -1 } });
    console.log('latest_run:', run ? `${run.status} pageCount=${run.pageCount} warnings=${(run.warnings||[]).length}` : 'none');
    const pagesCount = await db.collection('extractedpages').countDocuments({ projectId: new ObjectId(projectId) });
    console.log('extracted_pages_count:', pagesCount);
    await client.close();
  }catch(e){ console.log('ERR:', e.message); process.exit(2);} })();
