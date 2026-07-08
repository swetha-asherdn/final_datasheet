import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { connectToDatabase } from "@/server/db";
import { retryProjectJob } from "@/server/services/project-service";
export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) { try { const { projectId } = await params; const user = await requireUser(); await connectToDatabase(); await retryProjectJob(projectId, user.id); return NextResponse.json({ ok: true }); } catch (error) { return errorResponse(error); } }
