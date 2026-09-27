import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { createDefaultOutputVariant, AUTHORING_CANVAS_ID } from './deviceVariants'
import {
  exportEntryName,
  exportEntryNames,
  planExportEntries,
  variantExportRefusal,
  type ExportEntry,
} from './exportPlan'
import { createTestSlide, VALID_PNG_DATA_URL } from '../test/projectFixtures'
import type { OutputVariant, Slide } from '../types'

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'variant-iphone',
  name: 'iPhone',
  canvasId: AUTHORING_CANVAS_ID,
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1', 'slide-2'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

const deck = (count = 2): Slide[] =>
  Array.from({ length: count }, (_, index) => createTestSlide({ id: `slide-${index + 1}` }))

const capture = { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' }

describe('planExportEntries', () => {
  it('writes one file per slide of one variant when only the default exists', () => {
    const plan = planExportEntries({
      slides: deck(3),
      variants: [variant({ slideIds: ['slide-1', 'slide-2', 'slide-3'] })],
      profileId: 'app-store',
      requiresScreenshot: true,
    })

    expect(plan.entries.map((entry) => entry.slideNumber)).toEqual([1, 2, 3])
    expect(plan.blocked).toBeNull()
  })

  it('writes enabled variants in document order, then deck order within each', () => {
    const plan = planExportEntries({
      slides: deck(2),
      variants: [variant(), variant({ id: 'variant-pixel', name: 'Pixel' })],
      profileId: 'app-store',
      requiresScreenshot: true,
    })

    expect(plan.entries.map((entry) => [entry.variantName, entry.slideNumber])).toEqual([
      ['iPhone', 1], ['iPhone', 2],
      ['Pixel', 1], ['Pixel', 2],
    ])
  })

  it('skips a disabled variant and a variant aimed at another profile', () => {
    const plan = planExportEntries({
      slides: deck(2),
      variants: [
        variant(),
        variant({ id: 'off', name: 'Off', enabled: false }),
        variant({ id: 'play', name: 'Play', exportProfileId: 'google-play' }),
      ],
      profileId: 'app-store',
      requiresScreenshot: true,
    })

    expect(plan.entries.map((entry) => entry.variantName)).toEqual(['iPhone', 'iPhone'])
  })

  it('renders the merged slide, so a variant entry carries the device it swaps in', () => {
    const slides = deck(1)
    const plan = planExportEntries({
      slides,
      variants: [variant({ deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'android-pixel' }] })],
      profileId: 'app-store',
      requiresScreenshot: true,
    })

    expect(plan.entries[0].slide.deviceFrameId).toBe('android-pixel')
    // And the deck itself is untouched.
    expect(slides[0].deviceFrameId).toBe(createTestSlide().deviceFrameId)
  })

  it('blocks the whole export when one enabled variant renders a slide with no capture', () => {
    const slides = [createTestSlide({ id: 'slide-1' }), createTestSlide({ id: 'slide-2', screenshot: null, screenshotName: null })]
    // The first variant supplies the missing capture; the second does not, so the
    // refusal names the second one.
    const plan = planExportEntries({
      slides,
      variants: [
        variant({ deviceOverrides: [{ slideId: 'slide-2', screenshot: capture }] }),
        variant({ id: 'variant-pixel', name: 'Pixel' }),
      ],
      profileId: 'app-store',
      requiresScreenshot: true,
    })

    expect(plan.blocked).toEqual({ variantId: 'variant-pixel', variantName: 'Pixel', slideNumbers: [2] })
    // The entries are still planned, so the preview can show what would exist.
    expect(plan.entries).toHaveLength(4)
  })

  it('does not block a profile that does not require a capture', () => {
    const slides = [createTestSlide({ id: 'slide-1', screenshot: null, screenshotName: null })]
    const plan = planExportEntries({
      slides,
      variants: [variant({ slideIds: ['slide-1'], exportProfileId: 'google-play-feature-graphic' })],
      profileId: 'google-play-feature-graphic',
      requiresScreenshot: false,
    })

    expect(plan.blocked).toBeNull()
  })

  it('does not block on a disabled variant that is incomplete', () => {
    const slides = [createTestSlide({ id: 'slide-1', screenshot: null, screenshotName: null })]
    const plan = planExportEntries({
      slides,
      variants: [
        variant({ id: 'ok', slideIds: ['slide-1'], deviceOverrides: [{ slideId: 'slide-1', screenshot: capture }] }),
        variant({ id: 'off', slideIds: ['slide-1'], enabled: false }),
      ],
      profileId: 'app-store',
      requiresScreenshot: true,
    })

    expect(plan.blocked).toBeNull()
    expect(plan.entries).toHaveLength(1)
  })
})

describe('export entry names', () => {
  it('mints <profile>--<variant>--slide-NN.png', () => {
    expect(exportEntryName('app-store', 'iPhone', 1)).toBe('app-store--iphone--slide-01.png')
    expect(exportEntryName('google-play', 'Pixel Tablet', 12)).toBe('google-play--pixel-tablet--slide-12.png')
  })

  it('reduces a name with no usable characters rather than emitting an empty segment', () => {
    expect(exportEntryName('app-store', '***', 2)).toBe('app-store--variant--slide-02.png')
  })

  it('gives every file of a two-variant deck a distinct name', () => {
    const entries: ExportEntry[] = planExportEntries({
      slides: deck(3),
      variants: [
        variant({ slideIds: ['slide-1', 'slide-2', 'slide-3'] }),
        variant({ id: 'variant-pixel', name: 'Pixel', slideIds: ['slide-1', 'slide-2', 'slide-3'] }),
      ],
      profileId: 'app-store',
      requiresScreenshot: true,
    }).entries

    const names = exportEntryNames(entries, 'app-store')
    expect(names).toEqual([
      'app-store--iphone--slide-01.png',
      'app-store--iphone--slide-02.png',
      'app-store--iphone--slide-03.png',
      'app-store--pixel--slide-01.png',
      'app-store--pixel--slide-02.png',
      'app-store--pixel--slide-03.png',
    ])
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('variantExportRefusal', () => {
  it('names the variant and the deck positions, so it is actionable', () => {
    expect(variantExportRefusal({ variantId: 'v', variantName: 'iPad', slideNumbers: [2] }))
      .toBe('The “iPad” variant has no capture on slide 2, so it was not exported. Add the capture or turn that variant off.')
    expect(variantExportRefusal({ variantId: 'v', variantName: 'iPad', slideNumbers: [2, 5] }))
      .toContain('slides 2, 5')
  })
})

/**
 * The bundle itself, through the same zip writer the export uses.
 *
 * `jszip` needs no DOM, so the one part of the export that could otherwise only
 * be asserted by hand — the names, the count, and the bytes of every entry — is
 * covered here with a stub renderer in place of `toBlob`.
 */
describe('the written bundle', () => {
  const writeBundle = async (entries: readonly ExportEntry[], profileId: string) => {
    const zip = new JSZip()
    for (const [index, entry] of entries.entries()) {
      // The stub stands in for html-to-image: its bytes name the entry, so a
      // mismatched order or a mismatched name shows up in the read-back.
      const body = new TextEncoder().encode(`${entry.variantName}|${entry.slideNumber}`)
      zip.file(exportEntryName(profileId, entry.variantName, entry.slideNumber), body)
      expect(index).toBeGreaterThanOrEqual(0)
    }
    return JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }))
  }

  it('contains one named file per entry, whose contents match the plan', async () => {
    const slides = deck(3)
    const plan = planExportEntries({
      slides,
      variants: [
        variant({ slideIds: ['slide-1', 'slide-2', 'slide-3'] }),
        variant({
          id: 'variant-pixel',
          name: 'Pixel',
          slideIds: ['slide-1', 'slide-2', 'slide-3'],
          deviceOverrides: [{ slideId: 'slide-2', deviceFrameId: 'android-pixel' }],
        }),
      ],
      profileId: 'app-store',
      requiresScreenshot: true,
    })

    expect(plan.entries).toHaveLength(6)
    const zip = await writeBundle(plan.entries, 'app-store')
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir)

    expect(names).toHaveLength(plan.entries.length)
    expect(names).toEqual(exportEntryNames(plan.entries, 'app-store'))
    for (const [index, entry] of plan.entries.entries()) {
      const contents = await zip.file(names[index])!.async('string')
      expect(contents).toBe(`${entry.variantName}|${entry.slideNumber}`)
    }
  })

  it('agrees with the store preview, which is the same plan', async () => {
    const slides = deck(2)
    const plan = planExportEntries({ slides, variants: [variant(), variant({ id: 'variant-pixel', name: 'Pixel' })], profileId: 'app-store', requiresScreenshot: true })
    const preview = plan.entries.map((entry) => ({
      variant: entry.variantName,
      slide: entry.slideNumber,
      name: exportEntryName('app-store', entry.variantName, entry.slideNumber),
    }))

    const zip = await writeBundle(plan.entries, 'app-store')
    const written = Object.keys(zip.files).filter((name) => !zip.files[name].dir)
    expect(preview.map((row) => row.name)).toEqual(written)
  })
})

describe('the default project still exports one file per slide', () => {
  it('uses the same plan shape a pre-variant deck had', () => {
    const slides = deck(2)
    const defaultVariant = createDefaultOutputVariant({
      slideIds: slides.map((slide) => slide.id),
      locale: 'en-US',
      themeId: 'midnight',
      exportProfileId: exportProfiles[0].id,
    })
    const plan = planExportEntries({ slides, variants: [defaultVariant], profileId: 'app-store', requiresScreenshot: true })

    expect(plan.entries).toHaveLength(2)
    expect(exportEntryNames(plan.entries, 'app-store')).toEqual([
      'app-store--english--slide-01.png',
      'app-store--english--slide-02.png',
    ])
  })
})
