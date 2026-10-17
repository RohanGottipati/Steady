#!/usr/bin/env python3
"""LASK -> canonical ReferenceMotion adapter.

Synthetic-CSV scope (see synthetic-peg-transfer.csv). LASK is CC BY 4.0 (plan
7.1), so derived references may be deployed with attribution; record it in
docs/DATA_LICENSES.md before shipping real data.

Usage:
  python adapter.py <input.csv> <output.json> [--skill ID] [--id REF_ID]
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "common"))
import reference_builder as rb  # noqa: E402

# Synthetic LASK basis: x=right, y=up, z=away from camera.
# Canonical is +Z toward camera, so flip the source z axis.
AXIS_MAP = [(0, 1.0), (1, 1.0), (2, -1.0)]
ORIGIN = [0.0, 0.0, 0.0]
SCALE = 1.0
JAW_OPEN_THRESHOLD = 0.5


def _side(row, prefix):
    opening = float(row[prefix + "open"])
    return {
        "pos": [row[prefix + "px"], row[prefix + "py"], row[prefix + "pz"]],
        "quat": [
            float(row[prefix + "ox"]),
            float(row[prefix + "oy"]),
            float(row[prefix + "oz"]),
            float(row[prefix + "ow"]),
        ],
        "jaw": opening < JAW_OPEN_THRESHOLD,
    }


def row_to_frame(row):
    return {
        "t_ms": float(row["t_ms"]),
        "segment": row["phase"],
        "left": _side(row, "left_"),
        "right": _side(row, "right_"),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description="Convert LASK CSV to ReferenceMotion JSON.")
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--skill", default="peg-transfer")
    ap.add_argument("--id", default="peg-transfer-reference-v1")
    ap.add_argument("--source-name", default="LASK (synthetic sample, CC BY 4.0)")
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
