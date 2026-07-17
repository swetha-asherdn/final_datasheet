import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { getPdfExportHtmlPreviewForProject } from "@/server/datasheet/export-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await connectToDatabase();
    const searchParams = new URL(request.url).searchParams;
    const preferredMode = searchParams.get("mode") === "saved" ? "saved" : searchParams.get("mode") === "auto" ? "auto" : undefined;
    const html = await getPdfExportHtmlPreviewForProject({
      projectId,
      ownerId: user.id,
      preferredMode,
    });
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
