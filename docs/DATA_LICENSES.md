# Data Licenses

Track external dataset licenses and redistribution constraints before including any source data in the repository.

| Dataset | License / Terms | Redistributable? | Notes |
|---------|-----------------|------------------|-------|
| JIGSAWS | Academic research use only | No (not without written confirmation) | Do not commit raw data or deploy derived references until terms are confirmed. Adapter: `scripts/data/jigsaws/adapter.py` |
| LASK | CC BY 4.0 (project-stated) | Yes, with attribution | Cleanest source for a public reference demo; include attribution in shipped artifacts. Adapter: `scripts/data/lask/adapter.py` |
| SHANDS | TBD | TBD | Optional future source |

No raw external dataset is committed. Raw data lives outside git under `datasets/`
(git-ignored). B2 currently ships only **synthetic** sample CSVs under
`scripts/data/<dataset>/` to exercise the adapters — these contain no real
dataset content. Confirm each dataset's redistribution terms here before
integrating or deploying any real derived reference motion.
