import { Queue, type ConnectionOptions } from "bullmq";
import { env } from "@/lib/env";

export const EXTRACT_PDF_QUEUE = "extract-pdf";
let queue: Queue | null = null;

export type ExtractPdfJobData = { projectId: string; ownerId: string; storageKey: string };

export function getRedisConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL);
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined, password: url.password || undefined };
}

export function getExtractPdfQueue() {
  queue ??= new Queue<ExtractPdfJobData>(EXTRACT_PDF_QUEUE, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7 }
    }
  });
  return queue;
}
