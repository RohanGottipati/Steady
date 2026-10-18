import { describe, expect, it } from "vitest";
import { PRODUCT_CREDITS } from "@/lib/credits";
import { isDebugEnabled } from "@/lib/ui/debug-query";

describe("debug query", () => {
  it("is off unless debug=1 or the public default is exactly true", () => {
    expect(isDebugEnabled("", "false")).toBe(false);
    expect(isDebugEnabled("?fixture=needle-pass-good", "false")).toBe(false);
    expect(isDebugEnabled("?debug=0", undefined)).toBe(false);
    expect(isDebugEnabled("?debug=1", "false")).toBe(true);
    expect(isDebugEnabled("", "true")).toBe(true);
  });
});

describe("product credits", () => {
  it("names the documented sources and does not confirm an unverified LASK license", () => {
    const text = PRODUCT_CREDITS.map((credit) => credit.text).join("\n");
    expect(text).toContain("Apache License 2.0");
    expect(text).toContain("Gao");
    expect(text).toContain("JIGSAWS");
    expect(text).toContain("2014");
    expect(text).toContain("non-commercial");
    expect(text).toContain("procedural geometry");
    expect(text).toContain("LASK is not included");
    expect(text).toContain("BodyParts3D, © The Database Center for Life Science licensed under Creative Commons Attribution 4.0 International");
    expect(text).not.toMatch(/CC BY/i);
  });
});
