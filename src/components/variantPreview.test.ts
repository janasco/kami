import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { parseStylesheet } from '../test/stylesheet'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDefaultOutputVariant } from '../lib/deviceVariants'
import { AUTHORING_CANVAS_ID } from '../lib/deviceVariants'
import { exportProfiles } from '../data'
import { makeFlowboardProps } from '../test/flowboardProps'
import { collectIds } from '../test/flowboardProps'
import { createTestSlide } from '../test/projectFixtures'
import { ExportSlides } from './ExportSlides'
import { RefineVariantPreview } from './RefineVariantPreview'
import { SlideCanvas } from './SlideCanvas'
import type { OutputVariant, Slide } from '../types'

/**
 * Markup tests for the merged per-variant preview.
 *
 * The gap these close: the Refine canvas always drew the base deck, so a variant
 * a second device set a device override for was invisible until export. What
 * matters about the fix is not that the picture appears, it is that the picture
 * is read-only, and read-only is a claim about behaviour. Without a DOM in the
 * test environment it is proved three ways here:
 *
 * 1. **Structural.** The renderer is given `exportRenderProps`, whose object has
 *    no transform, select, nudge, or drop key in it. There is no path from this
 *    surface to the write handlers.
 * 2. **Affordance.** The rendered canvas carries the export marker and none of
 *    the interactive affordances the editable canvas has: no `role="button"`, no
 *    `tabindex`, no `aria-pressed`, no drop target, no guides.
 * 3. **Parity.** The markup of the canvas the preview draws is byte-identical to
 *    the markup the off-screen export stage draws for the same slide. If the
 *    preview were a reimplementation, this would be the assertion that fails.
 */

const noop = () => undefined

const deck = (count = 3): Slide[] =>
  Array.from({ length: count }, (_, index) => createTestSlide({ id: `slide-${index + 1}` }))

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'variant-pixel',
  name: 'Pixel',
  canvasId: AUTHORING_CANVAS_ID,
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1', 'slide-2', 'slide-3'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

const profile = exportProfiles[0]

const previewProps = (overrides: Record<string, unknown> = {}) => {
  const slides = overrides.slides as Slide[] | undefined ?? deck(3)
  const variants = (overrides.variants as OutputVariant[] | undefined) ?? [variant()]
  return {
    slides,
    selectedSlideId: (overrides.selectedSlideId as string | undefined) ?? 'slide-2',
    variants,
    value: (overrides.value as string | undefined) ?? 'variant-pixel',
    previewSlideId: (overrides.previewSlideId as string | undefined) ?? '',
    onPreviewSlideChange: noop,
    onChange: noop,
    profile,
    locale: 'en-US' as const,
    ...overrides,
  }
}

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(RefineVariantPreview, previewProps(props)))

/**
 * The renderer's own subtree, with its wrapper chrome cut off at both ends.
 *
 * A prefix slice would not do: the preview puts a record block after the canvas
 * and the export stage puts a stage wrapper before it, so the comparison walks
 * the `div` nesting instead of guessing where the element ends.
 */
const slideCanvasSubtree = (markup: string): string => {
  const start = markup.indexOf('data-slide-id="')
  if (start < 0) throw new Error('no slide canvas in this markup')
  const open = markup.lastIndexOf('<div', start)
  let depth = 0
  let index = open
  while (index < markup.length) {
    const nextOpen = markup.indexOf('<div', index)
    const nextClose = markup.indexOf('</div>', index)
    if (nextClose < 0) break
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1
      index = nextOpen + 4
      continue
    }
    depth -= 1
    index = nextClose + 6
    if (depth === 0) return markup.slice(open, index)
  }
  throw new Error('unbalanced slide canvas in this markup')
}

/** The editable canvas, for the contrast. */
const editableMarkup = () => {
  const props = makeFlowboardProps()
  return renderToStaticMarkup(createElement(SlideCanvas, {
    slides: props.slides,
    selectedSlide: props.selectedSlide,
    selectedIndex: 0,
    selectedId: props.selectedSlide.id,
    mode: 'isolated',
    onModeChange: noop,
    onSelect: noop,
    onImport: noop,
    onTransformChange: noop,
    selectedLayerId: 'headline',
    onLayerSelect: noop,
    onLayerTransformChange: noop,
    persistenceStatus: 'saved',
    persistenceDetail: '',
    projectValidationNotice: null,
    exportStatus: 'idle',
    exportDetail: '',
    exportCompleted: 0,
    exportTotal: 1,
    profile,
    locale: 'en-US',
  }))
}

describe('the merged per-variant preview', () => {
  it('draws the resolved slide, so the device the variant overrides is the one on screen', () => {
    const markup = render({ variants: [variant({ deviceOverrides: [{ slideId: 'slide-2', deviceFrameId: 'android-pixel' }] })] })

    // The merged slide's device frame is what the canvas element is built from.
    expect(markup).toContain('slide-canvas--device-android-pixel')
    expect(markup).toContain('data-slide-id="slide-2"')
  })

  it('shows the deck device when the variant overrides nothing for that slide', () => {
    const markup = render({ variants: [variant({ deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'android-pixel' }] })] })
    expect(markup).not.toContain('slide-canvas--device-android-pixel')
    expect(markup).toContain('the deck device, unchanged')
  })

  it('states which variant it is showing, in words a screen reader reads', () => {
    const markup = render({})
    expect(markup).toContain('Read-only preview of “Pixel”, slide 2 of 3')
    // Announced as it changes, so switching variants is not a silent swap.
    expect(markup).toContain('aria-live="polite"')
  })

  /**
   * The distinction has to survive a glance, not only a hover. A read-only
   * surface that looks like the editable one is worse than no preview at all:
   * the author drags, nothing moves, and the feature reads as broken.
   */
  it('is visibly and semantically distinct from the editable canvas', () => {
    const markup = render({})
    const editable = editableMarkup()

    expect(markup).toContain('variant-preview')
    expect(markup).toContain('data-variant-preview="read-only"')
    // The editable canvas is the one that offers layers as buttons.
    expect(editable).toContain('role="button"')
    expect(editable).toContain('tabindex="0"')
    expect(editable).toContain('aria-pressed=')
    expect(markup).not.toContain('role="button"')
    expect(markup).not.toContain('tabindex="0"')
    expect(markup).not.toContain('aria-pressed=')
    // And the stylesheet draws a different surface, not just a different label.
    const css = parseStylesheet('src/components/flowboard/flowboard.css')
    expect(css.value('.variant-preview', 'border')).toContain('dashed')
    expect(css.hasRule('.variant-preview[data-variant-preview="read-only"]')).toBe(true)
  })

  it('carries the export marker, which is the flag that disables dragging', () => {
    expect(render({})).toContain('slide-canvas--export')
  })

  it('offers no drop target, so nothing on it accepts a file', () => {
    const slides = [createTestSlide({ id: 'slide-1', screenshot: null, screenshotName: null })]
    const markup = render({
      slides,
      selectedSlideId: 'slide-1',
      variants: [variant({ slideIds: ['slide-1'] })],
    })

    expect(markup).toContain('device-placeholder')
    expect(markup).not.toContain('data-capture-drop-target')
  })

  it('draws no canvas guides, which are an editing aid and never reach an export', () => {
    expect(render({})).not.toContain('canvas-guides')
  })

  /**
   * The parity assertion. The preview must be the export's own render, not a
   * lookalike: the canvas subtree is compared against what the off-screen stage
   * emits for the same entry, character for character.
   */
  it('draws byte-identical markup to the off-screen export stage for the same slide', () => {
    const slides = deck(3)
    const variants = [variant({ deviceOverrides: [{ slideId: 'slide-2', deviceFrameId: 'android-pixel' }] })]
    const entrySlide = { ...slides[1], deviceFrameId: 'android-pixel' as const }

    const preview = render({ slides, variants, selectedSlideId: 'slide-2', value: 'variant-pixel' })
    const stage = renderToStaticMarkup(createElement(ExportSlides, {
      entries: [{
        variantId: 'variant-pixel',
        variantName: 'Pixel',
        slideNumber: 2,
        slideId: 'slide-2',
        slide: entrySlide,
      }],
      variants,
      profile,
      locale: 'en-US',
      stageRef: { current: null },
    }))

    // The renderer's own subtree, with only the surrounding chrome differing.
    expect(slideCanvasSubtree(preview)).toBe(slideCanvasSubtree(stage))
  })

  it('draws in the variant locale, not the editor locale', () => {
    const markup = render({ variants: [variant({ locale: 'ar-SA' })] })
    expect(markup).toContain('dir="rtl"')
  })
})

describe('the variant picker on the Refine canvas', () => {
  it('puts the editable deck first and every variant after it', () => {
    // Rendered on the deck, so no option carries `selected` and the order in the
    // markup is plainly the order in the list.
    const markup = render({
      value: '',
      variants: [
        createDefaultOutputVariant({ slideIds: ['slide-1', 'slide-2', 'slide-3'], locale: 'en-US', themeId: 'midnight', exportProfileId: 'app-store' }),
        variant(),
      ],
    })

    // The deck is value `""` rather than a variant id, and it is the selected
    // option here because this case renders on the deck.
    expect(markup).toMatch(/<option value="" selected="">Deck<\/option>/)
    expect(markup).toMatch(/<option value="variant-en-us">English<\/option>/)
    expect(markup).toMatch(/<option value="variant-pixel">Pixel<\/option>/)
    // In that order, which is what an author reads down the open list.
    const at = ['>Deck<', '>English<', '>Pixel<'].map((needle) => markup.indexOf(needle))
    expect(at).toEqual([...at].sort((a, b) => a - b))
  })

  it('labels the control and marks which option is on screen', () => {
    const markup = render({})
    expect(markup).toMatch(/<label class="field-label" for="refine-variant-preview">Show<\/label>/)
    expect(markup).toMatch(/id="refine-variant-preview"/)
    expect(markup).toMatch(/<option value="variant-pixel" selected="">Pixel<\/option>/)
  })

  it('duplicates no form id', () => {
    const slides = deck(3)
    const markup = render({ slides, variants: [variant(), variant({ id: 'variant-2', name: 'iPad' })] })
    const ids = collectIds(markup)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('offers a slide stepper only when the variant renders more than one slide', () => {
    const one = render({ variants: [variant({ slideIds: ['slide-1'] })], selectedSlideId: 'slide-1' })
    expect(one).not.toMatch(/id="refine-variant-slide"/)

    const many = render({
      variants: [variant({ deviceOverrides: [{ slideId: 'slide-2', deviceFrameId: 'android-pixel' }] })],
    })
    expect(many).toMatch(/id="refine-variant-slide"/)
    // The stepper lists deck positions, in deck order, and only the variant's own,
    // naming for each one whether the variant overrides it.
    expect(many).toMatch(/<option value="slide-1">Slide 1 · deck device<\/option>/)
    expect(many).toMatch(/<option value="slide-2" selected="">Slide 2 · overridden device<\/option>/)
  })

  it('says when the variant does not render the selected slide', () => {
    const markup = render({ variants: [variant({ slideIds: ['slide-2'] })], selectedSlideId: 'slide-1' })
    expect(markup).toContain('does not render the selected slide')
    expect(markup).toContain('data-slide-id="slide-2"')
  })

  it('states the pixel size and the file the preview corresponds to', () => {
    const markup = render({})
    expect(markup).toContain('1242 × 2688')
    expect(markup).toContain('app-store--pixel--slide-02.png')
  })
})

describe('returning to the editable canvas', () => {
  it('draws the deck option, and no canvas at all, when no variant is selected', () => {
    const markup = render({ value: '' })

    expect(markup).toMatch(/<option value="" selected="">Deck<\/option>/)
    // The Refine stage renders its own canvas in this state, so a second one here
    // would be two canvases stacked.
    expect(markup).not.toContain('slide-canvas')
    expect(markup).toContain('The editable canvas is below')
  })

  it('still offers every variant, so switching back and forth is one control', () => {
    const markup = render({ value: '', variants: [variant()] })
    expect(markup).toMatch(/<option value="variant-pixel">Pixel<\/option>/)
  })
})

describe('the merged preview stylesheet', () => {
  const css = parseStylesheet('src/components/flowboard/flowboard.css')

  it('wraps a long label rather than letting it overflow', () => {
    expect(css.value('.variant-preview__bar', 'flex-wrap')).toBe('wrap')
    expect(css.value('.variant-preview__state', 'min-width')).toBe('0px')
  })

  it('scales the exported canvas down with a transform, never a second renderer', () => {
    // A transform keeps the DOM the export would rasterise identical, and it is
    // the one effect html-to-image reproduces reliably.
    expect(css.value('.variant-preview__frame', 'overflow')).toBe('hidden')
    expect(css.value('.variant-preview__canvas', 'transform-origin')).toBe('center')
  })
})
