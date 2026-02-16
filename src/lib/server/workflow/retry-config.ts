import type { WorkflowStepName } from "../../types/index.js";

type DurationLabel = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";
type SleepDuration = `${number} ${DurationLabel}${"s" | ""}` | number;

export interface StepRetryConfig {
  retries: { limit: number; delay: SleepDuration; backoff: "constant" | "exponential" | "linear" };
  timeout: SleepDuration;
}

export const RETRY_CONFIG: Record<WorkflowStepName, StepRetryConfig> = {
  load_metadata: {
    retries: { limit: 3, delay: "2 seconds", backoff: "constant" },
    timeout: "10 seconds",
  },
  ensure_audio_access: {
    retries: { limit: 3, delay: "5 seconds", backoff: "constant" },
    timeout: "30 seconds",
  },
  maybe_split_audio: {
    retries: { limit: 2, delay: "30 seconds", backoff: "exponential" },
    timeout: "30 minutes",
  },
  transcribe_chunks: {
    retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
    timeout: "10 minutes",
  },
  merge_transcripts: {
    retries: { limit: 3, delay: "2 seconds", backoff: "constant" },
    timeout: "60 seconds",
  },
  summarize: {
    retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
    timeout: "5 minutes",
  },
  claims_extract: {
    retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
    timeout: "5 minutes",
  },
  grouping: {
    retries: { limit: 3, delay: "2 seconds", backoff: "constant" },
    timeout: "30 seconds",
  },
  index_for_search: {
    retries: { limit: 3, delay: "2 seconds", backoff: "constant" },
    timeout: "60 seconds",
  },
  notify: {
    retries: { limit: 3, delay: "5 seconds", backoff: "constant" },
    timeout: "30 seconds",
  },
  finalize: {
    retries: { limit: 3, delay: "2 seconds", backoff: "constant" },
    timeout: "10 seconds",
  },
};
