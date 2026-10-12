import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { getProjectForOwner } from "@/server/repositories/projects";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await connectToDatabase();
    const result = await getProjectForOwner(projectId, user.id);
    if (!result) throw new AppError("Project not found", 404, { code: "NOT_FOUND" });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
