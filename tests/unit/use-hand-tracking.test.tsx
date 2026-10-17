import { act, Activity, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHandTracking } from "@/lib/vision/use-hand-tracking";
import { TrackingController } from "@/lib/vision/tracking-controller";
import * as backends from "@/lib/vision/backends";
import { detection } from "../fixtures/vision";

describe("hand-tracking hook ownership", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("cleans up Strict Mode remounts and routes controls to the active controller", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const start = vi.spyOn(TrackingController.prototype, "start").mockResolvedValue();
    const stop = vi.spyOn(TrackingController.prototype, "stop").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    function Harness() {
      const tracking = useHandTracking();
      return <><video ref={tracking.videoRef} /><button onClick={() => void tracking.start()}>Start</button><button onClick={tracking.stop}>Stop</button></>;
    }
    const root = createRoot(container);
    try {
      await act(async () => root.render(<StrictMode><Harness /></StrictMode>));
      expect(stop.mock.calls.filter(call => call[0] === false)).toHaveLength(1); // simulated unmount
      const initialStops = stop.mock.calls.length;
      await act(async () => container.querySelectorAll("button")[0].click());
      expect(start).toHaveBeenCalledTimes(1);
      await act(async () => container.querySelectorAll("button")[1].click());
      expect(stop).toHaveBeenCalledTimes(initialStops + 1);
    } finally { await act(async () => root.unmount()); container.remove(); }
    expect(stop.mock.calls.filter(call => call[0] === false)).toHaveLength(2);
    expect(stop).toHaveBeenLastCalledWith(false);
  });
  it("releases the camera on Activity hide and restores an idle UI on cache resume", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const track = Object.assign(new EventTarget(), { stop: vi.fn() });
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const dispose = vi.fn();
    vi.spyOn(backends, "createBestBackend").mockResolvedValue({
      name: "worker-gpu", detect: vi.fn().mockResolvedValue(detection()), dispose,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    function Harness() {
      const tracking = useHandTracking();
      return <><video ref={tracking.videoRef} /><button onClick={() => void tracking.start()}>Start</button><span>{tracking.state.status}</span></>;
    }
    const root = createRoot(container);
    try {
      await act(async () => root.render(<Activity mode="visible"><Harness /></Activity>));
      await act(async () => {
        container.querySelector("button")!.click();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      expect(container.querySelector("span")!.textContent).toBe("running");
      await act(async () => root.render(<Activity mode="hidden"><Harness /></Activity>));
      expect(track.stop).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledTimes(1);
      await act(async () => root.render(<Activity mode="visible"><Harness /></Activity>));
      expect(container.querySelector("span")!.textContent).toBe("idle");
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
});
