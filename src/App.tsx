import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createSlide, exportProfiles, starterSlide } from './data'
import { ExportSlides } from './components/ExportSlides'
import { Flowboard, type FlowboardProps } from './components/Flowboard'
import { GuidedShell } from './components/GuidedShell'
import { Inspector } from './components/Inspector'
import { SlideCanvas } from './components/SlideCanvas'
import { SlideNavigator } from './components/SlideNavigator'
import { TopToolbar } from './components/TopToolbar'
import { TemplatePicker, type TemplateApplyMode } from './components/TemplatePicker'
import { OnboardingGuide } from './components/OnboardingGuide'
import { ScreenshotImportDialog } from './components/ScreenshotImportDialog'
import type { ExportStatus, PersistenceStatus } from './components/TopToolbar'
import {
  loadAutosavedProjectWithReport,
  parseProjectDocument,
  saveProjectLocally,
  serializeProject,
} from './lib/project'
import { exportSlidesAsZip } from './lib/exportSlides'
import { planExportEntries, unassignedExportRefusal, variantExportRefusal } from './lib/exportPlan'
import {
  collectExportPreflightBounds,
  runExportPreflight,
  type PreflightLayerBoundsBySlide,
} from './lib/exportPreflight'
import { createDefaultOutputVariant, enabledVariantsForProfile, expandVariantRenders, reconcileVariantSlideIds } from './lib/deviceVariants'
import { createSlidesFromProjectTemplate, type ProjectTemplate } from './lib/projectTemplates'
import { createDemoProject } from './lib/demoProject'
import { applyBulkSlideAction, bulkActionMergeKey, describeBulkSlideResult, type BulkSlideAction } from './lib/flowboardBulkEdit'
import { applyLayerArrange, layerArrangeMergeKey, type LayerArrangeAction } from './lib/layerArrange'
import { applySlideStyleToDeck } from './lib/slideStyle'
import {
  readScreenshotFile,
  validateScreenshotFiles,
  type ScreenshotImportItem,
} from './lib/screenshotImport'
import { planScreenshotDrop, type KamiCapturePayload } from './lib/screenshotDrop'
import { hasCompletedOnboarding, markOnboardingComplete } from './lib/onboarding'
import { readEditorMode, resolveInitialEditorMode, writeEditorMode, type EditorMode } from './lib/editorMode'
import { applySlideTextUpdateToSlides, type SlideTextField } from './lib/localization'
import type { CanvasMode, CaptureAsset, DeviceVariantSlideOverride, ExportProfileId, LayerId, LocaleId, OutputVariant, ScreenshotFit, Slide, SlideTransform } from './types'

const HISTORY_LIMIT = 50
const TEXT_HISTORY_COALESCE_MS = 750

/**
 * Reads the intrinsic pixel size of an image data URL.
 *
 * A hint, not a requirement: a data URL the browser refuses to decode resolves
 * to null and the import proceeds without one, because a backdrop with no known
 * aspect is still a perfectly good backdrop — the canvas just falls back to a
 * plain cover instead of guessing a crop.
 */
const measureIntrinsicSize = (dataUrl: string): Promise<{ width: number; height: number } | null> =>
  new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(
      image.naturalWidth > 0 && image.naturalHeight > 0
        ? { width: image.naturalWidth, height: image.naturalHeight }
        : null,
    )
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })

/** UI-only view choice. The Flowboard is the Full Editor experience. */
type EditorView = 'flowboard' | 'classic'

interface EditorState {
  projectName: string
  slides: Slide[]
  selectedId: string
  activeLocale: LocaleId
  canvasMode: CanvasMode
  exportProfileId: ExportProfileId
  /**
   * The deck's output variants. Absent means the single default variant, which
   * is what every project authored before device variants has, so the field
   * never appears in a document that has no reason to carry it.
   */
  outputVariants?: OutputVariant[]
}

interface HistoryEntry {
  state: EditorState
}

interface EditorHistory {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

function App() {
  const [editor, setEditor] = useState<EditorState>({
    projectName: 'Untitled screenshot project',
    slides: [starterSlide],
    selectedId: starterSlide.id,
    activeLocale: 'en-US',
    canvasMode: 'isolated',
    exportProfileId: exportProfiles[0].id,
  })
  const [selectedLayerId, setSelectedLayerId] = useState<LayerId>('headline')
  const editorRef = useRef(editor)
  const historyRef = useRef<EditorHistory>({ past: [], future: [] })
  const lastHistoryChangeRef = useRef<{ mergeKey: string; recordedAt: number } | null>(null)
  const [, setHistoryVersion] = useState(0)
  /**
   * The layer and the measured boxes are read by callbacks that must not be
   * rebuilt on every state change, so both are mirrored into refs alongside the
   * editor state they belong to.
   */
  const selectedLayerIdRef = useRef(selectedLayerId)
  selectedLayerIdRef.current = selectedLayerId
  const preflightBoundsRef = useRef<PreflightLayerBoundsBySlide>({})
  const arrangeTokenRef = useRef(0)
  const {
    projectName,
    slides,
    selectedId,
    activeLocale,
    canvasMode,
    exportProfileId,
    outputVariants,
  } = editor
  const exportProfile = exportProfiles.find((profile) => profile.id === exportProfileId) ?? exportProfiles[0]
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>('loading')
  const [persistenceDetail, setPersistenceDetail] = useState('Loading the local browser draft…')
  const [projectValidationNotice, setProjectValidationNotice] = useState<string | null>(null)
  const [projectLoadComplete, setProjectLoadComplete] = useState(false)
  const [projectLoadFailed, setProjectLoadFailed] = useState(false)
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const [exportDetail, setExportDetail] = useState('Export selected profile PNGs as a ZIP.')
  const [exportCompleted, setExportCompleted] = useState(0)
  const [exportTotal, setExportTotal] = useState(0)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [screenshotImportOpen, setScreenshotImportOpen] = useState(false)
  /**
   * Counts how many times a deck has been created, so the editor shell can open
   * on the stage where the work actually happens.
   *
   * A counter rather than a boolean on purpose. A deck can be replaced several
   * times in one session — a template, then the demo, then a blank slide — and
   * each one should open the editor again. A boolean would only ever fire for
   * the first, and the second template would leave the author on Intake looking
   * at a deck they cannot see.
   *
   * It is a count and not the deck itself because `activeStage` belongs to the
   * Flowboard shell while every action that creates a deck lives up here, above
   * it. A count is the one signal that crosses that boundary without either side
   * having to own the other's state. Zero means "nothing has been created yet",
   * so the effect that reads it does not fire on first mount.
   */
  const [editorEntryRequest, setEditorEntryRequest] = useState(0)
  const [onboardingCompleted, setOnboardingCompleted] = useState(hasCompletedOnboarding)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [editorView, setEditorView] = useState<EditorView>('flowboard')
  /**
   * Guided mode for a first-time author, Full editor for everyone else.
   *
   * The stored preference is read once and carried alongside the live mode, so
   * the first-run default can be resolved when the local draft load finishes
   * without ever overwriting a choice the author made. Until that lands the
   * Full Editor renders, which is what a returning author expects to see first.
   */
  const [editorModeState, setEditorModeState] = useState<{ mode: EditorMode; stored: EditorMode | null }>(() => {
    const stored = readEditorMode()
    return { mode: stored ?? 'full', stored }
  })
  const { mode: editorMode } = editorModeState
  const exportInProgressRef = useRef(false)
  const exportStageRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const iconInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const variantCaptureInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const importTargetIdRef = useRef<string | null>(null)
  const iconImportTargetIdRef = useRef<string | null>(null)
  const backgroundImportTargetIdRef = useRef<string | null>(null)
  /** Which variant and slide the variant-capture picker is filling. */
  const variantCaptureTargetRef = useRef<{ variantId: string; slideId: string } | null>(null)
  const autosaveRunRef = useRef(0)
  const [preflightBounds, setPreflightBounds] = useState<PreflightLayerBoundsBySlide>({})
  preflightBoundsRef.current = preflightBounds
  /**
   * The variants the editor renders and exports.
   *
   * A deck with none is not "no variants": it is the one default variant every
   * project has always had. Deriving it here rather than in each reader means
   * the preflight, the export plan, and the stage switcher cannot disagree about
   * whether a deck has a device variant.
   */
  const variants = useMemo<OutputVariant[]>(() => (outputVariants && outputVariants.length > 0
    ? outputVariants
    : [createDefaultOutputVariant({
      slideIds: slides.map((slide) => slide.id),
      locale: activeLocale,
      themeId: slides[0]?.theme ?? 'midnight',
      exportProfileId,
    })]), [activeLocale, exportProfileId, outputVariants, slides])
  const [previewVariantId, setPreviewVariantId] = useState<string>('')
  const previewVariant = useMemo(
    () => variants.find((variant) => variant.id === previewVariantId) ?? variants[0],
    [previewVariantId, variants],
  )
  const preflight = useMemo(() => runExportPreflight({
    profile: exportProfile,
    slides,
    activeLocale,
    layerBounds: preflightBounds,
    variants,
  }), [activeLocale, exportProfile, preflightBounds, slides, variants])

  /**
   * The files this export will write, in order.
   *
   * One plan feeds the store preview, the preflight, the off-screen export
   * stage, and the ZIP, so what the author is shown is what lands in the bundle.
   */
  const exportPlan = useMemo(() => planExportEntries({
    slides,
    variants,
    profileId: exportProfile.id,
    requiresScreenshot: exportProfile.preflight?.requirements.screenshot !== false,
  }), [exportProfile.id, exportProfile.preflight, slides, variants])

  /**
   * The first enabled variant for the current profile, which is the one device
   * set the measurement pass reads.
   */
  const measuredVariant = useMemo(
    () => enabledVariantsForProfile(variants, exportProfile.id)[0],
    [exportProfile.id, variants],
  )

  /**
   * Which slide each export node belongs to, for the measurement pass.
   *
   * The stage lays out one node per planned entry, so the first `slides.length`
   * nodes are the first enabled variant's renders. For a deck with a single
   * default variant that is the base deck in deck order, which is the mapping the
   * align, distribute, and preflight-bounds paths have always used.
   */
  const measuredSlideIds = useMemo(() => {
    if (!measuredVariant) return slides.map((slide) => slide.id)
    return expandVariantRenders(slides, measuredVariant).map((render) => render.slide.id)
  }, [measuredVariant, slides])

  /**
   * Whether an export is actually running, as opposed to merely possible.
   *
   * `validation` and `exporting` are the two states where every planned node must
   * be in the DOM. `success` and `error` are outcomes and `idle` is the resting
   * state, and none of the three needs a rendered export stage.
   */
  const exportInFlight = exportStatus === 'validation' || exportStatus === 'exporting'

  /**
   * The entries the off-screen export stage should hold right now.
   *
   * The stage used to hold every entry of every variant, permanently. Measured on
   * a nineteen-slide deck with three variants: 2,736 of the document's 4,249
   * elements were that one hidden container, and typing ten characters into a
   * variant name cost 905ms — about 90ms per keystroke, five times the frame
   * budget, for typing into a text field.
   *
   * While idle it holds only the measured variant's entries, and that is
   * measurement-identical rather than merely plausible:
   * `collectExportPreflightBounds` takes `slideNodes.slice(0, slideIds.length)` and
   * pairs those nodes with `measuredSlideIds` **by position**. The plan is
   * variant-major, so the first N mounted nodes are the measured variant's slides
   * whichever entries are mounted. Once the full list is mounted for the export
   * itself, the same positional pairing holds.
   *
   * For the common single-variant deck this changes nothing at all, because the
   * measured variant is the only one.
   */
  const mountedExportEntries = useMemo(() => {
    if (exportInFlight || !measuredVariant) return exportPlan.entries
    return exportPlan.entries.filter((entry) => entry.variantId === measuredVariant.id)
  }, [exportInFlight, exportPlan.entries, measuredVariant])

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (exportStageRef.current) {
        setPreflightBounds(collectExportPreflightBounds(exportStageRef.current!, slides, measuredSlideIds))
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeLocale, exportProfile, measuredSlideIds, slides])
  useEffect(() => {
    if (exportStatus !== 'validation') return
    if (preflight.status === 'blocked') {
      const firstIssue = preflight.blockingIssues[0]
      const slideLabel = firstIssue.slideNumbers.length > 0
        ? ` (${firstIssue.slideNumbers.length === 1 ? 'slide' : 'slides'} ${firstIssue.slideNumbers.join(', ')})`
        : ''
      setExportDetail(`Export blocked: ${firstIssue.message}${slideLabel}`)
      return
    }
    setExportStatus('idle')
    setExportDetail(preflight.warningIssues.length > 0
      ? `Preflight passed with ${preflight.warningIssues.length} warning${preflight.warningIssues.length === 1 ? '' : 's'}.`
      : 'Preflight passed. Ready to export.')
  }, [exportStatus, preflight])

  const selectedIndex = Math.max(
    0,
    slides.findIndex((slide) => slide.id === selectedId),
  )
  const selectedSlide = slides[selectedIndex] ?? starterSlide
  const canUndo = historyRef.current.past.length > 0
  const canRedo = historyRef.current.future.length > 0

  const clearEditorHistory = () => {
    historyRef.current = { past: [], future: [] }
    lastHistoryChangeRef.current = null
    setHistoryVersion((version) => version + 1)
  }

  const replaceEditor = (next: EditorState) => {
    editorRef.current = next
    setEditor(next)
  }

  const commitEditorUpdate = (
    update: (current: EditorState) => EditorState,
    mergeKey?: string,
  ) => {
    const current = editorRef.current
    const updated = update(current)
    if (updated === current) return

    /*
     * Every variant is re-pointed at the deck whenever the deck's shape changes.
     *
     * This is here, in the one function every deck edit funnels through, rather
     * than in the twelve call sites that change `slides`. Patching each one is
     * how the bug arrived: `addSlide` updated `slides` and nothing else, so a new
     * slide joined no variant and the export plan silently omitted it — ten slides
     * and three variants produced three manifest rows.
     *
     * Running only when the slide list actually changed keeps a deck that is never
     * edited byte-identical, which is the property the whole document format rests
     * on. `reconcileVariantSlideIds` returns the same array when nothing moved, so
     * an edit that touches slides but not variants does not also rewrite them.
     */
    const next = updated.slides === current.slides
      ? updated
      : (() => {
          const reconciled = reconcileVariantSlideIds(updated.slides, updated.outputVariants)
          return reconciled === updated.outputVariants ? updated : { ...updated, outputVariants: reconciled }
        })()

    if (next === current) return

    const contentChanged = next.projectName !== current.projectName
      || next.slides !== current.slides
      || next.activeLocale !== current.activeLocale
      || next.canvasMode !== current.canvasMode
      || next.exportProfileId !== current.exportProfileId
      || next.outputVariants !== current.outputVariants

    if (contentChanged) {
      const now = Date.now()
      const lastChange = lastHistoryChangeRef.current
      const shouldCoalesce = mergeKey !== undefined
        && lastChange?.mergeKey === mergeKey
        && now - lastChange.recordedAt < TEXT_HISTORY_COALESCE_MS

      if (!shouldCoalesce) {
        historyRef.current.past.push({ state: current })
        if (historyRef.current.past.length > HISTORY_LIMIT) historyRef.current.past.shift()
      }
      historyRef.current.future = []
      lastHistoryChangeRef.current = mergeKey ? { mergeKey, recordedAt: now } : null
      setHistoryVersion((version) => version + 1)
    }

    replaceEditor(next)
  }

  const selectSlide = (id: string) => {
    replaceEditor({ ...editorRef.current, selectedId: id })
  }

  const undo = () => {
    const history = historyRef.current
    const previous = history.past.at(-1)
    if (!previous) return

    history.past.pop()
    history.future.unshift({ state: editorRef.current })
    if (history.future.length > HISTORY_LIMIT) history.future.pop()
    lastHistoryChangeRef.current = null
    replaceEditor(previous.state)
    setHistoryVersion((version) => version + 1)
  }

  const redo = () => {
    const history = historyRef.current
    const next = history.future[0]
    if (!next) return

    history.future.shift()
    history.past.push({ state: editorRef.current })
    if (history.past.length > HISTORY_LIMIT) history.past.shift()
    lastHistoryChangeRef.current = null
    replaceEditor(next.state)
    setHistoryVersion((version) => version + 1)
  }

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (!event.metaKey && !event.ctrlKey) || event.altKey) return
      if (event.key.toLowerCase() !== 'z') return

      const isRedo = event.shiftKey
      if (isRedo ? historyRef.current.future.length === 0 : historyRef.current.past.length === 0) return
      event.preventDefault()
      if (isRedo) redo()
      else undo()
    }

    window.addEventListener('keydown', handleHistoryShortcut)
    return () => window.removeEventListener('keydown', handleHistoryShortcut)
  }, [])

  useEffect(() => {
    let active = true

    void loadAutosavedProjectWithReport()
      .then((loadResult) => {
        if (!active) return
        if (loadResult.error) {
          setProjectLoadFailed(true)
          setPersistenceStatus('open-error')
          setPersistenceDetail(`The local browser draft was rejected: ${loadResult.error} The current editor state was not changed.`)
          setOnboardingOpen(!onboardingCompleted)
          setEditorModeState((current) => ({
            ...current,
            mode: resolveInitialEditorMode(
              { restoredProject: false, onboardingComplete: onboardingCompleted },
              current.stored,
            ),
          }))
          return
        }
        const initialProject = loadResult.project
        if (initialProject) {
          /*
           * The draft's variants are re-pointed at the draft's deck on the way in.
           *
           * `commitEditorUpdate` does this for every edit, and this is the one
           * ingress that is not an edit: `replaceEditor` installs the restored
           * state directly, so nothing reconciles it. That left the worst version
           * of the stale-reference bug in the app, because the draft is where a
           * stale reference actually comes from — a document written before
           * variants covered the deck restores with each variant naming only the
           * slides it was created with, and `restoreOutputVariants` filters to
           * existing slides rather than adding missing ones, so nothing downstream
           * repairs it either.
           *
           * A three-slide deck with two variants naming one slide each then
           * planned 2 PNGs instead of 6, and the Ship review said "nothing blocks
           * the export" beside it, because a plan that renders what the variants
           * name is faithful about a plan that renders the wrong slides. Opening
           * the very same document from a file *was* reconciled, via
           * `commitEditorUpdate`; this is the path that made the same document
           * behave two different ways.
           *
           * The same call, not a second rule: `reconcileVariantSlideIds` returns
           * the same array when the draft already agrees, so a current draft is
           * installed — and autosaved — untouched, which is the byte-identity
           * property the format rests on.
           */
          const restoredVariants = reconcileVariantSlideIds(
            initialProject.slides,
            initialProject.outputVariants,
          )
          replaceEditor({
            projectName: initialProject.name,
            slides: initialProject.slides,
            selectedId: initialProject.slides[0].id,
            activeLocale: initialProject.activeLocale,
            canvasMode: initialProject.canvasMode,
            exportProfileId: initialProject.selectedExportProfileId,
            ...(restoredVariants ? { outputVariants: restoredVariants } : {}),
          })
        }
        clearEditorHistory()
        // The first-run default can only be decided now, once it is known
        // whether a project was restored. An explicit stored choice is kept.
        setEditorModeState((current) => ({
          ...current,
          mode: resolveInitialEditorMode(
            { restoredProject: Boolean(initialProject), onboardingComplete: onboardingCompleted },
            current.stored,
          ),
        }))
        setOnboardingOpen(!initialProject && !onboardingCompleted)
        setProjectLoadComplete(true)
        setPersistenceStatus('saving')
        setPersistenceDetail('Changes autosave to this browser after a short delay.')
      })
      .catch(() => {
        if (!active) return
        setProjectLoadFailed(true)
        setPersistenceStatus('error')
        setPersistenceDetail('The local browser draft could not be loaded. Download screenshot-studio.json to keep the project.')
        setOnboardingOpen(!onboardingCompleted)
        setEditorModeState((current) => ({
          ...current,
          mode: resolveInitialEditorMode(
            { restoredProject: false, onboardingComplete: onboardingCompleted },
            current.stored,
          ),
        }))
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!projectLoadComplete || projectLoadFailed) return

    setPersistenceStatus('saving')
    setPersistenceDetail('Changes autosave to this browser after a short delay.')
    const run = ++autosaveRunRef.current
    const timer = window.setTimeout(() => {
      void saveProjectLocally({
        name: projectName,
        slides,
        activeLocale,
        canvasMode,
        selectedExportProfileId: exportProfileId,
        // Absent rather than an empty list, so a deck that never used a device
        // variant keeps serializing the record it always wrote.
        ...(outputVariants ? { outputVariants } : {}),
      })
        .then(() => {
          if (run !== autosaveRunRef.current) return
          setPersistenceStatus('saved')
          setPersistenceDetail('A local browser draft is saved. Use Save project for the Git-trackable JSON file.')
        })
        .catch(() => {
          if (run !== autosaveRunRef.current) return
          setPersistenceStatus('error')
          setPersistenceDetail('Browser autosave is unavailable or full. Download screenshot-studio.json to keep the project.')
        })
    }, 600)

    return () => window.clearTimeout(timer)
  }, [activeLocale, canvasMode, exportProfileId, projectLoadComplete, projectLoadFailed, projectName, slides, outputVariants])

  const updateSelectedSlide = (updates: Partial<Slide>, mergeKey?: string) => {
    commitEditorUpdate((current) => {
      const slide = current.slides.find((item) => item.id === current.selectedId)
      if (!slide) return current

      const hasTransformChange = updates.transform !== undefined
        && (['x', 'y', 'scale', 'rotation', 'widthScale', 'heightScale', 'flipX', 'flipY'] as const).some(
          (field) => slide.transform[field] !== updates.transform?.[field],
        )
      const hasOtherChange = (Object.keys(updates) as Array<keyof Slide>).some(
        (field) => field !== 'transform' && !Object.is(slide[field], updates[field]),
      )
      if (!hasTransformChange && !hasOtherChange) return current

      return {
        ...current,
        slides: current.slides.map((item) => (item.id === slide.id ? { ...slide, ...updates } : item)),
      }
    }, mergeKey)
  }

  const updateSlidePosition = (
    slideId: string,
    position: Pick<SlideTransform, 'x' | 'y'>,
    mergeKey: string,
  ) => {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return
    commitEditorUpdate((current) => {
      const slide = current.slides.find((item) => item.id === slideId)
      if (!slide || (slide.transform.x === position.x && slide.transform.y === position.y)) return current

      return {
        ...current,
        slides: current.slides.map((item) => (
          item.id === slideId
            ? { ...item, transform: { ...item.transform, ...position } }
            : item
        )),
      }
    }, mergeKey)
  }

  const updateLayerPosition = (
    slideId: string,
    layerId: LayerId,
    position: Pick<SlideTransform, 'x' | 'y'>,
    mergeKey: string,
  ) => {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return
    commitEditorUpdate((current) => {
      const slide = current.slides.find((item) => item.id === slideId)
      const transform = slide?.layerTransforms[layerId]
      if (!slide || !transform || !slide.layerSettings[layerId].visible) return current
      if (transform.x === position.x && transform.y === position.y) return current

      return {
        ...current,
        slides: current.slides.map((item) => (
          item.id === slideId
            ? {
                ...item,
                layerTransforms: {
                  ...item.layerTransforms,
                  [layerId]: { ...transform, ...position },
                },
              }
            : item
        )),
      }
    }, mergeKey)
  }

  /**
   * Applies one align, distribute, or stacking action to the active slide.
   *
   * The token makes each press its own history entry, so one align is one undo
   * step, and a request that cannot apply is dropped rather than recorded as an
   * empty step the author would have to undo twice.
   */
  const arrangeActiveSlide = (action: LayerArrangeAction) => {
    const canvas = { width: exportProfile.width, height: exportProfile.height }
    let description: string | null = null
    arrangeTokenRef.current += 1
    const token = arrangeTokenRef.current

    commitEditorUpdate((current) => {
      description = null
      const slide = current.slides.find((item) => item.id === current.selectedId)
      if (!slide) return current
      const result = applyLayerArrange({
        slide,
        action,
        selectedLayerId: selectedLayerIdRef.current,
        bounds: preflightBoundsRef.current[slide.id],
        canvas,
      })
      if (!result.changed) return current
      description = result.description
      return {
        ...current,
        slides: current.slides.map((item) => (item.id === slide.id ? result.slide : item)),
      }
    }, layerArrangeMergeKey(action, editorRef.current.selectedId, token))

    if (!description) return
    setProjectValidationNotice(`${description}. Undo is available.`)
  }

  /**
   * Writes one text field for one slide and locale.
   *
   * The Inspector always edits the active slide in the active locale, and the
   * Story translation matrix can edit any cell, so both share this one path. The
   * merge key is what groups a burst of typing into a single undo step, and it
   * is unchanged from before: `text:<slideId>:<locale>:<field>`.
   */
  const updateSlideText = (
    slideId: string,
    locale: LocaleId,
    field: SlideTextField,
    value: string,
  ) => {
    commitEditorUpdate((current) => {
      const nextSlides = applySlideTextUpdateToSlides(current.slides, slideId, locale, field, value)
      return nextSlides === current.slides ? current : { ...current, slides: nextSlides }
    }, `text:${slideId}:${locale}:${field}`)
  }

  const updateSelectedSlideText = (field: SlideTextField, value: string) => {
    updateSlideText(editorRef.current.selectedId, editorRef.current.activeLocale, field, value)
  }

  const changeProjectName = (name: string) => {
    commitEditorUpdate((current) => (
      current.projectName === name ? current : { ...current, projectName: name }
    ), 'project-name')
  }

  const changeActiveLocale = (locale: LocaleId) => {
    commitEditorUpdate((current) => (
      current.activeLocale === locale ? current : { ...current, activeLocale: locale }
    ))
  }

  const changeCanvasMode = (mode: CanvasMode) => {
    commitEditorUpdate((current) => (
      current.canvasMode === mode ? current : { ...current, canvasMode: mode }
    ))
  }

  const changeExportProfile = (profileId: ExportProfileId) => {
    if (exportInProgressRef.current) return
    commitEditorUpdate((current) => (
      current.exportProfileId === profileId ? current : { ...current, exportProfileId: profileId }
    ))
  }

  /**
   * Switches between Guided and Full editor and remembers the choice.
   *
   * This is a browser preference only. Both shells drive the same editor
   * state, history, autosave, and export path, so switching modes cannot
   * change the deck and needs no project change.
   */
  const changeEditorMode = (mode: EditorMode) => {
    setEditorModeState({ mode, stored: mode })
    writeEditorMode(mode)
  }

  const closeOnboarding = () => {
    markOnboardingComplete()
    setOnboardingCompleted(true)
    setOnboardingOpen(false)
  }

  const startBlankSlide = () => {
    const blankSlide: Slide = {
      ...createSlide(),
      title: '',
      subtitle: '',
    }
    commitEditorUpdate((current) => ({
      ...current,
      slides: [blankSlide],
      selectedId: blankSlide.id,
    }))
    setSelectedLayerId('headline')
    closeOnboarding()
    setEditorEntryRequest((count) => count + 1)
  }

  const startFromTemplate = () => {
    closeOnboarding()
    setTemplatePickerOpen(true)
  }

  const startScreenshotImport = () => {
    closeOnboarding()
    setScreenshotImportOpen(true)
  }

  const loadDemoProject = () => {
    if (exportInProgressRef.current) return
    const demo = createDemoProject()
    commitEditorUpdate((current) => ({
      ...current,
      projectName: demo.name,
      slides: demo.slides,
      selectedId: demo.slides[0].id,
      activeLocale: demo.activeLocale,
      canvasMode: demo.canvasMode,
      exportProfileId: demo.selectedExportProfileId,
    }))
    setSelectedLayerId('headline')
    setTemplatePickerOpen(false)
    setProjectValidationNotice('Generated demo loaded with three safe, inline SVG screenshots. Undo is available.')
    closeOnboarding()
    setEditorEntryRequest((count) => count + 1)
  }

  const startFromOpenProject = () => {
    closeOnboarding()
    projectInputRef.current?.click()
  }

  const applyProjectTemplate = (template: ProjectTemplate, mode: TemplateApplyMode) => {
    if (exportInProgressRef.current) return
    let nextSlides: Slide[] = []
    commitEditorUpdate((current) => {
      nextSlides = createSlidesFromProjectTemplate(template)
      const createNewDeck = mode === 'new-deck'
      return {
        ...current,
        projectName: template.projectName,
        slides: nextSlides,
        selectedId: nextSlides[0].id,
        ...(createNewDeck
          ? { activeLocale: 'en-US' as const, canvasMode: 'isolated' as const, exportProfileId: exportProfiles[0].id }
          : {}),
      }
    })
    setSelectedLayerId('headline')
    setTemplatePickerOpen(false)
    setProjectValidationNotice(`${template.name} applied. Undo is available if you want to return to the previous deck.`)
    setEditorEntryRequest((count) => count + 1)
  }

  const addSlide = () => {
    commitEditorUpdate((current) => {
      const nextSlide = createSlide()
      return {
        ...current,
        slides: [...current.slides, nextSlide],
        selectedId: nextSlide.id,
      }
    })
  }

  const duplicateSlide = () => {
    commitEditorUpdate((current) => {
      const index = current.slides.findIndex((slide) => slide.id === current.selectedId)
      const source = current.slides[index]
      if (!source) return current

      const duplicate: Slide = {
        ...source,
        id: `slide-${crypto.randomUUID()}`,
        translations: source.translations
          ? Object.fromEntries(Object.entries(source.translations).map(([locale, copy]) => [locale, { ...copy }]))
          : undefined,
        // Copied rather than shared, so reordering the duplicate can never
        // reach back into the slide it came from.
        ...(source.layerOrder ? { layerOrder: [...source.layerOrder] } : {}),
        layerTransforms: Object.fromEntries(
          Object.entries(source.layerTransforms).map(([layerId, transform]) => [layerId, { ...transform }]),
        ) as Slide['layerTransforms'],
        layerSettings: Object.fromEntries(
          Object.entries(source.layerSettings).map(([layerId, settings]) => [layerId, { ...settings }]),
        ) as Slide['layerSettings'],
        accentShapeStyle: { ...source.accentShapeStyle },
      }
      const nextIndex = index + 1
      return {
        ...current,
        slides: [
          ...current.slides.slice(0, nextIndex),
          duplicate,
          ...current.slides.slice(nextIndex),
        ],
        selectedId: duplicate.id,
      }
    })
  }

  const deleteSlide = () => {
    commitEditorUpdate((current) => {
      if (current.slides.length <= 1) return current
      const index = current.slides.findIndex((slide) => slide.id === current.selectedId)
      const slidesAfterDelete = current.slides.filter((slide) => slide.id !== current.selectedId)
      return {
        ...current,
        slides: slidesAfterDelete,
        selectedId: slidesAfterDelete[Math.min(Math.max(index, 0), slidesAfterDelete.length - 1)].id,
      }
    })
  }

  /** Reorders one slide inside the deck. Undoable like any other edit. */
  const moveSlide = (id: string, direction: -1 | 1) => {
    commitEditorUpdate((current) => {
      const index = current.slides.findIndex((slide) => slide.id === id)
      const targetIndex = index + direction
      if (index < 0 || targetIndex < 0 || targetIndex >= current.slides.length) return current

      const nextSlides = [...current.slides]
      const [moved] = nextSlides.splice(index, 1)
      nextSlides.splice(targetIndex, 0, moved)
      return { ...current, slides: nextSlides }
    })
  }

  /**
   * Copies the selected slide's visual style onto every other slide. The rule
   * that decides which fields count as style lives in `lib/slideStyle`, where a
   * test can reach it; this handler only decides when to run it and what to say.
   *
   * The background fill and its focal point are part of that list. Leaving them
   * out would leave "apply style to all" copying the theme while the rest of the
   * deck kept its own backdrop, which is exactly the desynchronization this
   * button exists to remove.
   */
  const applySelectedSlideStyleToAllSlides = () => {
    let appliedCount = 0
    commitEditorUpdate((current) => {
      const source = current.slides.find((slide) => slide.id === current.selectedId)
      if (!source) return current

      const { slides: nextSlides, changedCount } = applySlideStyleToDeck(current.slides, source)
      if (changedCount === 0) return current
      appliedCount = changedCount
      return { ...current, slides: nextSlides }
    })

    if (appliedCount > 0) {
      setProjectValidationNotice(`The selected slide style was applied to ${appliedCount} other slide${appliedCount === 1 ? '' : 's'}. Undo is available.`)
    }
  }

  /**
   * Applies one bulk change to several slides as a single history entry, so
   * undo, redo, and autosave behave exactly like a single-slide edit. Returns
   * the notice to show in the stage, or null when no slide held a different
   * value.
   */
  const applyBulkSlideActionToSlides = (slideIds: string[], action: BulkSlideAction) => {
    if (slideIds.length === 0) return null
    const targets = new Set(slideIds)
    let changedCount = 0

    commitEditorUpdate((current) => {
      changedCount = 0
      const nextSlides = current.slides.map((slide) => {
        if (!targets.has(slide.id)) return slide
        const next = applyBulkSlideAction(slide, action)
        if (!next) return slide
        changedCount += 1
        return next
      })

      return changedCount === 0 ? current : { ...current, slides: nextSlides }
    }, bulkActionMergeKey(action, slideIds))

    if (changedCount === 0) return null
    const notice = describeBulkSlideResult(action, changedCount)
    setProjectValidationNotice(notice)
    return notice
  }

  const importScreenshot = (file: File, targetId = selectedSlide.id) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      commitEditorUpdate((current) => {
        let changed = false
        const nextSlides = current.slides.map((slide) => {
          if (slide.id !== targetId) return slide
          changed = true
          return { ...slide, screenshot: reader.result as string, screenshotName: file.name }
        })
        return changed ? { ...current, slides: nextSlides } : current
      })
    }
    reader.onerror = () => {
      setPersistenceStatus('error')
      setPersistenceDetail('The screenshot could not be read. The current project was not changed.')
    }
    reader.readAsDataURL(file)
  }

  const importScreenshotSequence = (items: ScreenshotImportItem[]) => {
    if (items.length === 0 || exportInProgressRef.current) return
    let assignedCount = 0
    let createdCount = 0
    const initialSlideCount = editorRef.current.slides.length

    commitEditorUpdate((current) => {
      assignedCount = Math.min(items.length, current.slides.length)
      createdCount = items.length - assignedCount
      const firstSlide = current.slides[0]
      const nextSlides = current.slides.map((slide, index) => {
        if (index >= assignedCount) return slide
        const item = items[index]
        return { ...slide, screenshot: item.dataUrl, screenshotName: item.name }
      })

      for (let index = assignedCount; index < items.length; index += 1) {
        const item = items[index]
        const blankSlide = createSlide()
        nextSlides.push({
          ...blankSlide,
          title: '',
          subtitle: '',
          layout: firstSlide?.layout ?? blankSlide.layout,
          theme: firstSlide?.theme ?? blankSlide.theme,
          deviceFrameId: firstSlide?.deviceFrameId ?? blankSlide.deviceFrameId,
          accentShapeStyle: firstSlide ? { ...firstSlide.accentShapeStyle } : blankSlide.accentShapeStyle,
          screenshot: item.dataUrl,
          screenshotName: item.name,
        })
      }

      return {
        ...current,
        slides: nextSlides,
        selectedId: nextSlides[items.length - 1].id,
      }
    })

    setSelectedLayerId('screenshot')
    setProjectValidationNotice(
      `${items.length} screenshot${items.length === 1 ? '' : 's'} imported in order. ${createdCount > 0 ? `${createdCount} slide${createdCount === 1 ? '' : 's'} added. ` : ''}${initialSlideCount > items.length ? 'Existing images on later slides were left untouched. ' : ''}Undo is available.`,
    )
  }

  /** Reads dropped or picked image files and imports them in selection order. */
  const importScreenshotFiles = (files: File[]) => {
    const accepted = validateScreenshotFiles(files)
      .filter((candidate) => candidate.valid)
      .map((candidate) => candidate.file)
    if (accepted.length === 0) {
      setPersistenceStatus('error')
      setPersistenceDetail('None of the selected files were a PNG, JPG, or WebP image under 10 MB. Nothing changed.')
      return
    }

    void Promise.all(accepted.map((file) => readScreenshotFile(file)))
      .then((items) => importScreenshotSequence(items))
      .catch(() => {
        setPersistenceStatus('error')
        setPersistenceDetail('One or more dropped images could not be read. The current project was not changed.')
      })
  }

  /**
   * One slide's drop target, shared by the capture cards, the deck tiles, and the
   * device placeholder.
   *
   * The plan is derived, not decided here: the drop module already knows which
   * files are captures, which slide each one lands on, whether it replaces what
   * is there, and which files are refused. This function reads the accepted
   * files, writes the whole plan in one `commitEditorUpdate`, and returns the
   * notice, so a drop of six images is one undo step and one autosave.
   *
   * A project document in the same drop is deliberately not opened. Opening one
   * would replace the whole deck, which is not what dropping onto a single slide
   * means, so it is reported instead of acted on.
   */
  const dropFilesOnSlide = async (targetSlideId: string, files: File[]): Promise<string> => {
    if (exportInProgressRef.current) {
      return 'An export is running, so nothing was placed. Drop again once it finishes.'
    }

    const initialPlan = planScreenshotDrop({ files, slides: editorRef.current.slides, targetSlideId })
    if (initialPlan.captures.length === 0) {
      setProjectValidationNotice(initialPlan.notice)
      return initialPlan.notice
    }

    let items: ScreenshotImportItem[]
    try {
      items = await Promise.all(initialPlan.captures.map((capture) => readScreenshotFile(capture.file)))
    } catch {
      const notice = `${initialPlan.notice} One or more images could not be read, so nothing was placed.`
      setPersistenceStatus('error')
      setPersistenceDetail(notice)
      return notice
    }

    /**
     * Re-planned against the live deck rather than the one the drop landed on,
     * because reading the files is asynchronous: a slide can be deleted or a
     * second slide added in between, and the assignment has to match the deck
     * that is actually being written.
     */
    let notice = initialPlan.notice
    let appliedCount = 0
    commitEditorUpdate((current) => {
      const plan = planScreenshotDrop({ files, slides: current.slides, targetSlideId })
      if (plan.captures.length === 0) {
        // The target slide is gone, so the plan refuses every capture and says
        // why. Nothing is written and no empty history entry is recorded.
        notice = plan.notice
        return current
      }
      if (plan.captures.length !== items.length) {
        notice = 'The deck changed while the images were being read, so nothing was placed. Drop them again.'
        return current
      }
      const nextSlides = [...current.slides]
      let lastTouchedId: string | null = null
      plan.captures.forEach((capture, index) => {
        const item = items[index]
        if (capture.slideId) {
          const at = nextSlides.findIndex((slide) => slide.id === capture.slideId)
          if (at < 0) return
          nextSlides[at] = { ...nextSlides[at], screenshot: item.dataUrl, screenshotName: item.name }
          lastTouchedId = capture.slideId
          return
        }
        // Past the end of the deck: a new slide appended in the same order, so
        // the drop reads as a continued sequence rather than a reshuffle.
        const template = nextSlides.find((slide) => slide.id === targetSlideId) ?? nextSlides[0]
        const created: Slide = {
          ...createSlide(),
          title: '',
          subtitle: '',
          ...(template
            ? {
              layout: template.layout,
              theme: template.theme,
              deviceFrameId: template.deviceFrameId,
              showDeviceStatusBar: template.showDeviceStatusBar,
              screenshotFit: template.screenshotFit,
              accentShapeStyle: { ...template.accentShapeStyle },
            }
            : {}),
          screenshot: item.dataUrl,
          screenshotName: item.name,
        }
        nextSlides.push(created)
        lastTouchedId = created.id
      })

      appliedCount = plan.assignedCount
      notice = plan.notice
      return {
        ...current,
        slides: nextSlides,
        // The last slide the drop touched is the one the author is looking at
        // next, which is also the one they will want to frame.
        selectedId: lastTouchedId ?? current.selectedId,
      }
    })

    if (appliedCount === 0) {
      setProjectValidationNotice(notice)
      return notice
    }

    setSelectedLayerId('screenshot')
    setProjectValidationNotice(notice)
    return notice
  }

  /**
   * Copies an existing capture onto another slide, from a card dragged onto a
   * card. It is a copy and not a move: the source slide keeps its capture,
   * because dragging a card to reuse a capture is a far more common intention
   * than rearranging the deck, and a move would silently blank a slide.
   */
  const dropCaptureOnSlide = (targetSlideId: string, capture: KamiCapturePayload): string => {
    if (exportInProgressRef.current) {
      return 'An export is running, so nothing was placed. Drop again once it finishes.'
    }

    const source = editorRef.current.slides.find((slide) => slide.id === capture.slideId)
    if (!source?.screenshot) {
      return 'That capture is no longer on its slide, so nothing was placed.'
    }
    if (source.id === targetSlideId) {
      return `Slide ${editorRef.current.slides.indexOf(source) + 1} already has that capture. Nothing changed.`
    }

    const target = editorRef.current.slides.find((slide) => slide.id === targetSlideId)
    if (!target) return 'That slide is no longer in the deck, so nothing was placed.'

    const slideNumber = editorRef.current.slides.indexOf(target) + 1
    const notice = `Copied ${source.screenshotName ?? 'the capture'} onto slide ${slideNumber}. The original is untouched. Undo is available.`
    commitEditorUpdate((current) => ({
      ...current,
      slides: current.slides.map((slide) => (
        slide.id === targetSlideId
          ? { ...slide, screenshot: source.screenshot, screenshotName: source.screenshotName }
          : slide
      )),
      selectedId: targetSlideId,
    }))
    setSelectedLayerId('screenshot')
    setProjectValidationNotice(notice)
    return notice
  }

  const importAppIcon = (file: File, targetId = selectedSlide.id) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      const mimeType = file.type || reader.result.match(/^data:([^;,]+)/i)?.[1] || 'application/octet-stream'
      commitEditorUpdate((current) => {
        let changed = false
        const nextSlides = current.slides.map((slide) => {
          if (slide.id !== targetId) return slide
          changed = true
          return {
            ...slide,
            appIcon: {
              name: file.name,
              dataUrl: reader.result as string,
              mimeType,
            },
          }
        })
        return changed ? { ...current, slides: nextSlides } : current
      })
    }
    reader.onerror = () => {
      setPersistenceStatus('error')
      setPersistenceDetail('The app icon could not be read. The current project was not changed.')
    }
    reader.readAsDataURL(file)
  }

  const importBackgroundImage = (file: File, targetId = selectedSlide.id) => {
    // A backdrop is artwork, not a capture: SVG is allowed here, and it is the
    // format the demo project and the exported bundles already use.
    if (!/^image\/(?:png|jpeg|jpg|webp|svg\+xml|avif|gif)$/i.test(file.type)
      && !/\.(?:png|jpe?g|webp|svg|avif|gif)$/i.test(file.name)) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      const dataUrl = reader.result
      const mimeType = file.type || dataUrl.match(/^data:([^;,]+)/i)?.[1] || 'application/octet-stream'
      /*
       * The intrinsic size is a hint for the panoramic overscan, so it is
       * measured here rather than guessed. It is optional on purpose: an
       * import that cannot be measured still stores the backdrop, and the canvas
       * falls back to a plain cover until the image reports its own size.
       */
      void measureIntrinsicSize(dataUrl).then((size) => {
        commitEditorUpdate((current) => {
          let changed = false
          const nextSlides = current.slides.map((slide) => {
            if (slide.id !== targetId) return slide
            changed = true
            return {
              ...slide,
              backgroundImage: {
                name: file.name,
                dataUrl,
                mimeType,
                ...(size ? { width: size.width, height: size.height } : {}),
              },
            }
          })
          return changed ? { ...current, slides: nextSlides } : current
        })
      })
    }
    reader.onerror = () => {
      setPersistenceStatus('error')
      setPersistenceDetail('The background image could not be read. The current project was not changed.')
    }
    reader.readAsDataURL(file)
  }

  const openImport = (targetId = selectedSlide.id) => {
    importTargetIdRef.current = targetId
    fileInputRef.current?.click()
  }

  const openAppIconImport = (targetId = selectedSlide.id) => {
    iconImportTargetIdRef.current = targetId
    setSelectedLayerId('app-icon')
    iconInputRef.current?.click()
  }

  const removeAppIcon = () => {
    updateSelectedSlide({ appIcon: null })
    setSelectedLayerId('app-icon')
  }

  const openBackgroundImageImport = (targetId = selectedSlide.id) => {
    backgroundImportTargetIdRef.current = targetId
    setSelectedLayerId('background-image')
    backgroundInputRef.current?.click()
  }

  const removeBackgroundImage = () => {
    updateSelectedSlide({ backgroundImage: null })
    setSelectedLayerId('background-image')
  }

  const saveProject = () => {
    try {
      const project = serializeProject({
        name: projectName,
        slides,
        activeLocale,
        canvasMode,
        selectedExportProfileId: exportProfileId,
        ...(outputVariants ? { outputVariants } : {}),
      })
      const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'screenshot-studio.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setPersistenceDetail('screenshot-studio.json was downloaded. This JSON file is the Git-trackable project artifact.')
    } catch {
      setPersistenceStatus('error')
      setPersistenceDetail('The project file could not be downloaded. No current changes were lost.')
    }
  }

  const openProjectFile = async (file: File) => {
    try {
      const result = parseProjectDocument(await file.text())
      if (!result.ok) {
        setPersistenceStatus('open-error')
        setPersistenceDetail(result.error)
        setProjectValidationNotice(null)
        return
      }

      commitEditorUpdate((current) => ({
        ...current,
        projectName: result.project.name,
        slides: result.project.slides,
        activeLocale: result.project.activeLocale,
        canvasMode: result.project.canvasMode,
        exportProfileId: result.project.selectedExportProfileId,
        selectedId: result.project.slides[0].id,
        ...(result.project.outputVariants ? { outputVariants: result.project.outputVariants } : {}),
      }))
      setPreviewVariantId('')
      setProjectLoadFailed(false)
      setProjectLoadComplete(true)
      setOnboardingOpen(false)
      setProjectValidationNotice(`Project validated and opened. Undo is available.${result.migration.applied.length > 0 ? ` Migrated: ${result.migration.applied.join(', ')}.` : ''}`)
    } catch {
      setPersistenceStatus('open-error')
      setPersistenceDetail('The selected project file could not be read. The current project was not changed.')
    }
  }

  const exportProject = async () => {
    if (exportInProgressRef.current) return

    const currentBounds = exportStageRef.current
      ? collectExportPreflightBounds(exportStageRef.current, slides, measuredSlideIds)
      : preflightBounds
    setPreflightBounds(currentBounds)
    const currentPreflight = runExportPreflight({
      profile: exportProfile,
      slides,
      activeLocale,
      layerBounds: currentBounds,
      variants,
    })
    if (currentPreflight.status === 'blocked') {
      const firstIssue = currentPreflight.blockingIssues[0]
      setExportStatus('validation')
      setExportDetail(`Export blocked: ${firstIssue.message}`)
      return
    }

    /*
     * The plan is recomputed here rather than read from the memo, so an export
     * can never be written against a plan the last render produced. A variant
     * with a missing capture stops the run before anything is rendered, so the
     * bundle can never contain a placeholder that looks finished.
     */
    const plan = planExportEntries({
      slides,
      variants,
      profileId: exportProfile.id,
      requiresScreenshot: exportProfile.preflight?.requirements.screenshot !== false,
    })
    if (plan.blocked) {
      setExportStatus('validation')
      setExportDetail(variantExportRefusal(plan.blocked))
      return
    }
    /*
     * The second refusal, and the one the gate cannot reach on its own.
     *
     * `plan.blocked` speaks about a variant; this one has no variant to name,
     * because the plan is empty. Reaching here would mean writing an empty ZIP
     * and reporting it as a success, so the run stops before anything is
     * rendered, exactly as it does for a blocked variant.
     */
    if (plan.unassigned) {
      setExportStatus('validation')
      setExportDetail(unassignedExportRefusal(plan.unassigned))
      return
    }

    exportInProgressRef.current = true
    setExportStatus('exporting')
    setExportCompleted(0)
    setExportTotal(plan.entries.length)
    setExportDetail(`Preparing ${plan.entries.length} ${exportProfile.name} PNG${plan.entries.length === 1 ? '' : 's'}…`)

    try {
      if (!exportStageRef.current) throw new Error('The export canvas is not ready.')

      /*
       * Wait for the full stage to actually mount before reading it.
       *
       * `setExportStatus('exporting')` above only schedules a render; React has not
       * committed it by the time this line runs, and the stage now mounts every
       * entry only while an export is in flight. Reading the ref immediately would
       * therefore hand `exportSlidesAsZip` whatever was still mounted — on a
       * multi-language deck, one language's slides — and produce a ZIP that was
       * short and reported success.
       *
       * Polling for the node count rather than waiting a fixed frame is deliberate:
       * one `requestAnimationFrame` is not a guarantee, and a wrong answer here is
       * a silently incomplete bundle. The check below turns "not ready yet" into a
       * loud failure instead.
       */
      const expectedNodes = plan.entries.length
      const deadline = Date.now() + 3000
      let mountedNodes = exportStageRef.current.querySelectorAll('[data-export-slide]').length
      while (mountedNodes < expectedNodes && Date.now() < deadline) {
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)))
        mountedNodes = exportStageRef.current?.querySelectorAll('[data-export-slide]').length ?? 0
      }
      if (mountedNodes < expectedNodes) {
        throw new Error(
          `The export canvas mounted ${mountedNodes} of ${expectedNodes} slides, so the bundle would have been incomplete. Nothing was downloaded.`,
        )
      }

      const { archive, filename } = await exportSlidesAsZip({
        projectName,
        entries: plan.entries,
        profile: exportProfile,
        stage: exportStageRef.current,
        onProgress: ({ completed, total, detail }) => {
          setExportCompleted(completed)
          setExportTotal(total)
          setExportDetail(detail)
        },
      })
      const url = URL.createObjectURL(archive)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setExportStatus('success')
      setExportCompleted(plan.entries.length)
      setExportTotal(plan.entries.length)
      setExportDetail(`${filename} downloaded with ${plan.entries.length} PNG${plan.entries.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setExportStatus('error')
      setExportDetail(error instanceof Error ? error.message : 'The PNG ZIP could not be created. Try again.')
    } finally {
      exportInProgressRef.current = false
    }
  }

  /**
   * The variant actions the Ship stage offers.
   *
   * All of them are one `commitEditorUpdate` each, so one is one undo step and
   * one autosave, exactly like every other edit in the editor.
   */
  const updateOutputVariants = (next: OutputVariant[] | undefined) => {
    commitEditorUpdate((current) => {
      if (next === current.outputVariants) return current
      return { ...current, ...(next && next.length > 0 ? { outputVariants: next } : { outputVariants: undefined }) }
    })
  }

  const changeVariantProfile = (variantId: string, profileId: ExportProfileId) => {
    updateOutputVariants(variants.map((variant) => (variant.id === variantId ? { ...variant, exportProfileId: profileId } : variant)))
  }

  const toggleVariantEnabled = (variantId: string) => {
    updateOutputVariants(variants.map((variant) => (variant.id === variantId ? { ...variant, enabled: !variant.enabled } : variant)))
  }

  /**
   * Set the language one variant is drawn in.
   *
   * `locale` has been on the variant since the field was introduced: it is
   * persisted, it is validated, it decides what the PNGs are drawn in, and it is
   * what the filename records. What it had no *control* for, so a new variant
   * inherited the deck's active locale and stayed there — which meant a deck
   * could describe several devices but only ever one language, no matter what the
   * document said.
   *
   * Deliberately one field on one variant rather than a bulk "translate to…"
   * action. Copy is authored per locale in the Story translation matrix, and a
   * variant pointing at a language whose copy is missing falls back to English
   * per field — which is a real, inspectable state, whereas a bulk duplicate
   * would fill the set with variants that silently export English twice.
   */
  const changeVariantLocale = (variantId: string, locale: LocaleId) => {
    updateOutputVariants(
      variants.map((variant) => (variant.id === variantId ? { ...variant, locale } : variant)),
    )
  }

  const renameVariant = (variantId: string, name: string) => {
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    updateOutputVariants(variants.map((variant) => (variant.id === variantId ? { ...variant, name: trimmed } : variant)))
  }

  /**
   * Adds a device variant: the same slides, the same locale, no overrides, and
   * the current profile. It is a starting point to edit, not a duplicate of the
   * deck, so the author names it and then changes only the device on the slides
   * that need it.
   */
  const addOutputVariant = () => {
    const taken = new Set(variants.map((variant) => variant.id))
    let index = variants.length + 1
    let id = `variant-${index}`
    while (taken.has(id)) {
      index += 1
      id = `variant-${index}`
    }
    const added: OutputVariant = {
      id,
      name: `Device ${index}`,
      canvasId: variants[0]?.canvasId ?? 'main-story',
      locale: activeLocale,
      themeId: slides[0]?.theme ?? 'midnight',
      slideIds: slides.map((slide) => slide.id),
      enabled: true,
      exportProfileId: exportProfileId,
    }
    updateOutputVariants([...variants, added])
    setPreviewVariantId(added.id)
    setProjectValidationNotice(`Added the “${added.name}” variant. Rename it, then set the device on the slides that differ. Undo is available.`)
  }

  /** Removes a variant and everything it overrides. */
  const removeOutputVariant = (variantId: string) => {
    const target = variants.find((variant) => variant.id === variantId)
    if (!target) return
    const remaining = variants.filter((variant) => variant.id !== variantId)
    updateOutputVariants(remaining.length > 0 ? remaining : undefined)
    if (previewVariantId === variantId) setPreviewVariantId('')
    setProjectValidationNotice(`Removed the “${target.name}” variant and its overrides. Undo is available.`)
  }

  /**
   * One device field for one slide of one variant.
   *
   * `undefined` clears it and the slide's own field takes over again, which is
   * the whole rule a variant is built on: a slide with no override for a field
   * uses the deck's value. An override that ends up naming nothing is removed
   * rather than stored, so clearing the last field really returns the document to
   * the shape it had.
   */
  const updateVariantOverride = (
    variantId: string,
    slideId: string,
    field: 'deviceFrameId' | 'showDeviceStatusBar' | 'screenshotFit',
    value: DeviceVariantSlideOverride['deviceFrameId'] | boolean | ScreenshotFit | undefined,
  ) => {
    const variant = variants.find((entry) => entry.id === variantId)
    if (!variant) return
    const existing = variant.deviceOverrides?.find((override) => override.slideId === slideId)
    const next: DeviceVariantSlideOverride = { ...(existing ?? { slideId }), [field]: value } as DeviceVariantSlideOverride
    for (const key of ['deviceFrameId', 'showDeviceStatusBar', 'screenshotFit', 'screenshot', 'layerTransforms'] as const) {
      if (next[key] === undefined) delete next[key]
    }
    const others = (variant.deviceOverrides ?? []).filter((override) => override.slideId !== slideId)
    const kept = Object.keys(next).length > 1
    updateOutputVariants(variants.map((entry) => (entry.id === variantId
      ? { ...entry, ...(kept ? { deviceOverrides: [...others, next] } : { deviceOverrides: others.length > 0 ? others : undefined }) }
      : entry)))
  }

  /**
   * Gives one slide of one variant its own capture.
   *
   * There is deliberately no "remove the capture" action: a variant that has to
   * withhold a capture blocks its own export rather than shipping a hole, and
   * removing the deck's capture is the deck's business, not the variant's.
   */
  const updateVariantCapture = (variantId: string, slideId: string, capture: CaptureAsset) => {
    const variant = variants.find((entry) => entry.id === variantId)
    if (!variant) return
    const others = (variant.deviceOverrides ?? []).filter((override) => override.slideId !== slideId)
    updateOutputVariants(variants.map((entry) => (entry.id === variantId
      ? { ...entry, deviceOverrides: [...others, { slideId, screenshot: capture }] }
      : entry)))
    setSelectedLayerId('screenshot')
  }

  /** Opens the picker for one slide of one variant. */
  const openVariantCaptureImport = (variantId: string, slideId: string) => {
    variantCaptureTargetRef.current = { variantId, slideId }
    variantCaptureInputRef.current?.click()
  }

  /** Reads one image and stores it as that slide's capture inside the variant. */
  const importVariantCapture = (target: { variantId: string; slideId: string }, file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      const mimeType = file.type || reader.result.match(/^data:([^;,]+)/i)?.[1] || 'application/octet-stream'
      updateVariantCapture(target.variantId, target.slideId, { name: file.name, dataUrl: reader.result, mimeType })
      setProjectValidationNotice(`Capture set for this device only. The deck’s own capture is untouched. Undo is available.`)
    }
    reader.onerror = () => {
      setPersistenceStatus('error')
      setPersistenceDetail('That image could not be read. The variant was not changed.')
    }
    reader.readAsDataURL(file)
  }

  /**
   * One prop object for both shells.
   *
   * Guided mode is a different set of questions asked of the same editor, not
   * a second editor, so it is handed the identical state and handlers. The
   * export, import, autosave, and project logic below is therefore written once
   * and used by both.
   */
  const shellProps: FlowboardProps = {
    projectName,
    onProjectNameChange: changeProjectName,
    canUndo,
    canRedo,
    onUndo: undo,
    onRedo: redo,
    onSaveProject: saveProject,
    onOpenProject: () => projectInputRef.current?.click(),
    onOpenProjectFile: (file) => void openProjectFile(file),
    slides,
    selectedSlide,
    selectedIndex,
    onSelect: selectSlide,
    onAddSlide: addSlide,
    onDuplicateSlide: duplicateSlide,
    onDeleteSlide: deleteSlide,
    onMoveSlide: moveSlide,
    onApplyStyleToAllSlides: applySelectedSlideStyleToAllSlides,
    onUpdateSlide: updateSelectedSlide,
    onApplyBulkSlideAction: applyBulkSlideActionToSlides,
    onTextUpdate: updateSelectedSlideText,
    onSlideTextUpdate: updateSlideText,
    onTransformChange: updateSlidePosition,
    selectedLayerId,
    onLayerSelect: setSelectedLayerId,
    onLayerTransformChange: updateLayerPosition,
    layerBounds: preflightBounds,
    onArrange: arrangeActiveSlide,
    onImportScreenshot: openImport,
    onImportFiles: importScreenshotFiles,
    onDropFilesOnSlide: dropFilesOnSlide,
    onDropCaptureOnSlide: dropCaptureOnSlide,
    onOpenScreenshotImport: () => setScreenshotImportOpen(true),
    onImportAppIcon: () => openAppIconImport(),
    onRemoveAppIcon: removeAppIcon,
    onImportBackground: () => openBackgroundImageImport(),
    onRemoveBackground: removeBackgroundImage,
    onOpenTemplates: () => setTemplatePickerOpen(true),
    templatesDisabled: !projectLoadComplete && !projectLoadFailed,
    onApplyTemplate: applyProjectTemplate,
    onLoadDemo: loadDemoProject,
    onStartBlank: startBlankSlide,
    editorEntryRequest,
    onOpenGuide: () => setOnboardingOpen(true),
    activeLocale,
    onLocaleChange: changeActiveLocale,
    canvasMode,
    onCanvasModeChange: changeCanvasMode,
    profile: exportProfile,
    onProfileChange: changeExportProfile,
    preflight,
    variants,
    activeVariantId: previewVariant?.id ?? '',
    exportEntries: exportPlan.entries,
    exportBlockedVariant: exportPlan.blocked,
    exportUnassigned: exportPlan.unassigned,
    onVariantPreviewChange: setPreviewVariantId,
    onVariantProfileChange: changeVariantProfile,
    onVariantLocaleChange: changeVariantLocale,
    onVariantToggleEnabled: toggleVariantEnabled,
    onVariantRename: renameVariant,
    onVariantAdd: addOutputVariant,
    onVariantRemove: removeOutputVariant,
    onVariantOverrideChange: updateVariantOverride,
    onVariantCaptureChange: openVariantCaptureImport,
    onExport: () => void exportProject(),
    exportStatus,
    exportDetail,
    exportCompleted,
    exportTotal,
    persistenceStatus,
    persistenceDetail,
    projectValidationNotice,
    onShowClassicEditor: () => setEditorView('classic'),
    onEditorModeChange: changeEditorMode,
  }

  return (
    <div className="app-shell">
      {editorMode === 'guided' ? (
        <GuidedShell {...shellProps} />
      ) : editorView === 'classic' ? (
        <>
          <TopToolbar
            projectName={projectName}
            onProjectNameChange={changeProjectName}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onTemplates={() => setTemplatePickerOpen(true)}
            templatesDisabled={!projectLoadComplete && !projectLoadFailed}
            onOpenGuide={() => setOnboardingOpen(true)}
            onImport={() => openImport()}
            onImportMultiple={() => setScreenshotImportOpen(true)}
            onOpen={() => projectInputRef.current?.click()}
            onSave={saveProject}
            onExport={() => void exportProject()}
            exportStatus={exportStatus}
            exportDetail={exportDetail}
            exportCompleted={exportCompleted}
            exportTotal={exportTotal}
            canvasMode={canvasMode}
            onCanvasModeChange={changeCanvasMode}
            persistenceStatus={persistenceStatus}
            persistenceDetail={persistenceDetail}
            profile={exportProfile}
            onShowFlowboard={() => setEditorView('flowboard')}
            onOpenGuided={() => changeEditorMode('guided')}
          />
          <div className="editor-grid">
            <SlideNavigator
              slides={slides}
              selectedId={selectedSlide.id}
              onSelect={selectSlide}
              onAdd={addSlide}
              onDuplicate={duplicateSlide}
              onDelete={deleteSlide}
            />
            <SlideCanvas
              slides={slides}
              selectedSlide={selectedSlide}
              selectedIndex={selectedIndex}
              selectedId={selectedSlide.id}
              mode={canvasMode}
              onModeChange={changeCanvasMode}
              onSelect={selectSlide}
              onImport={openImport}
              onTransformChange={updateSlidePosition}
              selectedLayerId={selectedLayerId}
              onLayerSelect={setSelectedLayerId}
              onLayerTransformChange={updateLayerPosition}
              onDropFilesOnSlide={dropFilesOnSlide}
              onDropCaptureOnSlide={dropCaptureOnSlide}
              persistenceStatus={persistenceStatus}
              persistenceDetail={persistenceDetail}
              projectValidationNotice={projectValidationNotice}
              exportStatus={exportStatus}
              exportDetail={exportDetail}
              exportCompleted={exportCompleted}
              exportTotal={exportTotal}
              profile={exportProfile}
              locale={activeLocale}
            />
            <Inspector
              slide={selectedSlide}
              activeLocale={activeLocale}
              onLocaleChange={changeActiveLocale}
              onUpdate={updateSelectedSlide}
              onTextUpdate={updateSelectedSlideText}
              onImport={() => openImport()}
              onImportIcon={() => openAppIconImport()}
              onRemoveIcon={removeAppIcon}
              onImportBackground={() => openBackgroundImageImport()}
              onRemoveBackground={removeBackgroundImage}
              selectedLayerId={selectedLayerId}
              onLayerSelect={setSelectedLayerId}
              profile={exportProfile}
              preflight={preflight}
              layerBounds={preflightBounds}
              onArrange={arrangeActiveSlide}
              onProfileChange={changeExportProfile}
              exportDisabled={exportStatus === 'exporting'}
            />
          </div>
        </>
      ) : (
        <Flowboard {...shellProps} />
      )}
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) importScreenshot(file, importTargetIdRef.current ?? selectedSlide.id)
          importTargetIdRef.current = null
          event.target.value = ''
        }}
        aria-label="Import app screenshot"
      />
      <input
        ref={iconInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) importAppIcon(file, iconImportTargetIdRef.current ?? selectedSlide.id)
          iconImportTargetIdRef.current = null
          event.target.value = ''
        }}
        aria-label="Import app icon"
      />
      <input
        ref={backgroundInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) importBackgroundImage(file, backgroundImportTargetIdRef.current ?? selectedSlide.id)
          backgroundImportTargetIdRef.current = null
          event.target.value = ''
        }}
        aria-label="Import background image"
      />
      <input
        ref={variantCaptureInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
        onChange={(event) => {
          const input = event.currentTarget
          const file = input.files?.[0]
          const target = variantCaptureTargetRef.current
          if (file && target) importVariantCapture(target, file)
          variantCaptureTargetRef.current = null
          input.value = ''
        }}
        aria-label="Import a capture for one device variant"
      />
      <input
        ref={projectInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const input = event.currentTarget
          const file = input.files?.[0]
          if (file) void openProjectFile(file)
          input.value = ''
        }}
        aria-label="Open screenshot studio project"
      />
      <ExportSlides entries={mountedExportEntries} variants={variants} profile={exportProfile} locale={activeLocale} stageRef={exportStageRef} />
      {onboardingOpen && (
        <OnboardingGuide
          onClose={closeOnboarding}
          onStartBlank={startBlankSlide}
          onStartTemplate={startFromTemplate}
          onImportScreenshots={startScreenshotImport}
          onLoadDemo={loadDemoProject}
          onOpenProject={startFromOpenProject}
        />
      )}
      {templatePickerOpen && (
        <TemplatePicker
          onClose={() => setTemplatePickerOpen(false)}
          onApply={applyProjectTemplate}
          onLoadDemo={loadDemoProject}
        />
      )}
      {screenshotImportOpen && (
        <ScreenshotImportDialog
          slideCount={slides.length}
          onClose={() => setScreenshotImportOpen(false)}
          onImport={importScreenshotSequence}
        />
      )}
    </div>
  )
}

export default App
