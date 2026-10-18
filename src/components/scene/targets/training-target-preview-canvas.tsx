"use client";
import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import { configureRoomRenderer } from "@/lib/ui/room-renderer";
import { RoomCamera, RoomScenery, TrainingField } from "../room-environment";
import { ExerciseTargets } from "../exercise-targets";
import { PegTransferTargets } from "../peg-transfer-targets";
import { PracticeNeedle, PracticePeg } from "../operating-room";
import { TrainingTarget } from "./training-target";
import { ORGAN_IDS, type OrganId } from "./organ-map";

const SKILLS = ["needle-passing", "suturing", "knot-tying", "peg-transfer", "cholecystectomy"] as const;

/** Development-only viewer for every exercise target inside the operating room. */
export default function TrainingTargetPreviewCanvas() {
  const [skill, setSkill] = useState<(typeof SKILLS)[number]>(() => {
    const requested = new URLSearchParams(window.location.search).get("skill");
    return SKILLS.find((id) => id === requested) ?? "needle-passing";
  });
  const [highlight, setHighlight] = useState<OrganId[]>([]);
  const needleLayers = skill === "needle-passing";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Training target">
        {SKILLS.map((id) => (
          <button key={id} type="button" aria-pressed={skill === id} onClick={() => setSkill(id)}
            className={`rounded-full border px-3 py-1 text-sm ${skill === id ? "bg-white text-slate-900" : "text-white"}`}>
            {id}
          </button>
        ))}
      </div>
      {skill === "cholecystectomy" && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Highlight organ">
          {ORGAN_IDS.map((organ) => (
            <button key={organ} type="button" aria-pressed={highlight.includes(organ)}
              onClick={() => setHighlight((current) => current.includes(organ) ? current.filter((o) => o !== organ) : [...current, organ])}
              className={`rounded-full border px-3 py-1 text-xs ${highlight.includes(organ) ? "bg-sky-400 text-slate-900" : "text-white"}`}>
              {organ}
            </button>
          ))}
        </div>
      )}
      <div className="h-[70vh] overflow-hidden rounded-xl border border-white/10">
        <Canvas shadows="percentage" camera={{ fov: 50, near: 0.05, far: 40 }} dpr={[1, 1.5]}
          onCreated={({ gl }) => { configureRoomRenderer(gl); }} aria-label="Training target preview">
          <RoomCamera />
          <RoomScenery />
          <TrainingField>
            <TrainingTarget skillId={skill} highlightOrgans={highlight} />
            {needleLayers && <><ExerciseTargets /><PracticeNeedle /></>}
            {skill === "peg-transfer" && <><PegTransferTargets /><PracticePeg /></>}
          </TrainingField>
        </Canvas>
      </div>
    </div>
  );
}
