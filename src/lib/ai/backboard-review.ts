import "server-only";

import { AI_REVIEW_SYSTEM_PROMPT, type AiReview } from "@/types/ai";
import { validatedReview, type ReviewRequest } from "./review-contract";
import { selectFocusMarker } from "@/lib/evaluation/focus-marker";

const BACKBOARD_URL = "https://app.backboard.io/api/threads/messages";

export class ReviewUnavailableError extends Error {
  constructor(message = "Backboard review is unavailable.") {
    super(message);
    this.name = "ReviewUnavailableError";
  }
}

function parseModelPayload(payload: unknown, request: ReviewRequest): AiReview | null {
  const candidates: unknown[] = [payload];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.content === "string") candidates.push(record.content);
    const message = record.message;
    if (message && typeof message === "object" && typeof (message as { content?: unknown }).content === "string") {
      candidates.push((message as { content: string }).content);
    }
    if (Array.isArray(record.choices)) {
      const content = (record.choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
      if (typeof content === "string") candidates.push(content);
    }
  }
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? safeJson(candidate) : candidate;
    const parsed = validatedReview(value, request);
    if (parsed) return parsed;
  }
  return null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * One non-streaming Backboard call. Memory and web search stay off.
 * Throws {@link ReviewUnavailableError} for missing config, timeout, or a bad payload.
 * Callers must keep the deterministic review; this function does not score motion.
 */
export async function requestBackboardReview(
  request: ReviewRequest,
  deps: { fetchFn?: typeof fetch; env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): Promise<AiReview> {
  const env = deps.env ?? process.env;
  const apiKey = env.BACKBOARD_API_KEY?.trim();
  const provider = env.BACKBOARD_MODEL_PROVIDER?.trim() || "google";
  const model = env.BACKBOARD_MODEL_NAME?.trim() || "gemini-2.5-flash";
  if (!apiKey) throw new ReviewUnavailableError("Backboard is not configured.");

  const fetchFn = deps.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(BACKBOARD_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        llm_provider: provider,
        model_name: model,
        stream: false,
        memory: "off",
        web_search: "off",
        json_output: true,
        system_prompt: `${AI_REVIEW_SYSTEM_PROMPT}\nReturn an object with summary (string), strengths (1-3 strings), improvements (1-3 strings), largestDifference ({segmentId, explanation}), replayNarration (string). Explain the supplied focus marker in largestDifference and replayNarration. Use only supplied measurements and never invent numbers. If there is no focus marker, explain the weakest metric without inventing a moment.`,
        content: JSON.stringify({ measurements: request, focusMarker: selectFocusMarker(request.worstMoments) }),
      }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 8_000),
    });
  } catch {
    throw new ReviewUnavailableError("Backboard did not respond.");
  }
  if (!response.ok) throw new ReviewUnavailableError("Backboard rejected the review request.");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ReviewUnavailableError("Backboard returned invalid JSON.");
  }
  if (payload && typeof payload === "object" && "status" in payload
    && payload.status !== "COMPLETED") throw new ReviewUnavailableError("Backboard did not complete the review.");
  const review = parseModelPayload(payload, request);
  if (!review) throw new ReviewUnavailableError("Backboard returned an unexpected review.");
  return review;
}
