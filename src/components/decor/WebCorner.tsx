export function WebCorner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5">
        <path d="M160 0 L0 160" />
        <path d="M160 30 L30 160" />
        <path d="M160 60 L60 160" />
        <path d="M160 90 L90 160" />
        <path d="M160 120 L120 160" />
        <path d="M160 0 Q100 60 160 30" />
        <path d="M160 0 Q90 100 130 160" />
        <path d="M160 0 Q60 130 90 160" />
        <path d="M160 0 Q40 150 60 160" />
      </g>
    </svg>
  )
}
