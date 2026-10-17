import { speechRequestSchema } from "@/lib/voice/speech-contract";
import { createRateLimiter, type RateLimiter } from "@/lib/voice/rate-limit";
import {
  synthesizeSpeech,
  SpeechConfigError,
  SpeechUpstreamError,
} from "@/lib/voice/tts-server";

// One-off clips are not cached: this POST reads the request body and has no
// `use cache`. `cacheComponents` rejects the old `dynamic = "force-dynamic"`
// segment config, and that compile error covers the replay with the dev overlay.

// Lazily built so tests can change env then reset (see __resetSpeechRateLimitForTests).
let limiter: RateLimiter | null = null;
function getLimiter(): RateLimiter {
  if (!limiter) {
    limiter = createRateLimiter({
      limit: Number(process.env.SPEECH_RATE_LIMIT ?? 20),
      windowMs: Number(process.env.SPEECH_RATE_WINDOW_MS ?? 60_000),
    });
  }
  return limiter;
}

/** Test-only: drop the limiter so the next request rebuilds it from current env. */
export function __resetSpeechRateLimitForTests(): void {
  limiter = null;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * POST /api/speech — dynamic ElevenLabs TTS for rare/one-off coaching phrases
 * and the final review narration (plan §15.3). The API key stays server-side;
 * the browser receives only `audio/mpeg` bytes.
 *
 * Public-deploy hardening (PR #11 review): the route is a no-op (503) unless
 * `SPEECH_ENABLED=true`, and is per-IP rate limited. A 503/429 here is safe —
 * the client falls back to the pre-generated clips and browser speech.
 */
export async function handleSpeechRequest(request: Request): Promise<Response> {
  if (process.env.SPEECH_ENABLED !== "true") {
    return Response.json({ error: "speech disabled" }, { status: 503 });
  }

  const gate = getLimiter().check(clientIp(request));
  if (!gate.allowed) {
    return Response.json(
      { error: "rate limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) },
      },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = speechRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { audio, contentType } = await synthesizeSpeech(parsed.data.text);
    return new Response(audio, {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof SpeechConfigError) {
      return Response.json({ error: "voice service unavailable" }, { status: 503 });
    }
    if (err instanceof SpeechUpstreamError) {
      return Response.json({ error: "speech synthesis failed" }, { status: 502 });
    }
    return Response.json({ error: "unexpected speech error" }, { status: 500 });
  }
}
