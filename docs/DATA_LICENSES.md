# Data Licenses

Track external dataset licenses and redistribution constraints before including any source data in the repository.

Per plan §7.2, before integrating any **real** dataset, confirm and record its
source URL, access/license terms, whether raw data may be stored locally,
whether derived reference motion may be deployed publicly, and the required
attribution text. Nothing below is settled until those fields are filled in from
the authoritative source.

| Dataset | License / Terms | Source URL | Raw stored locally? | Derived deployable? | Attribution | Status |
|---------|-----------------|-----------|---------------------|---------------------|-------------|--------|
| JIGSAWS | Academic research use only | _to confirm_ | No (keep under git-ignored `datasets/`) | No — not without written confirmation | _to confirm_ | Not cleared |
| LASK | CC BY 4.0 (project-stated, unverified) | _to confirm_ | _to confirm_ | Pending — CC BY 4.0 would allow it **with attribution**, but confirm URL + exact attribution text first | _to confirm_ | Pending confirmation |
| SHANDS | TBD | _to confirm_ | TBD | TBD | _to confirm_ | Optional future source |

Adapters: `scripts/data/jigsaws/adapter.py`, `scripts/data/lask/adapter.py`.

No raw external dataset is committed. Raw data must live outside git under
`datasets/` (git-ignored). B2 currently ships only **synthetic** sample CSVs
under `scripts/data/<dataset>/` and synthetic derived fixtures under
`public/references/` (`sourceType: internal-recording`, names marked synthetic)
— these contain no real dataset content, so no dataset license applies to them
yet. Fill in the table above from the authoritative source before integrating or
deploying any real derived reference motion.
