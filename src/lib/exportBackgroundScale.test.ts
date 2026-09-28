// @vitest-environment jsdom
import { createElement, createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { exportProfiles } from '../data'
import { ExportSlides } from '../components/ExportSlides'
import { planExportEntries } from './exportPlan'
import {
  backgroundMeasureTimeoutMessage,
  BACKGROUND_MEASURE_TIMEOUT_MS,
  measureExportBackgroundScales,
} from './exportBackgroundScale'
import { BACKGROUND_SCALE_VARIABLE, PANORAMIC_MAX_BLEED } from './backgroundFill'
import { createTestSlide, VALID_PNG_DATA_URL } from '../test/projectFixtures'
import type { BackgroundFill, OutputVariant, Slide } from '../types'

/**
 * The panoramic overscan, measured at the moment of capture.
 *
 * The failure this pins: `--background-scale` is the only value in the canvas's
 * background-fill block that comes from a *measurement* rather than from the
 * document, and the measurement reaches the stylesheet through React state. A PNG
 * is rasterised at one instant, and `html-to-image` snapshots the node's computed
 * style the moment it is called — so an export that lands before that state
 * commits writes a file with the panoramic bleed silently missing, reports
 * success, and leaves the editor preview showing the overscan the PNG does not
 * have. Correct-looking, wrong content, visible only by diffing a PNG against the
 * preview.
 *
 * jsdom, and what it cannot do
 * ----------------------------
 * jsdom decodes nothing and fires no `load` for a data URL, so the *browser's*
 * decode-to-`naturalWidth` path is not reproducible here and is not claimed to
 * be. What is reproduced is everything the fix actually decides:
 *
 *  - a node whose `--background-scale` was published before the image had a size
 *    (the bug's state), corrected by reading the element at capture time;
 *  - a node that is still loading, waited for and then measured;
 *  - a node that will never load, not waited on;
 *  - a non-panoramic node, not touched and not waited on;
 *  - a commit after the capture-time write, which must not republish the stale
 *    value over it;
 *  - the renderer's `load` handler, which is the other writer to the same value.
 *
 * Two things stay unverified, and neither is reachable from a unit test here:
 * that a real browser decodes a data URL quickly enough for the wait (a browser
 * fact), and that the resulting PNG pixels differ from the unscaled render (that
 * needs a rasteriser). The suite proves the decision and the ordering; it does
 * not prove a pixel.
 *
 * The image is stubbed by shadowing `naturalWidth`/`naturalHeight`/`complete` on
 * the element (or on the prototype, when the state has to exist *before* the
 * component's first commit). That is a faithful stand-in for the only thing the
 * code under test reads, and one test asserts the premise rather than trusting it.
 */

const profile = exportProfiles[0]
const profileAspectRatio = profile.width / profile.height

/**
 * A backdrop whose bleed lands in the *tapering* part of the curve, not the
 * saturated end.
 *
 * On a portrait profile almost any landscape backdrop saturates to the full
 * `1.06`, so every wrong measurement produces the same string and an assertion
 * against it cannot fail. This one does not, which is what gives the two-writer
 * tests their teeth. The guard below fails loudly if a profile change ever
 * pushes it back into saturation rather than letting those tests rot.
 */
const TAPERING_BACKDROP = { width: 1000, height: 1500 }
const TAPERING_ASPECT = TAPERING_BACKDROP.width / TAPERING_BACKDROP.height
const TAPERING_SCALE = '1.0266'

const variant: OutputVariant = {
  id: 'v-en',
  name: 'English',
  canvasId: 'main-story',
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: [],
  enabled: true,
  exportProfileId: profile.id,
}

interface ImageState { width: number; height: number }

/** `null` models an image that has not finished loading. */
const stubImage = (image: HTMLImageElement, state: ImageState | null) => {
  const define = (name: string, value: number | boolean) =>
    Object.defineProperty(image, name, { configurable: true, value })
  define('naturalWidth', state?.width ?? 0)
  define('naturalHeight', state?.height ?? 0)
  define('complete', state !== null)
}

/**
 * Makes a data URL report as already decoded, from before any element exists.
 *
 * This is the state a browser is in when the backdrop is in its memory cache:
 * `complete` is true and `load` has already fired, so no framework handler that
 * attaches afterwards will ever see it. Keyed by `src` so the app icon and the
 * screenshot on the same canvas are unaffected.
 */
const stubDecodedBackdrops = (decoded: Record<string, ImageState>) => {
  const originals = (['naturalWidth', 'naturalHeight', 'complete'] as const)
    .map((name) => [name, Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, name)] as const)
  const stateFor = (image: HTMLImageElement): ImageState | null =>
    decoded[image.getAttribute('src') ?? ''] ?? null
  const install = (name: 'naturalWidth' | 'naturalHeight' | 'complete') =>
    Object.defineProperty(HTMLImageElement.prototype, name, {
      configurable: true,
      get(this: HTMLImageElement) {
        const state = stateFor(this)
        if (name === 'naturalWidth') return state?.width ?? 0
        if (name === 'naturalHeight') return state?.height ?? 0
        return state !== null
      },
    })
  for (const name of ['naturalWidth', 'naturalHeight', 'complete'] as const) install(name)
  return () => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(HTMLImageElement.prototype, name, descriptor)
      else Reflect.deleteProperty(HTMLImageElement.prototype, name)
    }
  }
}

const panoramicSlide = (overrides: Partial<Slide> = {}): Slide => createTestSlide({
  id: 'panoramic-slide',
  backgroundFill: { kind: 'panoramic' } as BackgroundFill,
  // No stored hint. This is the shape the bug needs: with a correct hint in the
  // document the renderer's fallback happens to be right, which is why the
  // missing bleed only ever showed up on a deck that measured nothing at import.
  backgroundImage: { name: 'backdrop.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' },
  ...overrides,
})

/** A real export stage, built through the same plan and the same component. */
const renderStage = (slides: Slide[]) => {
  const deck = { ...variant, slideIds: slides.map((slide) => slide.id) }
  const plan = () => planExportEntries({
    slides,
    variants: [deck],
    profileId: profile.id,
    requiresScreenshot: true,
  })
  if (plan().blocked || plan().unassigned) throw new Error('the fixture deck should be exportable')

  const stageRef = createRef<HTMLDivElement>()
  /*
   * A fresh element every time, with no `key` that would change: the stage
   * re-renders, its `SlideRenderer` children re-render, and React commits them
   * — which is exactly what an export's per-entry progress callback does to this
   * subtree, and what makes a stale published value reachable. A changing key
   * would unmount and remount instead, which re-runs a mount-keyed effect and so
   * would pass against a renderer that never re-measured.
   */
  const element = () => createElement(ExportSlides, {
    entries: plan().entries,
    variants: [deck],
    profile,
    locale: 'en-US' as const,
    stageRef,
  })
  const view = render(element())
  const stage = stageRef.current
  if (!stage) throw new Error('the export stage did not mount')

  const canvases = Array.from(stage.querySelectorAll<HTMLElement>('.slide-canvas'))
  const images = Array.from(stage.querySelectorAll<HTMLImageElement>('[data-layer-id="background-image"] img'))
  if (canvases.length !== slides.length || images.length !== slides.length) {
    throw new Error(`expected ${slides.length} canvas roots and backdrop images, got ${canvases.length}/${images.length}`)
  }

  const scaleOf = (index: number) => canvases[index].style.getPropertyValue(BACKGROUND_SCALE_VARIABLE)
  return {
    ...view,
    stage,
    canvases,
    images,
    scaleOf,
    rerender: () => view.rerender(element()),
  }
}

const measure = (stage: HTMLElement, overrides: Record<string, unknown> = {}) =>
  measureExportBackgroundScales({ stage, profileAspectRatio, ...overrides })

afterEach(() => {
  cleanup()
})

describe('measuring the panoramic overscan at capture time', () => {
  it('corrects a node whose scale was published before the image had a size', async () => {
    /*
     * The bug, reproduced. The stage mounts, the renderer publishes the scale it
     * can compute from the document — and with no stored hint that is `1` — and
     * the image has not decoded, so nothing has published anything else. Reading
     * the element at capture time is the only thing that can recover the bleed.
     */
    const { stage, images, scaleOf } = renderStage([panoramicSlide()])
    expect(scaleOf(0)).toBe('1')

    stubImage(images[0], { width: 2560, height: 1097 })

    await expect(measure(stage)).resolves.toBe(1)
    expect(scaleOf(0)).toBe(String(1 + PANORAMIC_MAX_BLEED))
  })

  it('leaves a node alone when the measurement agrees with what is published', async () => {
    // The common case after the fix: a deck that stored a correct hint, or an
    // image whose measured size happens to be the documented one. Returning zero
    // is what makes "the fix is inert for every deck it does not affect"
    // observable rather than asserted.
    const hinted = panoramicSlide({
      backgroundImage: { name: 'backdrop.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png', width: 2560, height: 1097 },
    })
    const { stage, images, scaleOf } = renderStage([hinted])
    const published = scaleOf(0)
    expect(published).toBe(String(1 + PANORAMIC_MAX_BLEED))

    stubImage(images[0], { width: 2560, height: 1097 })

    await expect(measure(stage)).resolves.toBe(0)
    expect(scaleOf(0)).toBe(published)
  })

  it('waits for a still-loading backdrop, then measures it', async () => {
    // The half of the bug that is pure timing: the node is mounted, the image is
    // on its way, and the export has to notice the difference. Resolving without
    // the wait would publish `1` and produce exactly the file this exists to
    // prevent.
    const { stage, images, scaleOf } = renderStage([panoramicSlide()])
    stubImage(images[0], null)
    window.setTimeout(() => stubImage(images[0], { width: 2560, height: 1097 }), 0)

    await measure(stage)

    expect(scaleOf(0)).toBe(String(1 + PANORAMIC_MAX_BLEED))
  })

  it('does not wait for a backdrop that will never decode', async () => {
    // `complete` is true once a fetch settles *either way*, so a complete image
    // reporting no size is one the browser refused. Waiting for it would hold
    // the export until the timeout on a slide that is already as correct as it
    // can be: a failed backdrop degrades to the theme paint, not to a hole.
    const { stage, images, scaleOf } = renderStage([panoramicSlide()])
    stubImage(images[0], { width: 0, height: 0 })

    // `timeoutMs: 0` is the sharp form of "did not wait": the deadline has
    // already passed before the first check, so anything that waited would throw.
    await expect(measure(stage, { timeoutMs: 0 })).resolves.toBe(0)
    expect(scaleOf(0)).toBe('1')
  })

  it('touches and waits for nothing outside a panoramic fill', async () => {
    // Two nodes, one of each kind, only the panoramic one's image decoded. The
    // second is left still-loading on purpose: if the wait were not scoped to the
    // fill kind that uses the measurement, `timeoutMs: 0` would turn a deck the
    // bug never touched into a failed export.
    const { stage, images, scaleOf } = renderStage([
      panoramicSlide(),
      panoramicSlide({ id: 'image-slide', backgroundFill: { kind: 'image' } as BackgroundFill }),
    ])
    stubImage(images[0], { width: 2560, height: 1097 })
    stubImage(images[1], null)

    await expect(measure(stage, { timeoutMs: 0 })).resolves.toBe(1)
    expect(scaleOf(1)).toBe('1')
  })

  it('survives a commit after the write, which must not republish the stale value', async () => {
    /*
     * The hazard a bare capture-time write would leave open, and the reason the
     * two writers are safe.
     *
     * The export writes the measured value straight onto the node it is about to
     * rasterise, and this node is a React-managed element whose fill block React
     * republishes on every commit. If a commit republishes `--background-scale`
     * as `1` — the renderer's own value here, since the `load` event was never
     * observed and the document stored no hint — the *next* entry's PNG goes out
     * unscaled. Same class of silent wrong output, one entry later.
     *
     * What stops it is that the two values are the same value: React only rewrites
     * the style properties whose values actually changed, and its value is derived
     * from the same `naturalWidth`/`naturalHeight` this function just read. So the
     * commit is a no-op for that property. This test is what holds that down —
     * a renderer that recomputed the scale from something other than the element
     * would change the property here and be caught.
     */
    const { stage, images, scaleOf, rerender } = renderStage([panoramicSlide()])
    expect(scaleOf(0)).toBe('1')
    stubImage(images[0], { width: 2560, height: 1097 })
    await measure(stage)
    expect(scaleOf(0)).toBe(String(1 + PANORAMIC_MAX_BLEED))

    // A fresh element with the same shape still commits the whole subtree, which
    // is what an export's per-entry progress callback does to this stage.
    rerender()

    expect(scaleOf(0)).toBe(String(1 + PANORAMIC_MAX_BLEED))
  })
})

describe('the renderer converges on a backdrop that was already decoded', () => {
  it('publishes the measured scale without ever seeing a load event', () => {
    /*
     * The preview half of the same defect, and it is not timing-dependent at
     * all: a data URL already in the browser's memory cache reports `complete`
     * and fired `load` before the handler was attached, so an event-driven
     * measurement never runs. The renderer has to read the element.
     */
    const restore = stubDecodedBackdrops({ [VALID_PNG_DATA_URL]: { width: 2560, height: 1097 } })
    try {
      const { scaleOf } = renderStage([panoramicSlide()])
      expect(scaleOf(0)).toBe(String(1 + PANORAMIC_MAX_BLEED))
    } finally {
      restore()
    }
  })

  it('keeps the hint when the backdrop is genuinely undecoded', () => {
    // The other half of the contract: not decoded is not a measurement, and a
    // guessed crop is worse than a plain cover.
    const hinted = panoramicSlide({
      backgroundImage: { name: 'backdrop.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png', width: 3000, height: 1000 },
    })
    const { scaleOf } = renderStage([hinted])
    expect(scaleOf(0)).not.toBe('1')
  })
})

describe('a backdrop that never arrives fails loudly', () => {
  it('throws instead of waiting forever, naming the cause and the consequence', async () => {
    const { stage, images, scaleOf } = renderStage([panoramicSlide()])
    stubImage(images[0], null)

    // A clock that jumps past the deadline on the first check, so the assertion is
    // about the deadline being honoured rather than about how long a frame takes.
    let calls = 0
    const wait = measure(stage, { timeoutMs: 10, now: () => (calls++ * 1000) })

    await expect(wait).rejects.toThrow(/panoramic background image did not finish loading within 0 seconds/)
    // Nothing was published on the way out, so a caller that ignores the throw
    // still has the node it started with rather than a half-measured one.
    expect(scaleOf(0)).toBe('1')
  })

  it('says what stopped, what it would have cost, and what to do', () => {
    const message = backgroundMeasureTimeoutMessage(15_000)
    expect(message).toContain('A panoramic background image did not finish loading within 15 seconds')
    expect(message).toContain('drawn without the panoramic bleed')
    expect(message).toContain('Nothing was downloaded')
    expect(message).toMatch(/connection|try again/i)
  })

  it('reports the timeout it actually waited, not a hard-coded number', () => {
    expect(backgroundMeasureTimeoutMessage(2_500)).toContain('within 3 seconds')
  })

  it('gives a real backdrop real headroom rather than a token bound', () => {
    // The number is a judgement, so the judgement is asserted, for the same
    // reason and with the same floor as the font wait beside it.
    expect(BACKGROUND_MEASURE_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000)
  })
})

describe('what this does not cover', () => {
  it('cannot prove a browser decodes a data URL, or that pixels differ', () => {
    /*
     * The gap, stated as an assertion about the environment rather than left in a
     * comment, so it cannot be forgotten if jsdom ever changes underneath it.
     *
     * Two things are outside what any test in this file can reach: that a real
     * browser decodes a data URL quickly enough for the wait, and that the PNG
     * then differs from the unscaled render. The first is a browser fact and the
     * second needs a rasteriser. What these tests prove is the *decision* and the
     * *ordering* — which node is measured, when, and what is written — not a
     * pixel. Anyone reading "corrects a node whose scale was published before the
     * image had a size" as "the PNG is now right" is reading more into it than it
     * says.
     */
    const image = document.createElement('img')
    const loaded = vi.fn()
    image.addEventListener('load', loaded)
    image.src = VALID_PNG_DATA_URL
    document.body.append(image)

    expect(image.complete).toBe(false)
    expect(image.naturalWidth).toBe(0)
    expect(loaded).not.toHaveBeenCalled()
  })
})

describe('the two writers', () => {
  it('keeps the tapering backdrop inside the taper, or the tests below cannot fail', () => {
    expect(TAPERING_ASPECT).toBeGreaterThan(profileAspectRatio)
    expect(TAPERING_ASPECT).toBeLessThan(2 * profileAspectRatio)
  })

  it('is stubbing that supplies the decode, because jsdom does none', async () => {
    /*
     * The measurement is driven by the element and by nothing else.
     *
     * Two measurements of the same node, with the stub changed in between. If the
     * value came from anywhere but the element's own properties — a cached
     * reading, the document's hint, the first render's state — the second number
     * would be the first one.
     */
    const { stage, images, scaleOf } = renderStage([panoramicSlide()])
    expect(scaleOf(0)).toBe('1')

    stubImage(images[0], TAPERING_BACKDROP)
    await measure(stage)
    expect(scaleOf(0)).toBe(TAPERING_SCALE)

    stubImage(images[0], { width: 1000, height: 1000 })
    await measure(stage)
    expect(scaleOf(0)).toBe(String(1 + PANORAMIC_MAX_BLEED))
  })

  it('is not moved by the load event the renderer reads, because both read the element', async () => {
    /*
     * The other writer, exercised through its real path.
     *
     * The renderer's `onLoad` is a second route to the same value, and it is the
     * route a browser actually takes. If it ever published something other than
     * what the element reports, it would overwrite the capture-time write with a
     * different number on the very next commit — and the PNG after the first would
     * disagree with it.
     *
     * Both writers are given the *same* profile, because that is the real
     * arrangement: a disagreement about which profile a canvas is drawn at would
     * be a different bug and would make this one unfalsifiable.
     */
    const { stage, images, scaleOf } = renderStage([panoramicSlide()])
    stubImage(images[0], TAPERING_BACKDROP)
    await measure(stage)
    const measured = scaleOf(0)
    expect(measured).toBe(TAPERING_SCALE)

    fireEvent.load(images[0])

    expect(scaleOf(0)).toBe(measured)
  })
})
