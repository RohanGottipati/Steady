/** Fills an already-sized scene frame. It does not cover controls outside that frame. */
export function ViewportLoading({ label }: { label: string }) {
  return (
    <div
      data-testid="viewport-loading"
      aria-hidden="true"
      className="absolute inset-0 z-20 flex items-center justify-center bg-[#101e29] text-slate-100"
    >
      <div className="flex max-w-[16rem] flex-col items-center gap-3 px-4 text-center">
        <span className="size-8 rounded-full border-2 border-slate-500 border-t-slate-100 motion-safe:animate-spin motion-reduce:animate-none" />
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}
