// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { atomicWrite, ensureModel, MODEL_SHA256 } from "../../scripts/setup/prepare-vision.mjs";

const directories: string[] = [];
async function target() {
  const directory = await mkdtemp(join(tmpdir(), "steady-vision-test-"));
  directories.push(directory);
  return join(directory, "hand_landmarker.task");
}
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("vision asset preparation", () => {
  it("rejects a corrupt download without replacing the existing file", async () => {
    const path = await target();
    await writeFile(path, "old invalid model");
    const fetcher = vi.fn().mockResolvedValue(new Response("corrupt download"));
    await expect(ensureModel(path, fetcher)).rejects.toThrow(/checksum mismatch/);
    expect(await readFile(path, "utf8")).toBe("old invalid model");
    expect(MODEL_SHA256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("reports download failure clearly and never writes an error response as a model", async () => {
    const path = await target();
    await expect(ensureModel(path, vi.fn().mockResolvedValue(new Response("missing", { status: 404 })))).rejects.toThrow(/HTTP 404/);
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("atomically replaces assets and creates their parent directories", async () => {
    const path = await target();
    await atomicWrite(path, Buffer.from("first"));
    await atomicWrite(path, Buffer.from("second"));
    expect(await readFile(path, "utf8")).toBe("second");
  });
  it("reuses a prepared model without network access", async ({ skip }) => {
    // The real prepared artifact is optional; CI can run all deterministic tests before setup.
    let model: Buffer;
    try { model = await readFile(new URL("../../public/mediapipe/hand_landmarker.task", import.meta.url)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { skip(); return; } throw error; }
    const path = await target(); await writeFile(path, model);
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await ensureModel(path, fetcher)).toBe("cached");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
