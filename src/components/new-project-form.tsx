"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/lib/utils";

const maxBytes = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024);

type UploadErrorBody = {
  error?: string | { message?: string };
};

export function NewProjectForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    setError(null);
    const nextFile = accepted[0];
    if (!nextFile) return;

    if (!nextFile.name.toLowerCase().endsWith(".pdf") || nextFile.type !== "application/pdf") {
      setError("Choose a PDF file with the application/pdf MIME type.");
      return;
    }

    if (nextFile.size > maxBytes) {
      setError(`File must be ${formatBytes(maxBytes)} or smaller.`);
      return;
    }

    setFile(nextFile);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    multiple: false
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError("Add a PDF file before creating the project.");
      return;
    }

    const form = new FormData(event.currentTarget);
    form.set("file", file);
    setUploading(true);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/projects");
    xhr.upload.onprogress = (uploadEvent) => {
      if (uploadEvent.lengthComputable) {
        setProgress(Math.round((uploadEvent.loaded / uploadEvent.total) * 100));
      }
    };
    xhr.onload = () => {
      setUploading(false);

      const body = parseResponseBody(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        router.push(`/projects/${body.id}`);
        router.refresh();
        return;
      }

      setError(getUploadErrorMessage(body));
    };
    xhr.onerror = () => {
      setUploading(false);
      setError("Network error while uploading PDF.");
    };
    xhr.send(form);
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form className="space-y-6" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name">Project name</Label>
            <Input id="name" name="name" required maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" maxLength={1000} />
          </div>
          <div
            {...getRootProps()}
            className={`cursor-pointer rounded-lg border border-dashed p-8 text-center transition ${
              isDragActive ? "border-primary bg-teal-50" : "border-border bg-secondary/40"
            }`}
          >
            <input {...getInputProps()} />
            <UploadCloud className="mx-auto text-primary" size={36} />
            <p className="mt-3 font-medium">{file ? file.name : "Drag a PDF here, or click to browse"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {file ? formatBytes(file.size) : `PDF only, up to ${formatBytes(maxBytes)}`}
            </p>
          </div>
          {progress > 0 ? (
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <Button disabled={uploading}>{uploading ? "Uploading..." : "Create project"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function parseResponseBody(responseText: string): { id?: string; error?: UploadErrorBody["error"] } {
  try {
    return JSON.parse(responseText || "{}") as { id?: string; error?: UploadErrorBody["error"] };
  } catch {
    return {};
  }
}

function getUploadErrorMessage(body: UploadErrorBody & { id?: string }) {
  if (typeof body.error === "string") return body.error;
  if (body.error?.message) return body.error.message;
  return "Upload failed";
}
