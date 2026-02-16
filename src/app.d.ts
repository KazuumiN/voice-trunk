/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        R2_RAW_AUDIO: R2Bucket;
        R2_ARTIFACTS: R2Bucket;
        UPLOAD_QUEUE: Queue;
        RECORDING_PIPELINE: Workflow;
        CF_ACCESS_TEAM_DOMAIN: string;
        CF_ACCESS_AUD: string;
        GEMINI_API_KEY: string;
        R2_ACCOUNT_ID: string;
        R2_ACCESS_KEY_ID: string;
        R2_SECRET_ACCESS_KEY: string;
        ENVIRONMENT: string;
        DEFAULT_GEMINI_MODEL: string;
        GEMINI_MAX_CONCURRENT: string;
      };
      context: {
        waitUntil(promise: Promise<unknown>): void;
      };
    }
    interface Locals {
      orgId: string;
      userId?: string;
      email?: string;
      actorType: "user" | "service_token";
    }
  }
}

export {};
