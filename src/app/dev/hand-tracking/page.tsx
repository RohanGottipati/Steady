import { notFound } from "next/navigation";
import Link from "next/link";
import { HandTrackingPreview } from "@/components/camera/hand-tracking-preview";

export default function HandTrackingPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
    <Link href="/library" className="text-sm underline underline-offset-4">← Library</Link>
    <h1 className="text-3xl font-semibold">Hand tracking development preview</h1>
    <p>Start the camera and calibrate both hands. Open your thumb and index finger, move a colored tip ring inside the needle’s circle, then pinch when it turns green. Easy pickup helps with depth by default.</p>
    <HandTrackingPreview />
  </main>;
}
