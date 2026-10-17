import "server-only";

/**
 * Server-side ElevenLabs text-to-speech (plan §15.3). Keeps the API key on the
 * server: it is only ever sent to ElevenLabs via the `xi-api-key` header and
 * never returned to or reachable by the browser. `fetchFn`/`env` are injectable
 * for tests; production uses the global `fetch` and `process.env`.
 */

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

export interface SynthesizeResult {
  audio: ArrayBuffer;
  contentType: "audio/mpeg";
}

/** Voice service is not configured (missing key/voice/model). */
export class SpeechConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeechConfigError";
  }
}

/** ElevenLabs returned a non-ok response. */
export class SpeechUpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SpeechUpstreamError";
  }
}

export interface SynthesizeDeps {
  fetchFn?: typeof fetch;
  env?: Record<string, string | undefined>;
}

export async function synthesizeSpeech(
  text: string,
  deps: SynthesizeDeps = {},
): Promise<SynthesizeResult> {
  const env = deps.env ?? process.env;
  const fetchFn = deps.fetchFn ?? fetch;

  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim();
  const model = env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_flash_v2_5";
  if (!apiKey || !voiceId) {
    throw new SpeechConfigError(
      "ElevenLabs is not configured (ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID missing).",
    );
  }

  const res = await fetchFn(
    `${ELEVENLABS_TTS_URL}/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: model }),
    },
  );

  if (!res.ok) {
    throw new SpeechUpstreamError(
      `ElevenLabs TTS failed: HTTP ${res.status}`,
      res.status,
    );
  }

  return { audio: await res.arrayBuffer(), contentType: "audio/mpeg" };
}
