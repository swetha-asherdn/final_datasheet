import { connectToDatabase } from '../src/server/db';
import { UserModel } from '../src/server/models/user';
import { ProjectModel } from '../src/server/models/project';

async function main() {
  await connectToDatabase();
  const users = await UserModel.find({});
  console.log('--- ALL USERS IN DB ---');
  users.forEach(u => console.log(`ID: ${u._id.toString()}, Email: ${u.email}, Name: ${u.name}`));

  const project = await ProjectModel.findById('6ac46ff6c0de837db134e0a5');
  console.log('\n--- ACTIVE PROJECT ---');
  console.log(`Project ID: ${project?._id}, ownerId: ${project?.ownerId}`);

  const owner = await UserModel.findById(project?.ownerId);
  console.log(`Owner in DB: ID: ${owner?._id}, Email: ${owner?.email}, Name: ${owner?.name}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
