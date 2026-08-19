import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { ProjectModel } from "@/server/models/project";
import { getPrivateObject } from "@/server/storage/s3";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    
    await connectToDatabase();
    const project = await ProjectModel.findOne({ _id: projectId, ownerId: user.id });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Stream edited PDF if it exists, otherwise stream original PDF
    const hasEditedPdf = project.editableDocx?.storageKey && project.editableDocx.storageKey.endsWith(".pdf");
    const storageKey = hasEditedPdf ? project.editableDocx.storageKey : project.originalPdf.storageKey;

    const fileStream = await getPrivateObject(storageKey);
    
    return new Response(fileStream as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${project.originalPdf.originalFileName}"`
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
