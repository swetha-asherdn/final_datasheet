import { connectToDatabase } from "../src/server/db";
import { ProjectModel } from "../src/server/models/project";
import { regenerateDatasheetFromExtraction } from "../src/server/datasheet/service";

async function main() {
  console.log("Connecting to database...");
  await connectToDatabase();
  console.log("Connected.");

  const project = await ProjectModel.findById("6ac46ff6c0de837db134e0a5");
  if (!project) {
    console.error("Project 6ac46ff6c0de837db134e0a5 not found!");
    process.exit(1);
  }

  console.log(`Found project: ${project._id}, owner: ${project.ownerId}`);
  console.log("Running regenerateDatasheetFromExtraction with force: true...");

  const result = await regenerateDatasheetFromExtraction({
    projectId: project._id.toString(),
    ownerId: project.ownerId.toString(),
    force: true
  });

  console.log("Regeneration successful! Document ID:", result?.document?.id);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error regenerating datasheet:", err);
  process.exit(1);
});
