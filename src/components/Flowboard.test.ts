import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { runExportPreflight } from '../lib/exportPreflight'
import { describeFlowboardSelection } from '../lib/flowboardSelection'
import { resolveFlowboardExportGate } from '../lib/flowboardExportState'
import { createSlide, exportProfiles, starterSlide } from '../data'
import { projectTemplates } from '../lib/projectTemplates'
import { evaluateFlowboardStages } from '../lib/flowboardStages'
import { flowboardRailRegion } from '../lib/flowboardRail'
import { Flowboard, type FlowboardProps } from './Flowboard'
import { collectIds, makeFlowboardProps } from '../test/flowboardProps'
import { FlowboardTopBar } from './flowboard/FlowboardTopBar'
import { Inspector } from './Inspector'
import { SlideCanvas } from './SlideCanvas'
import { SlideNavigator } from './SlideNavigator'
import { TopToolbar } from './TopToolbar'
import { FrameStage } from './flowboard/FrameStage'
import { RefineStage } from './flowboard/RefineStage'
import { ShipStage } from './flowboard/ShipStage'
import { StoryStage } from './flowboard/StoryStage'

/**
 * Server-render smoke tests for the Flowboard shell.
 *
 * The repository has no DOM test environment, so these render the shell and
 * every stage to static markup. They catch render-time crashes and duplicate
 * form ids, which is what a staged shell most easily breaks.
 */

const noop = () => undefined

/** The shared shell fixture, wrapped so this file's call sites stay unchanged. */
const makeProps = (overrides: Partial<FlowboardProps> = {}): FlowboardProps =>
  makeFlowboardProps(overrides)

const canvasProps = (props: FlowboardProps) => ({
  slides: props.slides,
  selectedSlide: props.selectedSlide,
  selectedIndex: props.selectedIndex,
  selectedId: props.selectedSlide.id,
  mode: props.canvasMode,
  onModeChange: props.onCanvasModeChange,
  onSelect: props.onSelect,
  onImport: props.onImportScreenshot,
  onTransformChange: props.onTransformChange,
  selectedLayerId: props.selectedLayerId,
  onLayerSelect: props.onLayerSelect,
  onLayerTransformChange: props.onLayerTransformChange,
  persistenceStatus: props.persistenceStatus,
  persistenceDetail: props.persistenceDetail,
  projectValidationNotice: props.projectValidationNotice,
  exportStatus: props.exportStatus,
  exportDetail: props.exportDetail,
  exportCompleted: props.exportCompleted,
  exportTotal: props.exportTotal,
  profile: props.profile,
  locale: props.activeLocale,
})

const inspectorProps = (props: FlowboardProps) => ({
  slide: props.selectedSlide,
  activeLocale: props.activeLocale,
  onLocaleChange: props.onLocaleChange,
  onUpdate: props.onUpdateSlide,
  onTextUpdate: props.onTextUpdate,
  onImport: noop,
  onImportIcon: props.onImportAppIcon,
  onRemoveIcon: props.onRemoveAppIcon,
  onImportBackground: props.onImportBackground,
  onRemoveBackground: props.onRemoveBackground,
  selectedLayerId: props.selectedLayerId,
  onLayerSelect: props.onLayerSelect,
  profile: props.profile,
  preflight: props.preflight,
  onProfileChange: props.onProfileChange,
  exportDisabled: false,
})

/** Frame stage props for a given multi-selection. */
const frameProps = (props: FlowboardProps, multiSelectedIds: string[]) => ({
  slides: props.slides,
  selectedSlide: props.selectedSlide,
  selectedIndex: props.selectedIndex,
  selection: describeFlowboardSelection(
    props.slides.map((slide) => slide.id),
    props.selectedSlide.id,
    multiSelectedIds,
  ),
  onSelect: props.onSelect,
  onToggleSelect: noop,
  onSelectAll: noop,
  onClearSelection: noop,
  onUpdate: props.onUpdateSlide,
  onApplyBulkAction: noop,
  bulkNotice: null,
  onImport: props.onImportScreenshot,
  profile: props.profile,
})

/** Story stage props for a given multi-selection. */
const storyProps = (props: FlowboardProps, multiSelectedIds: string[]) => ({
  slides: props.slides,
  selectedSlide: props.selectedSlide,
  selectedIndex: props.selectedIndex,
  selection: describeFlowboardSelection(
    props.slides.map((slide) => slide.id),
    props.selectedSlide.id,
    multiSelectedIds,
  ),
  activeLocale: props.activeLocale,
  onLocaleChange: props.onLocaleChange,
  onSelect: props.onSelect,
  onToggleSelect: noop,
  onSelectAll: noop,
  onClearSelection: noop,
  onAdd: props.onAddSlide,
  onDuplicate: props.onDuplicateSlide,
  onDelete: props.onDeleteSlide,
  onMove: props.onMoveSlide,
  onApplyStyleToAll: props.onApplyStyleToAllSlides,
  onApplyBulkAction: noop,
  bulkNotice: null,
  editingCell: null,
  onEditingCellChange: noop,
  onSlideTextUpdate: props.onSlideTextUpdate,
  onOpenCopyEditor: noop,
})

describe('Flowboard', () => {
  it('renders the intake stage with all five stages in the rail', () => {
    const markup = renderToStaticMarkup(createElement(Flowboard, makeProps()))
    for (const name of ['Intake', 'Frame', 'Story', 'Refine', 'Ship']) {
      expect(markup).toContain(name)
    }
    expect(markup).toContain('flowboard-rail')
    expect(markup).toContain('Drop app captures here')
    expect(markup).toContain('Four things worth doing')
    expect(markup).toContain('aria-current="step"')
  })

  it('moves the stage navigation into the right rail, with no left navigation', () => {
    const markup = renderToStaticMarkup(createElement(Flowboard, makeProps()))
    // The steps list is rendered by the rail, after the main area in the DOM, so
    // the stage navigation is no longer the first child of the body.
    expect(markup).toContain('flowboard-rail')
    expect(markup).toContain('flowboard-steps flowboard-steps--rail')
    expect(markup).toContain('aria-label="Steps and deck context"')
    expect(markup.indexOf('flowboard-main')).toBeLessThan(markup.indexOf('flowboard-rail-wrap'))
    // The old persistent left rail and the second, context-only column are gone.
    expect(markup).not.toContain('flowboard-rail__list')
    expect(markup).not.toContain('flowboard-stage ')
    expect(markup).not.toContain('flowboard-context')
    // The body is the main area and the one rail, in that order.
    expect(markup).toMatch(/class="flowboard-body"><main class="flowboard-main"[\s\S]*?flowboard-rail-wrap/)
  })

  it('lists every stage in the rail with its state and one focusable entry', () => {
    const props = makeProps()
    const markup = renderToStaticMarkup(createElement(Flowboard, props))
    const steps = markup.match(/class="flowboard-step [^"]*"/g) ?? []
    // Five stages, once each, all inside the rail variant of the list.
    expect(steps).toHaveLength(5)
    expect([...markup.matchAll(/class="flowboard-step__name">([^<]+)</g)].map((match) => match[1]))
      .toEqual(['Intake', 'Frame', 'Story', 'Refine', 'Ship'])
    // Roving focus: one entry is in the tab order, and it is the active stage.
    expect([...markup.matchAll(/tabindex="0"/g)]).toHaveLength(1)
    expect(markup).toMatch(/tabindex="0" aria-current="step"/)
    // Every entry carries its state for a screen reader, not only the glyph.
    for (const stage of evaluateFlowboardStages({
      projectName: props.projectName,
      slides: props.slides,
      activeLocale: 'en-US',
      preflight: props.preflight,
      persistenceNeedsAttention: false,
    })) {
      expect(markup).toContain(`aria-label="${stage.name} stage, ${stage.stateLabel}. ${stage.purpose}"`)
    }
  })

  it('states the stage once in the rail instead of repeating it in every surface', () => {
    const markup = renderToStaticMarkup(createElement(Flowboard, makeProps()))
    const rail = markup.slice(markup.indexOf('flowboard-rail-wrap'))
    // The active stage's reason is stated in the rail, next to the steps.
    expect(rail).toContain('flowboard-rail__now')
    expect(rail).toContain('Now in Intake')
    // The header names the stage and its position, and the bottom nav is a
    // position too: neither prints the state a second time.
    expect(markup).toContain('Stage 1 of 5')
    expect(markup).not.toContain('flowboard-context__state')
    expect(markup).not.toContain('flowboard-topbar__stage')
    // The top bar is the project surface only.
    expect(markup).not.toContain('Now in</span>')
  })

  it('marks a blocked deck as needing attention', () => {
    const props = makeProps({
      slides: [starterSlide],
      selectedSlide: starterSlide,
      exportTotal: 1,
      preflight: runExportPreflight({
        profile: exportProfiles[0],
        slides: [starterSlide],
        activeLocale: 'en-US',
      }),
    })
    const markup = renderToStaticMarkup(createElement(Flowboard, props))
    expect(markup).toContain('Needs attention')
    expect(markup).toContain('blocking check')
  })

  it('renders the frame contact sheet with device, fit, and status bar summaries', () => {
    const props = makeProps()
    const markup = renderToStaticMarkup(createElement(FrameStage, frameProps(props, [])))
    expect(markup).toContain('Every capture, side by side')
    expect(markup).toContain('Contain fit')
    expect(markup).toContain('Status bar')
    // One slide is active with no multi-selection, so the bulk bar stays hidden.
    expect(markup).not.toContain('flowboard-bulk')
    expect(markup).toContain('No bulk selection')
    expect(markup).toContain('Select all')
    // The legend explains both states before the author has selected anything.
    expect(markup).toContain('flowboard-selection__legend')
    expect(markup).toContain('the slide the canvas and Inspector edit')
  })

  it('keeps the edited capture card marked as Editing with no multi-selection', () => {
    const props = makeProps()
    const markup = renderToStaticMarkup(createElement(FrameStage, frameProps(props, [])))
    // The edited slide is a structural state of its own, not a pressed toggle.
    expect([...markup.matchAll(/data-selection-state="editing"/g)]).toHaveLength(2)
    expect([...markup.matchAll(/data-selected="active"/g)]).toHaveLength(1)
    expect([...markup.matchAll(/data-selected="off"/g)]).toHaveLength(2)
    expect(markup).toContain('is-editing')
    expect(markup).toContain('Editing slide 1 in the canvas and Inspector.')
    expect(markup).toContain('aria-current="true"')
    // With nothing multi-selected, no card claims to be in the bulk selection.
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).not.toContain('data-selection-state="selected"')
  })

  it('shows the frame bulk bar and selection affordances for two selected captures', () => {
    const props = makeProps()
    const selected = props.slides.slice(0, 2).map((slide) => slide.id)
    const markup = renderToStaticMarkup(createElement(FrameStage, frameProps(props, selected)))

    expect(markup).toContain('flowboard-bulk')
    expect(markup).toContain('2 of 3 slides selected')
    expect(markup).toContain('Applies to slides 1 and 2.')
    expect(markup).toContain('slides 1 and 2. Bulk actions apply to all 2')
    // Frame controls: device frame, fit, status bar, plus layer visibility.
    expect(markup).toContain('flowboard-frame-bulk-device')
    expect(markup).toContain('Set the cover fit for the 2 selected slides')
    expect(markup).toContain('Turn the device status bar off for the 2 selected slides')
    expect(markup).toContain('flowboard-frame-bulk-layer')
    // Slide 1 is both edited and selected, slide 2 only selected, slide 3 neither.
    expect([...markup.matchAll(/data-selected="active"/g)]).toHaveLength(1)
    expect([...markup.matchAll(/data-selected="multi"/g)]).toHaveLength(1)
    expect([...markup.matchAll(/data-selected="off"/g)]).toHaveLength(1)
    expect([...markup.matchAll(/data-selection-state="editing"/g)]).toHaveLength(2)
    expect([...markup.matchAll(/data-selection-state="selected"/g)]).toHaveLength(2)
    // The editing state survives a range selection, so the two stay distinct.
    expect(markup).toContain('is-editing is-selected')
    expect(markup).toContain('is-selected')
    expect(markup).toContain('Slide 2 is selected for bulk editing.')
    expect(markup).toContain('Selected')
    const ids = collectIds(markup)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('renders the story beat strip with ordering and deck style actions', () => {
    const props = makeProps()
    const markup = renderToStaticMarkup(createElement(StoryStage, storyProps(props, [])))
    expect(markup).toContain('beat')
    expect(markup).toContain('Apply this style to all')
    expect(markup).toContain('Move beat 1 later')
    expect(markup).toContain('Beats selected')
    expect(markup).not.toContain('flowboard-bulk')
  })

  it('keeps the story add, duplicate, delete, and move actions while a bulk selection is open', () => {
    const props = makeProps()
    const selected = props.slides.slice(1, 3).map((slide) => slide.id)
    const markup = renderToStaticMarkup(createElement(StoryStage, storyProps(props, selected)))

    expect(markup).toContain('flowboard-bulk')
    expect(markup).toContain('2 of 3 slides selected')
    // Slide 1 is the edited beat, slides 2 and 3 are the bulk selection.
    expect([...markup.matchAll(/data-selection-state="editing"/g)]).toHaveLength(2)
    expect([...markup.matchAll(/data-selection-state="selected"/g)]).toHaveLength(4)
    // Each selected beat marks its row and its own control.
    expect([...markup.matchAll(/data-selected="multi"/g)]).toHaveLength(4)
    // Style bulk actions come from the existing catalogs.
    expect(markup).toContain('flowboard-story-bulk-layout')
    expect(markup).toContain('flowboard-story-bulk-theme')
    expect(markup).toContain('Layout for the 2 selected slides')
    expect(markup).toContain('Theme for the 2 selected slides')
    // Preserved single-beat actions.
    expect(markup).toContain('New beat')
    expect(markup).toContain('Duplicate beat 1')
    expect(markup).toContain('Delete beat 1')
    expect(markup).toContain('Apply this style to all 3 beats')
    expect(markup).toContain('Move beat 1 later')
    expect(markup).toContain('right-click')
  })

  it('renders the translation matrix beside the story beat strip', () => {
    const props = makeProps()
    const markup = renderToStaticMarkup(createElement(StoryStage, storyProps(props, [])))

    expect(markup).toContain('Translation matrix')
    // Three demo beats with supporting copy: 18 fields, 6 of them English.
    expect(markup).toContain('0/3 slides · 6/18 fields translated')
    // Table semantics: a caption, one column header per locale, one row header per beat.
    expect(markup).toContain('<caption')
    expect([...markup.matchAll(/scope="col"/g)]).toHaveLength(4)
    expect([...markup.matchAll(/scope="row"/g)]).toHaveLength(3)
    for (const label of ['English (US)', 'Español (España)', 'العربية (السعودية)']) {
      expect(markup).toContain(label)
    }
    // Every cell offers inline editing and a hand-off to the copy editor.
    expect([...markup.matchAll(/data-matrix-cell=/g)]).toHaveLength(9)
    expect([...markup.matchAll(/Open in editor/g)]).toHaveLength(9)
    // Missing translations are marked instead of silently showing English.
    expect(markup).toContain('missing · falls back to English')
    expect(markup).toContain('Headline missing')
    // Direction indicators: the Arabic column header plus one note per cell.
    expect([...markup.matchAll(/locale-direction__badge--rtl/g)]).toHaveLength(4)
    expect([...markup.matchAll(/data-direction="rtl"/g)]).toHaveLength(4)
    expect([...markup.matchAll(/Right-to-left copy, edited right-to-left/g)]).toHaveLength(3)
    // The active locale stays selectable from the column header.
    expect(markup).toContain('Active preview')
    expect(markup).toContain('Preview')
  })

  it('opens the inline copy editor for one matrix cell at a time', () => {
    const props = makeProps()
    const matrixProps = storyProps(props, [])
    const slide = props.slides[1]
    const markup = renderToStaticMarkup(createElement(StoryStage, {
      ...matrixProps,
      editingCell: { slideId: slide.id, locale: 'ar-SA' },
      activeLocale: 'en-US',
    }))

    // Only the open cell renders the two fields, labelled and right-to-left.
    expect(markup).toContain('flowboard-matrix-2-ar-sa')
    expect([...markup.matchAll(/aria-expanded="true"/g)]).toHaveLength(1)
    expect(markup).toContain('dir="rtl"')
    expect(markup).toContain('flowboard-matrix-2-ar-sa-title')
    expect(markup).toContain('flowboard-matrix-2-ar-sa-subtitle')
    // Unopened cells stay closed.
    expect(markup).not.toContain('flowboard-matrix-1-en-us')
  })

  it('keeps the matrix and the refine tray free of duplicate form ids', () => {
    const props = makeProps()
    const matrixIds = collectIds(renderToStaticMarkup(createElement(StoryStage, storyProps(props, []))))
    const refineIds = collectIds(renderToStaticMarkup(createElement(RefineStage, {
      canvas: canvasProps(props),
      inspector: inspectorProps(props),
      preflight: props.preflight,
      onGoToSlide: props.onSelect,
    })))

    expect(new Set(matrixIds).size).toBe(matrixIds.length)
    expect(new Set(refineIds).size).toBe(refineIds.length)
    // Only one stage renders at a time, so the two must not share an id.
    expect(matrixIds.filter((id) => refineIds.includes(id))).toEqual([])
  })

  it('renders the refine stage with the shared canvas and property tray', () => {
    const props = makeProps()
    const markup = renderToStaticMarkup(createElement(RefineStage, {
      canvas: canvasProps(props),
      inspector: inspectorProps(props),
      preflight: props.preflight,
      onGoToSlide: props.onSelect,
    }))
    expect(markup).toContain('slide-canvas')
    expect(markup).toContain('Property tray')
    expect(markup).toContain('Open full inspector')
  })

  it('renders the ship stage with the profile, review, and export action', () => {
    const props = makeProps()
    const markup = renderToStaticMarkup(createElement(ShipStage, {
      projectName: props.projectName,
      slides: props.slides,
      selectedSlide: props.selectedSlide,
      profile: props.profile,
      onProfileChange: props.onProfileChange,
      preflight: props.preflight,
      exportGate: resolveFlowboardExportGate({
        exportStatus: 'idle',
        preflight: props.preflight,
        slideCount: props.slides.length,
      }),
      exportDetail: props.exportDetail,
      onExport: props.onExport,
      onSaveProject: props.onSaveProject,
      onOpenProject: props.onOpenProject,
      onGoToSlide: props.onSelect,
    }))
    expect(markup).toContain('Export profile')
    expect(markup).toContain('Export PNGs as a ZIP')
    expect(markup).toContain(`${props.profile.width} × ${props.profile.height} px`)
  })

  it('blocks the ship export with the offending slide numbers', () => {
    const props = makeProps({
      slides: [starterSlide],
      selectedSlide: starterSlide,
      exportTotal: 1,
      preflight: runExportPreflight({
        profile: exportProfiles[0],
        slides: [starterSlide],
        activeLocale: 'en-US',
      }),
    })
    const gate = resolveFlowboardExportGate({
      exportStatus: 'validation',
      preflight: props.preflight,
      slideCount: 1,
    })
    const markup = renderToStaticMarkup(createElement(ShipStage, {
      projectName: props.projectName,
      slides: props.slides,
      selectedSlide: props.selectedSlide,
      profile: props.profile,
      onProfileChange: props.onProfileChange,
      preflight: props.preflight,
      exportGate: gate,
      exportDetail: '',
      onExport: props.onExport,
      onSaveProject: props.onSaveProject,
      onOpenProject: props.onOpenProject,
      onGoToSlide: props.onSelect,
    }))

    expect(gate.enabled).toBe(false)
    expect(markup).toContain('Resolve blocking checks')
    expect(markup).toContain('Export blocked on slide 1')
    // The disabled control is the one both surfaces read.
    expect(markup).toContain('aria-describedby="ship-export-gate"')
  })

  it('gives the top bar and the ship stage the same export enablement', () => {
    const props = makeProps()
    const gate = resolveFlowboardExportGate({
      exportStatus: 'exporting',
      preflight: props.preflight,
      slideCount: props.slides.length,
      completed: 2,
      total: 3,
    })

    const topBar = renderToStaticMarkup(createElement(FlowboardTopBar, {
      projectName: props.projectName,
      onProjectNameChange: noop,
      canUndo: true,
      canRedo: false,
      onUndo: noop,
      onRedo: noop,
      onSaveProject: noop,
      onOpenProject: noop,
      onExport: noop,
      exportGate: gate,
      exportDetail: '',
      persistenceStatus: 'saved',
      persistenceDetail: '',
      profile: props.profile,
    }))

    const ship = renderToStaticMarkup(createElement(ShipStage, {
      projectName: props.projectName,
      slides: props.slides,
      selectedSlide: props.selectedSlide,
      profile: props.profile,
      onProfileChange: noop,
      preflight: props.preflight,
      exportGate: gate,
      exportDetail: '',
      onExport: noop,
      onSaveProject: noop,
      onOpenProject: noop,
      onGoToSlide: noop,
    }))

    // One gate, one answer: both controls are disabled and both say 2/3.
    expect(topBar).toContain('Exporting 2/3')
    expect(ship).toContain('Exporting 2/3')
    expect(topBar).toContain('disabled=""')
    expect(ship).toContain('disabled=""')
  })

  it('does not repeat form ids between the refine tray and the classic inspector', () => {
    const props = makeProps()
    const trayMarkup = renderToStaticMarkup(createElement(RefineStage, {
      canvas: canvasProps(props),
      inspector: inspectorProps(props),
      preflight: props.preflight,
      onGoToSlide: props.onSelect,
    }))
    const trayIds = collectIds(trayMarkup)
    expect(new Set(trayIds).size).toBe(trayIds.length)
    expect(trayIds).toContain('flowboard-layer-opacity')
    expect(trayIds).not.toContain('layer-opacity')
  })

  it('renders an empty single-slide deck without throwing', () => {
    const single = createSlide()
    const props = makeProps({
      projectName: '',
      slides: [single],
      selectedSlide: single,
      selectedIndex: 0,
      exportTotal: 1,
      preflight: runExportPreflight({
        profile: exportProfiles[0],
        slides: [single],
        activeLocale: 'en-US',
      }),
    })
    const markup = renderToStaticMarkup(createElement(Flowboard, props))
    expect(markup).toContain('Intake')
  })

  it('keeps template shortcuts pointed at the existing template catalog', () => {
    const props = makeProps()
    const applied: string[] = []
    const markup = renderToStaticMarkup(createElement(Flowboard, {
      ...props,
      onApplyTemplate: (template) => applied.push(template.id),
    }))
    expect(markup).toContain(projectTemplates[0].name)
    expect(applied).toEqual([])
  })
})

describe('Flowboard shell layout', () => {
  it('writes the active stage grid template onto the shell', () => {
    const props = makeProps()
    const intake = renderToStaticMarkup(createElement(Flowboard, props))
    // The Intake stage is the only two-column stage, and the template is the
    // one the layout module declares rather than a content-count auto-fit.
    expect(intake).toContain('--flow-stage-columns:repeat(2, minmax(0, 1fr))')
    expect(intake).toContain('data-stage-layout="two-column"')
    expect(intake).not.toContain('auto-fit')
  })

  it('renders a single column stage without a phantom second track', () => {
    const props = makeProps()
    const markup = renderToStaticMarkup(createElement(ShipStage, {
      projectName: props.projectName,
      slides: props.slides,
      selectedSlide: props.selectedSlide,
      profile: props.profile,
      onProfileChange: noop,
      preflight: props.preflight,
      exportGate: resolveFlowboardExportGate({
        exportStatus: 'idle',
        preflight: props.preflight,
        slideCount: props.slides.length,
      }),
      exportDetail: '',
      onExport: noop,
      onSaveProject: noop,
      onOpenProject: noop,
      onGoToSlide: noop,
    }))
    // The lone export panel spans the row instead of sitting in an empty track.
    expect(markup).toContain('flowboard-panel--wide')
    expect(markup).toContain('flowboard-export-grid')
  })

  it('keeps the inspector drawer scrollable instead of clipping it', () => {
    const props = makeProps()
    const css = readFileSync(new URL('./flowboard/flowboard.css', import.meta.url), 'utf8')
    // The drawer must hand the Inspector a bounded flex column, and the
    // Inspector's own scroll region is what actually scrolls.
    expect(css).toContain('.flowboard-drawer__panel {\n  display: flex;')
    expect(css).toContain('max-height: min(620px, 68vh);')
    expect(css).toContain('.flowboard-drawer__panel .inspector__scroll {')
    expect(css).toContain('overflow-y: auto;')

    // And the drawer is closed until the author asks for it, with a way back out.
    const closed = renderToStaticMarkup(createElement(RefineStage, {
      canvas: canvasProps(props),
      inspector: inspectorProps(props),
      preflight: props.preflight,
      onGoToSlide: props.onSelect,
    }))
    expect(closed).not.toContain('id="flowboard-inspector-drawer"')
    expect(closed).toContain('Open full inspector')
  })

  it('lays the body out as the main area and one right rail, with explicit tracks', () => {
    const css = readFileSync(new URL('./flowboard/flowboard.css', import.meta.url), 'utf8')
    // The desktop body is two written-out tracks, not a content count.
    expect(css).toMatch(/\.flowboard-body \{\n(?:.*\n)*?  grid-template-columns: minmax\(0, 1fr\) var\(--flow-rail-width\);/)
    expect(css).toContain('grid-template-rows: minmax(0, 1fr);')
    // One rail width token, and none of the old three-zone widths.
    expect(css).toContain('--flow-rail-width:')
    expect(css).not.toContain('--flow-context-width')
    // Below the desktop limit the rail leaves the grid entirely, so the main
    // area really is the full width of the viewport.
    expect(css).toMatch(/@media \(max-width: 1199px\) \{\n  \.flowboard-body \{\n    grid-template-columns: minmax\(0, 1fr\);/)
    // No shell region is sized by a content count: that is what left holes
    // beside a stage panel. Uniform repeated-item grids inside a panel are a
    // different question and keep their own templates.
    for (const selector of ['.flowboard-body', '.flowboard-stage-body', '.flowboard-steps__list']) {
      const rule = css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)))
      expect(rule).not.toContain('auto-fit')
    }
  })

  it('keeps the rail scrollable and the drawer out of its way', () => {
    const css = readFileSync(new URL('./flowboard/flowboard.css', import.meta.url), 'utf8')
    // The wrap is bounded, and the panel inside it is the scroll region, so the
    // rail is never a fixed-height column with a cut-off bottom.
    expect(css).toMatch(/\.flowboard-rail-wrap \{[\s\S]*?overflow: hidden;/)
    expect(css).toMatch(/\.flowboard-rail \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/)
    // On a desktop the rail is a real grid track, so it cannot be positioned
    // over the Inspector drawer and fight it for the same pixels.
    const start = css.indexOf('\n.flowboard-rail-wrap {')
    const base = css.slice(start, css.indexOf('}', start))
    expect(base).not.toContain('position: fixed')
    expect(base).toContain('overflow: hidden;')
  })
})

describe('Flowboard rail region', () => {
  it('keeps the desktop rail a permanent, reachable column', () => {
    const markup = renderToStaticMarkup(createElement(Flowboard, makeProps()))
    // Server rendering runs with no matchMedia, so the shell reads as desktop.
    expect(markup).toContain('data-breakpoint="desktop"')
    expect(markup).toContain('data-rail-region="column"')
    expect(markup).toContain('flowboard-rail')
    // A permanent column is never inert and needs no toggle or scrim.
    expect(markup).not.toContain('inert')
    expect(markup).not.toContain('flowboard-rail-scrim')
    expect(markup).not.toContain('flowboard-rail-close')
    expect(markup).not.toContain('flowboard-rail-toggle')
  })

  it('agrees with the region model at every size', () => {
    // The pure model owns this decision; the shell only reads it.
    expect(flowboardRailRegion('desktop')).toBe('column')
    expect(flowboardRailRegion('tablet')).toBe('bottom-sheet')
    expect(flowboardRailRegion('mobile')).toBe('side-sheet')
  })
})

describe('Full Editor regression', () => {
  it('keeps all five stages and both ways out of the shell', () => {
    const markup = renderToStaticMarkup(createElement(Flowboard, makeProps()))
    // Guided mode is added beside the editor, not instead of it.
    for (const name of ['Intake', 'Frame', 'Story', 'Refine', 'Ship']) {
      expect(markup).toContain(name)
    }
    expect(markup).toContain('flowboard-rail')
    // The classic three-pane escape hatch and the Guided / Full switch are both
    // in the rail, so the Full Editor still has both ways out.
    expect(markup).toContain('Classic editor')
    expect(markup).toContain('editor-mode-switch')
    expect(markup).toContain('Full editor')
    expect(markup).toMatch(/editor-mode-switch__option is-active"[^>]*aria-pressed="true"/)
    expect(markup).toContain('Editor guide')
    // Undo, redo, save, and open stay in the Full Editor.
    expect(markup).toContain('Undo')
    expect(markup).toContain('Save JSON')
  })

  it('keeps every Flowboard behaviour the reorganised layout depends on', () => {
    const props = makeProps()
    const markup = renderToStaticMarkup(createElement(Flowboard, props))
    // The stage panel, the shared export gate, the local draft status, and the
    // project actions are all still on screen in the same shell.
    expect(markup).toContain('flowboard-stage-body')
    expect(markup).toContain('aria-describedby="flowboard-export-gate"')
    expect(markup).toContain('Saved locally')
    expect(markup).toContain('flowboard-topbar__actions')
    // The Refine canvas, the Inspector tray, and its drawer are unchanged: the
    // layout change is the shell around them, not the panels themselves.
    const refine = renderToStaticMarkup(createElement(RefineStage, {
      canvas: canvasProps(props),
      inspector: inspectorProps(props),
      preflight: props.preflight,
      onGoToSlide: props.onSelect,
    }))
    expect(refine).toContain('Open full inspector')
    expect(refine).toContain('aria-controls="flowboard-inspector-drawer"')
  })

  it('shows why an export is blocked as visible text, not only a title attribute', () => {
    const props = makeProps({
      slides: [starterSlide],
      selectedSlide: starterSlide,
      exportTotal: 1,
      preflight: runExportPreflight({
        profile: exportProfiles[0],
        slides: [starterSlide],
        activeLocale: 'en-US',
      }),
    })
    const gate = resolveFlowboardExportGate({
      exportStatus: 'validation',
      preflight: props.preflight,
      slideCount: 1,
    })
    expect(gate.blocked).toBe(true)

    const markup = renderToStaticMarkup(createElement(FlowboardTopBar, {
      projectName: props.projectName,
      onProjectNameChange: noop,
      canUndo: true,
      canRedo: false,
      onUndo: noop,
      onRedo: noop,
      onSaveProject: noop,
      onOpenProject: noop,
      onExport: noop,
      exportGate: gate,
      exportDetail: '',
      persistenceStatus: 'saved',
      persistenceDetail: '',
      profile: props.profile,
    }))

    // The reason is in a real status line that the button also points at, so a
    // disabled Export is never a dead control with only a tooltip to explain it.
    expect(markup).toContain('id="flowboard-export-gate"')
    expect(markup).toContain('flowboard-topbar__gate--blocked')
    expect(markup).toContain('role="status"')
    expect(markup).toContain(gate.message)
    expect(markup).toContain('Export blocked on slide 1')
    // The describedby target is the visible line, not a hidden duplicate.
    expect(markup).not.toContain('id="flowboard-export-gate-status"')
    expect([...markup.matchAll(/id="flowboard-export-gate"/g)]).toHaveLength(1)
  })

  it('keeps the top bar quiet on a clean deck without losing the describedby target', () => {
    const props = makeProps()
    const gate = resolveFlowboardExportGate({
      exportStatus: 'idle',
      preflight: props.preflight,
      slideCount: props.slides.length,
    })
    const markup = renderToStaticMarkup(createElement(FlowboardTopBar, {
      projectName: props.projectName,
      onProjectNameChange: noop,
      canUndo: true,
      canRedo: false,
      onUndo: noop,
      onRedo: noop,
      onSaveProject: noop,
      onOpenProject: noop,
      onExport: noop,
      exportGate: gate,
      exportDetail: '',
      persistenceStatus: 'saved',
      persistenceDetail: '',
      profile: props.profile,
    }))

    expect(markup).toContain('id="flowboard-export-gate"')
    // Nothing to report, so the line is still there for the describedby but is
    // not shown as a message.
    expect(markup).toMatch(/id="flowboard-export-gate" class="[^"]*visually-hidden/)
  })
})

describe('classic editor escape hatch', () => {
  it('still renders the original three-pane layout with the Flowboard toggle', () => {
    const props = makeProps()
    const markup = renderToStaticMarkup(createElement(
      'div',
      { className: 'app-shell' },
      createElement(TopToolbar, {
        projectName: props.projectName,
        onProjectNameChange: noop,
        canUndo: props.canUndo,
        canRedo: props.canRedo,
        onUndo: noop,
        onRedo: noop,
        onTemplates: noop,
        templatesDisabled: false,
        onOpenGuide: noop,
        onImport: noop,
        onImportMultiple: noop,
        onOpen: noop,
        onSave: noop,
        onExport: noop,
        exportStatus: 'idle',
        exportDetail: '',
        exportCompleted: 0,
        exportTotal: props.exportTotal,
        canvasMode: 'isolated',
        onCanvasModeChange: noop,
        persistenceStatus: 'saved',
        persistenceDetail: props.persistenceDetail,
        profile: props.profile,
        onShowFlowboard: noop,
      }),
      createElement(
        'div',
        { className: 'editor-grid' },
        createElement(SlideNavigator, {
          slides: props.slides,
          selectedId: props.selectedSlide.id,
          onSelect: noop,
          onAdd: noop,
          onDuplicate: noop,
          onDelete: noop,
        }),
        createElement(SlideCanvas, canvasProps(props)),
        createElement(Inspector, inspectorProps(props)),
      ),
    ))

    expect(markup).toContain('editor-grid')
    expect(markup).toContain('slide-navigator')
    expect(markup).toContain('inspector')
    expect(markup).toContain('Flowboard')
  })
})
