import { handleQueue } from "./queue-consumer.js";
import { RecordingPipelineWorkflow } from "./workflows/recording-pipeline.js";
import type { Env } from "../lib/types/env.js";

export { RecordingPipelineWorkflow };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // SvelteKit's adapter-cloudflare generates _worker.js as the main entry.
    // This fetch handler is a placeholder for non-SvelteKit routes if needed.
    // In production, wrangler.toml main points to .svelte-kit/cloudflare/_worker.js.
    return new Response("Not Found", { status: 404 });
  },

  async queue(
    batch: MessageBatch<unknown>,
    env: Env,
  ): Promise<void> {
    await handleQueue(batch as MessageBatch<import("./queue-consumer.js").R2EventMessage>, env);
  },
};
