import { describe, expect, it } from 'vitest'
import { AUTHORING_CANVAS_ID, DEFAULT_VARIANT_ID, expandVariantRenders } from './deviceVariants'
import { exportRenderProps, type ExportRenderProps } from './exportRenderProps'
import {
  BASE_PREVIEW_ID,
  describeVariantPreview,
  resolveVariantPreview,
  variantPreviewChoices,
  type VariantPreview,
} from './variantPreview'
import { exportProfiles } from '../data'
import { createTestSlide, VALID_PNG_DATA_URL } from '../test/projectFixtures'
import type { OutputVariant, Slide } from '../types'

/**
 * The merged per-variant preview's decisions, in a module with no React in it.
 *
 * The point of these is that the preview is a *read* of the deck. Every assertion
 * here is about which slide appears, and about the fact that nothing in the
 * result can write: the resolved slide is the export's own merge, and the props
 * the renderer is handed have no write path in them at all.
 */

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

const resolve = (slides: Slide[], v: OutputVariant | null, slideId: string) =>
  resolveVariantPreview({ slides, variant: v, slideId, locale: 'en-US' })

describe('variantPreviewChoices', () => {
  it('puts the editable deck first, so returning to editing is a choice', () => {
    const choices = variantPreviewChoices([variant()])

    expect(choices[0]).toEqual({ id: BASE_PREVIEW_ID, name: 'Deck' })
    expect(choices).toHaveLength(2)
  })

  it('names every variant, in document order', () => {
    const choices = variantPreviewChoices([
      variant({ id: 'a', name: 'English' }),
      variant({ id: 'b', name: 'Pixel' }),
      variant({ id: 'c', name: 'iPad' }),
    ])

    expect(choices.map((choice) => choice.name)).toEqual(['Deck', 'English', 'Pixel', 'iPad'])
  })

  it('keeps the names short, because the facts are stated beside the control', () => {
    const choices = variantPreviewChoices([variant({ deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'android-pixel' }] })])
    // No locale, no device, no render count: a select is read once, and all of
    // that is in the live sentence next to it.
    expect(choices[1].name).toBe('Pixel')
  })

  it('offers only the deck for a deck with no variants', () => {
    expect(variantPreviewChoices([])).toHaveLength(1)
  })
})

describe('resolveVariantPreview', () => {
  it('returns null for the deck, which is the editable canvas rather than a preview', () => {
    expect(resolve(deck(2), null, 'slide-1')).toBeNull()
  })

  it('returns null for a variant that renders nothing, rather than an empty canvas', () => {
    expect(resolve(deck(2), variant({ slideIds: ['slide-9'] }), 'slide-1')).toBeNull()
  })

  it('merges the variant override onto the deck slide, through the export merge', () => {
    const slides = deck(2)
    const preview = resolve(slides, variant({
      deviceOverrides: [{ slideId: 'slide-2', deviceFrameId: 'android-pixel', showDeviceStatusBar: false }],
    }), 'slide-2')!

    expect(preview.slideNumber).toBe(2)
    expect(preview.slide.deviceFrameId).toBe('android-pixel')
    expect(preview.slide.showDeviceStatusBar).toBe(false)
    expect(preview.usesDeckDevice).toBe(false)
    // The deck is untouched: this is a read, not a write.
    expect(slides[1].deviceFrameId).toBe(createTestSlide().deviceFrameId)
    expect(slides[1].showDeviceStatusBar).toBe(createTestSlide().showDeviceStatusBar)
  })

  it('returns the deck slide by identity when the variant overrides nothing for it', () => {
    const slides = deck(2)
    const preview = resolve(slides, variant({ deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'ipad-mini' }] }), 'slide-2')!

    expect(preview.usesDeckDevice).toBe(true)
    expect(preview.slide).toBe(slides[1])
  })

  it('draws in the variant locale, not the editor locale', () => {
    const preview = resolve(deck(2), variant({ locale: 'ar-SA' }), 'slide-1')!
    expect(preview.locale).toBe('ar-SA')
  })

  it('resolves the variant own capture onto the slide it previews', () => {
    const slides = [createTestSlide({ id: 'slide-1' }), createTestSlide({ id: 'slide-2', screenshot: null, screenshotName: null })]
    const preview = resolve(slides, variant({
      deviceOverrides: [{ slideId: 'slide-2', screenshot: { name: 'wide.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' } }],
    }), 'slide-2')!

    expect(preview.slide.screenshot).toBe(VALID_PNG_DATA_URL)
    expect(preview.missingCapture).toBe(false)
  })

  it('reports a render with no capture, which is the case that blocks the export', () => {
    const slides = [createTestSlide({ id: 'slide-1' }), createTestSlide({ id: 'slide-2', screenshot: null, screenshotName: null })]
    const preview = resolve(slides, variant(), 'slide-2')!

    expect(preview.missingCapture).toBe(true)
    expect(preview.usesDeckDevice).toBe(true)
  })

  /**
   * A variant is a subset. Asking it for a slide it does not render must not
   * quietly draw the deck, because the author would then be looking at a device
   * they did not choose and believe the variant had it.
   */
  it('shows the variant first render, and says which slide was asked for', () => {
    const slides = deck(3)
    const preview = resolve(slides, variant({ slideIds: ['slide-2', 'slide-3'] }), 'slide-1')!

    expect(preview.slideNumber).toBe(2)
    expect(preview.slideId).toBe('slide-2')
    expect(preview.requestedSlideId).toBe('slide-1')
  })

  it('leaves requestedSlideId null when the requested slide is the one shown', () => {
    expect(resolve(deck(3), variant(), 'slide-3')!.requestedSlideId).toBeNull()
  })

  it('lists every slide the variant renders, in deck order, for the stepper', () => {
    const preview = resolve(deck(4), variant({
      slideIds: ['slide-1', 'slide-3', 'slide-4'],
      deviceOverrides: [{ slideId: 'slide-3', deviceFrameId: 'ipad-air' }],
    }), 'slide-1')!

    expect(preview.renders).toEqual([
      { slideNumber: 1, slideId: 'slide-1', usesDeckDevice: true, missingCapture: false },
      { slideNumber: 3, slideId: 'slide-3', usesDeckDevice: false, missingCapture: false },
      { slideNumber: 4, slideId: 'slide-4', usesDeckDevice: true, missingCapture: false },
    ])
  })

  it('counts the deck slides the variant overrides', () => {
    const preview = resolve(deck(3), variant({
      deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'ipad-mini' }, { slideId: 'slide-2', screenshotFit: 'cover' }],
    }), 'slide-1')!

    expect(preview.overrideCount).toBe(2)
  })

  it('resolves the deck default variant the serializer writes, unchanged', () => {
    const slides = deck(2)
    const preview = resolveVariantPreview({
      slides,
      variant: { id: DEFAULT_VARIANT_ID, name: 'English', locale: 'en-US', slideIds: ['slide-1', 'slide-2'] },
      slideId: 'slide-2',
      locale: 'en-US',
    }) as VariantPreview

    // A deck with one default variant and no overrides previews as the deck does.
    expect(preview.slide).toBe(slides[1])
    expect(preview.usesDeckDevice).toBe(true)
    expect(preview.overrideCount).toBe(0)
  })
})

/**
 * The read-only proof, in the module that feeds the renderer.
 *
 * `resolveVariantPreview` returns a slide and some facts. It returns no handler,
 * no setter, and nothing that could be spread into a write. The props the
 * renderer is then given come from `exportRenderProps`, whose object has no
 * transform, select, nudge, or drop key — so there is no path from a drag on the
 * preview to the align, distribute, or transform handlers at all.
 */
describe('the merged preview cannot write', () => {
  const previewProps = (preview: VariantPreview) => exportRenderProps({
    slide: preview.slide,
    slideNumber: preview.slideNumber,
    variantId: preview.variantId,
    profile: exportProfiles[0],
    variants: [],
    locale: preview.locale,
    onImport: () => undefined,
  })

  it('hands the renderer a prop object with no write handler in it', () => {
    const slides = deck(2)
    const preview = resolve(slides, variant({ deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'android-pixel' }] }), 'slide-1')!

    const props = previewProps(preview)
    expect(Object.keys(props).some((key) => /transform|select|nudge|drop|change|update/i.test(key))).toBe(false)
    // The declared type admits no such key either, so a caller cannot add one
    // without this file failing to compile.
    const typed: ExportRenderProps = props
    expect(typed.exportMode).toBe(true)
  })

  it('offers nothing on the preview that a caller could spread into a write', () => {
    const slides = deck(1)
    const preview = resolve(slides, variant(), 'slide-1')!

    const callbacks = Object.entries(preview).filter(([, value]) => typeof value === 'function')
    expect(callbacks).toEqual([])
  })

  it('draws the very slide the export would write for the same variant and position', () => {
    const slides = deck(3)
    const v = variant({
      slideIds: ['slide-1', 'slide-2', 'slide-3'],
      deviceOverrides: [{ slideId: 'slide-2', deviceFrameId: 'android-pixel' }],
    })
    const preview = resolve(slides, v, 'slide-2')!

    // The export resolves the same override with the same function, so the two
    // renders cannot show different devices for the same slide.
    const exportRender = expandVariantRenders(slides, v).find((render) => render.slideNumber === 2)!

    expect(preview.slide).toEqual(exportRender.slide)
  })
})

describe('describeVariantPreview', () => {
  const previewFor = (overrides: Partial<OutputVariant> = {}, slideId = 'slide-1') =>
    resolve(deck(3), variant(overrides), slideId)!

  it('names the variant and the deck slide, so the surface is never ambiguous', () => {
    const text = describeVariantPreview(previewFor(), 3)
    expect(text).toContain('“Pixel”')
    expect(text).toContain('slide 1 of 3')
    expect(text.startsWith('Read-only preview')).toBe(true)
  })

  it('says when the device is the deck own', () => {
    expect(describeVariantPreview(previewFor(), 3)).toContain('the deck device, unchanged')
  })

  it('says when the variant overrides the device', () => {
    const text = describeVariantPreview(previewFor({ deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'android-pixel' }] }), 3)
    expect(text).toContain('the device this variant overrides')
  })

  it('says when the variant does not render the selected slide', () => {
    const text = describeVariantPreview(previewFor({ slideIds: ['slide-2'] }, 'slide-1'), 3)
    expect(text).toContain('does not render the selected slide')
  })

  it('says when the render has no capture, because that blocks the export', () => {
    const slides = [createTestSlide({ id: 'slide-1', screenshot: null, screenshotName: null })]
    const preview = resolve(slides, variant({ slideIds: ['slide-1'] }), 'slide-1')!
    expect(describeVariantPreview(preview, 1)).toContain('no capture')
  })
})
