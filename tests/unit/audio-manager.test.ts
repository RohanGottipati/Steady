import { describe, it, expect, vi } from "vitest";
import { AudioManager, type AudioHandle } from "@/lib/voice/audio-manager";

class FakeAudio implements AudioHandle {
  onended: (() => void) | null = null;
  onerror: ((err?: unknown) => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor(public src: string) {}
  finish() {
    this.onended?.();
  }
  fail() {
    this.onerror?.();
  }
}

function harness(
  overrides: Partial<ConstructorParameters<typeof AudioManager>[0]> = {},
) {
  const created: FakeAudio[] = [];
  const createAudio = vi.fn((src: string) => {
    const a = new FakeAudio(src);
    created.push(a);
    return a;
  });
  const browserCalls: string[] = [];
  let lastBrowserOnEnd: (() => void) | null = null;
  const browserSpeak = vi.fn((text: string, onEnd: () => void) => {
    browserCalls.push(text);
    lastBrowserOnEnd = onEnd;
  });
  const cancelBrowserSpeak = vi.fn();
  const revoked: string[] = [];
  const fetchFn = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(["audio"], { type: "audio/mpeg" }),
  })) as unknown as typeof fetch;
  const manager = new AudioManager({
    createAudio,
    browserSpeak,
    cancelBrowserSpeak,
    fetchFn,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: (url: string) => revoked.push(url),
    ...overrides,
  });
  return {
    manager,
    created,
    createAudio,
    browserSpeak,
    browserCalls,
    cancelBrowserSpeak,
    revoked,
    fetchFn,
    fireBrowserEnd: () => lastBrowserOnEnd?.(),
  };
}

describe("AudioManager", () => {
  it("plays a coaching clip from its local public asset URL", async () => {
    const { manager, created } = harness();
    const ok = await manager.playClip("path_deviation");
    expect(ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe("/audio/coach/path_deviation.mp3");
    expect(created[0].play).toHaveBeenCalledOnce();
    expect(manager.isSpeaking).toBe(true);
    created[0].finish();
    expect(manager.isSpeaking).toBe(false);
  });

  it("drops a second normal clip while one is already playing (no overlap)", async () => {
    const { manager, created } = harness();
    await manager.playClip("path_deviation");
    const second = await manager.playClip("overshoot");
    expect(second).toBe(false);
    expect(created).toHaveLength(1);
  });

  it("lets a high-priority clip interrupt current playback", async () => {
    const { manager, created } = harness();
    await manager.playClip("moving_too_fast");
    await manager.playClip("danger_zone_near", { priority: "high" });
    expect(created).toHaveLength(2);
    expect(created[0].pause).toHaveBeenCalledOnce();
    expect(created[1].src).toBe("/audio/coach/danger_zone_near.mp3");
    expect(manager.isSpeaking).toBe(true);
  });

  it("cancel() stops current playback and clears speaking state", async () => {
    const { manager, created } = harness();
    await manager.playClip("path_deviation");
    manager.cancel();
    expect(created[0].pause).toHaveBeenCalledOnce();
    expect(manager.isSpeaking).toBe(false);
  });

  it("speak() posts text to /api/speech and plays the returned audio", async () => {
    const { manager, created, fetchFn } = harness();
    const ok = await manager.speak("Great correction. Continue.");
    expect(ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/speech",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Great correction. Continue." }),
      }),
    );
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe("blob:fake");
  });

  it("cancel() aborts an in-flight dynamic request so it never plays", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slowFetch = vi.fn(async () => {
      await gate;
      return { ok: true, blob: async () => new Blob(["a"], { type: "audio/mpeg" }) };
    }) as unknown as typeof fetch;
    const { manager, created, browserSpeak } = harness({ fetchFn: slowFetch });
    const p = manager.speak("Late phrase.");
    manager.cancel();
    release();
    const ok = await p;
    expect(ok).toBe(false);
    expect(created).toHaveLength(0);
    expect(browserSpeak).not.toHaveBeenCalled();
  });

  describe("coach() — live-first with pre-generated clip fallback", () => {
    it("speaks a coaching event via the live ElevenLabs route when it succeeds", async () => {
      const { manager, created, fetchFn, browserSpeak } = harness();
      const ok = await manager.coach("path_deviation");
      expect(ok).toBe(true);
      expect(fetchFn).toHaveBeenCalledWith(
        "/api/speech",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ text: "Return toward the highlighted path." }),
        }),
      );
      expect(created).toHaveLength(1);
      expect(created[0].src).toBe("blob:fake");
      expect(browserSpeak).not.toHaveBeenCalled();
    });

    it("falls back to the pre-generated local clip when the live route fails", async () => {
      const failingFetch = vi.fn(async () => ({
        ok: false,
        blob: async () => new Blob(),
      })) as unknown as typeof fetch;
      const { manager, created, browserSpeak } = harness({ fetchFn: failingFetch });
      const ok = await manager.coach("rotation_late");
      expect(ok).toBe(true);
      expect(created).toHaveLength(1);
      expect(created[0].src).toBe("/audio/coach/rotation_late.mp3");
      expect(browserSpeak).not.toHaveBeenCalled();
    });

    it("falls back to browser speech only if both live and local clip fail", async () => {
      const failingFetch = vi.fn(async () => ({
        ok: false,
        blob: async () => new Blob(),
      })) as unknown as typeof fetch;
      const createFailing = vi.fn((src: string) => {
        const a = new FakeAudio(src);
        a.play = vi.fn(() => Promise.reject(new Error("cannot play")));
        return a;
      });
      const h = harness({ fetchFn: failingFetch, createAudio: createFailing });
      const ok = await h.manager.coach("overshoot");
      expect(ok).toBe(false);
      expect(h.browserSpeak).toHaveBeenCalledWith(
        "You moved past the target — correct gently.",
        expect.any(Function),
      );
      // Still "speaking" via the browser until the utterance ends.
      expect(h.manager.isSpeaking).toBe(true);
      h.fireBrowserEnd();
      expect(h.manager.isSpeaking).toBe(false);
    });

    it("drops a normal coaching event while already speaking", async () => {
      const { manager, created } = harness();
      await manager.coach("path_deviation");
      const second = await manager.coach("overshoot");
      expect(second).toBe(false);
      expect(created).toHaveLength(1);
    });
  });

  describe("resilience fixes", () => {
    it("revokes the blob URL when cancel() interrupts live playback", async () => {
      const { manager, revoked } = harness();
      await manager.speak("A dynamic phrase.");
      expect(revoked).toHaveLength(0);
      manager.cancel();
      expect(revoked).toContain("blob:fake");
    });

    it("revokes the blob URL when a high-priority request interrupts live playback", async () => {
      const { manager, revoked } = harness();
      await manager.speak("First phrase.");
      await manager.coach("danger_zone_near", { priority: "high" });
      expect(revoked).toContain("blob:fake");
    });

    it("keeps isSpeaking true during browser-speech fallback and drops normal cues", async () => {
      const createFailing = vi.fn((src: string) => {
        const a = new FakeAudio(src);
        a.play = vi.fn(() => Promise.reject(new Error("cannot play")));
        return a;
      });
      const h = harness({ createAudio: createFailing });
      await h.manager.playClip("unstable_grip");
      expect(h.browserSpeak).toHaveBeenCalledOnce();
      expect(h.manager.isSpeaking).toBe(true);
      const dropped = await h.manager.playClip("overshoot");
      expect(dropped).toBe(false);
      h.fireBrowserEnd();
      expect(h.manager.isSpeaking).toBe(false);
    });

    it("resolves false when live speech, the clip, and browser speech all fail", async () => {
      const fetchFn = vi.fn(async () => {
        throw new Error("failed to fetch");
      }) as unknown as typeof fetch;
      const createFailing = vi.fn((src: string) => {
        const audio = new FakeAudio(src);
        audio.play = vi.fn(() => Promise.reject(new Error("cannot play")));
        return audio;
      });
      const browserSpeak = vi.fn(() => {
        throw new Error("speech synthesis failed");
      });
      const manager = new AudioManager({ fetchFn, createAudio: createFailing, browserSpeak });
      await expect(manager.coach("overshoot")).resolves.toBe(false);
      expect(manager.isSpeaking).toBe(false);
      expect(fetchFn).toHaveBeenCalledOnce();
    });

    it("plays a fixture clip without calling the live speech route", async () => {
      const fetchFn = vi.fn() as unknown as typeof fetch;
      const { manager, created } = harness({ fetchFn });
      await expect(manager.playClip("path_deviation")).resolves.toBe(true);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(created[0].src).toBe("/audio/coach/path_deviation.mp3");
    });

    it("cancel() stops the browser-speech fallback", async () => {
      const createFailing = vi.fn((src: string) => {
        const a = new FakeAudio(src);
        a.play = vi.fn(() => Promise.reject(new Error("cannot play")));
        return a;
      });
      const h = harness({ createAudio: createFailing });
      await h.manager.playClip("unstable_grip");
      expect(h.manager.isSpeaking).toBe(true);
      h.manager.cancel();
      expect(h.cancelBrowserSpeak).toHaveBeenCalledOnce();
      expect(h.manager.isSpeaking).toBe(false);
    });
  });
});
