# Data Licenses

## Product UI reference labels (2026-10-18)

The new landing/library/workspace UI reads availability and reference labels from the canonical catalog. Playable scenes use authored synthetic guides for deterministic scoring. Optional JIGSAWS Needle Passing playback is a display/reference-demonstration choice, not the evaluation source. The supplied UI archive's claims about LASK expert data are not used. Suturing and Knot Tying now train on synthetic scene guides; their attributed JIGSAWS files stay data-only.


Track external dataset licenses and redistribution constraints before including any source data in the repository.

Per plan §7.2, before integrating any **real** dataset, confirm and record its
source URL, access/license terms, whether raw data may be stored locally,
whether derived reference motion may be deployed publicly, and the required
attribution text.

| Dataset | License / Terms | Source URL | Raw stored locally? | Derived deployable? | Attribution | Status |
|---------|-----------------|-----------|---------------------|---------------------|-------------|--------|
| JIGSAWS | Academic research use only, **not for commercial use** (JHU IRB-approved) | Access form: https://www.cs.jhu.edu/~los/jigsaws/info.php (emails same-day download links); info: https://cirl.lcsr.jhu.edu/research/hmm/datasets/jigsaws_release/ | Yes — git-ignored `datasets/jigsaws/` only, never committed | Yes, for this non-commercial prototype — derived motion committed with attribution; must be removed if Steady is ever commercialized | Gao et al. 2014 (see Citation below) | **Acquired; Needle Passing available as an optional attributed ghost; scoring remains synthetic** |
| LASK | CC BY 4.0 (project-stated, unverified) | _to confirm_ | _to confirm_ | Pending — CC BY 4.0 would allow it **with attribution**, but confirm URL + exact attribution text first | _to confirm_ | Not acquired. A7 wires only the synthetic LASK-format fixture as the Peg Transfer trainer reference |
| SHANDS | TBD | _to confirm_ | TBD | TBD | _to confirm_ | Optional future source |

Adapters: `scripts/data/jigsaws/adapter.py`, `scripts/data/lask/adapter.py`.

## JIGSAWS integration (B4)

Real expert-derived JIGSAWS references are committed as **data-only artifacts**,
one per task, at `public/references/<skill>/<skill>-jigsaws-expert-v1.json`
(coordinate-transformed to `scene-canonical-v1`, 30 Hz, segment-normalized;
`sourceType: dataset`):

| Data-only JIGSAWS ref | Source trial | Skill rating | Frames |
|-----------------------|--------------|--------------|--------|
| `needle-passing-jigsaws-expert-v1.json` | `Needle_Passing_E005` | Expert, GRS 17 | 3233 |
| `knot-tying-jigsaws-expert-v1.json` | `Knot_Tying_E003` | Expert, GRS 22 | 1198 |
| `suturing-jigsaws-expert-v1.json` | `Suturing_E002` | Expert, GRS 20 | 2926 |

**Optional display wiring for Needle Passing (A5/S1).** Its expert trial can be
selected as a workspace-fitted, gesture-mapped ghost with attribution. It never
selects the S1 scoring reference. The Suturing and Knot Tying JIGSAWS files stay
data-only for scoring and playback. They carry JIGSAWS's gesture vocabulary (`G1`–`G15`) and raw
source scale (metres, ~0.04–0.13), which do not match the skill-definition phase
labels or the scene workspace. Both skills now launch on the shared route-task
runtime with synthetic scene guides (`suturing-reference-v1`, `knot-tying-reference-v1`).
A5 maps/fits the optional Needle Passing ghost at runtime without changing these
committed data files. The **evaluation references stay synthetic**: needle-passing uses the
scene-aligned synthetic guide with id `needle-passing-reference-v1`. Peg Transfer (A7)
uses a fixed internally authored demonstration passed through the scene engine for
consistent segment boundaries, at Z=0. It is not derived from user performance.
`public/references/peg-transfer/peg-transfer-reference-v1.json` remains unchanged as
the sparse synthetic LASK-adapter fixture, not an acquired LASK recording.
The product label is “Synthetic reference (not expert data)”.

Trials are the highest-GRS **expert** (`E`) demonstration per task. Only the
patient-side (Slave) manipulator channels are used — the actual instrument tips
in the surgical field. The derived JSON contains tool position (m), orientation,
jaw state, and gesture-segment labels only — **no raw dataset frames, no video**.

Acquisition is a local dev step via the **JHU access form** (which emails the task
archives); `scripts/data/jigsaws/fetch.py` only extracts those downloaded archives
into git-ignored `datasets/jigsaws/`. Do **not** use the common Kaggle mirror for
kinematics — it ships only the Experimental_setup split files, no kinematics.

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
