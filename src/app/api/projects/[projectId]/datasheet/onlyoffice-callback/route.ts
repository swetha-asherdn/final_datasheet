import { NextResponse } from "next/server";
import { connectToDatabase } from "@/server/db";
import { ProjectModel } from "@/server/models/project";
import { uploadPrivateObject } from "@/server/storage/s3";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    
    // ONLYOFFICE Document Server statuses:
    // 2 - document is ready for saving (user closed connection / save interval)
    // 6 - document is being edited but is force-saved
    const status = Number(body.status);
    const url = body.url as string;
    
    console.info(`[onlyoffice-callback] received callback for project ${projectId}, status=${status}`);
    
    if (status === 2 || status === 6) {
      if (!url) {
        return NextResponse.json({ error: 1, message: "Missing document download URL" });
      }
      
      await connectToDatabase();
      const project = await ProjectModel.findById(projectId);
      if (!project) {
        return NextResponse.json({ error: 1, message: "Project not found" });
      }
      
      // Fetch the modified document from the ONLYOFFICE server
      const fileResponse = await fetch(url);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download modified file from ONLYOFFICE: ${fileResponse.statusText}`);
      }
      
      const arrayBuffer = await fileResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Determine S3 storage key
      const storageKey = project.editableDocx?.storageKey || `users/${project.ownerId}/projects/${project._id}/editable/${project._id}.docx`;
      
      // Upload to private S3 storage, overwriting the existing DOCX
      await uploadPrivateObject({
        key: storageKey,
        body: buffer,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });
      
      // Update Project metadata
      await ProjectModel.updateOne(
        { _id: project._id },
        {
          $set: {
            "editableDocx.storageKey": storageKey,
            "editableDocx.fileSize": buffer.length,
            "editableDocx.lastSavedAt": new Date()
          }
        }
      );
      
      console.info(`[onlyoffice-callback] successfully saved document for project ${projectId}, size=${buffer.length} bytes`);
    }
    
    // ONLYOFFICE Document Server requires returning error: 0 to verify successful callback reception
    return NextResponse.json({ error: 0 });
  } catch (error) {
    console.error("[onlyoffice-callback] error handling callback:", error);
    return NextResponse.json({ error: 1, message: error instanceof Error ? error.message : "Internal error" });
  }
}
