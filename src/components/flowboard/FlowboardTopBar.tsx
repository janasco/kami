import type { FlowboardExportGate } from '../../lib/flowboardExportState'
import type { ExportProfile } from '../../types'
import type { PersistenceStatus } from '../TopToolbar'

interface FlowboardTopBarProps {
  projectName: string
  onProjectNameChange: (name: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onSaveProject: () => void
  onOpenProject: () => void
  onExport: () => void
  /**
   * The one export gate the whole shell shares, so this bar and the Ship stage
   * can never disagree about whether the deck can be exported.
   */
  exportGate: FlowboardExportGate
  exportDetail: string
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

/**
 * Slim top bar for the Flowboard shell. The classic editor keeps its own
 * toolbar, so project actions live here without duplicating canvas controls.
 *
 * The bar is the project surface: the name, the local draft status, and the
 * project actions. Which stage is open, what state it is in, and the way out of
 * the Full editor are all the rail's job, so none of them are printed here a
 * second time.
 */
export function FlowboardTopBar({
  projectName,
  onProjectNameChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSaveProject,
  onOpenProject,
  onExport,
  exportGate,
  exportDetail,
  persistenceStatus,
  persistenceDetail,
  profile,
}: FlowboardTopBarProps) {
  return (
    <header className="flowboard-topbar">
      <a
        className="brand"
        href={import.meta.env.BASE_URL}
        aria-label="Back to Kami landing page"
        title="Back to Kami landing page"
      >
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>Kami</span>
      </a>

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

      <div className="flowboard-topbar__actions">
        <button
          className="button button--quiet"
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? 'Undo (⌘Z or Ctrl+Z)' : 'Nothing to undo'}
        >
          <span aria-hidden="true">↶</span> Undo
        </button>
        <button
          className="button button--quiet"
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title={canRedo ? 'Redo (⇧⌘Z or Shift+Ctrl+Z)' : 'Nothing to redo'}
        >
          <span aria-hidden="true">↷</span> Redo
        </button>
        <button className="button button--outline" type="button" onClick={onOpenProject}>
          <span aria-hidden="true">↥</span> Open
        </button>
        <button
          className="button button--outline"
          type="button"
          onClick={onSaveProject}
          title="Download screenshot-studio.json — use this JSON file for Git"
        >
          <span aria-hidden="true">↓</span> Save JSON
        </button>
        <button
          className="button button--primary"
          type="button"
          onClick={onExport}
          disabled={!exportGate.enabled}
          aria-busy={exportGate.exporting}
          aria-describedby="flowboard-export-gate"
          title={`${profile.name} · ${profile.width} × ${profile.height} px — ${exportGate.message}`}
        >
          {exportGate.exporting
            ? exportGate.label
            : exportGate.blocked
              ? 'Export blocked'
              : 'Export'}
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/*
        The gate reason used to live only in the Export button's title
        attribute, so a blocked export looked like a dead button with no
        explanation. It is now a real, visible status line that the button
        also points at, so screen readers and sighted authors read the same
        sentence. With nothing to report the line stays visually hidden, so a
        clean deck keeps a quiet top bar and the describedby target stays valid.
      */}
      <p
        id="flowboard-export-gate"
        className={`flowboard-topbar__gate flowboard-topbar__gate--${exportGate.reason}${
          exportGate.reason === 'ready' && !exportDetail ? ' visually-hidden' : ''
        }`}
        role="status"
        aria-live="polite"
      >
        {exportGate.reason === 'ready'
          ? (exportDetail || exportGate.message)
          : exportGate.message}
      </p>
    </header>
  )
}
