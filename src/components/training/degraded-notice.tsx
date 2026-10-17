"use client";

export function DegradedNotice({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="status"
      data-testid="degraded-notice"
      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p>{message}</p>
      <button
        type="button"
        data-testid="dismiss-degraded-notice"
        onClick={onDismiss}
        className="rounded border border-amber-500 px-3 py-1 font-medium"
      >
        Dismiss
      </button>
    </div>
  );
}
