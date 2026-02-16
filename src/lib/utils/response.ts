import type { ErrorCodeType } from "../constants.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCodeType | string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(error: HttpError): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
    }),
    {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function handleError(err: unknown): Response {
  if (err instanceof HttpError) {
    return errorResponse(err);
  }
  console.error("Unhandled error:", err);
  return errorResponse(
    new HttpError(500, "INTERNAL_ERROR", "An unexpected error occurred"),
  );
}
