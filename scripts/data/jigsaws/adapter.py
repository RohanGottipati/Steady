#!/usr/bin/env python3
"""JIGSAWS -> canonical ReferenceMotion adapter.

Two input formats:

* ``--format csv`` (default): the committed synthetic sample
  (synthetic-needle-passing.csv). Zero-dependency; used by unit tests.
* ``--format kinematics``: a real JIGSAWS kinematics file
  (``<Task>/kinematics/AllGestures/<trial>.txt``, 76 whitespace-separated
  columns per frame at 30 Hz) plus its transcription
  (``<Task>/transcriptions/<trial>.txt``, ``start_frame end_frame GestureID``).

Real JIGSAWS data is academic/non-commercial licensed (JHU-ISI, Gao et al.
2014). Raw data is never committed (git-ignored ``datasets/``); only the
heavily-derived reference motion is, with attribution. See docs/DATA_LICENSES.md.

Column layout (1-indexed, per readme.txt); we use the patient-side (Slave)
manipulators, i.e. the actual instrument tips in the surgical field:
  39-41  Slave left  tooltip xyz (metres)
  42-50  Slave left  tooltip rotation matrix R (row-major 3x3)
  57     Slave left  gripper angle (rad)
  58-60  Slave right tooltip xyz
  61-69  Slave right tooltip rotation matrix R
  76     Slave right gripper angle

Usage:
  python adapter.py <input.csv> <output.json> [--skill ID] [--id REF_ID]
  python adapter.py <kinematics.txt> <output.json> --format kinematics \\
      --transcription <transcription.txt> --skill suturing --id suturing-reference-v1 \\
      --source-type dataset --source-name "JIGSAWS Suturing E002 (expert) ..."
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "common"))
import reference_builder as rb  # noqa: E402

# Synthetic JIGSAWS basis: x=right, y=toward camera, z=up.
# Canonical is +X right, +Y up, +Z toward camera, so swap the y/z source axes.
# The same mapping is applied to real patient-side kinematics as a documented
# calibration assumption; confirm visually once the A5 ghost viewer exists.
AXIS_MAP = [(0, 1.0), (2, 1.0), (1, 1.0)]
ORIGIN = [0.0, 0.0, 0.0]
SCALE = 1.0
# da Vinci gripper angle is positive when the jaws are open; treat a small/negative
# angle as a closed grasp. Real expert trials are bimodal (open ~+0.3..0.5,
# grasp ~-0.9..-1.1), so 0.1 rad cleanly separates them. The synthetic CSV sample
# is authored against the original 0.2 threshold, so keep that path unchanged.
CSV_GRIP_CLOSED_RAD = 0.2
KIN_GRIP_CLOSED_RAD = 0.1

# Real-kinematics (Slave / patient-side) 0-based column offsets.
SLAVE_LEFT_POS = 38  # cols 39-41
SLAVE_LEFT_R = 41  # cols 42-50
SLAVE_LEFT_GRIP = 56  # col 57
SLAVE_RIGHT_POS = 57  # cols 58-60
SLAVE_RIGHT_R = 60  # cols 61-69
SLAVE_RIGHT_GRIP = 75  # col 76
KINEMATICS_FPS = 30.0


# --- Synthetic CSV path (unchanged; keeps the zero-dependency unit test green) ---


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
        "jaw": grip < CSV_GRIP_CLOSED_RAD,
    }


def row_to_frame(row):
    return {
        "t_ms": float(row["time_s"]) * 1000.0,
        "segment": row["gesture"],
        "left": _side(row, "L_"),
        "right": _side(row, "R_"),
    }


def frames_from_csv(path):
    return [row_to_frame(r) for r in rb.read_csv_rows(path)]


# --- Real JIGSAWS kinematics path ---


def _r_to_quat(vals, off):
    # 9 row-major rotation-matrix entries -> normalized [x, y, z, w].
    r = [
        [vals[off + 0], vals[off + 1], vals[off + 2]],
        [vals[off + 3], vals[off + 4], vals[off + 5]],
        [vals[off + 6], vals[off + 7], vals[off + 8]],
    ]
    return rb.matrix_to_quat(r)


def _slave_side(vals, pos_off, r_off, grip_off):
    return {
        "pos": [vals[pos_off], vals[pos_off + 1], vals[pos_off + 2]],
        "quat": _r_to_quat(vals, r_off),
        "jaw": vals[grip_off] < KIN_GRIP_CLOSED_RAD,
    }


def read_transcription(path):
    """Parse ``start_frame end_frame GestureID`` rows (1-indexed, inclusive)."""
    spans = []
    with open(path) as fh:
        for line in fh:
            parts = line.split()
            if len(parts) < 3:
                continue
            spans.append((int(parts[0]), int(parts[1]), parts[2]))
    if not spans:
        raise ValueError(f"No gesture spans found in transcription {path}")
    return spans


def _segment_for_frame(frame_no, spans, last):
    # frame_no is 1-indexed. Spans are contiguous for labeled motion; on a small
    # gap, carry the previous gesture forward so every kept frame has a segment.
    for start, end, gesture in spans:
        if start <= frame_no <= end:
            return gesture
    return last


def frames_from_kinematics(kin_path, transcription_path):
    spans = read_transcription(transcription_path)
    first_frame = min(s[0] for s in spans)
    last_frame = max(s[1] for s in spans)

    with open(kin_path) as fh:
        rows = [ln.split() for ln in fh if ln.strip()]

    frames = []
    last_gesture = spans[0][2]
    for i, cols in enumerate(rows):
        frame_no = i + 1  # kinematics line i (0-based) == transcription frame i+1
        if frame_no < first_frame or frame_no > last_frame:
            continue  # drop pre/post-task setup frames outside the labeled span
        vals = [float(c) for c in cols]
        last_gesture = _segment_for_frame(frame_no, spans, last_gesture)
        frames.append(
            {
                "t_ms": i / KINEMATICS_FPS * 1000.0,
                "segment": last_gesture,
                "left": _slave_side(vals, SLAVE_LEFT_POS, SLAVE_LEFT_R, SLAVE_LEFT_GRIP),
                "right": _slave_side(
                    vals, SLAVE_RIGHT_POS, SLAVE_RIGHT_R, SLAVE_RIGHT_GRIP
                ),
            }
        )
    if len(frames) < 2:
        raise ValueError(
            f"Only {len(frames)} frames in labeled span [{first_frame},{last_frame}] "
            f"of {kin_path}; expected the full task trajectory."
        )
    return frames


def main(argv=None):
    ap = argparse.ArgumentParser(description="Convert JIGSAWS data to ReferenceMotion JSON.")
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--format", choices=["csv", "kinematics"], default="csv")
    ap.add_argument(
        "--transcription", help="Transcription file (required for --format kinematics)."
    )
    ap.add_argument("--skill", default="needle-passing")
    ap.add_argument("--id", default="needle-passing-reference-v1")
    ap.add_argument(
        "--source-name",
        default="Synthetic needle-passing sample (JIGSAWS format, not expert data)",
    )
    # Synthetic samples ship as internal-recording; pass --source-type dataset
    # only when converting real (licensed) JIGSAWS kinematics.
    ap.add_argument("--source-type", default="internal-recording")
    args = ap.parse_args(argv)

    if args.format == "kinematics":
        if not args.transcription:
            ap.error("--transcription is required when --format kinematics")
        frames = frames_from_kinematics(args.input, args.transcription)
    else:
        frames = frames_from_csv(args.input)

    reference = rb.build_reference(
        frames,
        skill_id=args.skill,
        reference_id=args.id,
        source_type=args.source_type,
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
