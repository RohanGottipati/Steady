"use client";

import { lazy, Suspense } from "react";
import { trainingTargetKind } from "@/data/training-targets";
import { PegTransferBoard } from "./peg-transfer-board";
import { FallbackTrainingTarget, SyntheticTissuePad } from "./synthetic-tissue-pad";
import { TissueKnotTrainer } from "./tissue-knot-trainer";
import type { OrganId } from "./organ-map";

// Loaded only by procedure modules so simple exercises never fetch the anatomy GLB.
const SurgicalAnatomy = lazy(() => import("./surgical-anatomy"));

/**
 * Exercise-specific visual layer rendered inside TrainingField, underneath the existing
 * checkpoint, ghost, needle and instrument layers. Purely presentational.
 */
export function TrainingTarget({
  skillId,
  performanceMode = false,
  highlightOrgans,
}: {
  skillId?: string;
  performanceMode?: boolean;
  highlightOrgans?: readonly OrganId[];
}) {
  switch (trainingTargetKind(skillId)) {
    case "synthetic-tissue-pad":
      return <SyntheticTissuePad performanceMode={performanceMode} />;
    case "tissue-knot-trainer":
      return <TissueKnotTrainer performanceMode={performanceMode} />;
    case "peg-transfer-board":
      return <PegTransferBoard />;
    case "surgical-anatomy":
      return (
        <Suspense fallback={<FallbackTrainingTarget performanceMode={performanceMode} />}>
          <SurgicalAnatomy highlight={highlightOrgans} />
        </Suspense>
      );
    default:
      return <FallbackTrainingTarget performanceMode={performanceMode} />;
  }
}
