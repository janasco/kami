import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { getFlowboardStageSummary, flowboardStageIds, type FlowboardStageId } from '../lib/flowboardStages'
import { flowboardStageLayout, flowboardStageLayoutStyle } from '../lib/flowboardLayout'
import {
  flowboardRailInert,
  flowboardRailRegion,
  isFlowboardRailOpen,
  showsFlowboardRailToggle,
  showsFlowboardStageSelector,
} from '../lib/flowboardRail'
import type { EditorMode } from '../lib/editorMode'
import type { BulkSlideAction } from '../lib/flowboardBulkEdit'
import type { LayerArrangeAction } from '../lib/layerArrange'
import type { SlideTextField } from '../lib/localization'
import type { KamiCapturePayload } from '../lib/screenshotDrop'
import type { ExportPreflightResult, PreflightLayerBoundsBySlide } from '../lib/exportPreflight'
import type { ExportEntry, ExportPlan } from '../lib/exportPlan'
import type { ProjectTemplate } from '../lib/projectTemplates'
import type { CanvasMode, DeviceFrameId, ExportProfile, ExportProfileId, LayerId, LocaleId, OutputVariant, ScreenshotFit, Slide, SlideTransform } from '../types'
import type { ExportStatus, PersistenceStatus } from './TopToolbar'
import type { TemplateApplyMode } from './TemplatePicker'
import { FlowboardRightRail } from './flowboard/FlowboardRightRail'
import { FlowboardSteps } from './flowboard/FlowboardSteps'
import { FlowboardTopBar } from './flowboard/FlowboardTopBar'
import { useFlowboardBreakpoint } from './flowboard/useFlowboardBreakpoint'
import { useFlowboardStagePanels } from './flowboard/useFlowboardStagePanels'
import './flowboard/flowboard.css'

/** Id of the rail's close button, used to move focus into the open sheet. */
const FLOWBOARD_RAIL_CLOSE_ID = 'flowboard-rail-close'

export interface FlowboardProps {
  projectName: string
  onProjectNameChange: (name: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onSaveProject: () => void
  onOpenProject: () => void
  onOpenProjectFile: (file: File) => void
  slides: Slide[]
  selectedSlide: Slide
  selectedIndex: number
  onSelect: (id: string) => void
  onAddSlide: () => void
  onDuplicateSlide: () => void
  onDeleteSlide: () => void
  onMoveSlide: (id: string, direction: -1 | 1) => void
  onApplyStyleToAllSlides: () => void
  onUpdateSlide: (updates: Partial<Slide>, mergeKey?: string) => void
  /**
   * Applies one bulk change to several slides in a single history entry and
   * returns the notice to show, or null when nothing changed.
   */
  onApplyBulkSlideAction: (slideIds: string[], action: BulkSlideAction) => string | null
  onTextUpdate: (field: 'title' | 'subtitle', value: string) => void
  /**
   * Writes one text field for one slide and locale, so a stage that is not the
   * Refine stage can still edit copy through the same history and autosave path
   * the Inspector uses.
   */
  onSlideTextUpdate: (slideId: string, locale: LocaleId, field: SlideTextField, value: string) => void
  onTransformChange: (
    slideId: string,
    position: Pick<SlideTransform, 'x' | 'y'>,
    mergeKey: string,
  ) => void
  selectedLayerId: LayerId
  onLayerSelect: (layerId: LayerId) => void
  onLayerTransformChange: (
    slideId: string,
    layerId: LayerId,
    position: Pick<SlideTransform, 'x' | 'y'>,
    mergeKey: string,
  ) => void
  /**
   * Measured layer boxes for every slide, in export profile pixels and relative
   * to each canvas. Empty until the export stage has been measured, which is why
   * the arrange controls disable themselves rather than guessing.
   */
  layerBounds: PreflightLayerBoundsBySlide
  /** Applies one align, distribute, or stacking action in a single undo step. */
  onArrange: (action: LayerArrangeAction) => void
  onImportScreenshot: (slideId?: string) => void
  onImportFiles: (files: File[]) => void
  /**
   * Image files dropped on one slide, from a capture card, a deck tile, or the
   * device placeholder. Resolves to the notice for the drop so a surface can
   * state the outcome where the drop happened, and applies the whole drop as a
   * single undoable change.
   */
  onDropFilesOnSlide: (slideId: string, files: File[]) => Promise<string>
  /**
   * A capture dragged from one slide card onto another. Returns the notice for
   * that copy, which is why it needs no read: nothing has to be decoded first.
   */
  onDropCaptureOnSlide: (slideId: string, capture: KamiCapturePayload) => string
  onOpenScreenshotImport: () => void
  onImportAppIcon: () => void
  onRemoveAppIcon: () => void
  onImportBackground: () => void
  onRemoveBackground: () => void
  onOpenTemplates: () => void
  templatesDisabled: boolean
  onApplyTemplate: (template: ProjectTemplate, mode: TemplateApplyMode) => void
  onLoadDemo: () => void
  onStartBlank: () => void
  /**
   * How many times a deck has been created upstream. The shell watches this to
   * open on the editor stage, so choosing a template lands the author on the
   * slide they just built rather than back on the stage they started from.
   *
   * A count, not a boolean: a deck can be replaced several times in a session
   * and every one of them should open the editor. Zero means none, so the
   * effect does not fire on mount.
   */
  editorEntryRequest?: number
  onOpenGuide: () => void
  activeLocale: LocaleId
  onLocaleChange: (locale: LocaleId) => void
  canvasMode: CanvasMode
  onCanvasModeChange: (mode: CanvasMode) => void
  profile: ExportProfile
  onProfileChange: (profileId: ExportProfileId) => void
  preflight: ExportPreflightResult
  /**
   * The deck's output variants, in document order. A deck with one default
   * variant always has exactly one here, so a stage never has to handle "no
   * variants" as a separate case.
   */
  variants: OutputVariant[]
  /** Which variant the preview surfaces are drawing. Empty means the first. */
  activeVariantId: string
  /** What this profile's enabled variants will write, in ZIP order. */
  exportEntries: ExportEntry[]
  /** The variant that refuses to export, when one does. */
  exportBlockedVariant: ExportPlan['blocked']
  /**
   * Why the plan has no files in it, when it has none.
   *
   * A separate field from `exportBlockedVariant` because the two answer different
   * questions and come from different places: a block names a variant and the
   * deck positions that stop it, while this names a store target and why nothing
   * aims at it. Optional and additive — a caller that knows nothing about the
   * plan omits it and gets the shell it had.
   */
  exportUnassigned?: ExportPlan['unassigned']
  onVariantPreviewChange: (variantId: string) => void
  onVariantProfileChange: (variantId: string, profileId: ExportProfileId) => void
  /** Set the language a variant is drawn in. */
  onVariantLocaleChange: (variantId: string, locale: LocaleId) => void
  onVariantToggleEnabled: (variantId: string) => void
  onVariantRename: (variantId: string, name: string) => void
  onVariantAdd: () => void
  onVariantRemove: (variantId: string) => void
  /**
   * One device field for one slide of one variant. `undefined` clears the field
   * and the slide's own value takes over again.
   */
  onVariantOverrideChange: (
    variantId: string,
    slideId: string,
    field: 'deviceFrameId' | 'showDeviceStatusBar' | 'screenshotFit',
    value: DeviceFrameId | boolean | ScreenshotFit | undefined,
  ) => void
  /** Opens the picker for one slide of one variant's own capture. */
  onVariantCaptureChange: (variantId: string, slideId: string) => void
  onExport: () => void
  exportStatus: ExportStatus
  exportDetail: string
  exportCompleted: number
  exportTotal: number
  persistenceStatus: PersistenceStatus
  persistenceDetail: string
  projectValidationNotice: string | null
  onShowClassicEditor: () => void
  /**
   * Changes the editor mode. UI-only: the preference is stored in the browser,
   * never in the project, so switching modes cannot change the deck. Guided
   * mode takes the same props and handlers as this shell.
   */
  onEditorModeChange: (mode: EditorMode) => void
}

/**
 * The Flowboard editor shell, which is the Full Editor.
 *
 * The layout is one full-width main area and one rail. The rail is a permanent
 * right column on a desktop, a dismissible bottom sheet on a tablet, and a
 * dismissible side sheet on a phone, where a compact stage selector above the
 * content keeps the current stage visible without opening anything. There is no
 * left navigation column: the stage navigation, the deck facts, and the common
 * actions are all in the rail, so a stage is named, described, and reachable in
 * one place.
 *
 * Stages are freely navigable, so this is a workspace rather than a wizard: the
 * App state, handlers, shared SlideCanvas, export stage, undo/redo, autosave,
 * preflight, and project open/save all keep working exactly as before. The
 * classic three-pane editor remains available as an escape hatch, and Guided
 * mode is the other direction, not a replacement.
 */
export function Flowboard(props: FlowboardProps) {
  const {
    projectName,
    slides,
    preflight,
    profile,
    editorEntryRequest = 0,
  } = props
  const breakpoint = useFlowboardBreakpoint()
  const [activeStage, setActiveStage] = useState<FlowboardStageId>('intake')
  const [railOpen, setRailOpen] = useState(false)
  const railToggleRef = useRef<HTMLButtonElement>(null)
  /**
   * The Story translation matrix hands the copy editor back to this shell, so
   * the Refine stage still opens the way it did before the panels were shared
   * with Guided mode. Declared before the hook so its identity is stable.
   */
  const requestRefineStage = useCallback(() => {
    setActiveStage('refine')
    setRailOpen(false)
  }, [])

  /**
   * Creating a deck opens the editor.
   *
   * Every way of making a deck — a template, the demo, one blank slide — ends
   * with the author looking at the Intake stage, which is a checklist and a
   * dropzone rather than the thing they came to use. Refine is the stage that
   * holds the canvas and the inspector, so it is where the deck is actually
   * worked on and where it should open.
   *
   * The guard on zero matters: this effect must not fire when the shell mounts,
   * or every existing project would jump to Refine on load and skip the Intake
   * checklist that tells an author what is still missing.
   */
  useEffect(() => {
    if (!editorEntryRequest) return
    setActiveStage('refine')
    setRailOpen(false)
  }, [editorEntryRequest])
  const {
    stages,
    checklist,
    captureCount,
    exportGate,
    multiSelectedIds,
    clearMultiSelection,
    getStagePanel,
  } = useFlowboardStagePanels(props, requestRefineStage)

  /**
   * The rail is a permanent column on a desktop and a sheet below that, so only
   * the smaller sizes need the sheet behaviour: a scrim, Escape, a close
   * button, and an inert panel while it is closed.
   */
  const railRegion = flowboardRailRegion(breakpoint)
  const railSheetOpen = isFlowboardRailOpen(breakpoint, railOpen)
  const railPanelInert = flowboardRailInert(breakpoint, railOpen)

  /**
   * Closes the sheet and hands focus back to the button that opened it, so a
   * keyboard user is not dropped at the top of the document when the panel
   * becomes inert.
   */
  const closeRailSheet = useCallback(() => {
    const wasSheetOpen = railSheetOpen
    setRailOpen(false)
    if (!wasSheetOpen) return
    requestAnimationFrame(() => railToggleRef.current?.focus())
  }, [railSheetOpen])

  /** Move focus into the sheet so the close button is the first thing reached. */
  useEffect(() => {
    if (!railSheetOpen || typeof document === 'undefined') return
    document.getElementById(FLOWBOARD_RAIL_CLOSE_ID)?.focus()
  }, [railSheetOpen])

  const activeSummary = getFlowboardStageSummary(stages, activeStage)
  const stageIndex = flowboardStageIds.indexOf(activeStage)
  const previousId = flowboardStageIds[Math.max(stageIndex - 1, 0)]
  const nextId = flowboardStageIds[Math.min(stageIndex + 1, flowboardStageIds.length - 1)]
  const previousSummary = getFlowboardStageSummary(stages, previousId)
  const nextSummary = getFlowboardStageSummary(stages, nextId)

  const selectStage = (id: FlowboardStageId) => {
    setActiveStage(id)
    // Picking a stage out of the sheet closes it, so the content is not left
    // behind a panel on a tablet or a phone. Closing it that way also hands
    // focus back to the toggle, instead of dropping it on an inert button.
    if (railSheetOpen) closeRailSheet()
    else setRailOpen(false)
  }

  const stageLayout = flowboardStageLayout(activeStage)

  const isTypingTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null
    return Boolean(element && ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
  }

  const handleShellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Never steal a key from a field the author is typing in.
    if (isTypingTarget(event.target)) return

    if (event.key === 'Escape' && !event.defaultPrevented) {
      // The rail sheet is the top-most surface on tablet and mobile, so it
      // closes first. Dialogs such as the template picker and the import window
      // live outside this shell, so their own Escape handlers still own the key
      // while they are open.
      if (railSheetOpen) {
        event.preventDefault()
        event.stopPropagation()
        closeRailSheet()
        return
      }
      if (multiSelectedIds.length === 0) return
      event.stopPropagation()
      clearMultiSelection()
      return
    }

    /*
     * The main area is full width now, so the bracket keys move between stages
     * without reaching for the rail. They are plain characters on purpose: an
     * author who is typing never gets here, because of the guard above.
     */
    if (event.key !== '[' && event.key !== ']') return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    selectStage(event.key === '[' ? previousId : nextId)
  }

  const stagePanel = getStagePanel(activeStage, selectStage)

  return (
    <div
      className={`flowboard-shell flowboard-shell--${breakpoint}${railSheetOpen ? ' is-rail-open' : ''}`}
      data-breakpoint={breakpoint}
      data-rail-region={railRegion}
      data-stage-layout={stageLayout.columnCount === 2 ? 'two-column' : 'single-column'}
      style={flowboardStageLayoutStyle(activeStage)}
      onKeyDown={handleShellKeyDown}
    >
      <FlowboardTopBar
        projectName={projectName}
        onProjectNameChange={props.onProjectNameChange}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        onSaveProject={props.onSaveProject}
        onOpenProject={props.onOpenProject}
        onExport={props.onExport}
        exportGate={exportGate}
        exportDetail={props.exportDetail}
        persistenceStatus={props.persistenceStatus}
        persistenceDetail={props.persistenceDetail}
        profile={profile}
      />

      <div className="flowboard-body">
        <main className="flowboard-main" aria-label={`${activeSummary.name} stage`}>
          {showsFlowboardStageSelector(breakpoint) && (
            <div className="flowboard-stagebar">
              <FlowboardSteps stages={stages} activeId={activeStage} onSelect={selectStage} variant="bar" />
            </div>
          )}

          <div className="flowboard-main__scroll">
            <header className="flowboard-stage-header">
              <div className="flowboard-stage-header__title">
                <span className="eyebrow">Stage {stageIndex + 1} of {flowboardStageIds.length}</span>
                <h1>{activeSummary.name}</h1>
                <p>{activeSummary.reminder}</p>
              </div>
              {showsFlowboardRailToggle(breakpoint) && (
                <button
                  className="button button--outline button--small flowboard-rail-toggle"
                  type="button"
                  ref={railToggleRef}
                  onClick={() => setRailOpen((open) => !open)}
                  aria-expanded={railSheetOpen}
                  aria-controls="flowboard-rail-panel"
                >
                  <span aria-hidden="true">☰</span> {railOpen ? 'Hide steps' : 'Steps'}
                </button>
              )}
            </header>

            {stagePanel}
          </div>

          {/*
            The step counter is a position, not a status: the state of the stage
            is stated once, in the rail.
          */}
          <nav className="flowboard-stage-nav" aria-label="Stage navigation">
            <button
              className="button button--quiet"
              type="button"
              onClick={() => selectStage(previousId)}
              disabled={stageIndex === 0}
            >
              <span aria-hidden="true">←</span> {previousSummary.name}
            </button>
            <span className="flowboard-stage-nav__label">
              Stage {stageIndex + 1} of {flowboardStageIds.length}
            </span>
            <button
              className="button button--quiet"
              type="button"
              onClick={() => selectStage(nextId)}
              disabled={stageIndex === flowboardStageIds.length - 1}
            >
              {nextSummary.name} <span aria-hidden="true">→</span>
            </button>
          </nav>
        </main>

        {/*
          The scrim sits outside the rail wrap on purpose: the wrap is a
          transformed fixed sheet, and a fixed child of a transformed element is
          positioned against that element instead of the viewport.
        */}
        {railSheetOpen && (
          <button
            type="button"
            className="flowboard-rail-scrim"
            tabIndex={-1}
            aria-label="Close steps and deck context"
            onClick={closeRailSheet}
          />
        )}

        <div
          className="flowboard-rail-wrap"
          id="flowboard-rail-panel"
          // A closed sheet must not be reachable by keyboard, and on desktop the
          // rail is a permanent column, so it is never inert there.
          inert={railPanelInert}
        >
          <FlowboardRightRail
            activeStage={activeSummary}
            stages={stages}
            onSelectStage={selectStage}
            checklist={checklist}
            slides={slides}
            captureCount={captureCount}
            profile={profile}
            preflight={preflight}
            persistenceStatus={props.persistenceStatus}
            persistenceDetail={props.persistenceDetail}
            projectValidationNotice={props.projectValidationNotice}
            exportStatus={props.exportStatus}
            exportDetail={props.exportDetail}
            onOpenGuide={props.onOpenGuide}
            onShowClassicEditor={props.onShowClassicEditor}
            onEditorModeChange={props.onEditorModeChange}
            dismissible={railRegion !== 'column'}
            onDismiss={closeRailSheet}
          />
        </div>
      </div>
    </div>
  )
}
