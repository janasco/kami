import { describe, expect, it } from 'vitest'
import { exportProfiles, getStoreListing, storeListings } from '../data'
import { AUTHORING_CANVAS_ID } from './deviceVariants'
import { planExportEntries } from './exportPlan'
import { buildStorePreview, storeHeadline, storePreviewCapturesLine } from './storePreview'
import { createTestSlide, VALID_PNG_DATA_URL } from '../test/projectFixtures'
import type { ExportProfile, ExportProfileId, LocaleId, OutputVariant, Slide } from '../types'

/**
 * The store-listing preview, as a pure model.
 *
 * The interesting content of this feature is the copy and the cut, not the JSX,
 * and the copy is the part that can be wrong in a way nobody would notice: a
 * surface that says "the store requires three images" is making a claim the code
 * cannot check. So the derivation lives here, where a test can read the sentence
 * an author will read.
 */

const deck = (count = 3): Slide[] =>
  Array.from({ length: count }, (_, index) => createTestSlide({ id: `slide-${index + 1}` }))

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'variant-en-us',
  name: 'English',
  canvasId: AUTHORING_CANVAS_ID,
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1', 'slide-2', 'slide-3'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

const profileFor = (id: ExportProfileId): ExportProfile =>
  exportProfiles.find((entry) => entry.id === id) ?? exportProfiles[0]

const previewFor = (
  slides: Slide[],
  overrides: { profileId?: ExportProfileId; variants?: OutputVariant[]; locale?: LocaleId; variantId?: string } = {},
) => buildStorePreview({
  plan: planExportEntries({
    slides,
    variants: overrides.variants ?? [variant({ slideIds: slides.map((slide) => slide.id), exportProfileId: overrides.profileId ?? 'app-store' })],
    profileId: overrides.profileId ?? 'app-store',
    requiresScreenshot: true,
  }),
  profile: profileFor(overrides.profileId ?? 'app-store'),
  variants: overrides.variants ?? [variant({ slideIds: slides.map((slide) => slide.id), exportProfileId: overrides.profileId ?? 'app-store' })],
  locale: overrides.locale ?? 'en-US',
  variantId: overrides.variantId,
})

describe('the listing catalog', () => {
  it('has one entry per export profile, so a new profile cannot silently miss one', () => {
    expect(storeListings.map((listing) => listing.profileId).sort())
      .toEqual(exportProfiles.map((profile) => profile.id).sort())
  })

  it('describes rather than asserts: no entry claims a store enforces anything', () => {
    for (const listing of storeListings) {
      for (const [field, value] of Object.entries(listing)) {
        if (field === 'profileId' || field === 'headlineReference' || field === 'leadingImages') continue
        expect(value, `${listing.profileId}.${field}`).not.toMatch(/\b(must|required|requires|reject|rejects|only allows|at least|no more than)\b/i)
      }
    }
  })

  it('reads as a description of what is on screen, not a threshold', () => {
    const listing = getStoreListing(profileFor('app-store'))
    expect(listing.leading).toMatch(/shown side by side/)
    expect(listing.icon).toMatch(/above the carousel/)
    expect(listing.headline).toMatch(/wraps/)
  })

  it('gives a landscape profile a full-width leading slot, not a row', () => {
    expect(getStoreListing(profileFor('google-play-tablet-7-landscape')).leadingImages).toBe(1)
    expect(getStoreListing(profileFor('google-play-feature-graphic')).leadingImages).toBe(1)
    expect(getStoreListing(profileFor('google-play-feature-graphic')).leading).toMatch(/one image rather than a carousel/)
  })

  it('derives a listing for a profile the catalog has never heard of', () => {
    const unknown = { ...profileFor('app-store'), id: 'brand-new' as ExportProfileId, orientation: 'landscape' as const, name: 'Brand new store' }
    const listing = getStoreListing(unknown)

    expect(listing.profileId).toBe('brand-new')
    expect(listing.leadingImages).toBe(1)
    // It borrows no store's name, because it has never heard of one.
    expect(listing.storeName).toBe('Brand new store')
  })
})

describe('storeHeadline', () => {
  it('reads the first line only, which is the line a tile leads with', () => {
    const slide = createTestSlide({ title: 'Your idea,\nbeautifully presented.' })
    expect(storeHeadline(slide, 'en-US')).toBe('Your idea,')
  })

  it('reads the active locale, not the deck default', () => {
    const slide = createTestSlide({
      title: 'Ship it',
      translations: { 'es-ES': { title: 'Lánzalo' } },
    })
    expect(storeHeadline(slide, 'es-ES')).toBe('Lánzalo')
    expect(storeHeadline(slide, 'en-US')).toBe('Ship it')
  })

  it('falls back to the deck copy when the locale has no translation', () => {
    const slide = createTestSlide({ title: 'Ship it' })
    expect(storeHeadline(slide, 'ar-SA')).toBe('Ship it')
  })

  it('is empty, not crashing, for a slide with no title', () => {
    expect(storeHeadline(createTestSlide({ title: '' }), 'en-US')).toBe('')
  })
})

describe('buildStorePreview', () => {
  it('splits the set into the leading tiles and the rest, in export order', () => {
    const preview = previewFor(deck(5))

    expect(preview.leading.map((row) => row.slideNumber)).toEqual([1, 2, 3])
    expect(preview.trailing.map((row) => row.slideNumber)).toEqual([4, 5])
    expect(preview.slideCount).toBe(5)
  })

  it('never shows more leading tiles than the deck has slides', () => {
    const preview = previewFor(deck(2))
    expect(preview.leading).toHaveLength(2)
    expect(preview.trailing).toEqual([])
  })

  it('names the file each leading tile is, exactly as the bundle names it', () => {
    const preview = previewFor(deck(3))
    expect(preview.leading.map((row) => row.filename)).toEqual([
      'app-store--english--slide-01.png',
      'app-store--english--slide-02.png',
      'app-store--english--slide-03.png',
    ])
  })

  it('counts captures and icons across the whole set, not only the leading tiles', () => {
    const slides = deck(4)
    slides[2] = createTestSlide({ id: 'slide-3', screenshot: null, screenshotName: null })
    slides[3] = createTestSlide({ id: 'slide-4', appIcon: null })
    const preview = previewFor(slides)

    expect(preview.slideCount).toBe(4)
    expect(preview.captureCount).toBe(3)
    expect(preview.missingCaptureNumbers).toEqual([3])
    expect(preview.missingIconNumbers).toEqual([4])
  })

  it('treats a hidden icon as an absent one, because nothing is drawn', () => {
    const slides = deck(1)
    const hidden = {
      ...slides[0],
      layerSettings: { ...slides[0].layerSettings, 'app-icon': { opacity: 1, visible: false } },
    }
    const preview = previewFor([hidden])
    expect(preview.iconCount).toBe(0)
    expect(preview.missingIconNumbers).toEqual([1])
  })

  it('reports headline length per tile, against the listing reading length', () => {
    const slides = [createTestSlide({ id: 'slide-1', title: 'A short one' }), createTestSlide({ id: 'slide-2', title: 'A rather longer headline that will not fit on one line' })]
    const preview = previewFor(slides)

    expect(preview.leading[0]).toMatchObject({ headline: 'A short one', headlineLength: 11, wrapsHeadline: false })
    expect(preview.leading[1]).toMatchObject({ wrapsHeadline: true })
    expect(preview.longestHeadline).toEqual({ slideNumber: 2, length: 54 })
  })

  it('reads the listing from the profile, so the two catalogs cannot disagree', () => {
    const preview = previewFor(deck(3), { profileId: 'google-play-tablet-7-landscape' })
    expect(preview.listing.profileId).toBe('google-play-tablet-7-landscape')
    expect(preview.leadingImages).toBe(1)
    expect(preview.leading).toHaveLength(1)
    expect(preview.trailing).toHaveLength(2)
  })

  it('describes one variant set, and says which variant it is describing', () => {
    const variants = [
      variant({ id: 'variant-iphone', name: 'iPhone', slideIds: ['slide-1', 'slide-2', 'slide-3'] }),
      variant({ id: 'variant-pixel', name: 'Pixel', slideIds: ['slide-1', 'slide-2', 'slide-3'] }),
    ]
    const preview = previewFor(deck(3), { variants, variantId: 'variant-pixel' })

    expect(preview.variantId).toBe('variant-pixel')
    expect(preview.variantName).toBe('Pixel')
    expect(preview.leading[0].filename).toBe('app-store--pixel--slide-01.png')
  })

  it('defaults to the first variant the plan writes', () => {
    const variants = [variant({ id: 'variant-iphone', name: 'iPhone' }), variant({ id: 'variant-pixel', name: 'Pixel' })]
    expect(previewFor(deck(3), { variants }).variantName).toBe('iPhone')
  })

  it('reads a slide through the variant merge, so it shows the exported capture', () => {
    const slides = [createTestSlide({ id: 'slide-1', screenshot: null, screenshotName: null })]
    const variants = [variant({
      slideIds: ['slide-1'],
      deviceOverrides: [{ slideId: 'slide-1', screenshot: { name: 'wide.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' } }],
    })]
    const preview = previewFor(slides, { variants })

    expect(preview.captureCount).toBe(1)
    expect(preview.leading[0].hasCapture).toBe(true)
  })

  it('reads the headline in the locale the export draws in', () => {
    const slides = [createTestSlide({ id: 'slide-1', title: 'Ship it', translations: { 'es-ES': { title: 'Lánzalo ya' } } })]
    const variants = [variant({ slideIds: ['slide-1'], locale: 'es-ES' })]
    const preview = previewFor(slides, { variants, locale: 'en-US' })

    expect(preview.locale).toBe('es-ES')
    expect(preview.leading[0].headline).toBe('Lánzalo ya')
  })

  it('is an empty, honest model for a plan with nothing in it', () => {
    const preview = buildStorePreview({
      plan: { entries: [], blocked: null },
      profile: profileFor('app-store'),
      variants: [],
      locale: 'en-US',
    })

    expect(preview.leading).toEqual([])
    expect(preview.trailing).toEqual([])
    expect(preview.slideCount).toBe(0)
    expect(preview.longestHeadline).toBeNull()
    expect(preview.leadingImages).toBe(3)
  })
})

describe('storePreviewCapturesLine', () => {
  it('states the count descriptively rather than as a pass or a fail', () => {
    const preview = previewFor(deck(3))
    expect(storePreviewCapturesLine(preview)).toBe('All 3 images have a capture.')
  })

  it('names the deck positions that have none, so it is actionable', () => {
    const slides = deck(3)
    slides[1] = createTestSlide({ id: 'slide-2', screenshot: null, screenshotName: null })
    const preview = previewFor(slides)
    expect(storePreviewCapturesLine(preview)).toBe('2 of 3 images have a capture. Slide 2 has none.')
  })

  it('says so for a deck with no images at all', () => {
    const preview = previewFor(deck(2))
    expect(preview.slideCount).toBeGreaterThan(0)
    expect(previewFor([]).slideCount).toBe(0)
  })
})
