export const PROJECT_STATUSES = ["DRAFT", "UPLOADED", "QUEUED", "PROCESSING", "REVIEW_REQUIRED", "COMPLETED", "FAILED", "EXPORTED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const allowedTransitions: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ["UPLOADED", "FAILED"],
  UPLOADED: ["QUEUED", "FAILED"],
  QUEUED: ["PROCESSING", "FAILED"],
  PROCESSING: ["REVIEW_REQUIRED", "FAILED"],
  REVIEW_REQUIRED: ["PROCESSING", "COMPLETED", "FAILED"],
  COMPLETED: ["EXPORTED"],
  FAILED: ["QUEUED"],
  EXPORTED: []
};

export function canTransitionProjectStatus(from: ProjectStatus, to: ProjectStatus) {
  return from === to || allowedTransitions[from].includes(to);
}

export function assertProjectStatusTransition(from: ProjectStatus, to: ProjectStatus) {
  if (!canTransitionProjectStatus(from, to)) throw new Error(`Invalid project status transition from ${from} to ${to}`);
}
