import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describeFlowboardSelection } from '../lib/flowboardSelection'
import { exportProfiles } from '../data'
import { KAMI_CAPTURE_DRAG_TYPE } from '../lib/screenshotDrop'
import { ExportSlides } from './ExportSlides'
import { FrameStage } from './flowboard/FrameStage'
import { IntakeStage } from './flowboard/IntakeStage'
import { SlideCanvas } from './SlideCanvas'
import { makeFlowboardProps } from '../test/flowboardProps'

/**
 * Markup tests for the capture drop targets.
 *
 * The repository has no DOM test environment, so these render the three surfaces
 * to static markup and check the affordances that have to be there: a target is
 * declared on every card and tile, a card with a capture offers itself as a drag
 * source, the placeholder still works as an import button, and the export stage —
 * which renders the same placeholder — is not a target at all. The behaviour
 * behind the handlers is covered in `lib/screenshotDrop.test.ts`.
 */

const noop = () => undefined

const noopDropFiles = async () => 'Nothing was placed.'
const noopDropCapture = () => 'Nothing was placed.'

const frameProps = (overrides: Record<string, unknown> = {}) => {
  const props = makeFlowboardProps()
  return {
    slides: props.slides,
    selectedSlide: props.selectedSlide,
    selectedIndex: props.selectedIndex,
    selection: describeFlowboardSelection(
      props.slides.map((slide) => slide.id),
      props.selectedSlide.id,
      [],
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
    onDropFiles: noopDropFiles,
    onDropCapture: noopDropCapture,
    ...overrides,
  }
}

const intakeProps = (overrides: Record<string, unknown> = {}) => {
  const props = makeFlowboardProps()
  return {
    projectName: props.projectName,
    onProjectNameChange: noop,
    slides: props.slides,
    captureCount: props.slides.length,
    activeLocale: 'en-US' as const,
    onLocaleChange: noop,
    profile: props.profile,
    checklist: [],
    onGoToStage: noop,
    onImportFiles: noop,
    onOpenProjectFile: noop,
    onOpenScreenshotImport: noop,
    onImportScreenshot: noop,
    onOpenTemplates: noop,
    templatesDisabled: false,
    onApplyTemplate: noop,
    onLoadDemo: noop,
    onStartBlank: noop,
    onOpenProject: noop,
    onDropFiles: noopDropFiles,
    onDropCapture: noopDropCapture,
    ...overrides,
  }
}

/** A canvas with no capture, so the device placeholder is what gets rendered. */
const emptyCanvasProps = (overrides: Record<string, unknown> = {}) => {
  const props = makeFlowboardProps()
  const slide = { ...props.slides[0], screenshot: null, screenshotName: null }
  return {
    slides: [slide],
    selectedSlide: slide,
    selectedIndex: 0,
    selectedId: slide.id,
    mode: 'isolated' as const,
    onModeChange: noop,
    onSelect: noop,
    onImport: noop,
    onTransformChange: noop,
    selectedLayerId: 'headline' as const,
    onLayerSelect: noop,
    onLayerTransformChange: noop,
    persistenceStatus: 'saved' as const,
    persistenceDetail: '',
    projectValidationNotice: null,
    exportStatus: 'idle' as const,
    exportDetail: '',
    exportCompleted: 0,
    exportTotal: 1,
    profile: props.profile,
    locale: 'en-US' as const,
    ...overrides,
  }
}

describe('capture drop targets', () => {
  it('makes every contact-sheet card a target and a source', () => {
    const props = makeFlowboardProps()
    const markup = renderToStaticMarkup(createElement(FrameStage, frameProps()))
    const cardCount = props.slides.length

    // One target wrapper per card, and every card holds a capture in the demo
    // deck, so every card is also a drag source.
    expect([...markup.matchAll(/data-capture-drop-target=""/g)]).toHaveLength(cardCount)
    expect([...markup.matchAll(/draggable="true"/g)]).toHaveLength(cardCount)
    // The card is still a real button with its own selection behaviour, and the
    // target wraps it rather than replacing it.
    expect([...markup.matchAll(/class="flowboard-capture-card[ "]/g)]).toHaveLength(cardCount)
    expect(markup).toContain('flowboard-drop-target')
    // The instruction is stated once, in a live region, before anything is
    // dropped.
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('Drop images on a card to replace that capture')
  })

  it('leaves a card with no capture able to receive but not to offer', () => {
    const props = frameProps()
    const empty = { ...props.slides[0], screenshot: null, screenshotName: null }
    const markup = renderToStaticMarkup(createElement(FrameStage, {
      ...props,
      slides: [empty, props.slides[1]],
    }))

    // Both cards accept a drop; only the one with a capture can be dragged from.
    expect([...markup.matchAll(/data-capture-drop-target=""/g)]).toHaveLength(2)
    expect([...markup.matchAll(/draggable="true"/g)]).toHaveLength(1)
    expect(markup).toContain('No capture yet')
  })

  it('makes every Intake deck tile a target and a source', () => {
    const props = makeFlowboardProps()
    const markup = renderToStaticMarkup(createElement(IntakeStage, intakeProps()))

    expect([...markup.matchAll(/data-capture-drop-target=""/g)]).toHaveLength(props.slides.length)
    expect([...markup.matchAll(/draggable="true"/g)]).toHaveLength(props.slides.length)
    expect(markup).toContain('flowboard-mini-strip__item')
    expect(markup).toContain('Drop images straight onto a slide')
    // The big dropzone and the per-slide tiles are both still here, and the
    // dropzone still has its own status line for a deck-wide drop.
    expect(markup).toContain('Drop app captures here')
    expect(markup).toContain('Import a sequence')
    expect(markup).toContain('Replace capture on this slide')
  })

  it('makes the device placeholder a target without losing the import button', () => {
    const markup = renderToStaticMarkup(createElement(SlideCanvas, emptyCanvasProps({
      onDropFilesOnSlide: noop,
      onDropCaptureOnSlide: noopDropCapture,
    })))

    expect(markup).toContain('data-capture-drop-target=""')
    expect(markup).toContain('device-placeholder')
    // The click-to-import path is untouched: it is still a button, still labelled,
    // and still opens the file picker.
    expect(markup).toMatch(/<button class="device-placeholder[^"]*" type="button"[^>]*>/)
    expect(markup).toContain('Add a screenshot to slide 1')
    expect(markup).toContain('Add your screenshot')
    // A placeholder has no capture, so it never offers a drag of its own.
    expect(markup).not.toContain('draggable="true"')
  })

  it('offers no drop target at all in the export stage', () => {
    const props = makeFlowboardProps()
    const markup = renderToStaticMarkup(createElement(ExportSlides, {
      // The same renderer, the same placeholder, and no drop handlers: an
      // exported PNG is the artwork alone.
      entries: [{
        variantId: props.variants[0].id,
        variantName: props.variants[0].name,
        slideNumber: 1,
        slideId: props.slides[0].id,
        slide: { ...props.slides[0], screenshot: null, screenshotName: null },
      }],
      variants: props.variants,
      profile: props.profile,
      locale: 'en-US',
      stageRef: { current: null },
    }))

    expect(markup).toContain('device-placeholder')
    expect(markup).not.toContain('data-capture-drop-target')
    expect(markup).not.toContain('is-drop-active')
  })

  it('declares no target on a canvas that was not given one', () => {
    const markup = renderToStaticMarkup(createElement(SlideCanvas, emptyCanvasProps()))
    expect(markup).toContain('Add your screenshot')
    expect(markup).not.toContain('data-capture-drop-target')
  })
})

describe('the drop target stylesheet', () => {
  it('gives every target one ring, a hint, and a source state', () => {
    const css = readFileSync(new URL('./flowboard/flowboard.css', import.meta.url), 'utf8')
    expect(css).toContain('.flowboard-drop-target {')
    expect(css).toContain('.flowboard-drop-target.is-drop-active {')
    expect(css).toContain('.flowboard-drop-target.is-drag-source {')
    expect(css).toContain('.flowboard-drop-hint {')
    // The hint sits over the thumbnail but never takes the pointer, so a drop is
    // still received by the card underneath it.
    expect(css).toMatch(/\.flowboard-drop-hint \{[\s\S]*?pointer-events: none;/)
    // The ring reuses the focus colour, so a drop target and a keyboard focus
    // read as the same kind of affordance.
    expect(css).toMatch(/\.flowboard-drop-target\.is-drop-active \{[\s\S]*?var\(--flow-focus/)
  })

  it('lights the device placeholder from inside the aperture', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    // An inset ring, because the aperture clips anything drawn past its edge.
    expect(css).toMatch(/\.device-placeholder\.is-drop-active \{[\s\S]*?outline-offset: -8px;/)
    // The button keeps its own rule, so the import path and the export are
    // unchanged when nothing is being dragged over it.
    expect(css).toMatch(/\.device-placeholder \{[\s\S]*?cursor: pointer;/)
  })
})

describe('the Kami drag type', () => {
  it('is a Kami-owned MIME type rather than a file or a link', () => {
    // A single source of truth for the type, so a drag written by one surface is
    // read by every other one.
    expect(KAMI_CAPTURE_DRAG_TYPE).toBe('application/x-kami-capture')
    expect(KAMI_CAPTURE_DRAG_TYPE).not.toContain('text/')
    expect(KAMI_CAPTURE_DRAG_TYPE).not.toBe('Files')
  })
})

describe('the export profile used by the drop tests', () => {
  it('is the one the whole editor shares', () => {
    // Guards the fixture: a drop test that quietly used a different profile
    // would still pass, so the profile is named here.
    expect(exportProfiles[0].width).toBe(1242)
  })
})
