import { EditorModeSwitch } from '../EditorModeSwitch'
import { nextFlowboardStage, type FlowboardChecklistItem, type FlowboardStageId, type FlowboardStageSummary } from '../../lib/flowboardStages'
import type { EditorMode } from '../../lib/editorMode'
import type { ExportPreflightResult } from '../../lib/exportPreflight'
import type { ExportProfile, Slide } from '../../types'
import type { ExportStatus, PersistenceStatus } from '../TopToolbar'
import { FlowboardSteps } from './FlowboardSteps'

interface FlowboardRightRailProps {
  activeStage: FlowboardStageSummary
  stages: FlowboardStageSummary[]
  onSelectStage: (id: FlowboardStageId) => void
  checklist: FlowboardChecklistItem[]
  slides: Slide[]
  captureCount: number
  profile: ExportProfile
  preflight: ExportPreflightResult
  persistenceStatus: PersistenceStatus
  persistenceDetail: string
  projectValidationNotice: string | null
  exportStatus: ExportStatus
  exportDetail: string
  onOpenGuide: () => void
  onShowClassicEditor: () => void
  /** Hands the editor-mode preference back to the App. UI-only. */
  onEditorModeChange: (mode: EditorMode) => void
  /**
   * True when the rail is a sheet rather than the desktop column. A sheet owns a
   * close button, because Escape and the scrim are not the only way out.
   */
  dismissible?: boolean
  onDismiss?: () => void
}

const persistenceLabel: Record<PersistenceStatus, string> = {
  loading: 'Loading local draft…',
  saving: 'Saving locally…',
  saved: 'Saved locally',
  error: 'Save failed',
  'open-error': 'Open failed',
}

const preflightLabel = {
  ready: 'Preflight passed',
  warnings: 'Preflight warnings',
  blocked: 'Preflight blocked',
} as const

/**
 * The one rail of the Full Editor.
 *
 * The stage navigation used to be a left column of its own and this panel was a
 * separate right column that explained the stage. They are one column now: the
 * steps, the deck facts, and the common actions read as a single surface, in
 * the order an author uses them. Each fact is stated once here rather than
 * repeated in the top bar, the stage header, and the rail, so there is one
 * place to look for the stage state, the deck numbers, and the way out.
 */
export function FlowboardRightRail({
  activeStage,
  stages,
  onSelectStage,
  checklist,
  slides,
  captureCount,
  profile,
  preflight,
  persistenceStatus,
  persistenceDetail,
  projectValidationNotice,
  exportStatus,
  exportDetail,
  onOpenGuide,
  onShowClassicEditor,
  onEditorModeChange,
  dismissible = false,
  onDismiss,
}: FlowboardRightRailProps) {
  const nextId = nextFlowboardStage(activeStage.id)
  const nextStage = stages.find((stage) => stage.id === nextId)
  const doneCount = checklist.filter((item) => item.done).length

  return (
    <aside className="flowboard-rail" aria-label="Steps and deck context">
      <div className="flowboard-rail__top">
        <span className="eyebrow">Full editor</span>
        {dismissible && (
          <button
            id="flowboard-rail-close"
            className="icon-button flowboard-rail__close"
            type="button"
            onClick={() => onDismiss?.()}
            aria-label="Close steps and deck context"
            title="Close steps and deck context"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>

      <FlowboardSteps stages={stages} activeId={activeStage.id} onSelect={onSelectStage} variant="rail" />

      {/*
        The state itself is already on the active entry in the steps list, so
        this block says why the stage is in that state and leaves the badge out
        rather than printing the same word twice.
      */}
      <div className="flowboard-rail__now">
        <span className="flowboard-rail__label">Now in {activeStage.name}</span>
        <p>{activeStage.detail}</p>
      </div>

      <div className="flowboard-rail__section">
        <span className="flowboard-rail__label">Deck at a glance</span>
        <div className="flowboard-record">
          <div className="flowboard-record__row">
            <span>Slides</span>
            <strong>{slides.length}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Captures</span>
            <strong>{captureCount} of {slides.length}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Setup</span>
            <strong>{doneCount} of {checklist.length} done</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Target</span>
            <strong>{profile.name}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Output</span>
            <strong>{profile.width} × {profile.height} px</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Checks</span>
            <strong className={`flowboard-record__status--${preflight.status}`}>{preflightLabel[preflight.status]}</strong>
          </div>
        </div>
      </div>

      {nextStage && nextStage.id !== activeStage.id && (
        <div className="flowboard-rail__section">
          <span className="flowboard-rail__label">Up next</span>
          <button className="flowboard-rail__next" type="button" onClick={() => onSelectStage(nextStage.id)}>
            <strong>{nextStage.name}</strong>
            <span>{nextStage.purpose}</span>
            <span className={`flowboard-rail__next-state flowboard-rail__next-state--${nextStage.state}`}>
              {nextStage.stateLabel}
            </span>
          </button>
        </div>
      )}

      <div className="flowboard-rail__section flowboard-rail__section--status">
        <span
          className={`project-title__status project-title__status--${persistenceStatus}`}
          role="status"
          aria-live="polite"
          title={persistenceDetail}
        >
          <span className="status-dot" /> {persistenceLabel[persistenceStatus]}
        </span>
        {projectValidationNotice && (
          <p className="flowboard-rail__notice" role="status" aria-live="polite">{projectValidationNotice}</p>
        )}
        {exportStatus !== 'idle' && <p className="flowboard-rail__notice">{exportDetail}</p>}
        <p className="flowboard-rail__meta">{persistenceDetail}</p>
      </div>

      <div className="flowboard-rail__actions">
        <button className="button button--outline button--small" type="button" onClick={onOpenGuide}>
          <span aria-hidden="true">?</span> Editor guide
        </button>
        <button className="button button--quiet button--small" type="button" onClick={onShowClassicEditor}>
          <span aria-hidden="true">▤</span> Classic editor
        </button>
      </div>

      {/*
        The same Guided / Full switch the guided shell offers, so the mode can
        be changed from either side and neither shell invents its own wording.
      */}
      <EditorModeSwitch mode="full" onChange={onEditorModeChange} />
    </aside>
  )
}
