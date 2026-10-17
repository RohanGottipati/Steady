import type { HandLandmarker } from "@mediapipe/tasks-vision";

export const ASSET_ROOT = "/mediapipe";

/** Each caller owns its detector; cancelled initializations close late resources. */
export async function createLandmarker(assetRoot: string, workerContext: boolean, signal?: AbortSignal) {
  const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
  signal?.throwIfAborted();
  // Next/Turbopack bundles workers as classic scripts (even with type: module).
  // The matching classic WASM loader uses importScripts, not import.meta/export.
  const fileset = await FilesetResolver.forVisionTasks(`${assetRoot}/wasm`, false);
  let lastError: unknown;
  for (const delegate of ["GPU", "CPU"] as const) {
    signal?.throwIfAborted();
    let detector: HandLandmarker | undefined;
    try {
      detector = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${assetRoot}/hand_landmarker.task`, delegate },
        runningMode: "VIDEO", numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        canvas: workerContext ? new OffscreenCanvas(1, 1) : document.createElement("canvas"),
      });
      signal?.throwIfAborted();
      return { detector, delegate };
    } catch (error) {
      detector?.close();
      lastError = error;
    }
  }
  signal?.throwIfAborted();
  const detail = lastError instanceof Error ? lastError.message : "Model or WASM initialization failed.";
  throw new Error(`Unable to initialize local hand tracking. Run npm run prepare:vision and retry. ${detail}`);
}
