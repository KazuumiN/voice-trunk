/**
 * Combined worker entry point that wraps SvelteKit's generated worker
 * with Cloudflare Queue consumer and Workflow exports.
 *
 * wrangler.toml `main` should point to this file.
 */
import svelteKitWorker from "./.svelte-kit/cloudflare/_worker.js";
export { RecordingPipelineWorkflow } from "./src/worker/workflows/recording-pipeline.js";
import { handleQueue } from "./src/worker/queue-consumer.js";
import type { Env } from "./src/lib/types/env.js";

export default {
  fetch: svelteKitWorker.fetch,

  async queue(
    batch: MessageBatch<unknown>,
    env: Env,
  ): Promise<void> {
    await handleQueue(
      batch as MessageBatch<import("./src/worker/queue-consumer.js").R2EventMessage>,
      env,
    );
  },
};
