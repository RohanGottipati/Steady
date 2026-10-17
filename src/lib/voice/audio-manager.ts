import type { CoachingEventType } from "@/types/coaching";
import { COACH_CLIP_BY_TYPE, coachClipPath } from "@/lib/voice/coach-clips";
import { MAX_SPEECH_TEXT_LENGTH } from "@/lib/voice/speech-contract";

/**
 * Minimal media element the manager drives. Narrowed from `HTMLAudioElement`
 * so the manager can be dependency-injected and unit-tested without jsdom's
 * unimplemented media stack.
 */
export interface AudioHandle {
  play(): Promise<void>;
  pause(): void;
  onended: (() => void) | null;
  onerror: ((err?: unknown) => void) | null;
}

export type SpeakPriority = "normal" | "high";

export interface AudioManagerOptions {
  /** Factory for a playable audio element. Defaults to `new Audio(src)`. */
  createAudio?: (src: string) => AudioHandle;
  /** `fetch` used for dynamic TTS. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  /**
   * Browser-speech fallback. Must invoke `onEnd` when the utterance finishes
   * (or fails) so the manager can release the audio slot. Defaults to
   * `window.speechSynthesis`.
   */
  browserSpeak?: (text: string, onEnd: () => void) => void;
  /** Cancel any in-progress browser speech. Defaults to `speechSynthesis.cancel()`. */
  cancelBrowserSpeak?: () => void;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  /** Server route for dynamic phrases. Defaults to `/api/speech`. */
  speechEndpoint?: string;
}

/** A source to attempt, in priority order; returns `null` to skip. */
type PlaybackStep = () => Promise<{ src: string; revoke?: () => void } | null>;

function defaultCreateAudio(src: string): AudioHandle {
  // HTMLAudioElement structurally satisfies AudioHandle; its DOM event-handler
  // signatures are wider than we need, so narrow via unknown.
  return new Audio(src) as unknown as AudioHandle;
}

function defaultBrowserSpeak(text: string, onEnd: () => void): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => onEnd();
  utterance.onerror = () => onEnd();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function defaultCancelBrowserSpeak(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

/**
 * Central coaching-audio manager (plan §15.4). Guarantees at most one voice
 * line at a time: a normal request while busy is dropped, a high-priority
 * request interrupts, and `cancel()` both stops playback and invalidates any
 * in-flight request so an obsolete phrase never starts. The single-voice
 * guarantee extends to the browser-speech fallback — the slot stays held until
 * the utterance ends, and interrupting/cancelling stops it.
 *
 * Coaching voice uses a live-first fallback chain (per project decision
 * 2026-10-17): the live ElevenLabs route (`/api/speech`) is primary, the
 * committed pre-generated clip is the resilience fallback, and browser
 * `speechSynthesis` is the last resort — so the demo always talks even offline.
 */
export class AudioManager {
  private readonly createAudio: (src: string) => AudioHandle;
  private readonly fetchFn: typeof fetch;
  private readonly browserSpeak: (text: string, onEnd: () => void) => void;
  private readonly cancelBrowserSpeak: () => void;
  private readonly createObjectURL: (blob: Blob) => string;
  private readonly revokeObjectURL: (url: string) => void;
  private readonly speechEndpoint: string;

  private current: AudioHandle | null = null;
  /** Idempotent cleanup (e.g. blob revoke) for the current playback. */
  private currentCleanup: (() => void) | null = null;
  private browserSpeaking = false;
  private busy = false;
  /** Monotonic request id; a request whose id is stale has been superseded. */
  private seq = 0;

  constructor(options: AudioManagerOptions = {}) {
    this.createAudio = options.createAudio ?? defaultCreateAudio;
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
    this.browserSpeak = options.browserSpeak ?? defaultBrowserSpeak;
    this.cancelBrowserSpeak =
      options.cancelBrowserSpeak ?? defaultCancelBrowserSpeak;
    this.createObjectURL =
      options.createObjectURL ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectURL =
      options.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url));
    this.speechEndpoint = options.speechEndpoint ?? "/api/speech";
  }

  get isSpeaking(): boolean {
    return this.busy;
  }

  /**
   * Primary coaching entry: speak a deterministic coaching event, preferring
   * the live ElevenLabs voice and falling back to the pre-generated clip, then
   * browser speech.
   */
  coach(
    type: CoachingEventType,
    opts: { priority?: SpeakPriority } = {},
  ): Promise<boolean> {
    const text = COACH_CLIP_BY_TYPE[type].text;
    const mySeq = this.begin(opts.priority ?? "normal");
    if (mySeq === null) return Promise.resolve(false);
    return this.playChain(
      mySeq,
      [this.liveStep(text), this.clipStep(type)],
      text,
    );
  }

  /** Play only the pre-generated local clip for an event type. */
  playClip(
    type: CoachingEventType,
    opts: { priority?: SpeakPriority } = {},
  ): Promise<boolean> {
    const text = COACH_CLIP_BY_TYPE[type].text;
    const mySeq = this.begin(opts.priority ?? "normal");
    if (mySeq === null) return Promise.resolve(false);
    return this.playChain(mySeq, [this.clipStep(type)], text);
  }

  /** Speak a dynamic phrase via the server TTS route (no pre-generated clip). */
  speak(
    text: string,
    opts: { priority?: SpeakPriority } = {},
  ): Promise<boolean> {
    const trimmed = text.trim().slice(0, MAX_SPEECH_TEXT_LENGTH);
    if (!trimmed) return Promise.resolve(false);
    const mySeq = this.begin(opts.priority ?? "normal");
    if (mySeq === null) return Promise.resolve(false);
    return this.playChain(mySeq, [this.liveStep(trimmed)], trimmed);
  }

  /** Stop any current playback/fallback and invalidate pending requests. */
  cancel(): void {
    this.seq += 1;
    this.stopCurrent();
    if (this.browserSpeaking) {
      this.cancelBrowserSpeak();
      this.browserSpeaking = false;
    }
    this.busy = false;
  }

  private liveStep(text: string): PlaybackStep {
    return async () => {
      const res = await this.fetchFn(this.speechEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`speech route failed: ${res.status}`);
      const blob = await res.blob();
      const url = this.createObjectURL(blob);
      return { src: url, revoke: () => this.revokeObjectURL(url) };
    };
  }

  private clipStep(type: CoachingEventType): PlaybackStep {
    return async () => ({ src: coachClipPath(type) });
  }

  /**
   * Reserve the single audio slot. Returns a request id, or `null` if a
   * normal request must be dropped because something is already speaking.
   */
  private begin(priority: SpeakPriority): number | null {
    if (this.busy && priority !== "high") return null;
    if (this.busy) {
      this.stopCurrent();
      if (this.browserSpeaking) {
        this.cancelBrowserSpeak();
        this.browserSpeaking = false;
      }
    }
    this.busy = true;
    this.seq += 1;
    return this.seq;
  }

  private superseded(mySeq: number): boolean {
    return mySeq !== this.seq;
  }

  private stopCurrent(): void {
    if (this.current) {
      this.current.pause();
      this.current = null;
    }
    if (this.currentCleanup) {
      const cleanup = this.currentCleanup;
      this.currentCleanup = null;
      cleanup();
    }
  }

  /** Try each source in order; fall back to browser speech if all fail. */
  private async playChain(
    mySeq: number,
    steps: PlaybackStep[],
    fallbackText: string,
  ): Promise<boolean> {
    for (const step of steps) {
      if (this.superseded(mySeq)) return false;
      let src: string;
      let revoke: (() => void) | undefined;
      try {
        const resolved = await step();
        if (!resolved) continue;
        src = resolved.src;
        revoke = resolved.revoke;
      } catch {
        continue;
      }
      if (this.superseded(mySeq)) {
        revoke?.();
        return false;
      }
      const played = await this.attachAndPlay(src, mySeq, fallbackText, revoke);
      if (played) return true;
    }
    this.startBrowserFallback(mySeq, fallbackText);
    return false;
  }

  private attachAndPlay(
    src: string,
    mySeq: number,
    fallbackText: string,
    onDone?: () => void,
  ): Promise<boolean> {
    if (this.superseded(mySeq)) {
      onDone?.();
      return Promise.resolve(false);
    }
    const handle = this.createAudio(src);
    this.current = handle;
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      this.currentCleanup = null;
      onDone?.();
    };
    this.currentCleanup = cleanup;
    handle.onended = () => {
      if (settled) return;
      if (!this.superseded(mySeq)) {
        this.busy = false;
        this.current = null;
      }
      cleanup();
    };
    handle.onerror = () => {
      if (settled) return;
      const stale = this.superseded(mySeq);
      cleanup();
      if (stale) return;
      this.current = null;
      this.startBrowserFallback(mySeq, fallbackText);
    };
    return handle.play().then(
      () => true,
      () => {
        // Starting playback failed; let the caller try the next source. Leave
        // `busy` set so the chain keeps ownership of the audio slot.
        this.current = null;
        cleanup();
        return false;
      },
    );
  }

  /** Last-resort browser speech; holds the slot until the utterance ends. */
  private startBrowserFallback(mySeq: number, text: string): void {
    if (this.superseded(mySeq)) return;
    this.current = null;
    this.currentCleanup = null;
    this.browserSpeaking = true;
    this.browserSpeak(text, () => {
      this.browserSpeaking = false;
      if (!this.superseded(mySeq)) {
        this.busy = false;
      }
    });
  }
}
