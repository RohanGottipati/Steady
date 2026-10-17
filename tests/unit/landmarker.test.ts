import { afterEach, describe, expect, it, vi } from "vitest";
import { createLandmarker } from "@/lib/vision/landmarker";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { deferred } from "../fixtures/vision";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

describe("landmarker initialization", () => {
  afterEach(() => vi.clearAllMocks());
  it("tries CPU after GPU failure with two hands and the pinned local asset root", async () => {
    const detector = { close: vi.fn() } as unknown as HandLandmarker;
    vi.mocked(HandLandmarker.createFromOptions).mockRejectedValueOnce(new Error("no GPU")).mockResolvedValueOnce(detector);
    const created = await createLandmarker("https://localhost/mediapipe", false);
    expect(created.delegate).toBe("CPU");
    expect(FilesetResolver.forVisionTasks).toHaveBeenCalledWith("https://localhost/mediapipe/wasm", false);
    expect(HandLandmarker.createFromOptions).toHaveBeenLastCalledWith({}, expect.objectContaining({
      numHands: 2, runningMode: "VIDEO", baseOptions: { modelAssetPath: "https://localhost/mediapipe/hand_landmarker.task", delegate: "CPU" },
    }));
  });
  it("closes a detector that finishes initialization after cancellation", async () => {
    const pending = deferred<HandLandmarker>();
    vi.mocked(HandLandmarker.createFromOptions).mockReturnValueOnce(pending.promise);
    const abort = new AbortController();
    const creating = createLandmarker("/mediapipe", false, abort.signal);
    const failed = expect(creating).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(HandLandmarker.createFromOptions).toHaveBeenCalledTimes(1));
    abort.abort();
    const detector = { close: vi.fn() } as unknown as HandLandmarker;
    pending.resolve(detector); await failed;
    expect(detector.close).toHaveBeenCalledTimes(1);
  });
});
