#!/usr/bin/env python3
"""Local-only JIGSAWS fetch helper (NOT part of the committed build).

Reads KAGGLE_API_TOKEN from .env.local, authenticates kagglehub, downloads the
JIGSAWS mirror, and prints the local path + a shallow layout so the adapter can
be pointed at the kinematics files.

JIGSAWS is academic/non-commercial licensed. This script only *acquires* raw
data into kagglehub's local cache (and optionally mirrors it under the
git-ignored datasets/ tree). Do NOT commit raw data or wire this into the build.

Usage:
  python scripts/data/jigsaws/fetch.py

Requires:
  pip install kagglehub
"""
import os
import sys
from pathlib import Path

DATASET = "aditya9790/jigsaws-skill-assessment-working-set"
REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_LOCAL = REPO_ROOT / ".env.local"


def load_token_from_env_local(path: Path) -> str | None:
    """Minimal .env parser: returns KAGGLE_API_TOKEN if present (unquoted)."""
    if not path.exists():
        return None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        if key.strip() == "KAGGLE_API_TOKEN":
            return val.strip().strip('"').strip("'")
    return None


def main() -> int:
    # Prefer an already-exported env var; fall back to .env.local.
    token = os.environ.get("KAGGLE_API_TOKEN") or load_token_from_env_local(ENV_LOCAL)
    if not token:
        print(
            "KAGGLE_API_TOKEN not found in environment or .env.local.\n"
            "Add it to .env.local (KAGGLE_API_TOKEN=KGAT_...) or export it, then retry.",
            file=sys.stderr,
        )
        return 1
    os.environ["KAGGLE_API_TOKEN"] = token

    try:
        import kagglehub
    except ImportError:
        print("kagglehub is not installed. Run: pip install kagglehub", file=sys.stderr)
        return 1

    print(f"Downloading {DATASET} (this is multi-GB; first run is slow)...")
    path = Path(kagglehub.dataset_download(DATASET))
    print(f"\nDataset cached at:\n  {path}\n")

    print("Top-level layout (depth 2):")
    for entry in sorted(path.rglob("*")):
        depth = len(entry.relative_to(path).parts)
        if depth > 2:
            continue
        marker = "/" if entry.is_dir() else ""
        print(f"  {entry.relative_to(path)}{marker}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
