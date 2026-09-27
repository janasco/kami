import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { exportProfiles, localeOptions } from '../../data'
import { projectTemplates, type ProjectTemplate } from '../../lib/projectTemplates'
import { SCREENSHOT_IMPORT_ACCEPT } from '../../lib/screenshotImport'
import { isProjectDropFile, type KamiCapturePayload } from '../../lib/screenshotDrop'
import type { FlowboardChecklistItem, FlowboardStageId } from '../../lib/flowboardStages'
import type { ExportProfile, LocaleId, Slide } from '../../types'
import { SlideDropTarget } from './SlideDropTarget'
import { SlideThumbnail } from './SlideThumbnail'

interface IntakeStageProps {
  projectName: string
  onProjectNameChange: (name: string) => void
  slides: Slide[]
  captureCount: number
  activeLocale: LocaleId
  onLocaleChange: (locale: LocaleId) => void
  profile: ExportProfile
  checklist: FlowboardChecklistItem[]
  onGoToStage: (id: FlowboardStageId) => void
  onImportFiles: (files: File[]) => void
  onOpenProjectFile: (file: File) => void
  onOpenScreenshotImport: () => void
  onImportScreenshot: () => void
  onOpenTemplates: () => void
  templatesDisabled: boolean
  onApplyTemplate: (template: ProjectTemplate) => void
  onLoadDemo: () => void
  onStartBlank: () => void
  onOpenProject: () => void
  /**
   * Image files dropped on one deck tile. Resolves to the notice for the drop so
   * it can be stated next to the strip.
   */
  onDropFiles: (slideId: string, files: File[]) => Promise<string>
  /** A capture dragged from one deck tile onto another. */
  onDropCapture: (slideId: string, capture: KamiCapturePayload) => string
}

/**
 * Stage 1. The entry point of the shell: bring captures in, name the project,
 * jump to a starter, and see the short getting-started checklist.
 */
export function IntakeStage({
  projectName,
  onProjectNameChange,
  slides,
  captureCount,
  activeLocale,
  onLocaleChange,
  profile,
  checklist,
  onGoToStage,
  onImportFiles,
  onOpenProjectFile,
  onOpenScreenshotImport,
  onImportScreenshot,
  onOpenTemplates,
  templatesDisabled,
  onApplyTemplate,
  onLoadDemo,
  onStartBlank,
  onOpenProject,
  onDropFiles,
  onDropCapture,
}: IntakeStageProps) {
  const [dragging, setDragging] = useState(false)
  const [dropNote, setDropNote] = useState<string | null>(null)
  const [slideNote, setSlideNote] = useState<string | null>(null)
  const dragDepthRef = useRef(0)
  const captureRequired = profile.preflight?.requirements.screenshot !== false

  /**
   * The big dropzone takes files, and only files.
   *
   * It assigns a whole deck in order, so a capture dragged off a card must not
   * be claimed here: dropping one on this panel would replace the deck instead of
   * the one slide the author aimed at. Reading the type keeps the two apart.
   */
  const carriesFiles = (transfer: DataTransfer | null) =>
    Array.from(transfer?.types ?? []).includes('Files')

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setDragging(false)
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length === 0) return

    // The same classification the slide drops use, so a project file and a
    // capture are never mistaken for one another here either.
    const projectFiles = files.filter(isProjectDropFile)
    const imageFiles = files.filter((file) => !isProjectDropFile(file))
    if (projectFiles.length > 0) {
      onOpenProjectFile(projectFiles[0])
      setDropNote(`Opened ${projectFiles[0].name}. The project replaces the current deck and can be undone.`)
    }
    if (imageFiles.length > 0) {
      onImportFiles(imageFiles)
      setDropNote(`Importing ${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'} in selection order.`)
    }
    if (imageFiles.length === 0 && projectFiles.length === 0) {
      setDropNote('Dropped files were not recognized. Use PNG, JPG, WebP, or a screenshot-studio.json project.')
    }
  }

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event.dataTransfer)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event.dataTransfer)) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragging(false)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event.dataTransfer)) return
    event.preventDefault()
  }

  /**
   * A drop on one deck tile is stated next to the strip, not up in the big
   * dropzone, so the outcome of the drop is next to the slide it changed.
   */
  const dropFilesOnSlide = (slideId: string, files: File[]) => {
    void onDropFiles(slideId, files).then(setSlideNote)
  }

  const dropCaptureOnSlide = (slideId: string, dropped: KamiCapturePayload) => {
    setSlideNote(onDropCapture(slideId, dropped))
  }

  return (
    <div className="flowboard-stage-body flowboard-intake">
      <section className="flowboard-panel flowboard-dropzone" aria-labelledby="intake-capture-title">
        <div
          className={`flowboard-dropzone__target${dragging ? ' is-dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="flowboard-dropzone__icon" aria-hidden="true">⇪</span>
          <div>
            <h3 id="intake-capture-title">Drop app captures here</h3>
            <p>
              Images are placed in selection order from slide 1, and a <code>screenshot-studio.json</code> file opens
              as a project. PNG, JPG, or WebP · 10 MB per image.
            </p>
          </div>
        </div>
        <div className="flowboard-dropzone__actions">
          <button className="button button--primary" type="button" onClick={onOpenScreenshotImport}>
            <span aria-hidden="true">⇞</span> Import a sequence
          </button>
          <button className="button button--outline" type="button" onClick={onImportScreenshot}>
            <span aria-hidden="true">↑</span> Replace capture on this slide
          </button>
          <button className="button button--quiet" type="button" onClick={onOpenProject}>
            <span aria-hidden="true">↥</span> Open project
          </button>
        </div>
        <p className="flowboard-hint" role="status" aria-live="polite">
          {dropNote ?? `Files are embedded in the project. Nothing is uploaded. Accepts ${SCREENSHOT_IMPORT_ACCEPT}.`}
        </p>
      </section>

      <section className="flowboard-panel" aria-labelledby="intake-record-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">App record</span>
          <h3 id="intake-record-title">Project basics</h3>
        </div>
        <label className="field-label" htmlFor="flowboard-project-name">Project name</label>
        <input
          id="flowboard-project-name"
          className="flowboard-text-input"
          value={projectName}
          spellCheck={false}
          onChange={(event) => onProjectNameChange(event.target.value)}
        />
        <label className="field-label" htmlFor="flowboard-locale">Preview language</label>
        <select
          id="flowboard-locale"
          className="profile-select"
          value={activeLocale}
          onChange={(event) => onLocaleChange(event.target.value as LocaleId)}
        >
          {localeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} · {option.direction.toUpperCase()}
            </option>
          ))}
        </select>
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
            <span>Target</span>
            <strong>{profile.name}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Dimensions</span>
            <strong>{profile.width} × {profile.height} px</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Orientation</span>
            <strong>{profile.orientation[0].toUpperCase() + profile.orientation.slice(1)}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Capture required</span>
            <strong>{captureRequired ? 'Every slide' : 'Optional on this profile'}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Profiles available</span>
            <strong>{exportProfiles.length}</strong>
          </div>
        </div>
      </section>

      <section className="flowboard-panel" aria-labelledby="intake-starters-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Shortcuts</span>
          <h3 id="intake-starters-title">Starters and templates</h3>
        </div>
        <div className="flowboard-starter-actions">
          <button className="button button--outline" type="button" onClick={onLoadDemo}>
            <span aria-hidden="true">✦</span> Load the 3-slide demo
          </button>
          <button className="button button--outline" type="button" onClick={onOpenTemplates} disabled={templatesDisabled}>
            <span aria-hidden="true">◇</span> Browse all templates
          </button>
          <button className="button button--quiet" type="button" onClick={onStartBlank}>
            <span aria-hidden="true">＋</span> Start from one blank slide
          </button>
        </div>
        <ul className="flowboard-template-list" role="list" aria-label="Template shortcuts">
          {projectTemplates.slice(0, 4).map((template) => (
            <li key={template.id}>
              <button
                className="flowboard-template-chip"
                type="button"
                onClick={() => onApplyTemplate(template)}
                disabled={templatesDisabled}
                title={`${template.description} Creates a new ${template.slides.length}-slide deck.`}
              >
                <span className="flowboard-template-chip__category">{template.category}</span>
                <strong>{template.name}</strong>
                <small>{template.slides.length} slides</small>
              </button>
            </li>
          ))}
        </ul>
        <p className="flowboard-hint">Applying a starter creates a new deck. Undo returns you to the current one.</p>
      </section>

      <section className="flowboard-panel" aria-labelledby="intake-checklist-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Getting started</span>
          <h3 id="intake-checklist-title">Four things worth doing</h3>
        </div>
        <ol className="flowboard-checklist" role="list">
          {checklist.map((item) => (
            <li key={item.id} className={item.done ? 'is-done' : ''}>
              <button type="button" className="flowboard-checklist__item" onClick={() => onGoToStage(item.stageId)}>
                <span className="flowboard-checklist__mark" aria-hidden="true">{item.done ? '✓' : '○'}</span>
                <span className="flowboard-checklist__copy">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
                <span className="flowboard-checklist__go">
                  Go to {item.stageId}<span aria-hidden="true"> →</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="flowboard-panel flowboard-panel--wide" aria-labelledby="intake-deck-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Current deck</span>
          <h3 id="intake-deck-title">{slides.length} slide{slides.length === 1 ? '' : 's'} in this project</h3>
          <p className="flowboard-hint">
            Drop images straight onto a slide to fill it, or drag one slide&apos;s capture onto another to copy it.
          </p>
        </div>
        <ul className="flowboard-mini-strip" role="list">
          {slides.map((slide, index) => (
            <li key={slide.id}>
              <SlideDropTarget
                slide={slide}
                className="flowboard-mini-strip__item"
                hint={slide.screenshot ? 'Drop to replace' : 'Drop to add'}
                onDropFiles={dropFilesOnSlide}
                onDropCapture={dropCaptureOnSlide}
              >
                <SlideThumbnail slide={slide} index={index} />
                <span className="flowboard-mini-strip__label">
                  {slide.title.split('\n')[0].trim() || `Slide ${index + 1}`}
                </span>
              </SlideDropTarget>
            </li>
          ))}
        </ul>
        <p className="flowboard-hint flowboard-drop-note" role="status" aria-live="polite">
          {slideNote ?? 'Dropping onto a slide replaces only that slide. Drop onto the panel above to place a whole sequence from slide 1.'}
        </p>
      </section>
    </div>
  )
}
