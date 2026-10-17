# Data Licenses

Track external dataset licenses and redistribution constraints before including any source data in the repository.

Per plan §7.2, before integrating any **real** dataset, confirm and record its
source URL, access/license terms, whether raw data may be stored locally,
whether derived reference motion may be deployed publicly, and the required
attribution text.

| Dataset | License / Terms | Source URL | Raw stored locally? | Derived deployable? | Attribution | Status |
|---------|-----------------|-----------|---------------------|---------------------|-------------|--------|
| JIGSAWS | Academic research use only, **not for commercial use** (JHU IRB-approved) | Access form: https://www.cs.jhu.edu/~los/jigsaws/info.php (emails a per-day download link); info: https://cirl.lcsr.jhu.edu/research/hmm/datasets/jigsaws_release/ | Yes — git-ignored `datasets/jigsaws/` only, never committed | Yes, for this non-commercial prototype — derived reference motion committed with attribution; must be removed if Steady is ever commercialized | Gao et al. 2014 (see Citation below) | **Acquired; derived references committed** |
| LASK | CC BY 4.0 (project-stated, unverified) | _to confirm_ | _to confirm_ | Pending — CC BY 4.0 would allow it **with attribution**, but confirm URL + exact attribution text first | _to confirm_ | Not used (needle-passing now sourced from JIGSAWS) |
| SHANDS | TBD | _to confirm_ | TBD | TBD | _to confirm_ | Optional future source |

Adapters: `scripts/data/jigsaws/adapter.py`, `scripts/data/lask/adapter.py`.

## JIGSAWS integration (B4)

The three JIGSAWS skills ship as **real expert-derived** canonical references; the
non-JIGSAWS skill (peg-transfer) remains a synthetic LASK-format fixture.

Committed references under `public/references/` (coordinate-transformed to
`scene-canonical-v1`, 30 Hz, segment-normalized; `sourceType: dataset`):

| Skill | Source trial | Skill rating | Frames |
|-------|--------------|--------------|--------|
| needle-passing | `Needle_Passing_E005` | Expert, GRS 17 | 3233 |
| knot-tying | `Knot_Tying_E003` | Expert, GRS 22 | 1198 |
| suturing | `Suturing_E002` | Expert, GRS 20 | 2926 |
| peg-transfer | synthetic (LASK format) | n/a | — |

Trials are the highest-GRS **expert** (`E`) demonstration per task. Only the
patient-side (Slave) manipulator channels are used — the actual instrument tips
in the surgical field. The derived JSON contains tool position (m), orientation,
jaw state, and gesture-segment labels only — **no raw dataset frames, no video**.

Acquisition is a local dev step (`scripts/data/jigsaws/fetch.py` / the JHU access
form); raw archives stay in git-ignored `datasets/jigsaws/`. The gesture-segment
ids (`G1`–`G15`) are JIGSAWS's annotated gesture vocabulary.

### Citation (required by JIGSAWS terms)

> Yixin Gao, S. Swaroop Vedula, Carol E. Reiley, Narges Ahmidi, Balakrishnan
> Varadarajan, Henry C. Lin, Lingling Tao, Luca Zappella, Benjamín Béjar, David D.
> Yuh, Chi Chiung Grace Chen, René Vidal, Sanjeev Khudanpur and Gregory D. Hager.
> *The JHU-ISI Gesture and Skill Assessment Working Set (JIGSAWS): A Surgical
> Activity Dataset for Human Motion Modeling.* In Modeling and Monitoring of
> Computer Assisted Interventions (M2CAI) – MICCAI Workshop, 2014.

This attribution must appear wherever the derived references are used in-product.

## Constraints

No raw external dataset is committed. Raw data must live outside git under
git-ignored `datasets/` (and the `**/*/raw/` patterns in `.gitignore`). The
committed derived references are a substantially transformed product (per-frame
tool trajectories, resampled and normalized), not the raw dataset, and are used
non-commercially with attribution. If Steady is ever commercialized, re-confirm
JIGSAWS terms and remove or re-license these references.
