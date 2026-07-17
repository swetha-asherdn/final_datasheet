import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { createPdfExportForProject } from "@/server/datasheet/export-service";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    const body = await request.json().catch(() => ({})) as { mode?: "auto" | "saved" };
    await connectToDatabase();
    const result = await createPdfExportForProject({ projectId, ownerId: user.id, preferredMode: body.mode === "saved" ? "saved" : body.mode === "auto" ? "auto" : undefined });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
