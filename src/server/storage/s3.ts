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

export async function ensureBucket() {
  const s3 = getS3Client();
  try { await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET })); } catch { await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET })); }
}

export async function uploadPrivateObject(params: { key: string; body: Buffer; contentType: string; metadata?: Record<string, string> }) {
  await ensureBucket();
  await getS3Client().send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: params.key, Body: params.body, ContentType: params.contentType, Metadata: params.metadata }));
}

export async function getPrivateObject(key: string): Promise<PrivateObject> {
  try {
    const response = await getS3Client().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return {
      body: toWebStream(response.Body),
      contentType: response.ContentType ?? null,
      contentLength: typeof response.ContentLength === "number" ? response.ContentLength : undefined
    };
  } catch (error) {
    if (isMissingObjectError(error)) {
      throw new AppError("Artifact not found", 404, { code: "ARTIFACT_NOT_FOUND" });
    }

    throw error;
  }
}

export async function createSignedReadUrl(key: string, expiresIn = 300) {
  return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn });
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
