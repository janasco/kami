import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatFileSize,
  readScreenshotFile,
  SCREENSHOT_IMPORT_ACCEPT,
  validateScreenshotFiles,
  type ScreenshotFileCandidate,
  type ScreenshotImportItem,
} from '../lib/screenshotImport'

interface ScreenshotImportDialogProps {
  slideCount: number
  onClose: () => void
  onImport: (items: ScreenshotImportItem[]) => void
}

type ImportPhase = 'selecting' | 'reading' | 'success' | 'error'

export function ScreenshotImportDialog({ slideCount, onClose, onImport }: ScreenshotImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [candidates, setCandidates] = useState<ScreenshotFileCandidate[]>([])
  const [phase, setPhase] = useState<ImportPhase>('selecting')
  const [progress, setProgress] = useState({ completed: 0, total: 0, currentName: '' })
  const [message, setMessage] = useState('')

  const validCandidates = useMemo(() => candidates.filter((candidate) => candidate.valid), [candidates])
  const assignedCandidates = useMemo(() => validCandidates.map((candidate, index) => ({
    ...candidate,
    createsSlide: index >= slideCount,
  })), [slideCount, validCandidates])
  const invalidCount = candidates.length - validCandidates.length
  const createdSlideCount = assignedCandidates.filter((candidate) => candidate.createsSlide).length

  useEffect(() => {
    dialogRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && phase !== 'reading') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, phase])

  const selectFiles = (files: File[]) => {
    setCandidates(validateScreenshotFiles(files))
    setPhase('selecting')
    setProgress({ completed: 0, total: 0, currentName: '' })
    setMessage('')
  }

  const importFiles = async () => {
    if (validCandidates.length === 0 || phase === 'reading') return
    const total = validCandidates.length
    setPhase('reading')
    setProgress({ completed: 0, total, currentName: total > 0 ? validCandidates[0].file.name : '' })
    setMessage(`Reading 0 of ${total} screenshots…`)

    const items: ScreenshotImportItem[] = []
    const errors: string[] = []
    for (let index = 0; index < validCandidates.length; index += 1) {
      const candidate = validCandidates[index]
      setProgress({ completed: index, total, currentName: candidate.file.name })
      setMessage(`Reading ${index + 1} of ${total} — ${candidate.file.name}`)
      try {
        items.push(await readScreenshotFile(candidate.file))
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${candidate.file.name} could not be read.`)
      }
      setProgress({ completed: index + 1, total, currentName: candidate.file.name })
    }

    if (items.length === 0 || errors.length > 0) {
      setPhase('error')
      const detail = errors.length > 0
        ? `${errors.length} file${errors.length === 1 ? '' : 's'} could not be read: ${errors[0]}`
        : 'No screenshots could be read.'
      setMessage(`${detail} The project was not changed so slide order stays intact.`)
      return
    }

    onImport(items)
    setPhase('success')
    setMessage(`Imported ${items.length} screenshot${items.length === 1 ? '' : 's'} in order.`)
  }

  return (
    <div
      className="screenshot-import-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && phase !== 'reading') onClose()
      }}
    >
      <div
        className="screenshot-import-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-import-title"
        aria-describedby="screenshot-import-description"
        tabIndex={-1}
      >
        <header className="screenshot-import-dialog__header">
          <div>
            <span className="eyebrow">Guided screenshot import</span>
            <h2 id="screenshot-import-title">Turn captures into a slide sequence</h2>
            <p id="screenshot-import-description">
              Select PNG, JPG, or WebP files. Kami uses your selection order from slide 1 onward.
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={phase === 'reading'}
            aria-label="Close screenshot import"
          >
            ×
          </button>
        </header>

        <div className="screenshot-import-dialog__body">
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            multiple
            accept={SCREENSHOT_IMPORT_ACCEPT}
            onChange={(event) => {
              selectFiles(Array.from(event.currentTarget.files ?? []))
              event.currentTarget.value = ''
            }}
            aria-label="Choose multiple app screenshots"
          />

          <button
            className="screenshot-import-dropzone"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={phase === 'reading' || phase === 'success'}
          >
            <span className="screenshot-import-dropzone__icon" aria-hidden="true">＋</span>
            <span>
              <strong>{candidates.length > 0 ? 'Choose a different group' : 'Choose screenshots'}</strong>
              <small>Select multiple files · 10 MB maximum each</small>
            </span>
          </button>

          {candidates.length === 0 ? (
            <div className="screenshot-import-empty">
              <strong>No files selected yet</strong>
              <p>Your file names and slide assignments will appear here before anything changes.</p>
            </div>
          ) : (
            <div className="screenshot-import-file-list" aria-label="Selected screenshot assignment order">
              <div className="screenshot-import-file-list__heading">
                <strong>Selection order</strong>
                <span>{validCandidates.length} valid · {invalidCount} rejected</span>
              </div>
              {candidates.map((candidate, index) => {
                const assignment = candidate.valid ? assignedCandidates.find((item) => item.file === candidate.file) : null
                return (
                  <div className={`screenshot-import-file ${candidate.valid ? '' : 'is-invalid'}`} key={`${candidate.file.name}-${index}`}>
                    <span className="screenshot-import-file__index">{candidate.valid ? assignment?.slideNumber : '—'}</span>
                    <span className="screenshot-import-file__name" title={candidate.file.name}>{candidate.file.name}</span>
                    <span className="screenshot-import-file__size">{formatFileSize(candidate.file.size)}</span>
                    <span className="screenshot-import-file__assignment">
                      {candidate.valid
                        ? assignment?.createsSlide ? `New slide ${assignment.slideNumber}` : `Slide ${assignment?.slideNumber}`
                        : candidate.error}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {validCandidates.length < slideCount && candidates.length > 0 && (
            <p className="screenshot-import-note">
              Slides {validCandidates.length + 1}–{slideCount} keep their current images and copy.
            </p>
          )}

          {phase === 'reading' && (
            <div className="screenshot-import-progress" role="status" aria-live="polite">
              <div className="screenshot-import-progress__bar">
                <span style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }} />
              </div>
              <strong>{message}</strong>
              <small>Keep this window open while the local image data is prepared.</small>
            </div>
          )}
          {phase === 'success' && (
            <div className="screenshot-import-result is-success" role="status" aria-live="polite">
              <strong>{message}</strong>
              <span>{createdSlideCount > 0 ? `${createdSlideCount} new slide${createdSlideCount === 1 ? '' : 's'} added. ` : ''}The change autosaves and can be undone.</span>
            </div>
          )}
          {phase === 'error' && (
            <div className="screenshot-import-result is-error" role="alert">
              <strong>{message}</strong>
              <span>Choose the files again or cancel. The current project is unchanged.</span>
            </div>
          )}
        </div>

        <footer className="screenshot-import-dialog__footer">
          <p>Files are embedded locally. Nothing is uploaded.</p>
          <div>
            <button className="button button--quiet" type="button" onClick={onClose} disabled={phase === 'reading'}>
              {phase === 'success' ? 'Done' : 'Cancel'}
            </button>
            {phase !== 'success' && (
              <button
                className="button button--primary"
                type="button"
                onClick={() => void importFiles()}
                disabled={validCandidates.length === 0 || phase === 'reading'}
              >
                {phase === 'reading'
                  ? `Importing ${progress.completed}/${progress.total}`
                  : `Import ${validCandidates.length || ''} screenshot${validCandidates.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
