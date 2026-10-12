import { connectToDatabase } from "../src/server/db";
import { ProjectModel } from "../src/server/models/project";

async function main() {
  await connectToDatabase();
  const projects = await ProjectModel.find({}).sort({ createdAt: -1 }).limit(10);
  console.log("Projects in MongoDB:");
  projects.forEach(p => {
    console.log(`  ID: ${p._id}, Title: ${p.title}, Pages: ${p.originalPdf?.pageCount}, File: ${p.originalPdf?.originalFileName}, Status: ${p.status}`);
  });
}

main().catch(console.error);
