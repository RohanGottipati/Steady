import { createLandmarker } from "../lib/vision/landmarker";
import type { WorkerRequest, WorkerResponse } from "../lib/vision/types";
import type { HandLandmarker } from "@mediapipe/tasks-vision";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};
let detector: HandLandmarker | undefined;
const abort = new AbortController();
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const created = await createLandmarker(data.assetRoot, true, abort.signal);
      detector = created.detector;
      scope.postMessage({ type: "ready", delegate: created.delegate });
    } else if (data.type === "frame") {
      try {
        if (!detector) throw new Error("Hand detector is not ready.");
        const result = detector.detectForVideo(data.bitmap, data.tMs);
        scope.postMessage({ type: "result", id: data.id, result: {
          landmarks: result.landmarks, worldLandmarks: result.worldLandmarks, handedness: result.handedness,
        } });
      } finally { data.bitmap.close(); }
    } else {
      abort.abort();
      detector?.close();
      detector = undefined;
    }
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : "Hand tracking failed." });
  }
};
