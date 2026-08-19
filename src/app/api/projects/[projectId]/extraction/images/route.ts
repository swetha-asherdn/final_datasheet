import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { getAllExtractedImagesForProject } from "@/server/extraction/service";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await connectToDatabase();
    const result = await getAllExtractedImagesForProject({ projectId, ownerId: user.id });
    if (!result) return NextResponse.json({ error: { message: "Project not found", code: "PROJECT_NOT_FOUND" } }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
