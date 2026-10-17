import { notFound } from "next/navigation";
import { HandTrackingPreview } from "@/components/camera/hand-tracking-preview";

export default function HandTrackingPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
    <h1 className="text-3xl font-semibold">Hand tracking development preview</h1>
    <p>Show both open hands in good lighting. This preview verifies camera tracking; calibration and instrument control follow in A2.</p>
    <HandTrackingPreview />
  </main>;
}
