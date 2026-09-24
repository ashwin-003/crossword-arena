import { Lock, Check } from 'lucide-react'
import type { GameSectionRow } from '@/types/database'

interface SectionTabsProps {
  sections: GameSectionRow[]
  activeSectionId: string | null
  lockedSectionIds?: Set<string>
  submittedSectionIds?: Set<string>
  unlockedSectionIds?: Set<string>
  sectionRemainingSeconds?: Record<string, number>
  onSelect: (sectionId: string) => void
  disabled?: boolean
}

export function SectionTabs({
  sections,
  activeSectionId,
  lockedSectionIds = new Set(),
  submittedSectionIds = new Set(),
  unlockedSectionIds,
  onSelect,
  disabled = false,
}: SectionTabsProps) {
  if (sections.length === 0) return null

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {sections.map((section, idx) => {
        const isActive = section.id === activeSectionId
        const isSubmitted = submittedSectionIds.has(section.id)
        const isLocked = lockedSectionIds.has(section.id) || (unlockedSectionIds ? !unlockedSectionIds.has(section.id) && !isSubmitted : false)

        return (
          <button
            key={section.id}
            type="button"
            disabled={disabled || (isLocked && !isSubmitted)}
            onClick={() => {
              if (!isLocked || isSubmitted) {
                onSelect(section.id)
              }
            }}
            className={[
              'relative flex shrink-0 items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-xs font-bold uppercase tracking-wide transition-all duration-200',
              isActive
                ? 'border-accent-purple bg-accent-purple/20 text-accent-purple shadow-[0_0_14px_rgba(168,85,247,0.3)]'
                : isSubmitted
                  ? 'border-success/40 bg-success/10 text-success hover:border-success/70'
                  : isLocked
                    ? 'cursor-not-allowed border-border/60 bg-surface/30 text-text-muted opacity-50'
                    : 'border-border-strong bg-surface/60 text-text-secondary hover:border-accent-cyan/50 hover:text-text-primary',
            ].join(' ')}
          >
            <span className="font-mono text-[10px] opacity-70">#{idx + 1}</span>

            {/* Section Name */}
            <span className="flex items-center gap-1">
              {isSubmitted ? (
                <Check size={12} className="text-success" />
              ) : isLocked ? (
                <Lock size={11} className="text-text-muted" />
              ) : null}
              {section.name}
            </span>

            {/* Status Badge */}
            {isSubmitted ? (
              <span className="rounded bg-success/20 px-1.5 py-0.5 font-mono text-[9px] font-extrabold uppercase text-success">
                SUBMITTED
              </span>
            ) : isLocked ? (
              <span className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[9px] font-extrabold uppercase text-text-muted">
                LOCKED
              </span>
            ) : isActive ? (
              <span className="rounded bg-accent-purple/20 px-1.5 py-0.5 font-mono text-[9px] font-extrabold uppercase text-accent-purple animate-pulse">
                ACTIVE
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
