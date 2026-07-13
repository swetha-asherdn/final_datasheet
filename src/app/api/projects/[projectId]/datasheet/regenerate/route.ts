import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { regenerateDatasheetFromExtraction } from "@/server/datasheet/service";

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await connectToDatabase();
    const result = await regenerateDatasheetFromExtraction({ projectId, ownerId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}