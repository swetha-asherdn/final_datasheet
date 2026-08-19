import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { ProjectModel } from "@/server/models/project";
import { uploadPrivateObject } from "@/server/storage/s3";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    
    // Read multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing PDF file" }, { status: 400 });
    }

    await connectToDatabase();
    const project = await ProjectModel.findOne({ _id: projectId, ownerId: user.id });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save edited PDF under editable prefix
    const storageKey = `users/${user.id}/projects/${project._id}/editable/${project._id}.pdf`;

    await uploadPrivateObject({
      key: storageKey,
      body: buffer,
      contentType: "application/pdf"
    });

    // Update project metadata pointing to the edited PDF
    await ProjectModel.updateOne(
      { _id: project._id },
      {
        $set: {
          "editableDocx.storageKey": storageKey,
          "editableDocx.fileSize": buffer.length,
          "editableDocx.lastSavedAt": new Date(),
          composerStatus: "EDITING"
        }
      }
    );

    return NextResponse.json({ success: true, fileSize: buffer.length });
  } catch (error) {
    return errorResponse(error);
  }
}
