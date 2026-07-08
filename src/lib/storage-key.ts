export function sanitizeFileName(fileName: string) {
  return fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function buildOriginalPdfKey(userId: string, projectId: string, originalFileName: string) {
  return `users/${userId}/projects/${projectId}/original/${sanitizeFileName(originalFileName)}`;
}

export function buildPreviewKey(ownerId: string, projectId: string, pageNumber: number) {
  return `users/${ownerId}/projects/${projectId}/previews/page-${pageNumber}.jpg`;
}

export function buildExtractedImageKey(ownerId: string, projectId: string, pageNumber: number, imageId: string) {
  return `users/${ownerId}/projects/${projectId}/extracted/images/page-${pageNumber}/${sanitizeFileName(imageId)}.png`;
}
