import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { synthesizeSpeech } = vi.hoisted(() => ({ synthesizeSpeech: vi.fn() }));

vi.mock("@/lib/voice/tts-server", () => {
  class SpeechConfigError extends Error {}
  class SpeechUpstreamError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return { synthesizeSpeech, SpeechConfigError, SpeechUpstreamError };
});

import { POST } from "@/app/api/speech/route";
import { __resetSpeechRateLimitForTests } from "@/lib/voice/speech-handler";
import { SpeechConfigError, SpeechUpstreamError } from "@/lib/voice/tts-server";

function req(body: unknown, ip = "1.1.1.1"): Request {
  return new Request("http://localhost/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  synthesizeSpeech.mockReset();
  vi.stubEnv("SPEECH_ENABLED", "true");
  vi.stubEnv("SPEECH_RATE_LIMIT", "20");
  vi.stubEnv("SPEECH_RATE_WINDOW_MS", "60000");
  __resetSpeechRateLimitForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/speech", () => {
  it("returns 400 and does not call TTS for invalid text", async () => {
    const res = await POST(req({ text: "   " }));
    expect(res.status).toBe(400);
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await POST(req("not json"));
    expect(res.status).toBe(400);
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("streams mp3 audio for a valid request without leaking the API key", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    synthesizeSpeech.mockResolvedValue({ audio: bytes, contentType: "audio/mpeg" });

    const res = await POST(req({ text: "Slow down." }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(synthesizeSpeech).toHaveBeenCalledWith("Slow down.");

    const buf = new Uint8Array(await res.arrayBuffer());
    expect([...buf]).toEqual([1, 2, 3, 4]);
    // Response carries only audio bytes — no JSON envelope that could carry a key.
    expect(res.headers.get("xi-api-key")).toBeNull();
  });

  it("returns 503 when the voice service is not configured", async () => {
    synthesizeSpeech.mockRejectedValue(new SpeechConfigError("no key"));
    const res = await POST(req({ text: "Slow down." }));
    expect(res.status).toBe(503);
  });

  it("returns 502 when ElevenLabs fails upstream", async () => {
    synthesizeSpeech.mockRejectedValue(new SpeechUpstreamError("boom", 429));
    const res = await POST(req({ text: "Slow down." }));
    expect(res.status).toBe(502);
  });

  it("returns 503 and does not call TTS when SPEECH_ENABLED is not 'true'", async () => {
    vi.stubEnv("SPEECH_ENABLED", "false");
    const res = await POST(req({ text: "Slow down." }));
    expect(res.status).toBe(503);
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("rate-limits per client IP once the window cap is exceeded", async () => {
    vi.stubEnv("SPEECH_RATE_LIMIT", "2");
    __resetSpeechRateLimitForTests();
    synthesizeSpeech.mockResolvedValue({
      audio: new Uint8Array([1]).buffer,
      contentType: "audio/mpeg",
    });

    expect((await POST(req({ text: "a" }, "9.9.9.9"))).status).toBe(200);
    expect((await POST(req({ text: "a" }, "9.9.9.9"))).status).toBe(200);
    const limited = await POST(req({ text: "a" }, "9.9.9.9"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
    // A different IP is unaffected.
    expect((await POST(req({ text: "a" }, "8.8.8.8"))).status).toBe(200);
  });
});
