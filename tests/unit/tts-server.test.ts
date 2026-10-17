import { describe, it, expect, vi } from "vitest";
import {
  synthesizeSpeech,
  SpeechConfigError,
  SpeechUpstreamError,
} from "@/lib/voice/tts-server";

const fullEnv = {
  ELEVENLABS_API_KEY: "secret-key-123",
  ELEVENLABS_VOICE_ID: "voice-abc",
  ELEVENLABS_TTS_MODEL: "eleven_flash_v2_5",
};

function audioResponse() {
  const bytes = new Uint8Array(2048).fill(7);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer,
  };
}

describe("synthesizeSpeech", () => {
  it("throws SpeechConfigError when the API key is not configured", async () => {
    const fetchFn = vi.fn();
    await expect(
      synthesizeSpeech("Slow down.", {
        fetchFn: fetchFn as unknown as typeof fetch,
        env: { ...fullEnv, ELEVENLABS_API_KEY: "" },
      }),
    ).rejects.toBeInstanceOf(SpeechConfigError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("calls ElevenLabs with the server key and returns mp3 audio", async () => {
    const fetchFn = vi.fn(async () => audioResponse());
    const result = await synthesizeSpeech("Slow down.", {
      fetchFn: fetchFn as unknown as typeof fetch,
      env: fullEnv,
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice-abc");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("secret-key-123");
    const body = JSON.parse(init.body as string);
    expect(body.text).toBe("Slow down.");
    expect(body.model_id).toBe("eleven_flash_v2_5");

    expect(result.contentType).toBe("audio/mpeg");
    expect(result.audio.byteLength).toBe(2048);
  });

  it("throws SpeechUpstreamError on a non-ok ElevenLabs response", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => "rate limited",
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    await expect(
      synthesizeSpeech("Slow down.", {
        fetchFn: fetchFn as unknown as typeof fetch,
        env: fullEnv,
      }),
    ).rejects.toBeInstanceOf(SpeechUpstreamError);
  });
});
