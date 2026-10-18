"use client";
import dynamic from "next/dynamic";
const Preview = dynamic(() => import("./training-target-preview-canvas"), {
  ssr: false,
  loading: () => <p className="p-8 text-sm text-white/60">Loading training targets…</p>,
});
export function TrainingTargetPreview() {
  return <Preview />;
}
