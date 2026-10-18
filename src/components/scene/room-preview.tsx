"use client";
import dynamic from "next/dynamic";
const Preview = dynamic(() => import("./room-preview-canvas"), {
  ssr: false,
  loading: () => (
    <p className="p-8 text-sm text-white/60">Loading operating room preview…</p>
  ),
});
export function OperatingRoomPreview() {
  return <Preview />;
}
