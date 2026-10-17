#!/usr/bin/env python3
"""JIGSAWS -> canonical ReferenceMotion adapter.

Synthetic-CSV scope (see synthetic-needle-passing.csv). Real JIGSAWS kinematics
are academic-license only: do not commit raw data or deploy derived artifacts
until the team clears redistribution (plan 7.1/7.2).

Usage:
  python adapter.py <input.csv> <output.json> [--skill ID] [--id REF_ID]
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "common"))
import reference_builder as rb  # noqa: E402

# Synthetic JIGSAWS basis: x=right, y=toward camera, z=up.
# Canonical is +X right, +Y up, +Z toward camera, so swap the y/z source axes.
AXIS_MAP = [(0, 1.0), (2, 1.0), (1, 1.0)]
ORIGIN = [0.0, 0.0, 0.0]
SCALE = 1.0
GRIP_CLOSED_RAD = 0.2


def _side(row, prefix):
    grip = float(row[prefix + "grip"])
    return {
        "pos": [row[prefix + "x"], row[prefix + "y"], row[prefix + "z"]],
        "quat": [
            float(row[prefix + "qx"]),
            float(row[prefix + "qy"]),
            float(row[prefix + "qz"]),
            float(row[prefix + "qw"]),
        ],
        "jaw": grip < GRIP_CLOSED_RAD,
    }


def row_to_frame(row):
    return {
        "t_ms": float(row["time_s"]) * 1000.0,
        "segment": row["gesture"],
        "left": _side(row, "L_"),
        "right": _side(row, "R_"),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description="Convert JIGSAWS CSV to ReferenceMotion JSON.")
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--skill", default="needle-passing")
    ap.add_argument("--id", default="needle-passing-reference-v1")
    ap.add_argument("--source-name", default="JIGSAWS (synthetic sample)")
    args = ap.parse_args(argv)

    frames = [row_to_frame(r) for r in rb.read_csv_rows(args.input)]
    reference = rb.build_reference(
        frames,
        skill_id=args.skill,
        reference_id=args.id,
        source_type="dataset",
        source_name=args.source_name,
        axis_map=AXIS_MAP,
        origin=ORIGIN,
        scale=SCALE,
    )
    rb.write_reference(reference, args.output)
    print(
        f"Wrote {args.output}: {len(reference['frames'])} frames, "
        f"{len(reference['segments'])} segments"
    )


if __name__ == "__main__":
    main()
