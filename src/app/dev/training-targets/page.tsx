import { notFound } from "next/navigation";
import Link from "next/link";
import { TrainingTargetPreview } from "@/components/scene/targets/training-target-preview";

export default function TrainingTargetsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-6 py-8">
      <Link href="/library" className="text-sm underline underline-offset-4">← Library</Link>
      <h1 className="text-2xl font-semibold">Training target development preview</h1>
      <TrainingTargetPreview />
    </main>
  );
}
