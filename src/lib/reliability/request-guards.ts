import type { RateLimiter } from "@/lib/voice/rate-limit";

/** Uses the same trusted proxy headers as the speech route. Limits are per instance. */
export function rateLimitRequest(request: Request, limiter: RateLimiter): Response | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip")?.trim() || "unknown";
  const gate = limiter.check(ip);
  return gate.allowed ? null : Response.json({ error: "rate limited" }, {
    status: 429,
    headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) },
  });
}

export class RequestBodyError extends Error {
  constructor(readonly status: 400 | 413) {
    super(status === 413 ? "request body too large" : "invalid JSON body");
  }
}

/** Bound bytes before JSON parsing, including chunked bodies without Content-Length. */
export async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) {
    void request.body?.cancel().catch(() => {});
    throw new RequestBodyError(413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError(400);
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new RequestBodyError(413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    throw error instanceof RequestBodyError ? error : new RequestBodyError(400);
  } finally {
    reader.releaseLock();
  }
}
