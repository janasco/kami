// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { stubRect } from '../test/setup'
import { makeFlowboardProps } from '../test/flowboardProps'
import { SlideCanvas, SlideRenderer } from './SlideCanvas'
import type { SlideTransform } from '../types'

/**
 * The first test in this repository that actually operates the editor.
 *
 * Everything before it rendered a component to a string and looked at the
 * markup, or called an exported pure function. Nothing mounted a component,
 * nothing ran an effect, and nothing fired an event, because the suite ran in
 * `environment: 'node'` with no DOM.
 *
 * The consequence was not academic. `App.tsx` (1582 lines) and `SlideCanvas.tsx`
 * (814 lines) are the two files a rewrite is most likely to change, and neither
 * had a single test that could observe them misbehaving. The suite could report
 * 744 green while the editor was broken the moment you touched it.
 *
 * Dragging the composition is the highest-value case available because it is the
 * editor's primary gesture, and because it is a chain of four things that can
 * each break independently: a pointer-down guard, a movement threshold, a
 * measured-box division, and a commit through the change handler.
 */

const CANVAS_WIDTH = 1242
const CANVAS_HEIGHT = 2688

/** The drag is dead until the pointer has moved this far, so a click is not a drag. */
const DRAG_THRESHOLD_PX = 3

/**
 * Unmount every tree, so a component that subscribes in an effect does not stay
 * mounted after its test ends. This is the one DOM-only concern, which is why it
 * lives here and not in the shared setup file.
 */
afterEach(() => {
  cleanup()
})

const noop = () => undefined

const renderCanvas = (overrides: Record<string, unknown> = {}) => {
  const props = makeFlowboardProps()
  const onTransformChange = vi.fn()
  const onLayerTransformChange = vi.fn()
  const view = render(
    <SlideCanvas
      slides={props.slides}
      selectedSlide={props.selectedSlide}
      selectedIndex={0}
      selectedId={props.selectedSlide.id}
      mode="isolated"
      onModeChange={noop}
      onSelect={noop}
      onImport={noop}
      onTransformChange={onTransformChange}
      selectedLayerId="headline"
      onLayerSelect={noop}
      onLayerTransformChange={onLayerTransformChange}
      persistenceStatus="saved"
      persistenceDetail=""
      projectValidationNotice={null}
      exportStatus="idle"
      exportDetail=""
      exportCompleted={0}
      exportTotal={1}
      profile={props.profile}
      locale="en-US"
      {...overrides}
    />,
  )

  const canvas = view.container.querySelector('.slide-canvas')
  if (!canvas) throw new Error('no .slide-canvas rendered')
  stubRect(canvas, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT })

  return { ...view, canvas, onTransformChange, onLayerTransformChange }
}

/** A pointer event carrying the fields the drag handlers actually read. */
const pointer = (type: string, init: { clientX: number; clientY: number; pointerId?: number }) => ({
  pointerId: init.pointerId ?? 1,
  isPrimary: true,
  button: 0,
  buttons: type === 'pointerup' ? 0 : 1,
  clientX: init.clientX,
  clientY: init.clientY,
})

describe('dragging the slide on the canvas', () => {
  it('commits a transform proportional to the drag across the measured canvas', () => {
    const { canvas, onTransformChange } = renderCanvas()

    fireEvent.pointerDown(canvas, pointer('pointerdown', { clientX: 600, clientY: 1200 }))
    // 124.2px across a 1242px canvas is exactly 10% of its width.
    fireEvent.pointerMove(canvas, pointer('pointermove', { clientX: 600 + 124.2, clientY: 1200 }))
    fireEvent.pointerUp(canvas, pointer('pointerup', { clientX: 600 + 124.2, clientY: 1200 }))

    expect(onTransformChange).toHaveBeenCalledTimes(1)
    // The handler is (slideId, position, mergeKey) — the position is the second
    // argument, and the third is the coalescing key that makes one drag one
    // undo step.
    const [slideId, committed, mergeKey] = onTransformChange.mock.calls[0] as [string, SlideTransform, string]
    expect(slideId).toBeTruthy()
    expect(mergeKey).toContain('drag')
    expect(committed.x).toBeCloseTo(10, 5)
    // A horizontal drag must not disturb the vertical position.
    expect(committed.y).toBeCloseTo(0, 5)
  })

  it('treats a press and release without movement as a click, not a drag', () => {
    const { canvas, onTransformChange } = renderCanvas()

    fireEvent.pointerDown(canvas, pointer('pointerdown', { clientX: 600, clientY: 1200 }))
    fireEvent.pointerUp(canvas, pointer('pointerup', { clientX: 600, clientY: 1200 }))

    expect(onTransformChange).not.toHaveBeenCalled()
  })

  it('ignores movement below the drag threshold, so a jittery click cannot nudge a layer', () => {
    const { canvas, onTransformChange } = renderCanvas()

    fireEvent.pointerDown(canvas, pointer('pointerdown', { clientX: 600, clientY: 1200 }))
    fireEvent.pointerMove(canvas, pointer('pointermove', { clientX: 600 + (DRAG_THRESHOLD_PX - 1), clientY: 1200 }))
    fireEvent.pointerUp(canvas, pointer('pointerup', { clientX: 600 + (DRAG_THRESHOLD_PX - 1), clientY: 1200 }))

    expect(onTransformChange).not.toHaveBeenCalled()
  })

  it('does not drag a second pointer, so a pinch cannot overwrite the layer position', () => {
    const { canvas, onTransformChange } = renderCanvas()

    fireEvent.pointerDown(canvas, { ...pointer('pointerdown', { clientX: 600, clientY: 1200 }), isPrimary: false })
    fireEvent.pointerMove(canvas, pointer('pointermove', { clientX: 900, clientY: 1200, pointerId: 2 }))
    fireEvent.pointerUp(canvas, pointer('pointerup', { clientX: 900, clientY: 1200, pointerId: 2 }))

    expect(onTransformChange).not.toHaveBeenCalled()
  })

  it('ignores a non-primary button, so a right-click never moves the artwork', () => {
    const { canvas, onTransformChange } = renderCanvas()

    fireEvent.pointerDown(canvas, { ...pointer('pointerdown', { clientX: 600, clientY: 1200 }), button: 2 })
    fireEvent.pointerMove(canvas, pointer('pointermove', { clientX: 900, clientY: 1200 }))
    fireEvent.pointerUp(canvas, pointer('pointerup', { clientX: 900, clientY: 1200 }))

    expect(onTransformChange).not.toHaveBeenCalled()
  })

  it('does not drag from a control, because a press on a button belongs to the button', () => {
    const { canvas, onTransformChange } = renderCanvas({
      onImport: noop,
      // An empty slide renders the device placeholder, which is a real button.
      selectedSlide: { ...makeFlowboardProps().selectedSlide, screenshot: null, screenshotName: null },
    })
    const placeholder = canvas.querySelector('button')
    if (!placeholder) throw new Error('expected a button inside the canvas to press')

    fireEvent.pointerDown(placeholder, pointer('pointerdown', { clientX: 600, clientY: 1200 }))
    fireEvent.pointerMove(canvas, pointer('pointermove', { clientX: 900, clientY: 1200 }))
    fireEvent.pointerUp(canvas, pointer('pointerup', { clientX: 900, clientY: 1200 }))

    expect(onTransformChange).not.toHaveBeenCalled()
  })

  it('refuses to drag when exportMode is set, even with a write handler present', () => {
    // This is the guarantee the merged variant preview rests on, and the only
    // version of it that is actually worth asserting.
    //
    // An earlier attempt drove this through `ExportSlides` and it passed for the
    // wrong reason: `ExportSlides` passes no `onTransformChange`, so the drag was
    // blocked by the *missing handler*, and the test would have kept passing even
    // if `exportMode` stopped gating anything. So this hands the renderer a real
    // write handler and lets `exportMode` be the only thing standing between a
    // read-only surface and an edit.
    //
    // If this ever fails, a read-only preview has become silently editable: the
    // author drags a layer and the project document changes under a surface that
    // claims to be the export.
    const props = makeFlowboardProps()
    const onTransformChange = vi.fn()
    const onLayerTransformChange = vi.fn()
    const view = render(
      <SlideRenderer
        slide={props.slides[0]}
        slideNumber={1}
        onImport={noop}
        profile={props.profile}
        locale="en-US"
        exportMode
        selectedLayerId="headline"
        onLayerSelect={noop}
        onTransformChange={onTransformChange}
        onLayerTransformChange={onLayerTransformChange}
      />,
    )
    const canvas = view.container.querySelector('.slide-canvas')
    if (!canvas) throw new Error('no .slide-canvas rendered')
    stubRect(canvas, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT })

    fireEvent.pointerDown(canvas, pointer('pointerdown', { clientX: 600, clientY: 1200 }))
    fireEvent.pointerMove(canvas, pointer('pointermove', { clientX: 900, clientY: 1200 }))
    fireEvent.pointerUp(canvas, pointer('pointerup', { clientX: 900, clientY: 1200 }))

    expect(onTransformChange).not.toHaveBeenCalled()
    expect(onLayerTransformChange).not.toHaveBeenCalled()
  })

  it('does not commit when the canvas has no measured size, instead of writing NaN', () => {
    // The guard that made `positionForPointer` return null on a zero box. A
    // canvas that has not been laid out yet is a real state on first paint, and
    // dividing by its width would put NaN into the project document.
    const props = makeFlowboardProps()
    const onTransformChange = vi.fn()
    const view = render(
      <SlideCanvas
        slides={props.slides}
        selectedSlide={props.selectedSlide}
        selectedIndex={0}
        selectedId={props.selectedSlide.id}
        mode="isolated"
        onModeChange={noop}
        onSelect={noop}
        onImport={noop}
        onTransformChange={onTransformChange}
        selectedLayerId="headline"
        onLayerSelect={noop}
        onLayerTransformChange={noop}
        persistenceStatus="saved"
        persistenceDetail=""
        projectValidationNotice={null}
        exportStatus="idle"
        exportDetail=""
        exportCompleted={0}
        exportTotal={1}
        profile={props.profile}
        locale="en-US"
      />,
    )
    const canvas = view.container.querySelector('.slide-canvas')
    if (!canvas) throw new Error('no .slide-canvas rendered')
    stubRect(canvas, { width: 0, height: 0 })

    fireEvent.pointerDown(canvas, pointer('pointerdown', { clientX: 600, clientY: 1200 }))
    fireEvent.pointerMove(canvas, pointer('pointermove', { clientX: 900, clientY: 1200 }))
    fireEvent.pointerUp(canvas, pointer('pointerup', { clientX: 900, clientY: 1200 }))

    expect(onTransformChange).not.toHaveBeenCalled()
  })
})
