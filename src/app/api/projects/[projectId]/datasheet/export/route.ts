import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { listPdfExportsForProject } from "@/server/datasheet/export-service";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await connectToDatabase();
    const exports = await listPdfExportsForProject({ projectId, ownerId: user.id });
    return NextResponse.json({ exports });
  } catch (error) {
    return errorResponse(error);
  }
}
