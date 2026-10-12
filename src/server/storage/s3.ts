import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

let client: S3Client | null = null;

export type PrivateObject = {
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
  contentLength?: number;
};

export function getS3Client() {
  client ??= new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: env.S3_FORCE_PATH_STYLE, credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } });
  return client;
}

export function isStorageConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;
  const code = String(err.code || "");
  const message = String(err.message || "");
  const name = String(err.name || "");
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    code === "ETIMEDOUT" ||
    message.includes("ECONNREFUSED") ||
    message.includes("connect ECONNREFUSED") ||
    message.includes("fetch failed") ||
    name === "TimeoutError" ||
    name === "ConnectTimeoutError"
  );
}

export function wrapStorageError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (isStorageConnectionError(error)) {
    throw new AppError(
      `Storage service is unavailable at ${env.S3_ENDPOINT}. Please ensure MinIO/S3 is running and reachable.`,
      503,
      { code: "STORAGE_SERVICE_UNAVAILABLE" }
    );
  }
  throw error;
}

type S3Sendable = {
  send: <T = unknown>(command: unknown) => Promise<T>;
};

export async function ensureBucket() {
  const s3 = getS3Client() as unknown as S3Sendable;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch (error) {
    if (isStorageConnectionError(error)) {
      wrapStorageError(error);
    }
    try {
      await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    } catch (createError) {
      if (isStorageConnectionError(createError)) {
        wrapStorageError(createError);
      }
      const errName = (createError as { name?: string })?.name;
      if (errName === "BucketAlreadyOwnedByYou" || errName === "BucketAlreadyExists") {
        return;
      }
      throw createError;
    }
  }
}

export async function uploadPrivateObject(params: { key: string; body: Buffer; contentType: string; metadata?: Record<string, string> }) {
  try {
    await ensureBucket();
    const s3 = getS3Client() as unknown as S3Sendable;
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: params.key, Body: params.body, ContentType: params.contentType, Metadata: params.metadata }));
  } catch (error) {
    wrapStorageError(error);
  }
}

export async function getPrivateObject(key: string): Promise<PrivateObject> {
  try {
    const s3 = getS3Client() as unknown as S3Sendable;
    const response = await s3.send<Record<string, unknown>>(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return {
      body: toWebStream(response.Body),
      contentType: (response.ContentType as string | undefined) ?? null,
      contentLength: typeof response.ContentLength === "number" ? response.ContentLength : undefined
    };
  } catch (error) {
    if (isMissingObjectError(error)) {
      throw new AppError("Artifact not found", 404, { code: "ARTIFACT_NOT_FOUND" });
    }

    wrapStorageError(error);
  }
}

export async function createSignedReadUrl(key: string, expiresIn = 300) {
  try {
    return await getSignedUrl(getS3Client() as unknown as Parameters<typeof getSignedUrl>[0], new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn });
  } catch (error) {
    wrapStorageError(error);
  }
}

function toWebStream(body: unknown) {
  if (body instanceof ReadableStream) return body;

  if (body && typeof body === "object" && "transformToWebStream" in body) {
    const transformToWebStream = body.transformToWebStream;
    if (typeof transformToWebStream === "function") {
      return transformToWebStream.call(body) as ReadableStream<Uint8Array>;
    }
  }

  throw new AppError("Artifact stream unavailable", 500, { code: "ARTIFACT_STREAM_UNAVAILABLE" });
}

function isMissingObjectError(error: unknown) {
  if (getHttpStatusCode(error) === 404) return true;
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  const name = error.name;
  return name === "NoSuchKey" || name === "NotFound";
}

function getHttpStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("$metadata" in error)) return null;
  const metadata = error.$metadata;
  if (!metadata || typeof metadata !== "object" || !("httpStatusCode" in metadata)) return null;
  return typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : null;
}
