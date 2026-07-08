import { Types } from "mongoose";
import { ProjectModel } from "@/server/models/project";
import { ProcessingJobModel } from "@/server/models/processing-job";
import type { ProjectStatus } from "@/lib/project-status";

export type ProjectListParams = { ownerId: string; search?: string; status?: ProjectStatus | "ALL"; page?: number; pageSize?: number };
type LeanProject = Record<string, unknown> & { _id: unknown };
type LeanJob = Record<string, unknown> & { _id: unknown };

export async function listProjects(params: ProjectListParams) {
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 8, 1), 50);
  const filter: Record<string, unknown> = { ownerId: new Types.ObjectId(params.ownerId) };
  if (params.search) filter.name = { $regex: params.search, $options: "i" };
  if (params.status && params.status !== "ALL") filter.status = params.status;
  const [items, total] = await Promise.all([ProjectModel.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean<LeanProject[]>(), ProjectModel.countDocuments(filter)]);
  return { items: items.map(serializeProject), total, page, pageSize, pageCount: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function getProjectForOwner(projectId: string, ownerId: string) {
  if (!Types.ObjectId.isValid(projectId)) return null;
  const project = await ProjectModel.findOne({ _id: projectId, ownerId: new Types.ObjectId(ownerId) }).lean<LeanProject>();
  if (!project) return null;
  const job = await ProcessingJobModel.findOne({ projectId: project._id }).lean<LeanJob>();
  return { project: serializeProject(project), job: job ? serializeJob(job) : null };
}

export function serializeProject(project: Record<string, unknown>) {
  return { id: String(project._id), ownerId: String(project.ownerId), name: String(project.name), description: String(project.description ?? ""), status: String(project.status), originalPdf: project.originalPdf, extractionProgress: Number(project.extractionProgress ?? 0), lastError: project.lastError ? String(project.lastError) : null, createdAt: new Date(project.createdAt as Date).toISOString(), updatedAt: new Date(project.updatedAt as Date).toISOString() };
}

export function serializeJob(job: Record<string, unknown>) {
  return { id: String(job._id), projectId: String(job.projectId), queueName: String(job.queueName), bullJobId: job.bullJobId ? String(job.bullJobId) : null, status: String(job.status), progress: Number(job.progress ?? 0), errorSummary: job.errorSummary ? String(job.errorSummary) : null, attempts: Number(job.attempts ?? 0), createdAt: new Date(job.createdAt as Date).toISOString(), updatedAt: new Date(job.updatedAt as Date).toISOString() };
}