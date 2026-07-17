import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { resetDatasheetLayoutForProject } from "@/server/datasheet/layout-service";

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await connectToDatabase();
    const result = await resetDatasheetLayoutForProject({ projectId, ownerId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
