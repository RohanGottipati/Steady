export function scoreTone(score: number) {
  return score >= 80
    ? { text: "text-emerald-300", bar: "bg-emerald-500" }
    : score >= 60
      ? { text: "text-amber-300", bar: "bg-amber-500" }
      : { text: "text-red-300", bar: "bg-red-500" };
}
