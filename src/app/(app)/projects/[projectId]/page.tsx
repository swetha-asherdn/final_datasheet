import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { ExtractionReview } from "@/components/extraction-review";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { getProjectForOwner } from "@/server/repositories/projects";
import { createSignedReadUrl } from "@/server/storage/s3";

type ProjectStatus = "DRAFT" | "UPLOADED" | "QUEUED" | "PROCESSING" | "REVIEW_REQUIRED" | "FAILED";

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  await connectToDatabase();
  const result = await getProjectForOwner(projectId, user.id);
  if (!result) notFound();
  const { project, job } = result;
  const pdf = project.originalPdf as { storageKey: string; originalFileName: string; mimeType: string; sizeBytes: number; pageCount?: number | null };
  const signedUrl = await createSignedReadUrl(pdf.storageKey);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">Back to dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{project.name}</h1>
          {project.description ? <p className="mt-2 max-w-3xl text-muted-foreground">{project.description}</p> : null}
        </div>
        <StatusBadge status={project.status} />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Filename" value={pdf.originalFileName} />
        <InfoCard label="File size" value={formatBytes(pdf.sizeBytes)} />
        <InfoCard label="Job status" value={job ? job.status : "Not queued"} />
        <InfoCard label="Progress" value={`${job?.progress ?? project.extractionProgress}%`} />
      </div>

      {project.lastError ? <div className="mb-6 rounded-md bg-red-50 p-3 text-sm text-red-700">{project.lastError}</div> : null}
      <ExtractionReview projectId={project.id} status={project.status as ProjectStatus} originalPdfUrl={signedUrl} />
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><p className="break-words text-sm font-medium">{value}</p></CardContent>
    </Card>
  );
}

