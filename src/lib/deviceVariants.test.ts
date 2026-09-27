import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { createTestSlide, VALID_PNG_DATA_URL, VALID_SVG_DATA_URL } from '../test/projectFixtures'
import {
  AUTHORING_CANVAS_ID,
  DEFAULT_VARIANT_ID,
  createDefaultOutputVariant,
  describeDeviceVariant,
  deviceOverrideCount,
  enabledVariantsForProfile,
  expandVariantRenders,
  findDeviceOverride,
  findIncompleteVariant,
  isProfileReadyForVariants,
  resolveDeviceOverride,
  resolveVariantDeviceFrameId,
  variantsForProfile,
} from './deviceVariants'
import type { ExportProfileId, OutputVariant, Slide } from '../types'

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'variant-a',
  name: 'iPhone',
  canvasId: AUTHORING_CANVAS_ID,
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1', 'slide-2', 'slide-3'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

const deck = (ids: string[] = ['slide-1', 'slide-2', 'slide-3']): Slide[] =>
  ids.map((id, index) => createTestSlide({ id, title: `Slide ${index + 1}` }))

const noCapture = (id: string): Slide => createTestSlide({ id, screenshot: null, screenshotName: null })

describe('resolveDeviceOverride', () => {
  it('returns the slide by identity when the variant overrides nothing for it', () => {
    const slide = deck()[0]
    const result = resolveDeviceOverride(slide, variant())
    expect(result.slide).toBe(slide)
    expect(result.override).toBeNull()
  })

  it('returns the slide by identity when the variant has no overrides at all', () => {
    const slide = deck()[0]
    expect(resolveDeviceOverride(slide, variant({ deviceOverrides: [] })).slide).toBe(slide)
    expect(resolveDeviceOverride(slide, null).slide).toBe(slide)
    expect(resolveDeviceOverride(slide, undefined).slide).toBe(slide)
  })

  it('restates only the fields the override names', () => {
    const [first, second] = deck()
    const before = { ...second }
    const result = resolveDeviceOverride(second, variant({
      deviceOverrides: [{ slideId: 'slide-2', deviceFrameId: 'android-pixel' }],
    }))

    expect(result.slide.deviceFrameId).toBe('android-pixel')
    // Everything the override did not name is inherited untouched.
    expect(result.slide.screenshot).toBe(second.screenshot)
    expect(result.slide.screenshotName).toBe(second.screenshotName)
    expect(result.slide.screenshotFit).toBe(before.screenshotFit)
    expect(result.slide.showDeviceStatusBar).toBe(before.showDeviceStatusBar)
    expect(result.slide.layerTransforms).toBe(second.layerTransforms)
    // And the source slide is not mutated.
    expect(second).toEqual(before)
    expect(first.id).toBe('slide-1')
  })

  it('copies the layer transforms it overrides instead of sharing the deck map', () => {
    const slide = deck()[0]
    const source = slide.layerTransforms.screenshot
    const moved = { ...source, y: 120 }
    const result = resolveDeviceOverride(slide, variant({
      deviceOverrides: [{ slideId: 'slide-1', layerTransforms: { screenshot: moved } }],
    }))

    expect(result.slide.layerTransforms.screenshot).toEqual(moved)
    expect(result.slide.layerTransforms.screenshot).not.toBe(moved)
    expect(result.slide.layerTransforms.headline).toBe(slide.layerTransforms.headline)
    // The deck is untouched, and a later edit to the override cannot reach it.
    expect(slide.layerTransforms.screenshot).toEqual(source)
  })

  it('swaps the capture a device shows without touching the slide capture', () => {
    const slide = deck()[0]
    const result = resolveDeviceOverride(slide, variant({
      deviceOverrides: [{
        slideId: 'slide-1',
        screenshot: { name: 'tablet.png', dataUrl: VALID_SVG_DATA_URL, mimeType: 'image/svg+xml' },
      }],
    }))

    expect(result.slide.screenshot).toBe(VALID_SVG_DATA_URL)
    expect(result.slide.screenshotName).toBe('tablet.png')
    expect(slide.screenshot).toBe(VALID_PNG_DATA_URL)
    expect(slide.screenshotName).toBe('test.png')
  })

  it('normalizes a stale device frame and a bad fit on read', () => {
    const slide = deck()[0]
    const result = resolveDeviceOverride(slide, variant({
      deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'iphone-x' as never, screenshotFit: 'stretch' as never }],
    }))

    expect(result.slide.deviceFrameId).toBe('iphone')
    expect(result.slide.screenshotFit).toBe('contain')
  })

  it('takes the last record when a hand-edited variant lists a slide twice', () => {
    const result = resolveDeviceOverride(deck()[0], variant({
      deviceOverrides: [
        { slideId: 'slide-1', deviceFrameId: 'android' },
        { slideId: 'slide-1', deviceFrameId: 'ipad-mini' },
      ],
    }))

    expect(result.slide.deviceFrameId).toBe('ipad-mini')
    expect(findDeviceOverride(variant({ deviceOverrides: [{ slideId: 'slide-1' }, { slideId: 'slide-1' }] }), 'slide-1')).toEqual({ slideId: 'slide-1' })
  })
})

describe('resolveVariantDeviceFrameId', () => {
  it('prefers the override and falls back to the slide', () => {
    const slide = createTestSlide({ id: 'a', deviceFrameId: 'android' })
    expect(resolveVariantDeviceFrameId(slide, { slideId: 'a', deviceFrameId: 'iphone-island' })).toBe('iphone-island')
    expect(resolveVariantDeviceFrameId(slide, null)).toBe('android')
  })
})

describe('expandVariantRenders', () => {
  it('renders every slide the variant names, in deck order', () => {
    const renders = expandVariantRenders(deck(), variant())
    expect(renders.map((render) => render.slideNumber)).toEqual([1, 2, 3])
    expect(renders.map((render) => render.slide.id)).toEqual(['slide-1', 'slide-2', 'slide-3'])
    expect(renders.every((render) => render.override === null)).toBe(true)
  })

  it('numbers a render by its position in the authoring deck, not in the variant', () => {
    // This is the reason a variant names slides rather than duplicating them: a
    // subset still reports the 1-based deck position the "Open slide" button and
    // preflight slideNumbers use.
    const renders = expandVariantRenders(deck(), variant({ slideIds: ['slide-1', 'slide-3'] }))
    expect(renders.map((render) => render.slideNumber)).toEqual([1, 3])
  })

  it('skips a slide the deck no longer has rather than numbering past the end', () => {
    const renders = expandVariantRenders(deck(), variant({ slideIds: ['slide-2', 'deleted-slide'] }))
    expect(renders).toHaveLength(1)
    expect(renders[0].slideNumber).toBe(2)
  })

  it('flags a render that would show no capture', () => {
    const slides = [deck()[0], noCapture('slide-2'), deck()[2]]
    const renders = expandVariantRenders(slides, variant())
    expect(renders.map((render) => render.missingCapture)).toEqual([false, true, false])
  })

  it('treats an empty variant as no renders rather than every slide', () => {
    expect(expandVariantRenders(deck(), variant({ slideIds: [] }))).toEqual([])
  })
})

describe('profile readiness across variants', () => {
  it('takes only the enabled variants that target the profile', () => {
    const variants = [
      variant({ id: 'a' }),
      variant({ id: 'b', enabled: false }),
      variant({ id: 'c', exportProfileId: 'google-play' }),
    ]
    expect(enabledVariantsForProfile(variants, 'app-store').map((entry) => entry.id)).toEqual(['a'])
    expect(variantsForProfile(variants, 'app-store').map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('is ready when every enabled variant has its captures', () => {
    expect(isProfileReadyForVariants(deck(), [variant()], 'app-store', true)).toBe(true)
  })

  it('is not ready when one enabled variant renders a slide with no capture', () => {
    const slides = [deck()[0], noCapture('slide-2'), deck()[2]]
    expect(isProfileReadyForVariants(slides, [variant()], 'app-store', true)).toBe(false)
  })

  /**
   * The case the old `slides.every(s => s.screenshot)` status could not see: the
   * base slide has no capture, but this variant supplies one, so it is ready
   * while the deck-wide check would still say no.
   */
  it('is ready when a variant supplies the capture the slide itself lacks', () => {
    const slides = [deck()[0], noCapture('slide-2'), deck()[2]]
    const supplied = variant({
      deviceOverrides: [{
        slideId: 'slide-2',
        screenshot: { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' },
      }],
    })
    expect(isProfileReadyForVariants(slides, [supplied], 'app-store', true)).toBe(true)
  })

  it('ignores a disabled variant that is incomplete', () => {
    const slides = [deck()[0], noCapture('slide-2'), deck()[2]]
    const capture = { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' }
    const variants = [
      variant({ id: 'ok', deviceOverrides: [{ slideId: 'slide-2', screenshot: capture }] }),
      variant({ id: 'off', enabled: false }),
    ]
    expect(isProfileReadyForVariants(slides, variants, 'app-store', true)).toBe(true)
  })

  it('is ready for a profile that does not require a capture, even with none', () => {
    const slides = [noCapture('slide-1')]
    expect(isProfileReadyForVariants(slides, [variant()], 'google-play-feature-graphic', false)).toBe(true)
  })

  it('names the first incomplete variant in document order, with deck positions', () => {
    const slides = [deck()[0], noCapture('slide-2'), deck()[2]]
    const capture = { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' }
    const variants = [
      variant({ id: 'ok', deviceOverrides: [{ slideId: 'slide-2', screenshot: capture }] }),
      variant({ id: 'pixel', name: 'Pixel' }),
      variant({ id: 'ipad', name: 'iPad' }),
    ]
    const incomplete = findIncompleteVariant(slides, variants, 'app-store', true)

    expect(incomplete?.variant.id).toBe('pixel')
    expect(incomplete?.slideNumbers).toEqual([2])
  })
})

describe('describeDeviceVariant', () => {
  it('names the frame count, the locale, and the deck device when nothing is customised', () => {
    expect(describeDeviceVariant(variant(), 3)).toBe('3 slides · en-US · deck device')
  })

  it('names the device a variant actually swaps in', () => {
    const customised = variant({ deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'android-pixel' }] })
    expect(describeDeviceVariant(customised, 3)).toBe('3 slides · en-US · Pixel')
  })

  it('says how many slides are customised when the change is not a device', () => {
    const customised = variant({ deviceOverrides: [{ slideId: 'slide-1', screenshotFit: 'cover' }] })
    expect(describeDeviceVariant(customised, 2)).toBe('2 slides · en-US · 1 customised')
  })

  it('counts distinct slides, not records', () => {
    const repeated = variant({
      deviceOverrides: [
        { slideId: 'slide-1', screenshotFit: 'cover' },
        { slideId: 'slide-1', screenshotFit: 'contain' },
        { slideId: 'slide-2', deviceFrameId: 'android' },
      ],
    })
    expect(deviceOverrideCount(repeated)).toBe(2)
  })
})

describe('createDefaultOutputVariant', () => {
  it('is the exact record the serializer wrote before device variants existed', () => {
    const created = createDefaultOutputVariant({
      slideIds: ['a', 'b'],
      locale: 'es-ES',
      themeId: 'coral',
      exportProfileId: exportProfiles[0].id as ExportProfileId,
    })

    expect(created).toEqual({
      id: DEFAULT_VARIANT_ID,
      name: 'English',
      canvasId: AUTHORING_CANVAS_ID,
      locale: 'es-ES',
      themeId: 'coral',
      slideIds: ['a', 'b'],
      enabled: true,
      exportProfileId: 'app-store',
    })
  })

  it('copies the slide ids so the variant cannot alias the deck array', () => {
    const slideIds = ['a']
    const created = createDefaultOutputVariant({
      slideIds,
      locale: 'en-US',
      themeId: 'midnight',
      exportProfileId: 'app-store',
    })
    slideIds.push('b')
    expect(created.slideIds).toEqual(['a'])
  })
})
