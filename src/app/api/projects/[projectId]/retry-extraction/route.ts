import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { retryExtractionForProject } from "@/server/extraction/service";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await connectToDatabase();
    let engine: "native" | "google_doc_ai" | "gemini_vision" = "gemini_vision";
    try {
      const body = await request.json();
      if (body?.engine === "google_doc_ai" || body?.engine === "native" || body?.engine === "gemini_vision") {
        engine = body.engine;
      }
    } catch {
      // Body may be empty, default to gemini_vision
    }
    await retryExtractionForProject(projectId, user.id, engine);
    return NextResponse.json({ ok: true, engine });
  } catch (error) {
    return errorResponse(error);
  }
}
