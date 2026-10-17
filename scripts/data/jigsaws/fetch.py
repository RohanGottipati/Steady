#!/usr/bin/env python3
"""Local-only JIGSAWS extraction helper (NOT part of the committed build).

JIGSAWS is academic/non-commercial licensed (JHU-ISI, Gao et al. 2014). The
authoritative source is the JHU access form:

  https://www.cs.jhu.edu/~los/jigsaws/info.php

Fill it in (name/email/organization), accept the academic-use terms, and the
server emails same-day download links for Knot-Tying, Needle-Passing, Suturing
and Experimental-setup. Download the three task archives (they contain the
`kinematics/AllGestures/*.txt` files this adapter needs) to a local folder.

NOTE: do NOT use a Kaggle mirror for the kinematics — the commonly-indexed mirror
(`aditya9790/jigsaws-skill-assessment-working-set`) ships only the
Experimental_setup split files, no kinematics.

This script only extracts those already-downloaded archives into the git-ignored
`datasets/jigsaws/` tree. It never downloads anything, never commits raw data, and
is not wired into the build.

Usage:
  python scripts/data/jigsaws/fetch.py [--source DIR]

  --source DIR   Folder containing Knot_Tying.zip, Needle_Passing.zip,
                 Suturing.zip (default: your Downloads folder).
"""
import argparse
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEST = REPO_ROOT / "datasets" / "jigsaws"
ARCHIVES = ["Knot_Tying.zip", "Needle_Passing.zip", "Suturing.zip"]


def main() -> int:
    ap = argparse.ArgumentParser(description="Extract JHU-form JIGSAWS archives locally.")
    ap.add_argument(
        "--source",
        type=Path,
        default=Path.home() / "Downloads",
        help="Folder containing the JIGSAWS task .zip archives.",
    )
    args = ap.parse_args()

    missing = [a for a in ARCHIVES if not (args.source / a).exists()]
    if missing:
        print(
            "Missing archive(s) in "
            f"{args.source}: {', '.join(missing)}.\n"
            "Request them via the JHU access form "
            "(https://www.cs.jhu.edu/~los/jigsaws/info.php) and download the task "
            "archives there, then re-run with --source pointing at that folder.",
            file=sys.stderr,
        )
        return 1

    DEST.mkdir(parents=True, exist_ok=True)
    for archive in ARCHIVES:
        print(f"Extracting {archive} -> {DEST} ...")
        with zipfile.ZipFile(args.source / archive) as zf:
            zf.extractall(DEST)

    print("\nDone. Task folders under datasets/jigsaws/:")
    for task in sorted(p.name for p in DEST.iterdir() if p.is_dir()):
        kin = DEST / task / "kinematics" / "AllGestures"
        n = len(list(kin.glob("*.txt"))) if kin.exists() else 0
        print(f"  {task}: {n} kinematics trials")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
