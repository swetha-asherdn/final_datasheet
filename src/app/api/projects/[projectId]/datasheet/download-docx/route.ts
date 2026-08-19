import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectToDatabase } from "@/server/db";
import { ProjectModel } from "@/server/models/project";
import { getPrivateObject } from "@/server/storage/s3";

function generateDocxToken(projectId: string) {
  const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
  return crypto.createHmac("sha256", secret).update(projectId).digest("hex");
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    
    // Verify token matches the HMAC signature of the projectId
    const expectedToken = generateDocxToken(projectId);
    if (token !== expectedToken) {
      return new Response("Unauthorized", { status: 401 });
    }
    
    await connectToDatabase();
    const project = await ProjectModel.findById(projectId);
    if (!project || !project.editableDocx?.storageKey) {
      return new Response("Editable document not found", { status: 404 });
    }
    
    // Fetch the private document from S3
    const artifact = await getPrivateObject(project.editableDocx.storageKey);
    
    // Stream document directly to ONLYOFFICE Document Server
    return new Response(artifact.body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(project.name)}.docx"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("[download-docx] error streaming document:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
