import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { getPdfExportDownloadForProject } from "@/server/datasheet/export-service";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; exportId: string }> }) {
  try {
    const { projectId, exportId } = await params;
    const user = await requireUser();
    await connectToDatabase();
    const exportFile = await getPdfExportDownloadForProject({ projectId, exportId, ownerId: user.id });
    return new Response(exportFile.body, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=60",
        "Content-Type": exportFile.contentType,
        "Content-Disposition": `attachment; filename="${sanitizeDownloadFilename(exportFile.filename)}"`,
        "X-Content-Type-Options": "nosniff",
        ...(exportFile.contentLength ? { "Content-Length": String(exportFile.contentLength) } : {})
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function sanitizeDownloadFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-") || "vellore-semicon-datasheet.pdf";
}
