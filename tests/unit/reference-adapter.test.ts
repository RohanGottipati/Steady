// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseReference } from "@/lib/references/load-reference";

const ROOT = process.cwd();

function pythonCmd(): string | null {
  for (const cmd of ["python", "python3", "py"]) {
    try {
      execFileSync(cmd, ["--version"], { stdio: "ignore" });
      return cmd;
    } catch {
      // try next candidate
    }
  }
  return null;
}

describe("committed reference fixtures", () => {
  it("needle-passing reference validates against the schema", () => {
    const json = JSON.parse(
      readFileSync(
        join(ROOT, "public/references/needle-passing/needle-passing-reference-v1.json"),
        "utf8",
      ),
    );
    const ref = parseReference(json);
    expect(ref.skillId).toBe("needle-passing");
    expect(ref.fps).toBe(30);
    expect(ref.frames.length).toBeGreaterThan(0);
    expect(ref.frames[0].normalizedProgress).toBe(0);
    expect(ref.frames.at(-1)!.normalizedProgress).toBe(1);
  });
});

const py = pythonCmd();
const describePy = py ? describe : describe.skip;

describePy("dataset adapters produce valid references from a synthetic CSV", () => {
  const tmp = mkdtempSync(join(tmpdir(), "steady-ref-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("JIGSAWS adapter output validates and stays in 0..1 progress", () => {
    const out = join(tmp, "jigsaws.json");
    execFileSync(
      py as string,
      [
        "scripts/data/jigsaws/adapter.py",
        "scripts/data/jigsaws/synthetic-needle-passing.csv",
        out,
      ],
      { cwd: ROOT },
    );
    const ref = parseReference(JSON.parse(readFileSync(out, "utf8")));
    expect(ref.coordinateSystem).toBe("scene-canonical-v1");
    expect(
      ref.frames.every((f) => f.normalizedProgress >= 0 && f.normalizedProgress <= 1),
    ).toBe(true);
  });

  it("LASK adapter output validates", () => {
    const out = join(tmp, "lask.json");
    execFileSync(
      py as string,
      [
        "scripts/data/lask/adapter.py",
        "scripts/data/lask/synthetic-peg-transfer.csv",
        out,
      ],
      { cwd: ROOT },
    );
    const ref = parseReference(JSON.parse(readFileSync(out, "utf8")));
    expect(ref.skillId).toBe("peg-transfer");
    expect(ref.frames.length).toBeGreaterThan(0);
  });
});
