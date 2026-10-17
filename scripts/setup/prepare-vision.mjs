#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
export const MODEL_SHA256 = "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, bytes); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

export async function ensureModel(path, fetchModel = fetch) {
  try {
    if (hash(await readFile(path)) === MODEL_SHA256) return "cached";
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const response = await fetchModel(MODEL_URL, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}. Retry npm run prepare:vision when online.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== MODEL_SHA256) throw new Error("Hand model checksum mismatch; refusing to install it.");
  await atomicWrite(path, bytes);
  return "downloaded";
}

export async function prepareVision() {
  const packageRoot = dirname(fileURLToPath(import.meta.resolve("@mediapipe/tasks-vision")));
  const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const target = join(root, "public/mediapipe");
  for (const name of await readdir(join(packageRoot, "wasm"))) {
    if (!/^vision_wasm_(?:module_|nosimd_)?internal\.(?:js|wasm)$/.test(name)) continue;
    const source = await readFile(join(packageRoot, "wasm", name));
    let current;
    try { current = await readFile(join(target, "wasm", name)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!current?.equals(source)) await atomicWrite(join(target, "wasm", name), source);
  }
  const status = await ensureModel(join(target, "hand_landmarker.task"));
  await atomicWrite(join(target, "runtime.json"), JSON.stringify({ package: pkg.name, version: pkg.version, modelSha256: MODEL_SHA256 }, null, 2) + "\n");
  console.log(`Vision assets ready: MediaPipe ${pkg.version}; model ${status}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  prepareVision().catch(error => { console.error(error.message); process.exitCode = 1; });
}
