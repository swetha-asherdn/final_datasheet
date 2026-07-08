import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { getExtractionPageForProject } from "@/server/extraction/service";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; pageNumber: string }> }) {
  try {
    const { projectId, pageNumber } = await params;
    const user = await requireUser();
    await connectToDatabase();
    const result = await getExtractionPageForProject({ projectId, ownerId: user.id, pageNumber: Number(pageNumber) });
    if (!result) return NextResponse.json({ error: { message: "Extracted page not found", code: "EXTRACTED_PAGE_NOT_FOUND" } }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
