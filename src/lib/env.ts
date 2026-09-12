import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NEXTAUTH_SECRET: z.string().min(1),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/pdf_extractor"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1).default("minioadmin"),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default("minioadmin"),
  S3_BUCKET: z.string().min(1).default("pdf-projects"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
  PYTHON_WORKER_URL: z.string().url().default("http://localhost:8000"),
  EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
  OCR_LANGUAGES: z.string().min(1).default("eng")
});

export const env = envSchema.parse(process.env);
