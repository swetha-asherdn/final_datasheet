import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { createDatasheetFromExtraction } from "@/server/datasheet/service";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    const body = await request.json().catch(() => ({})) as { force?: boolean };
    await connectToDatabase();
    const result = await createDatasheetFromExtraction({ projectId, ownerId: user.id, force: body.force === true });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
