/**
 * One derivation of the five Flowboard stage panels, shared by both shells.
 *
 * The Full Editor (Flowboard) and the Guided shell both need the existing
 * stage components — IntakeStage, FrameStage, StoryStage, RefineStage, and
 * ShipStage — wired to the same App state and handlers. Deriving them here
 * keeps a single source for the multi-selection, the bulk notice, the Story
 * translation matrix cell, and the Refine copy-editor hand-off, so neither
 * shell grows its own copy of that logic and the two can never disagree.
 *
 * This module is UI-only. It creates no project state, holds nothing that is
 * serialized, and reuses the same handlers the App already passes down.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  buildFlowboardChecklist,
  evaluateFlowboardStages,
  type FlowboardChecklistItem,
  type FlowboardStageId,
  type FlowboardStageSummary,
} from '../../lib/flowboardStages'
import { resolveFlowboardExportGate, type FlowboardExportGate } from '../../lib/flowboardExportState'
import type { BulkSlideAction } from '../../lib/flowboardBulkEdit'
import type { SlideTextField } from '../../lib/localization'
import {
  clearSlideSelection,
  describeFlowboardSelection,
  selectAllSlides,
  toggleSlideSelection,
  type FlowboardSelection,
} from '../../lib/flowboardSelection'
import type { LocaleId } from '../../types'
import type { TranslationCellRef } from '../../lib/translationMatrix'
import type { FlowboardProps } from '../Flowboard'
import { FrameStage } from './FrameStage'
import { IntakeStage } from './IntakeStage'
import { RefineStage } from './RefineStage'
import { ShipStage } from './ShipStage'
import { StoryStage } from './StoryStage'
// The stage panels carry their own presentation, and the guided shell shows the
// very same panels, so the stylesheet is loaded from the shared module rather
// than only from the Flowboard shell.
import './flowboard.css'

/**
 * A request from one stage to focus the Refine copy editor.
 *
 * The token keeps two identical requests apart so a second visit to the same
 * slide and locale still moves focus instead of being swallowed as a repeat.
 */
export interface CopyEditorRequest {
  slideId: string
  locale: LocaleId
  /** Which field to place the caret in. */
  field: SlideTextField
  token: number
}

export interface FlowboardStagePanels {
  /** Per-stage rollouts shared by the rail, the headers, and the context panel. */
  stages: FlowboardStageSummary[]
  /** The short getting-started checklist rendered by the Intake stage. */
  checklist: FlowboardChecklistItem[]
  captureCount: number
  selection: FlowboardSelection
  exportGate: FlowboardExportGate
  /** Slide ids in the UI-only multi-selection, empty when there is none. */
  multiSelectedIds: string[]
  clearMultiSelection: () => void
  /**
   * Builds one stage panel. Only the requested stage is constructed.
   *
   * `onGoToStage` is supplied by the shell, because only the shell knows how a
   * stage id maps onto its own navigation: the Full Editor moves the stage
   * rail, while guided mode moves its step and opens the advanced panel.
   */
  getStagePanel: (id: FlowboardStageId, onGoToStage: (id: FlowboardStageId) => void) => ReactNode
}

/**
 * Wires the five existing stage components to the App state and handlers.
 *
 * Everything returned here is either derived from props or UI-only state
 * (multi-selection, bulk notice, open matrix cell, copy-editor request), so
 * the project document, the active locale, and the history stack are touched
 * only through the handlers the App already owns.
 */
export function useFlowboardStagePanels(
  props: FlowboardProps,
  /**
   * Called when the Story translation matrix asks for the Refine copy editor.
   * The shell owns the navigation, so it decides whether that means a new
   * stage or an opened advanced panel.
   */
  onRequestRefine: () => void,
): FlowboardStagePanels {
  const { slides, selectedSlide, selectedIndex, activeLocale, preflight, profile } = props
  /**
   * UI-only multi-selection shared by the Frame and Story stages. It holds
   * slide ids in React state and is never serialized, so the project format
   * and the single active slide Refine edits are untouched.
   */
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([])
  const [bulkNotice, setBulkNotice] = useState<string | null>(null)
  /**
   * UI-only state for the Story translation matrix: which cell is open for
   * inline editing, and the last request to focus the Refine copy editor.
   * Neither is serialized, so the project document and the active locale are
   * only ever changed by the actions the author asks for.
   */
  const [editingCell, setEditingCell] = useState<TranslationCellRef | null>(null)
  const [copyEditorRequest, setCopyEditorRequest] = useState<CopyEditorRequest | null>(null)
  const copyEditorTokenRef = useRef(0)
  /**
   * Which variant the Refine canvas is previewing, or `''` for the editable
   * deck. Held here rather than inside the Refine stage for two reasons: the
   * Ship stage's "Show on canvas" button has to be able to set it and move the
   * author there, and a choice made on the canvas has to survive the author
   * walking to another stage and back. UI-only, like everything else in this
   * hook, and never serialized.
   */
  const [refineVariantPreviewId, setRefineVariantPreviewId] = useState('')
  /**
   * Which deck slide that preview holds, and the same two reasons plus a third.
   *
   * The Ship stage's export manifest is a row per planned file, and a row names
   * a variant *and* a deck slide, so opening one is a request for both. The
   * preview's own stepper is a request for a slide too. They write this one
   * value, because two stores would mean a row asking for slide 7 and the
   * stepper remembering slide 2, with the preview obliged to pick a winner.
   */
  const [refineVariantPreviewSlideId, setRefineVariantPreviewSlideId] = useState('')

  const deckInput = useMemo(() => ({
    projectName: props.projectName,
    slides,
    activeLocale,
    preflight,
    persistenceNeedsAttention: props.persistenceStatus === 'error' || props.persistenceStatus === 'open-error',
  }), [activeLocale, preflight, props.persistenceStatus, props.projectName, slides])

  const stages = useMemo(() => evaluateFlowboardStages(deckInput), [deckInput])
  const checklist = useMemo(() => buildFlowboardChecklist(deckInput), [deckInput])
  const captureCount = slides.filter((slide) => slide.screenshot).length

  /**
   * One export gate for every surface. The top bar, the Ship stage, and the
   * guided Download step all read it, so no two Export controls can disagree
   * about a blocked or running export.
   */
  const exportGate = useMemo(() => resolveFlowboardExportGate({
    exportStatus: props.exportStatus,
    preflight,
    // The plan's own refusal, so a store target nothing aims at reads as blocked
    // here rather than only in the export run. The gate is what every Export
    // control renders, so this is the one place the fact has to arrive.
    unassigned: props.exportUnassigned,
    slideCount: slides.length,
    completed: props.exportCompleted,
    total: props.exportTotal,
  }), [preflight, props.exportCompleted, props.exportStatus, props.exportTotal, props.exportUnassigned, slides.length])

  const slideIds = useMemo(() => slides.map((slide) => slide.id), [slides])
  const selection = useMemo(
    () => describeFlowboardSelection(slideIds, selectedSlide.id, multiSelectedIds),
    [multiSelectedIds, selectedSlide.id, slideIds],
  )

  const clearMultiSelection = useCallback(() => {
    setMultiSelectedIds(clearSlideSelection())
    setBulkNotice(null)
  }, [])

  /** A plain click keeps the single selection the editor already had. */
  const selectSlide = useCallback((slideId: string) => {
    clearMultiSelection()
    props.onSelect(slideId)
  }, [clearMultiSelection, props])

  /**
   * Adds or removes a slide from the multi-selection and keeps the active
   * single slide in step with the card that was last touched, so the Refine
   * stage always shows a slide the author can see highlighted.
   */
  const toggleSelectedSlide = useCallback((slideId: string) => {
    setBulkNotice(null)
    setMultiSelectedIds((current) => toggleSlideSelection(current, slideId, slideIds))
    props.onSelect(slideId)
  }, [props, slideIds])

  const selectAllSlidesInDeck = useCallback(() => {
    setBulkNotice(null)
    setMultiSelectedIds(selectAllSlides(slideIds))
  }, [slideIds])

  const applyBulkAction = useCallback((action: BulkSlideAction) => {
    setBulkNotice(props.onApplyBulkSlideAction(selection.targetIds, action))
  }, [props.onApplyBulkSlideAction, selection.targetIds])

  /**
   * Sends the author to the normal copy editor for one beat and locale.
   *
   * The matrix stays a shortcut into the Inspector and the canvas rather than a
   * second editor: the beat is selected, the preview locale follows the cell,
   * and the Refine stage opens with the requested field focused. The matrix
   * cell stays open so returning to Story keeps the same context.
   */
  const openCopyEditor = useCallback((slideId: string, locale: LocaleId) => {
    if (slideId !== selectedSlide.id) props.onSelect(slideId)
    if (locale !== activeLocale) props.onLocaleChange(locale)
    copyEditorTokenRef.current += 1
    setCopyEditorRequest({ slideId, locale, field: 'title', token: copyEditorTokenRef.current })
    onRequestRefine()
  }, [activeLocale, onRequestRefine, props, selectedSlide.id])

  const goToSlide = (slideId: string) => props.onSelect(slideId)

  /**
   * The one route into the merged preview: pick the variant and the deck slide,
   * then move the author to the stage that draws it.
   *
   * The Ship stage's "Show on canvas" button, every row of its export manifest,
   * and the Refine canvas's own picker all write the same two values, so there is
   * one way in and no two surfaces that can disagree about what is on screen.
   * `''` for the slide keeps the preview following the deck's selection, which is
   * what it did before anything could ask for a slide by name.
   */
  const openVariantPreview = (
    variantId: string,
    slideId: string,
    onGoToStage: (id: FlowboardStageId) => void,
  ) => {
    props.onVariantPreviewChange(variantId)
    setRefineVariantPreviewId(variantId)
    setRefineVariantPreviewSlideId(slideId)
    onGoToStage('refine')
  }

  const getStagePanel = (id: FlowboardStageId, onGoToStage: (id: FlowboardStageId) => void): ReactNode => {
    if (id === 'intake') {
      return (
        <IntakeStage
          projectName={props.projectName}
          onProjectNameChange={props.onProjectNameChange}
          slides={slides}
          captureCount={captureCount}
          activeLocale={activeLocale}
          onLocaleChange={props.onLocaleChange}
          profile={profile}
          checklist={checklist}
          onGoToStage={onGoToStage}
          onImportFiles={props.onImportFiles}
          onOpenProjectFile={props.onOpenProjectFile}
          onOpenScreenshotImport={props.onOpenScreenshotImport}
          onImportScreenshot={() => props.onImportScreenshot()}
          onDropFiles={props.onDropFilesOnSlide}
          onDropCapture={props.onDropCaptureOnSlide}
          onOpenTemplates={props.onOpenTemplates}
          templatesDisabled={props.templatesDisabled}
          onApplyTemplate={(template) => props.onApplyTemplate(template, 'new-deck')}
          onLoadDemo={props.onLoadDemo}
          onStartBlank={props.onStartBlank}
          onOpenProject={props.onOpenProject}
        />
      )
    }

    if (id === 'frame') {
      return (
        <FrameStage
          slides={slides}
          selectedSlide={selectedSlide}
          selectedIndex={selectedIndex}
          selection={selection}
          onSelect={selectSlide}
          onToggleSelect={toggleSelectedSlide}
          onSelectAll={selectAllSlidesInDeck}
          onClearSelection={clearMultiSelection}
          onUpdate={props.onUpdateSlide}
          onApplyBulkAction={applyBulkAction}
          bulkNotice={bulkNotice}
          onImport={props.onImportScreenshot}
          profile={profile}
          onDropFiles={props.onDropFilesOnSlide}
          onDropCapture={props.onDropCaptureOnSlide}
        />
      )
    }

    if (id === 'story') {
      return (
        <StoryStage
          slides={slides}
          selectedSlide={selectedSlide}
          selectedIndex={selectedIndex}
          selection={selection}
          activeLocale={activeLocale}
          onLocaleChange={props.onLocaleChange}
          onSelect={selectSlide}
          onToggleSelect={toggleSelectedSlide}
          onSelectAll={selectAllSlidesInDeck}
          onClearSelection={clearMultiSelection}
          onAdd={props.onAddSlide}
          onDuplicate={props.onDuplicateSlide}
          onDelete={props.onDeleteSlide}
          onMove={props.onMoveSlide}
          onApplyStyleToAll={props.onApplyStyleToAllSlides}
          onApplyBulkAction={applyBulkAction}
          bulkNotice={bulkNotice}
          editingCell={editingCell}
          onEditingCellChange={setEditingCell}
          onSlideTextUpdate={props.onSlideTextUpdate}
          onOpenCopyEditor={openCopyEditor}
        />
      )
    }

    if (id === 'refine') {
      return (
        <RefineStage
          canvas={{
            slides,
            selectedSlide,
            selectedIndex,
            selectedId: selectedSlide.id,
            mode: props.canvasMode,
            onModeChange: props.onCanvasModeChange,
            onSelect: props.onSelect,
            onImport: props.onImportScreenshot,
            onTransformChange: props.onTransformChange,
            selectedLayerId: props.selectedLayerId,
            onLayerSelect: props.onLayerSelect,
            onLayerTransformChange: props.onLayerTransformChange,
            onDropFilesOnSlide: props.onDropFilesOnSlide,
            onDropCaptureOnSlide: props.onDropCaptureOnSlide,
            persistenceStatus: props.persistenceStatus,
            persistenceDetail: props.persistenceDetail,
            projectValidationNotice: props.projectValidationNotice,
            exportStatus: props.exportStatus,
            exportDetail: props.exportDetail,
            exportCompleted: props.exportCompleted,
            exportTotal: props.exportTotal,
            profile,
            locale: activeLocale,
          }}
          inspector={{
            slide: selectedSlide,
            activeLocale,
            onLocaleChange: props.onLocaleChange,
            onUpdate: props.onUpdateSlide,
            onTextUpdate: props.onTextUpdate,
            onImport: () => props.onImportScreenshot(),
            onImportIcon: props.onImportAppIcon,
            onRemoveIcon: props.onRemoveAppIcon,
            onImportBackground: props.onImportBackground,
            onRemoveBackground: props.onRemoveBackground,
            selectedLayerId: props.selectedLayerId,
            onLayerSelect: props.onLayerSelect,
            profile,
            preflight,
            layerBounds: props.layerBounds,
            onArrange: props.onArrange,
            onProfileChange: props.onProfileChange,
            exportDisabled: props.exportStatus === 'exporting',
          }}
          preflight={preflight}
          onGoToSlide={goToSlide}
          variants={props.variants}
          variantPreviewId={refineVariantPreviewId}
          onVariantPreviewIdChange={setRefineVariantPreviewId}
          variantPreviewSlideId={refineVariantPreviewSlideId}
          onVariantPreviewSlideIdChange={setRefineVariantPreviewSlideId}
          copyEditorRequest={copyEditorRequest}
        />
      )
    }

    return (
      <ShipStage
        projectName={props.projectName}
        slides={slides}
        selectedSlide={selectedSlide}
        profile={profile}
        onProfileChange={props.onProfileChange}
        preflight={preflight}
        variants={props.variants}
        activeVariantId={props.activeVariantId}
        onVariantPreviewChange={props.onVariantPreviewChange}
        onVariantProfileChange={props.onVariantProfileChange}
        onVariantLocaleChange={props.onVariantLocaleChange}
        onVariantToggleEnabled={props.onVariantToggleEnabled}
        onVariantRename={props.onVariantRename}
        onVariantAdd={props.onVariantAdd}
        onVariantRemove={props.onVariantRemove}
        onVariantOverrideChange={props.onVariantOverrideChange}
        onVariantCaptureChange={props.onVariantCaptureChange}
        exportEntries={props.exportEntries}
        exportBlockedVariant={props.exportBlockedVariant}
        exportUnassigned={props.exportUnassigned}
        exportGate={exportGate}
        exportDetail={props.exportDetail}
        onExport={props.onExport}
        onSaveProject={props.onSaveProject}
        onOpenProject={props.onOpenProject}
        onGoToSlide={goToSlide}
        onOpenVariantPreview={(variantId, slideId) => openVariantPreview(variantId, slideId, onGoToStage)}
        activeLocale={activeLocale}
      />
    )
  }

  return {
    stages,
    checklist,
    captureCount,
    selection,
    exportGate,
    multiSelectedIds,
    clearMultiSelection,
    getStagePanel,
  }
}
