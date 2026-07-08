import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiError = {
  message: string;
  code: string;
  details?: Record<string, unknown>;
};

export type ApiErrorResponse = {
  error: ApiError;
};

type AppErrorOptions = {
  code?: string;
  details?: Record<string, unknown>;
};

export class AppError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, public readonly statusCode = 400, options: AppErrorOptions = {}) {
    super(message);
    this.name = "AppError";
    this.code = options.code ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "APP_ERROR");
    this.details = options.details;
  }
}

function createErrorResponse(message: string, code: string, details?: Record<string, unknown>): ApiErrorResponse {
  return { error: { message, code, ...(details ? { details } : {}) } };
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(createErrorResponse(error.message, error.code, error.details), {
      status: error.statusCode
    });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      createErrorResponse("Invalid request", "VALIDATION_ERROR", {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code
        }))
      }),
      { status: 422 }
    );
  }

  console.error(error);
  return NextResponse.json(createErrorResponse("Unexpected server error", "INTERNAL_ERROR"), { status: 500 });
}
