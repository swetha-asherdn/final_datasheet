import { NextResponse } from "next/server";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/project-status";
import { AppError, errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { listProjects } from "@/server/repositories/projects";
import { createProjectWithUpload } from "@/server/services/project-service";
export async function GET(request: Request) { try { const user = await requireUser(); await connectToDatabase(); const url = new URL(request.url); const statusParam = url.searchParams.get("status"); const status = PROJECT_STATUSES.includes(statusParam as ProjectStatus) ? (statusParam as ProjectStatus) : "ALL"; return NextResponse.json(await listProjects({ ownerId: user.id, search: url.searchParams.get("q") ?? undefined, status, page: Number(url.searchParams.get("page") ?? 1) })); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) { try { const user = await requireUser(); const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) throw new AppError("PDF file is required", 422); const project = await createProjectWithUpload({ ownerId: user.id, name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), file }); return NextResponse.json({ id: String(project._id) }, { status: 201 }); } catch (error) { return errorResponse(error); } }
