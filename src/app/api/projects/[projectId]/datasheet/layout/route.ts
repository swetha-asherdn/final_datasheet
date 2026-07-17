import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { getDatasheetLayoutForProject, updateDatasheetLayoutForProject } from "@/server/datasheet/layout-service";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await connectToDatabase();
    const result = await getDatasheetLayoutForProject({ projectId, ownerId: user.id });
    if (!result) return NextResponse.json({ error: { message: "Paged layout not found", code: "DATASHEET_LAYOUT_NOT_FOUND" } }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    const input = await request.json();
    await connectToDatabase();
    const result = await updateDatasheetLayoutForProject({ projectId, ownerId: user.id, input });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
