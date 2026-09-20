import { useRef, useState, type ChangeEvent } from 'react'
import { Upload, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/contexts/ToastContext'
import { parseCluesCsv, CSV_TEMPLATE, type ImportedClue } from '@/utils/csvImport'

export function CsvImportButton({ onImport }: { onImport: (rows: ImportedClue[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()
  const [importing, setImporting] = useState(false)

  function handleDownloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'crossword-questions-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImporting(true)
    const reader = new FileReader()
    reader.onload = () => {
      setImporting(false)
      const text = String(reader.result ?? '')
      const { rows, errors } = parseCluesCsv(text)

      if (rows.length === 0) {
        showToast({
          variant: 'danger',
          title: 'Import failed',
          description: errors[0] ?? 'No valid rows found in that file.',
        })
        return
      }

      onImport(rows)

      if (errors.length > 0) {
        showToast({
          variant: 'warning',
          title: `Imported ${rows.length} question${rows.length === 1 ? '' : 's'} — ${errors.length} row${errors.length === 1 ? '' : 's'} skipped`,
          description: errors.slice(0, 3).join(' '),
        })
      } else {
        showToast({
          variant: 'success',
          title: `Imported ${rows.length} question${rows.length === 1 ? '' : 's'}`,
          description: 'This replaced the questions currently in the form below.',
        })
      }
    }
    reader.onerror = () => {
      setImporting(false)
      showToast({ variant: 'danger', title: 'Unable to read that file' })
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border-strong bg-surface/40 p-3">
      <p className="text-xs text-text-secondary">
        Have a lot of questions? Import them all at once from a CSV file instead of typing each one in below.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={importing}>
          <Upload size={14} />
          Import CSV
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleDownloadTemplate}>
          <Download size={14} />
          Download Template
        </Button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
      </div>
    </div>
  )
}
