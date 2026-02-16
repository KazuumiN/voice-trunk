import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  TranscriptSegment,
  SummaryJson,
  ClaimsJson,
} from "../../types/index.js";
import {
  TRANSCRIPTION_PROMPT,
  SUMMARY_PROMPT,
  CLAIMS_PROMPT,
} from "./prompts.js";

/** Thrown when Gemini returns a 429 / RESOURCE_EXHAUSTED response. */
export class GeminiRateLimitError extends Error {
  retryAfterMs: number;
  constructor(context: string, retryAfterMs: number, cause?: unknown) {
    super(
      `Gemini API rate limited during ${context}. Suggested retry after ${retryAfterMs}ms.`,
    );
    this.name = "GeminiRateLimitError";
    this.retryAfterMs = retryAfterMs;
    if (cause) this.cause = cause;
  }
}

export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  /**
   * Transcribe audio from a presigned URL.
   * Sends the URL as a file input to Gemini.
   */
  async transcribe(
    audioUrl: string,
    mimeType: string,
  ): Promise<{ segments: TranscriptSegment[]; language: string }> {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = await this.callWithRateLimitHandling(
      () =>
        model
          .generateContent([
            TRANSCRIPTION_PROMPT,
            {
              fileData: {
                fileUri: audioUrl,
                mimeType,
              },
            },
          ])
          .then((r) => r.response.text()),
      "transcription",
    );

    const parsed = safeParseJson(text, "transcription");

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Gemini transcription response is not an object");
    }
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.segments)) {
      throw new Error(
        `Gemini transcription response missing "segments" array. ` +
          `Keys: ${Object.keys(obj).join(", ")}`,
      );
    }

    return {
      segments: obj.segments as TranscriptSegment[],
      language: typeof obj.language === "string" ? obj.language : "ja",
    };
  }

  /**
   * Summarize a transcript text.
   */
  async summarize(
    transcriptText: string,
  ): Promise<Omit<SummaryJson, "recordingId" | "runId">> {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = await this.callWithRateLimitHandling(
      () =>
        model
          .generateContent(SUMMARY_PROMPT + transcriptText)
          .then((r) => r.response.text()),
      "summarization",
    );

    const parsed = safeParseJson(text, "summarization");

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Gemini summarization response is not an object");
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.shortSummary !== "string") {
      throw new Error(
        `Gemini summarization response missing "shortSummary". ` +
          `Keys: ${Object.keys(obj).join(", ")}`,
      );
    }
    if (typeof obj.longSummary !== "string") {
      throw new Error(
        `Gemini summarization response missing "longSummary". ` +
          `Keys: ${Object.keys(obj).join(", ")}`,
      );
    }

    return {
      shortSummary: obj.shortSummary,
      longSummary: obj.longSummary,
      keyPoints: Array.isArray(obj.keyPoints) ? obj.keyPoints : [],
      decisions: Array.isArray(obj.decisions) ? obj.decisions : [],
      openItems: Array.isArray(obj.openItems) ? obj.openItems : [],
    };
  }

  /**
   * Extract claims from transcript text.
   */
  async extractClaims(transcriptText: string): Promise<ClaimsJson> {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = await this.callWithRateLimitHandling(
      () =>
        model
          .generateContent(CLAIMS_PROMPT + transcriptText)
          .then((r) => r.response.text()),
      "claims extraction",
    );

    const parsed = safeParseJson(text, "claims extraction");

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Gemini claims response is not an object");
    }
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.claims)) {
      throw new Error(
        `Gemini claims response missing "claims" array. ` +
          `Keys: ${Object.keys(obj).join(", ")}`,
      );
    }

    return { claims: obj.claims } as ClaimsJson;
  }

  /**
   * Wraps a Gemini API call to detect 429 rate limit errors.
   * On rate limit: waits before rethrowing so the workflow retry has a better chance.
   */
  private async callWithRateLimitHandling<T>(
    fn: () => Promise<T>,
    context: string,
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isRateLimitError(err)) {
        const waitMs = extractRetryAfterMs(err) || 30_000;
        console.warn(
          `[gemini] Rate limited during ${context}, waiting ${waitMs}ms before retry`,
        );
        await sleep(waitMs);
        throw new GeminiRateLimitError(context, waitMs, err);
      }
      throw err;
    }
  }
}

function safeParseJson(text: string, context: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Failed to parse Gemini ${context} response as JSON. ` +
        `Response (first 200 chars): ${text.slice(0, 200)}`,
    );
  }
}

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Check for status property (GoogleGenerativeAIFetchError)
  if ("status" in err && (err as { status: unknown }).status === 429)
    return true;
  // Check error message patterns
  const msg = err.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit")
  );
}

function extractRetryAfterMs(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  // Some error objects carry errorDetails with retryDelay
  if ("errorDetails" in err) {
    const details = (err as { errorDetails: unknown[] }).errorDetails;
    if (Array.isArray(details)) {
      for (const d of details) {
        if (
          d &&
          typeof d === "object" &&
          "retryDelay" in (d as Record<string, unknown>)
        ) {
          const delay = (d as { retryDelay: string }).retryDelay;
          const match = delay?.match?.(/(\d+)s/);
          if (match) return parseInt(match[1], 10) * 1000;
        }
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
