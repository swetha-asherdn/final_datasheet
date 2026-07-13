import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { updateTemplateForProject } from "@/server/datasheet/service";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    const input = await request.json();
    await connectToDatabase();
    return NextResponse.json(await updateTemplateForProject({ projectId, ownerId: user.id, input }));
  } catch (error) {
    return errorResponse(error);
  }
}
