export function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border-2 border-border-strong bg-halftone bg-surface/60 px-4 py-4">
      <span className="font-mono text-2xl font-extrabold text-text-primary sm:text-3xl">{value}</span>
      <span className="font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">{label}</span>
    </div>
  )
}
