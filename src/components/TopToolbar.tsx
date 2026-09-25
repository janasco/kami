import { CanvasModeToggle } from './CanvasModeToggle'
import type { CanvasMode, ExportProfile } from '../types'

export type PersistenceStatus = 'loading' | 'saving' | 'saved' | 'error' | 'open-error'
export type ExportStatus = 'idle' | 'exporting' | 'success' | 'error' | 'validation'

interface TopToolbarProps {
  projectName: string
  onProjectNameChange: (name: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onTemplates: () => void
  templatesDisabled: boolean
  onOpenGuide: () => void
  onImport: () => void
  onImportMultiple: () => void
  onOpen: () => void
  onSave: () => void
  onExport: () => void
  exportStatus: ExportStatus
  exportDetail: string
  exportCompleted: number
  exportTotal: number
  canvasMode: CanvasMode
  onCanvasModeChange: (mode: CanvasMode) => void
  persistenceStatus: PersistenceStatus
  persistenceDetail: string
  profile: ExportProfile
}

const persistenceLabel: Record<PersistenceStatus, string> = {
  loading: 'Loading local draft…',
  saving: 'Saving locally…',
  saved: 'Saved locally',
  error: 'Save failed',
  'open-error': 'Open failed',
}

export function TopToolbar({
  projectName,
  onProjectNameChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTemplates,
  templatesDisabled,
  onOpenGuide,
  onImport,
  onImportMultiple,
  onOpen,
  onSave,
  onExport,
  exportStatus,
  exportDetail,
  exportCompleted,
  exportTotal,
  canvasMode,
  onCanvasModeChange,
  persistenceStatus,
  persistenceDetail,
  profile,
}: TopToolbarProps) {
  return (
    <header className="top-toolbar">
      <div className="brand" aria-label="Kami home">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>Kami</span>
      </div>

      <div className="top-toolbar__divider" />

      <div className="project-title">
        <span className="project-title__label">Project</span>
        <input
          aria-label="Project name"
          value={projectName}
          onChange={(event) => onProjectNameChange(event.target.value)}
          spellCheck={false}
        />
        <span
          className={`project-title__status project-title__status--${persistenceStatus}`}
          role="status"
          aria-live="polite"
          title={persistenceDetail}
        >
          <span className="status-dot" /> {persistenceLabel[persistenceStatus]}
        </span>
      </div>

      <div className="top-toolbar__actions">
        <CanvasModeToggle
          mode={canvasMode}
          onChange={onCanvasModeChange}
          className="canvas-mode-toggle--top"
        />
        <button
          className="button button--quiet button--history button--undo"
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? 'Undo (⌘Z or Ctrl+Z)' : 'Nothing to undo'}
        >
          <span aria-hidden="true">↶</span> Undo
        </button>
        <button
          className="button button--quiet button--history button--redo"
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title={canRedo ? 'Redo (⇧⌘Z or Shift+Ctrl+Z)' : 'Nothing to redo'}
        >
          <span aria-hidden="true">↷</span> Redo
        </button>
        <button className="button button--quiet" type="button" onClick={onTemplates} disabled={templatesDisabled}>
          <span aria-hidden="true">✦</span> Templates
        </button>
        <button
          className="button button--quiet onboarding-guide-button"
          type="button"
          onClick={onOpenGuide}
          aria-label="Open the Kami editor guide"
          title="Open the Kami editor guide"
        >
          <span aria-hidden="true">?</span>
        </button>
        <button className="button button--quiet" type="button" onClick={onImport}>
          <span aria-hidden="true">↑</span> Import screenshot
        </button>
        <button className="button button--quiet" type="button" onClick={onImportMultiple}>
          <span aria-hidden="true">⇞</span> Import multiple
        </button>
        <button className="button button--outline" type="button" onClick={onOpen}>
          <span aria-hidden="true">↥</span> Open
        </button>
        <button
          className="button button--primary"
          type="button"
          onClick={onSave}
          title="Download screenshot-studio.json — use this JSON file for Git"
        >
          Save project <span aria-hidden="true">↓</span>
        </button>
        <button
          className={`button button--quiet ${exportStatus === 'exporting' ? 'is-exporting' : ''}`}
          type="button"
          onClick={onExport}
          disabled={exportStatus === 'exporting'}
          title={`${profile.name} · ${profile.width} × ${profile.height} px${exportDetail ? ` — ${exportDetail}` : ''}`}
          aria-busy={exportStatus === 'exporting'}
        >
          {exportStatus === 'exporting'
            ? `Exporting ${exportCompleted}/${exportTotal}`
            : 'Export'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </header>
  )
}
