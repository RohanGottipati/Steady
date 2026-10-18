export function scoreTone(score: number) {
  return score >= 80
    ? { text: "text-emerald-700", bar: "bg-emerald-500" }
    : score >= 60
      ? { text: "text-amber-700", bar: "bg-amber-500" }
      : { text: "text-red-700", bar: "bg-red-500" };
}
