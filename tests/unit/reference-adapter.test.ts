// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function loadFixture(rel: string) {
  return parseReference(JSON.parse(readFileSync(join(ROOT, rel), "utf8")));
}

function expectCanonicalInvariants(ref: ReturnType<typeof parseReference>) {
  const f = ref.frames;
  expect(ref.fps).toBe(30);
  expect(ref.coordinateSystem).toBe("scene-canonical-v1");
  expect(f[0].normalizedProgress).toBe(0);
  expect(f.at(-1)!.normalizedProgress).toBe(1);
  for (let i = 0; i < f.length; i++) {
    expect(f[i].normalizedProgress).toBeGreaterThanOrEqual(0);
    expect(f[i].normalizedProgress).toBeLessThanOrEqual(1);
    for (const tool of [f[i].leftTool, f[i].rightTool]) {
      const q = tool.rotation;
      const norm = Math.hypot(q.x, q.y, q.z, q.w);
      expect(norm).toBeCloseTo(1, 6); // slerp output stays unit-norm
    }
    if (i > 0) {
      expect(f[i].normalizedProgress).toBeGreaterThanOrEqual(f[i - 1].normalizedProgress);
      expect(f[i].tMs).toBeGreaterThan(f[i - 1].tMs);
      const dt = f[i].tMs - f[i - 1].tMs;
      if (i < f.length - 1) {
        expect(dt).toBeCloseTo(1000 / 30, 2); // 30 Hz cadence
      } else {
        // The final frame is forced to the true end timestamp, so the last
        // step may be shorter than one full 30 Hz interval.
        expect(dt).toBeGreaterThan(0);
        expect(dt).toBeLessThanOrEqual(1000 / 30 + 0.01);
      }
    }
  }
  const declared = new Set(ref.segments.map((s) => s.id));
  for (const fr of f) expect(declared.has(fr.segmentId)).toBe(true);
  for (const s of ref.segments) expect(s.startMs).toBeLessThanOrEqual(s.endMs);
}

describe("committed reference fixtures", () => {
  // needle-passing-reference-v1 is the product/eval reference and stays synthetic
  // (scene-scale, skill-phase segments that match the skill definition). The real
  // JIGSAWS expert refs are committed separately as data-only (see below).
  it("synthetic needle-passing reference validates and applies the JIGSAWS y/z axis swap", () => {
    const ref = loadFixture("public/references/needle-passing/needle-passing-reference-v1.json");
    expect(ref.skillId).toBe("needle-passing");
    expect(ref.sourceType).toBe("internal-recording");
    expectCanonicalInvariants(ref);
    // CSV row 0 left tool source (-0.40, 0.30, 0.10) with basis (x=right, y=toward
    // camera, z=up) -> canonical (x, z, y) = (-0.40, 0.10, 0.30).
    const p = ref.frames[0].leftTool.position;
    expect(p.x).toBeCloseTo(-0.4, 9);
    expect(p.y).toBeCloseTo(0.1, 9);
    expect(p.z).toBeCloseTo(0.3, 9);
    expect(ref.frames[0].leftTool.jawClosed).toBe(false); // grip 0.80 -> open
    expect(ref.frames.find((fr) => fr.segmentId === "grip")!.leftTool.jawClosed).toBe(true);
    // Source orientations rotate about source-Y; the Y/Z axis swap must carry them
    // to canonical-Z. A non-identity frame must no longer be about Y.
    const rot = ref.frames.find((fr) => Math.abs(fr.leftTool.rotation.w) < 0.999);
    expect(rot).toBeDefined();
    expect(Math.abs(rot!.leftTool.rotation.y)).toBeLessThan(1e-9);
    expect(Math.abs(rot!.leftTool.rotation.z)).toBeGreaterThan(1e-3);
  });

  // Real JIGSAWS expert trials (academic/non-commercial, derived motion only;
  // DATA-ONLY, not product-wired — scale/visual calibration pending A5). See
  // docs/DATA_LICENSES.md.
  for (const skill of ["needle-passing", "knot-tying", "suturing"]) {
    it(`${skill} JIGSAWS expert data-only ref validates and holds canonical invariants`, () => {
      const ref = loadFixture(`public/references/${skill}/${skill}-jigsaws-expert-v1.json`);
      expect(ref.skillId).toBe(skill);
      expect(ref.sourceType).toBe("dataset");
      expect(ref.sourceName).toMatch(/JIGSAWS/);
      expect(ref.frames.length).toBeGreaterThan(100);
      // Real surgical tasks revisit gestures, so segments repeat.
      expect(ref.segments.length).toBeGreaterThan(1);
      expectCanonicalInvariants(ref);
    });
  }

  it("peg-transfer fixture validates and applies the LASK z flip", () => {
    const ref = loadFixture("public/references/peg-transfer/peg-transfer-reference-v1.json");
    expect(ref.skillId).toBe("peg-transfer");
    expectCanonicalInvariants(ref);
    // CSV row 0 left tool source (-0.35, 0.10, 0.40) with basis (x=right, y=up,
    // z=away from camera) -> canonical (x, y, -z) = (-0.35, 0.10, -0.40).
    const p = ref.frames[0].leftTool.position;
    expect(p.x).toBeCloseTo(-0.35, 9);
    expect(p.y).toBeCloseTo(0.1, 9);
    expect(p.z).toBeCloseTo(-0.4, 9);
  });

  it("peg-transfer preserves every source CSV phase, in order (incl. final segment)", () => {
    const ref = loadFixture("public/references/peg-transfer/peg-transfer-reference-v1.json");
    expect(ref.segments.map((s) => s.id)).toEqual([
      "reach",
      "grasp",
      "lift",
      "transfer",
      "place",
      "release",
      "complete",
    ]);
  });
});

const py = pythonCmd();
const describePy = py ? describe : describe.skip;

// Build one 76-column JIGSAWS kinematics row (readme.txt layout). Only the
// patient-side (Slave) channels are populated; Master columns stay zero.
function kinRow(leftPos: number[], leftGrip: number, rightPos: number[], rightGrip: number) {
  const v = new Array(76).fill(0);
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // identity rotation matrix
  v[38] = leftPos[0]; v[39] = leftPos[1]; v[40] = leftPos[2]; // cols 39-41
  for (let k = 0; k < 9; k++) v[41 + k] = I[k]; // cols 42-50
  v[56] = leftGrip; // col 57
  v[57] = rightPos[0]; v[58] = rightPos[1]; v[59] = rightPos[2]; // cols 58-60
  for (let k = 0; k < 9; k++) v[60 + k] = I[k]; // cols 61-69
  v[75] = rightGrip; // col 76
  return v.join(" ");
}

describePy("dataset adapters produce valid references", () => {
  const tmp = mkdtempSync(join(tmpdir(), "steady-ref-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  function runAdapter(args: string[]) {
    execFileSync(py as string, ["scripts/data/jigsaws/adapter.py", ...args], { cwd: ROOT });
  }

  it("JIGSAWS synthetic CSV adapter output validates and stays in 0..1 progress", () => {
    const out = join(tmp, "jigsaws.json");
    runAdapter(["scripts/data/jigsaws/synthetic-needle-passing.csv", out]);
    const ref = parseReference(JSON.parse(readFileSync(out, "utf8")));
    expect(ref.coordinateSystem).toBe("scene-canonical-v1");
    expect(ref.frames.every((f) => f.normalizedProgress >= 0 && f.normalizedProgress <= 1)).toBe(
      true,
    );
  });

  it("JIGSAWS --format kinematics maps column offsets, grip threshold and matrix->quat", () => {
    const kin = join(tmp, "trial.txt");
    const tr = join(tmp, "trial_tr.txt");
    // grip < 0.1 rad -> closed; identity rotation matrix -> quaternion (0,0,0,1).
    const rows = [
      kinRow([0.1, 0.2, 0.3], -0.5, [0.4, 0.5, 0.6], 0.5),
      kinRow([0.1, 0.2, 0.3], -0.5, [0.4, 0.5, 0.6], 0.5),
      kinRow([0.1, 0.2, 0.3], -0.5, [0.4, 0.5, 0.6], 0.5),
    ];
    writeFileSync(kin, rows.join("\n") + "\n");
    writeFileSync(tr, "1 3 G1\n");
    const out = join(tmp, "kin.json");
    runAdapter([kin, out, "--format", "kinematics", "--transcription", tr, "--skill", "suturing"]);
    const ref = parseReference(JSON.parse(readFileSync(out, "utf8")));

    const l = ref.frames[0].leftTool;
    const r = ref.frames[0].rightTool;
    // y/z axis swap: source (x,y,z) -> canonical (x,z,y).
    expect(l.position.x).toBeCloseTo(0.1, 9);
    expect(l.position.y).toBeCloseTo(0.3, 9);
    expect(l.position.z).toBeCloseTo(0.2, 9);
    expect(r.position.x).toBeCloseTo(0.4, 9);
    expect(r.position.y).toBeCloseTo(0.6, 9);
    expect(r.position.z).toBeCloseTo(0.5, 9);
    // grip threshold: left -0.5 -> closed, right 0.5 -> open.
    expect(l.jawClosed).toBe(true);
    expect(r.jawClosed).toBe(false);
    // identity rotation matrix -> identity quaternion.
    expect(l.rotation).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
    expect(ref.segments.map((s) => s.id)).toEqual(["G1"]);
  });

  it("JIGSAWS --format kinematics rejects rows without exactly 76 columns", () => {
    const kin = join(tmp, "bad.txt");
    const tr = join(tmp, "bad_tr.txt");
    writeFileSync(kin, "0 1 2 3 4\n0 1 2 3 4\n"); // 5 columns, not 76
    writeFileSync(tr, "1 2 G1\n");
    const out = join(tmp, "bad.json");
    expect(() =>
      runAdapter([kin, out, "--format", "kinematics", "--transcription", tr]),
    ).toThrow();
  });

  it("LASK adapter output validates", () => {
    const out = join(tmp, "lask.json");
    execFileSync(
      py as string,
      ["scripts/data/lask/adapter.py", "scripts/data/lask/synthetic-peg-transfer.csv", out],
      { cwd: ROOT },
    );
    const ref = parseReference(JSON.parse(readFileSync(out, "utf8")));
    expect(ref.skillId).toBe("peg-transfer");
    expect(ref.frames.length).toBeGreaterThan(0);
  });
});
