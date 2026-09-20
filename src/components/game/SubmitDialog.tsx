import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { BoltAccent } from '@/components/decor/BoltAccent'

export function SubmitDialog({
  open,
  onCancel,
  onConfirm,
  submitting,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={
        <span className="relative inline-flex items-center gap-2">
          Submit Your Game?
          <BoltAccent className="h-5 w-5 text-warning" />
        </span>
      }
      variant="impact"
      footer={
        <>
          <Button variant="secondary" chunky onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" chunky onClick={onConfirm} loading={submitting}>
            Submit
          </Button>
        </>
      }
    >
      You will not be able to continue editing after submission.
    </Modal>
  )
}
