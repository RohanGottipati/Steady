#!/usr/bin/env node
/**
 * Pre-generate the common coaching voice clips (plan §14.3 / B7) with ElevenLabs
 * and write them to public/audio/coach/<type>.mp3 so the live trainer can play
 * them instantly from local assets (no per-play API latency, offline-safe).
 *
 * Usage:
 *   npm run audio:coach            # generate missing clips
 *   npm run audio:coach -- --force # regenerate all clips
 *   npm run audio:coach -- --dry-run
 *
 * Server key only: ELEVENLABS_* are read from .env.local and never shipped to
 * the browser. Requires Node >= 22.6 (runs with --experimental-strip-types so
 * the TypeScript clip manifest can be imported directly).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ENV_PATH = resolve(ROOT, ".env.local");
const OUT_DIR = resolve(ROOT, "public/audio/coach");

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const DRY_RUN = args.has("--dry-run");

function loadEnvLocal(path) {
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}. Restore the tracked .env.local and unlock git-crypt; see docs/GIT_CRYPT.md.`,
    );
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

async function synthesize(env, text) {
  const apiKey = requireEnv(env, "ELEVENLABS_API_KEY");
  const voiceId = requireEnv(env, "ELEVENLABS_VOICE_ID");
  const model = env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_flash_v2_5";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
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
    const body = await res.text();
    throw new Error(`ElevenLabs TTS failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.byteLength < 1000) {
    throw new Error(`Unexpectedly small audio for "${text}" (${audio.byteLength} bytes)`);
  }
  return audio;
}

async function main() {
  const { COACH_CLIPS } = await import("../../src/lib/voice/coach-clips.ts");

  mkdirSync(OUT_DIR, { recursive: true });
  const env = DRY_RUN ? {} : loadEnvLocal(ENV_PATH);

  let generated = 0;
  let skipped = 0;
  for (const clip of COACH_CLIPS) {
    const outPath = resolve(OUT_DIR, clip.file);
    const exists = existsSync(outPath);
    if (exists && !FORCE) {
      console.log(`  skip  ${clip.file} (exists)`);
      skipped += 1;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  plan  ${clip.file}  "${clip.text}"`);
      generated += 1;
      continue;
    }
    const audio = await synthesize(env, clip.text);
    writeFileSync(outPath, audio);
    console.log(`  write ${clip.file}  (${statSync(outPath).size} bytes)  "${clip.text}"`);
    generated += 1;
  }

  console.log(
    `\n${DRY_RUN ? "[dry-run] " : ""}coach clips: ${generated} ${
      DRY_RUN ? "planned" : "generated"
    }, ${skipped} skipped. Output: public/audio/coach/`,
  );
}

main().catch((err) => {
  console.error("\nCoach clip generation failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
