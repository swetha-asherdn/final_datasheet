import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { getPagePreviewArtifactForProject } from "@/server/extraction/service";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; pageNumber: string }> }) {
  try {
    const { projectId, pageNumber } = await params;
    const user = await requireUser();
    await connectToDatabase();
    const artifact = await getPagePreviewArtifactForProject({ projectId, ownerId: user.id, pageNumber: Number(pageNumber) });
    if (!artifact) {
      return NextResponse.json({ error: { message: "Preview artifact not found", code: "ARTIFACT_NOT_FOUND" } }, { status: 404 });
    }

    return new Response(artifact.body, {
      status: 200,
      headers: {
        "Cache-Control": artifact.cacheControl,
        "Content-Type": artifact.contentType,
        "X-Content-Type-Options": "nosniff",
        ...(artifact.contentLength ? { "Content-Length": String(artifact.contentLength) } : {})
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
