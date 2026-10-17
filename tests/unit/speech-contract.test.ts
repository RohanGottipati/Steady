import { describe, it, expect } from "vitest";
import {
  MAX_SPEECH_TEXT_LENGTH,
  speechRequestSchema,
} from "@/lib/voice/speech-contract";

describe("speech request contract", () => {
  it("accepts and trims valid text", () => {
    const parsed = speechRequestSchema.parse({ text: "  Slow down.  " });
    expect(parsed.text).toBe("Slow down.");
  });

  it("rejects empty or whitespace-only text", () => {
    expect(speechRequestSchema.safeParse({ text: "" }).success).toBe(false);
    expect(speechRequestSchema.safeParse({ text: "   " }).success).toBe(false);
  });

  it("rejects missing text", () => {
    expect(speechRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects text longer than the maximum", () => {
    const tooLong = "a".repeat(MAX_SPEECH_TEXT_LENGTH + 1);
    expect(speechRequestSchema.safeParse({ text: tooLong }).success).toBe(false);
  });

  it("accepts text at exactly the maximum length", () => {
    const atMax = "a".repeat(MAX_SPEECH_TEXT_LENGTH);
    expect(speechRequestSchema.safeParse({ text: atMax }).success).toBe(true);
  });
});
