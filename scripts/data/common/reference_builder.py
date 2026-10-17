"""Shared reference-motion conversion pipeline (stdlib only).

Dataset adapters parse their raw CSV into a list of source frames, then call
build_reference() to transform into the canonical scene coordinate system
(plan 7.3), resample to 30 Hz, segment-normalize, and emit a dict matching the
TypeScript ReferenceMotion contract (src/types/motion.ts).

Numpy/pandas are intentionally unused here so the synthetic-CSV path runs with
zero install; swap them in when real JIGSAWS/LASK ingestion lands.
"""

import csv
import json
import math

CANONICAL_COORDINATE_SYSTEM = "scene-canonical-v1"
SCHEMA_VERSION = 1
TARGET_FPS = 30

# A source frame is:
# {"t_ms": float, "segment": str,
#  "left":  {"pos": [x,y,z], "quat": [x,y,z,w], "jaw": bool},
#  "right": {"pos": [x,y,z], "quat": [x,y,z,w], "jaw": bool}}


def read_csv_rows(path):
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


def _apply_axis_map(p, axis_map):
    # axis_map maps canonical [x,y,z] <- (source_index, sign)
    return [sign * float(p[idx]) for (idx, sign) in axis_map]


def transform_position(p, axis_map, origin, scale):
    q = _apply_axis_map(p, axis_map)
    return [(q[i] - origin[i]) * scale for i in range(3)]


def normalize_quat(x, y, z, w):
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    return [x / n, y / n, z / n, w / n]


def slerp(a, b, t):
    d = sum(a[i] * b[i] for i in range(4))
    if d < 0.0:
        b = [-v for v in b]
        d = -d
    if d > 0.9995:
        return normalize_quat(*[a[i] + t * (b[i] - a[i]) for i in range(4)])
    th0 = math.acos(max(min(d, 1.0), -1.0))
    sin0 = math.sin(th0)
    th = th0 * t
    s0 = math.cos(th) - d * math.sin(th) / sin0
    s1 = math.sin(th) / sin0
    return [s0 * a[i] + s1 * b[i] for i in range(4)]


def axis_map_to_matrix(axis_map):
    m = [[0.0, 0.0, 0.0] for _ in range(3)]
    for i, (idx, sign) in enumerate(axis_map):
        m[i][idx] = sign
    return m


def _matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def _transpose(m):
    return [[m[j][i] for j in range(3)] for i in range(3)]


def quat_to_matrix(q):
    x, y, z, w = q
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]


def matrix_to_quat(r):
    tr = r[0][0] + r[1][1] + r[2][2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        w, x, y, z = (
            0.25 * s,
            (r[2][1] - r[1][2]) / s,
            (r[0][2] - r[2][0]) / s,
            (r[1][0] - r[0][1]) / s,
        )
    elif r[0][0] > r[1][1] and r[0][0] > r[2][2]:
        s = math.sqrt(1.0 + r[0][0] - r[1][1] - r[2][2]) * 2
        w, x, y, z = (
            (r[2][1] - r[1][2]) / s,
            0.25 * s,
            (r[0][1] + r[1][0]) / s,
            (r[0][2] + r[2][0]) / s,
        )
    elif r[1][1] > r[2][2]:
        s = math.sqrt(1.0 + r[1][1] - r[0][0] - r[2][2]) * 2
        w, x, y, z = (
            (r[0][2] - r[2][0]) / s,
            (r[0][1] + r[1][0]) / s,
            0.25 * s,
            (r[1][2] + r[2][1]) / s,
        )
    else:
        s = math.sqrt(1.0 + r[2][2] - r[0][0] - r[1][1]) * 2
        w, x, y, z = (
            (r[1][0] - r[0][1]) / s,
            (r[0][2] + r[2][0]) / s,
            (r[1][2] + r[2][1]) / s,
            0.25 * s,
        )
    return normalize_quat(x, y, z, w)


def transform_quat(q, basis):
    # Change orientation basis the same way positions are mapped: R' = M R M^T.
    # For a signed permutation M (incl. reflections, det=-1) this stays a proper
    # rotation, so the quaternion lives in the same frame as the mapped positions.
    rotated = _matmul(_matmul(basis, quat_to_matrix(q)), _transpose(basis))
    return matrix_to_quat(rotated)


def _lerp3(a, b, u):
    return [a[i] + (b[i] - a[i]) * u for i in range(3)]


def resample(frames, target_fps=TARGET_FPS):
    """Resample source frames to a fixed cadence with position lerp + quat slerp.

    The fixed grid always includes the true final timestamp so the last source
    segment survives (a short final step is expected). Each output frame's
    segment is the phase active at that time (step function over source rows),
    which keeps the full phase sequence rather than picking the nearer endpoint.
    """
    if len(frames) < 2:
        return list(frames)
    frames = sorted(frames, key=lambda f: f["t_ms"])
    step = 1000.0 / target_fps
    t0, t1 = frames[0]["t_ms"], frames[-1]["t_ms"]

    steps = int(math.floor((t1 - t0) / step + 1e-9))
    times = [t0 + k * step for k in range(steps + 1)]
    if abs(times[-1] - t1) > 1e-6:
        times.append(t1)  # guarantee a sample at the true end

    out = []
    for t in times:
        i = 0
        while i < len(frames) - 2 and frames[i + 1]["t_ms"] <= t:
            i += 1
        f0, f1 = frames[i], frames[i + 1]
        span = (f1["t_ms"] - f0["t_ms"]) or 1.0
        u = min(max((t - f0["t_ms"]) / span, 0.0), 1.0)

        # Active phase = last source row at or before t (step function).
        seg_idx = 0
        for j in range(len(frames)):
            if frames[j]["t_ms"] <= t + 1e-9:
                seg_idx = j
            else:
                break

        out.append(
            {
                "t_ms": t,
                "segment": frames[seg_idx]["segment"],
                "left": {
                    "pos": _lerp3(f0["left"]["pos"], f1["left"]["pos"], u),
                    "quat": slerp(f0["left"]["quat"], f1["left"]["quat"], u),
                    "jaw": (f0 if u < 0.5 else f1)["left"]["jaw"],
                },
                "right": {
                    "pos": _lerp3(f0["right"]["pos"], f1["right"]["pos"], u),
                    "quat": slerp(f0["right"]["quat"], f1["right"]["quat"], u),
                    "jaw": (f0 if u < 0.5 else f1)["right"]["jaw"],
                },
            }
        )
    return out


def _tool_state(tool_id, side):
    pos = {"x": side["pos"][0], "y": side["pos"][1], "z": side["pos"][2]}
    return {
        "id": tool_id,
        "position": pos,
        "rotation": {
            "x": side["quat"][0],
            "y": side["quat"][1],
            "z": side["quat"][2],
            "w": side["quat"][3],
        },
        "tipPosition": dict(pos),
        "jawClosed": bool(side["jaw"]),
    }


def _derive_segments(frames):
    segs = []
    for fr in frames:
        if segs and segs[-1]["id"] == fr["segmentId"]:
            segs[-1]["endMs"] = fr["tMs"]
        else:
            segs.append({"id": fr["segmentId"], "startMs": fr["tMs"], "endMs": fr["tMs"]})
    return segs


def build_reference(
    source_frames,
    *,
    skill_id,
    reference_id,
    source_type,
    source_name,
    axis_map,
    origin,
    scale,
):
    basis = axis_map_to_matrix(axis_map)
    transformed = []
    for f in source_frames:
        transformed.append(
            {
                "t_ms": float(f["t_ms"]),
                "segment": f["segment"],
                "left": {
                    "pos": transform_position(f["left"]["pos"], axis_map, origin, scale),
                    "quat": transform_quat(normalize_quat(*f["left"]["quat"]), basis),
                    "jaw": f["left"]["jaw"],
                },
                "right": {
                    "pos": transform_position(f["right"]["pos"], axis_map, origin, scale),
                    "quat": transform_quat(normalize_quat(*f["right"]["quat"]), basis),
                    "jaw": f["right"]["jaw"],
                },
            }
        )

    resampled = resample(transformed, TARGET_FPS)
    t0 = resampled[0]["t_ms"]
    total = (resampled[-1]["t_ms"] - t0) or 1.0

    frames_out = []
    for fr in resampled:
        prog = min(max((fr["t_ms"] - t0) / total, 0.0), 1.0)
        frames_out.append(
            {
                "tMs": round(fr["t_ms"] - t0, 3),
                "segmentId": fr["segment"],
                "normalizedProgress": round(prog, 6),
                "leftTool": _tool_state("left-tool", fr["left"]),
                "rightTool": _tool_state("right-tool", fr["right"]),
            }
        )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": reference_id,
        "skillId": skill_id,
        "sourceType": source_type,
        "sourceName": source_name,
        "coordinateSystem": CANONICAL_COORDINATE_SYSTEM,
        "fps": TARGET_FPS,
        "segments": _derive_segments(frames_out),
        "frames": frames_out,
    }


def write_reference(reference, out_path):
    with open(out_path, "w", newline="\n") as fh:
        json.dump(reference, fh, indent=2)
        fh.write("\n")
