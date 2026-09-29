import { AlertTriangle, ShieldAlert, Lock, AlertOctagon, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface AntiMalpracticeModalProps {
  violationCount: number
  maxViolations?: number
  isOpen: boolean
  isSubmitting?: boolean
  isDuplicateTab?: boolean
  onAcknowledge: () => void
}

export function AntiMalpracticeModal({
  violationCount,
  maxViolations = 3,
  isOpen,
  isSubmitting = false,
  isDuplicateTab = false,
  onAcknowledge,
}: AntiMalpracticeModalProps) {
  if (!isOpen && !isDuplicateTab) return null

  // Duplicate Tab Blocker
  if (isDuplicateTab) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/95 p-4 backdrop-blur-md">
        <div className="w-full max-w-md rounded-2xl border border-danger/40 bg-surface-elevated p-6 text-center shadow-2xl animate-fade-in-up">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger ring-8 ring-danger/5">
            <Lock size={28} />
          </div>

          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-danger">
            Session Locked
          </div>

          <h2 className="mb-2 font-display text-xl font-black uppercase tracking-wide text-text-primary">
            Multiple Tabs Detected
          </h2>

          <p className="mb-6 text-sm leading-relaxed text-text-secondary">
            Crossword Arena detected that your competition session is already active in another tab or window. To maintain fair play, concurrent test sessions are strictly prohibited.
          </p>

          <div className="rounded-xl border border-border bg-bg/60 p-4 text-xs font-medium text-text-muted">
            Please close this tab and continue in your <span className="font-semibold text-text-primary">original browser tab</span>.
          </div>
        </div>
      </div>
    )
  }

  // Strike 3: Automatic Submission Modal
  if (violationCount >= maxViolations) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/95 p-4 backdrop-blur-md">
        <div className="w-full max-w-md rounded-2xl border border-danger/50 bg-surface-elevated p-6 text-center shadow-2xl animate-fade-in-up">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/15 text-danger ring-8 ring-danger/5">
            <AlertOctagon size={36} />
          </div>

          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/10 px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider text-danger">
            Violations: {maxViolations} / {maxViolations}
          </div>

          <h2 className="mb-2 font-display text-2xl font-black uppercase tracking-wide text-danger">
            Test Automatically Submitted
          </h2>

          <p className="mb-6 text-sm leading-relaxed text-text-secondary">
            You have reached the maximum allowed limit of <span className="font-bold text-text-primary">{maxViolations} screen-exit violations</span>. Your test has been submitted automatically with your saved answers.
          </p>

          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-bg/60 p-4 text-sm font-semibold text-text-muted">
            <Loader2 size={20} className="animate-spin text-accent-cyan" />
            <span>
              {isSubmitting
                ? 'Finalizing your match and saving results...'
                : 'Test locked. Moving to waiting screen...'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Strike 2: Strong / Final Warning Modal
  if (violationCount === 2) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-bg/90 p-4 backdrop-blur-md">
        <div className="w-full max-w-md rounded-2xl border border-warning/60 bg-surface-elevated p-6 text-center shadow-2xl animate-fade-in-up">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/15 text-warning ring-8 ring-warning/5 animate-pulse">
            <ShieldAlert size={30} />
          </div>

          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-warning">
            Violations: 2 / {maxViolations}
          </div>

          <h2 className="mb-2 font-display text-xl font-black uppercase tracking-wide text-warning">
            Final Warning: Test Screen Left
          </h2>

          <p className="mb-4 text-sm leading-relaxed text-text-secondary">
            This is your <span className="font-bold text-text-primary">second violation</span> for leaving the test window or switching applications.
          </p>

          <div className="mb-6 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-bold leading-normal text-danger">
            WARNING: One more violation will AUTOMATICALLY SUBMIT your test immediately and lock all answers.
          </div>

          <Button
            onClick={onAcknowledge}
            size="lg"
            className="w-full justify-center bg-warning text-bg hover:bg-warning/90 font-bold"
          >
            <span>I Understand — Return to Test</span>
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    )
  }

  // Strike 1: First Warning Modal
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-bg/90 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-accent-cyan/40 bg-surface-elevated p-6 text-center shadow-2xl animate-fade-in-up">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-cyan/15 text-accent-cyan ring-8 ring-accent-cyan/5">
          <AlertTriangle size={28} />
        </div>

        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent-cyan/40 bg-accent-cyan/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-accent-cyan">
          Violations: 1 / {maxViolations}
        </div>

        <h2 className="mb-2 font-display text-xl font-black uppercase tracking-wide text-text-primary">
          Warning: You Left the Test Screen
        </h2>

        <p className="mb-4 text-sm leading-relaxed text-text-secondary">
          You navigated away from the test window (switched tabs, minimized browser, or opened another application). This incident has been recorded.
        </p>

        <div className="mb-6 rounded-xl border border-border bg-bg/60 p-3 text-xs font-medium text-text-muted">
          You have <span className="font-bold text-text-primary">2 warnings remaining</span> before your test is automatically submitted.
        </div>

        <Button
          onClick={onAcknowledge}
          size="lg"
          variant="primary"
          className="w-full justify-center font-bold"
        >
          <span>Return to Test</span>
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  )
}
