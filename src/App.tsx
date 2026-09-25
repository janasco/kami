import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createSlide, exportProfiles, starterSlide } from './data'
import { ExportSlides } from './components/ExportSlides'
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
import {
  collectExportPreflightBounds,
  runExportPreflight,
  type PreflightLayerBoundsBySlide,
} from './lib/exportPreflight'
import { createSlidesFromProjectTemplate, type ProjectTemplate } from './lib/projectTemplates'
import { createDemoProject } from './lib/demoProject'
import type { ScreenshotImportItem } from './lib/screenshotImport'
import { hasCompletedOnboarding, markOnboardingComplete } from './lib/onboarding'
import type { CanvasMode, ExportProfileId, LayerId, LocaleId, Slide, SlideTransform } from './types'

const HISTORY_LIMIT = 50
const TEXT_HISTORY_COALESCE_MS = 750

interface EditorState {
  projectName: string
  slides: Slide[]
  selectedId: string
  activeLocale: LocaleId
  canvasMode: CanvasMode
  exportProfileId: ExportProfileId
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
  const {
    projectName,
    slides,
    selectedId,
    activeLocale,
    canvasMode,
    exportProfileId,
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
  const [onboardingCompleted, setOnboardingCompleted] = useState(hasCompletedOnboarding)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const exportInProgressRef = useRef(false)
  const exportStageRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const iconInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const importTargetIdRef = useRef<string | null>(null)
  const iconImportTargetIdRef = useRef<string | null>(null)
  const backgroundImportTargetIdRef = useRef<string | null>(null)
  const autosaveRunRef = useRef(0)
  const [preflightBounds, setPreflightBounds] = useState<PreflightLayerBoundsBySlide>({})
  const preflight = useMemo(() => runExportPreflight({
    profile: exportProfile,
    slides,
    activeLocale,
    layerBounds: preflightBounds,
  }), [activeLocale, exportProfile, preflightBounds, slides])

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (exportStageRef.current) setPreflightBounds(collectExportPreflightBounds(exportStageRef.current!, slides))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeLocale, exportProfile, slides])

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
    const next = update(current)
    if (next === current) return

    const contentChanged = next.projectName !== current.projectName
      || next.slides !== current.slides
      || next.activeLocale !== current.activeLocale
      || next.canvasMode !== current.canvasMode
      || next.exportProfileId !== current.exportProfileId

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
          return
        }
        const initialProject = loadResult.project
        if (initialProject) {
          replaceEditor({
            projectName: initialProject.name,
            slides: initialProject.slides,
            selectedId: initialProject.slides[0].id,
            activeLocale: initialProject.activeLocale,
            canvasMode: initialProject.canvasMode,
            exportProfileId: initialProject.selectedExportProfileId,
          })
        }
        clearEditorHistory()
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
      void saveProjectLocally({ name: projectName, slides, activeLocale, canvasMode, selectedExportProfileId: exportProfileId })
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
  }, [activeLocale, canvasMode, exportProfileId, projectLoadComplete, projectLoadFailed, projectName, slides])

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

  const updateSelectedSlideText = (field: 'title' | 'subtitle', value: string) => {
    commitEditorUpdate((current) => {
      let changed = false
      const nextSlides = current.slides.map((slide) => {
        if (slide.id !== current.selectedId) return slide
        if (current.activeLocale === 'en-US') {
          if (slide[field] === value && slide.translations?.['en-US']?.[field] === value) return slide
          changed = true
          return {
            ...slide,
            [field]: value,
            translations: {
              ...slide.translations,
              'en-US': { ...slide.translations?.['en-US'], [field]: value },
            },
          }
        }
        if (slide.translations?.[current.activeLocale]?.[field] === value) return slide
        changed = true
        return {
          ...slide,
          translations: {
            ...slide.translations,
            [current.activeLocale]: {
              ...slide.translations?.[current.activeLocale],
              [field]: value,
            },
          },
        }
      })
      return changed ? { ...current, slides: nextSlides } : current
    }, `text:${editorRef.current.selectedId}:${editorRef.current.activeLocale}:${field}`)
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
    if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) return
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
            backgroundImage: {
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
      const project = serializeProject({ name: projectName, slides, activeLocale, canvasMode, selectedExportProfileId: exportProfileId })
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
      }))
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
      ? collectExportPreflightBounds(exportStageRef.current, slides)
      : preflightBounds
    setPreflightBounds(currentBounds)
    const currentPreflight = runExportPreflight({
      profile: exportProfile,
      slides,
      activeLocale,
      layerBounds: currentBounds,
    })
    if (currentPreflight.status === 'blocked') {
      const firstIssue = currentPreflight.blockingIssues[0]
      const slideLabel = firstIssue.slideNumbers.length > 0
        ? ` (${firstIssue.slideNumbers.length === 1 ? 'slide' : 'slides'} ${firstIssue.slideNumbers.join(', ')})`
        : ''
      setExportStatus('validation')
      setExportDetail(`Export blocked: ${firstIssue.message}${slideLabel}`)
      return
    }

    exportInProgressRef.current = true
    setExportStatus('exporting')
    setExportCompleted(0)
    setExportTotal(slides.length)
    setExportDetail(`Preparing ${exportProfile.name} PNGs…`)

    try {
      if (!exportStageRef.current) throw new Error('The export canvas is not ready.')
      const { archive, filename } = await exportSlidesAsZip(
        projectName,
        slides,
        exportStageRef.current,
        exportProfile,
        ({ completed, total, detail }) => {
          setExportCompleted(completed)
          setExportTotal(total)
          setExportDetail(detail)
        },
      )
      const url = URL.createObjectURL(archive)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setExportStatus('success')
      setExportCompleted(slides.length)
      setExportTotal(slides.length)
      setExportDetail(`${filename} downloaded with ${slides.length} PNG${slides.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setExportStatus('error')
      setExportDetail(error instanceof Error ? error.message : 'The PNG ZIP could not be created. Try again.')
    } finally {
      exportInProgressRef.current = false
    }
  }

  return (
    <div className="app-shell">
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
          onProfileChange={changeExportProfile}
          exportDisabled={exportStatus === 'exporting'}
        />
      </div>
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
      <ExportSlides slides={slides} profile={exportProfile} locale={activeLocale} stageRef={exportStageRef} />
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
