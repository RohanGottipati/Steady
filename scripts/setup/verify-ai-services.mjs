#!/usr/bin/env node
/**
 * Setup smoke check for Backboard + ElevenLabs (server keys only).
 * Usage: npm run verify:ai
 *
 * Verifies:
 * - Backboard catalog contains the configured Google Gemini model
 * - ElevenLabs accepts the configured voice + TTS model for a short clip
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const ENV_PATH = resolve(ROOT, ".env.local");

function loadEnvLocal(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Restore the tracked .env.local and unlock git-crypt; see docs/GIT_CRYPT.md.`);
  }
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function requireEnv(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is empty in .env.local`);
  return value;
}

async function verifyBackboard(env) {
  const apiKey = requireEnv(env, "BACKBOARD_API_KEY");
  const provider = requireEnv(env, "BACKBOARD_MODEL_PROVIDER");
  const modelName = requireEnv(env, "BACKBOARD_MODEL_NAME");

  const url = new URL("https://app.backboard.io/api/models");
  url.searchParams.set("provider", provider);
  url.searchParams.set("model_type", "llm");
  url.searchParams.set("limit", "100");

  const listRes = await fetch(url, {
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
  });
  if (!listRes.ok) {
    throw new Error(`Backboard list models failed: HTTP ${listRes.status}`);
  }
  const listJson = await listRes.json();
  const models = listJson.models ?? [];
  const match = models.find((m) => m.name === modelName && m.provider === provider);
  if (!match) {
    const names = models.map((m) => m.name).filter((n) => String(n).includes("flash"));
    throw new Error(
      `Backboard model "${modelName}" (provider=${provider}) not found. Flash candidates: ${names.join(", ") || "(none)"}`,
    );
  }

  const detailRes = await fetch(
    `https://app.backboard.io/api/models/${encodeURIComponent(modelName)}`,
    { headers: { "X-API-Key": apiKey, Accept: "application/json" } },
  );
  if (!detailRes.ok) {
    throw new Error(`Backboard get model failed: HTTP ${detailRes.status}`);
  }
  const detail = await detailRes.json();

  return {
    name: detail.name ?? match.name,
    provider: detail.provider ?? match.provider,
    supports_json_output: detail.supports_json_output ?? match.supports_json_output,
    context_limit: detail.context_limit ?? match.context_limit,
  };
}

async function verifyElevenLabs(env) {
  const apiKey = requireEnv(env, "ELEVENLABS_API_KEY");
  const voiceId = requireEnv(env, "ELEVENLABS_VOICE_ID");
  const ttsModel = requireEnv(env, "ELEVENLABS_TTS_MODEL");

  const voicesRes = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
  });
  if (!voicesRes.ok) {
    throw new Error(`ElevenLabs list voices failed: HTTP ${voicesRes.status}`);
  }
  const voicesJson = await voicesRes.json();
  const voice = (voicesJson.voices ?? []).find((v) => v.voice_id === voiceId);
  if (!voice) {
    throw new Error(`ElevenLabs voice id "${voiceId}" not found for this API key`);
  }

  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: "Path deviation detected. Return toward the highlighted path.",
        model_id: ttsModel,
      }),
    },
  );
  if (!ttsRes.ok) {
    const body = await ttsRes.text();
    throw new Error(`ElevenLabs TTS failed: HTTP ${ttsRes.status} ${body.slice(0, 300)}`);
  }
  const audio = Buffer.from(await ttsRes.arrayBuffer());
  if (audio.byteLength < 1000) {
    throw new Error(`ElevenLabs TTS returned unexpectedly small audio (${audio.byteLength} bytes)`);
  }

  return {
    voice_id: voiceId,
    voice_name: voice.name,
    tts_model: ttsModel,
    audio_bytes: audio.byteLength,
  };
}

async function main() {
  const env = loadEnvLocal(ENV_PATH);
  console.log("Verifying Backboard…");
  const backboard = await verifyBackboard(env);
  console.log("  OK", backboard);

  console.log("Verifying ElevenLabs…");
  const eleven = await verifyElevenLabs(env);
  console.log("  OK", eleven);

  console.log("\nAll AI service checks passed.");
  console.log("Update docs/CONTEXT.md external service flags if this is a first-time setup.");
}

main().catch((err) => {
  console.error("\nAI service verification failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
