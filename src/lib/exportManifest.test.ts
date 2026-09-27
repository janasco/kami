import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { AUTHORING_CANVAS_ID } from './deviceVariants'
import { writeExportArchive } from './exportSlides'
import { exportEntryName, planExportEntries, type ExportEntry, type ExportPlan } from './exportPlan'
import {
  buildExportManifest,
  exportManifestNames,
  reconcileExportManifest,
  type ExportManifest,
} from './exportManifest'
import { createTestSlide } from '../test/projectFixtures'
import type { ExportProfile, ExportProfileId, OutputVariant, Slide } from '../types'

/**
 * The export manifest, and the one property that makes it worth having: it is
 * derived from the plan, so it can be written down **before** anything renders,
 * and it must still name exactly the files the bundle ends up containing.
 *
 * The archive below is built with the real `writeExportArchive` — the real ZIP
 * assembly, the real naming, the real order — with only the PNG rasteriser
 * stubbed, because `html-to-image` needs a DOM. Everything under test is the
 * real code path.
 */

const profileFor = (id: ExportProfileId): ExportProfile =>
  exportProfiles.find((entry) => entry.id === id) ?? exportProfiles[0]

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'variant-iphone',
  name: 'iPhone',
  canvasId: AUTHORING_CANVAS_ID,
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1', 'slide-2', 'slide-3'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

const deck = (count = 3): Slide[] =>
  Array.from({ length: count }, (_, index) => createTestSlide({ id: `slide-${index + 1}` }))

const planFor = (slides: Slide[], variants: OutputVariant[], profileId: ExportProfileId = 'app-store'): ExportPlan =>
  planExportEntries({ slides, variants, profileId, requiresScreenshot: true })

/**
 * Builds the real bundle the export builds. The stub stands in for
 * `toBlob`, and its bytes name the entry they were rendered for, so a misordered
 * or misnamed write shows up in the read-back rather than only in a filename.
 */
const writeRealBundle = async (plan: ExportPlan, profileId: ExportProfileId): Promise<JSZip> => {
  const archive = await writeExportArchive(
    new JSZip(),
    plan.entries,
    profileId,
    async (entry: ExportEntry) => new TextEncoder().encode(`${entry.variantName}|${entry.slideNumber}`),
    () => undefined,
  )
  return JSZip.loadAsync(await archive.arrayBuffer())
}

const writtenNames = (zip: JSZip): string[] =>
  Object.keys(zip.files).filter((name) => !zip.files[name].dir)

const twoVariants = (slides: Slide[]): OutputVariant[] => [
  variant({ slideIds: slides.map((slide) => slide.id) }),
  variant({
    id: 'variant-pixel',
    name: 'Pixel',
    slideIds: slides.map((slide) => slide.id),
    deviceOverrides: [{ slideId: 'slide-2', deviceFrameId: 'android-pixel' }],
  }),
]

describe('buildExportManifest', () => {
  it('derives one row per planned entry, in plan order, with no rendering', () => {
    const slides = deck(3)
    const plan = planFor(slides, twoVariants(slides))
    const manifest = buildExportManifest({
      plan,
      profile: profileFor('app-store'),
      variants: twoVariants(slides),
      locale: 'en-US',
    })

    expect(manifest.entries).toHaveLength(6)
    expect(manifest.entries.map((row) => [row.variantName, row.slideNumber])).toEqual([
      ['iPhone', 1], ['iPhone', 2], ['iPhone', 3],
      ['Pixel', 1], ['Pixel', 2], ['Pixel', 3],
    ])
    expect(manifest.entries.map((row) => row.slideId)).toEqual([
      'slide-1', 'slide-2', 'slide-3',
      'slide-1', 'slide-2', 'slide-3',
    ])
  })

  it('names the profile by its stable id and its display name together', () => {
    const slides = deck(1)
    const profile = profileFor('google-play-tablet-7-landscape')
    const manifest = buildExportManifest({
      plan: planFor(slides, [variant({ exportProfileId: profile.id, slideIds: ['slide-1'] })], profile.id),
      profile,
      variants: [variant({ exportProfileId: profile.id, slideIds: ['slide-1'] })],
      locale: 'en-US',
    })

    // The id goes in the filename so a renamed catalog entry cannot change what
    // a bundle written last month is called; the display name is what a person reads.
    expect(manifest.profileId).toBe('google-play-tablet-7-landscape')
    expect(manifest.profileName).toBe('Google Play tablet 7-inch landscape')
    expect(manifest.entries[0].filename).toBe('google-play-tablet-7-landscape--iphone--slide-01.png')
    expect(manifest.entries[0].filename).toContain(manifest.profileId)
  })

  it('carries the pixel dimensions every row is rendered at', () => {
    const slides = deck(2)
    const profile = profileFor('app-store')
    const manifest = buildExportManifest({
      plan: planFor(slides, [variant({ slideIds: ['slide-1', 'slide-2'] })]),
      profile,
      variants: [variant({ slideIds: ['slide-1', 'slide-2'] })],
      locale: 'en-US',
    })

    for (const row of manifest.entries) {
      expect([row.width, row.height]).toEqual([1242, 2688])
      expect(row.dimensions).toBe('1242 × 2688')
    }
    expect([manifest.width, manifest.height]).toEqual([1242, 2688])
  })

  it('records the locale each file is drawn in, which is the variant locale', () => {
    const slides = deck(1)
    const variants = [
      variant({ slideIds: ['slide-1'], locale: 'en-US' }),
      variant({ id: 'variant-es', name: 'Español', slideIds: ['slide-1'], locale: 'es-ES' }),
      variant({ id: 'variant-ar', name: 'العربية', slideIds: ['slide-1'], locale: 'ar-SA' }),
    ]
    const manifest = buildExportManifest({
      plan: planFor(slides, variants),
      profile: profileFor('app-store'),
      variants,
      // The editor's own locale is the fallback only, so a deck whose variants
      // all name a locale never inherits it.
      locale: 'en-US',
    })

    expect(manifest.entries.map((row) => row.locale)).toEqual(['en-US', 'es-ES', 'ar-SA'])
    // And the editor's active locale is stated once, for the surface showing it.
    expect(manifest.editorLocale).toBe('en-US')
  })

  it('falls back to the editor locale for a variant that names none', () => {
    const slides = deck(1)
    const variants = [{ ...variant({ slideIds: ['slide-1'] }), locale: undefined as never }]
    const manifest = buildExportManifest({
      plan: planFor(slides, variants),
      profile: profileFor('app-store'),
      variants,
      locale: 'ar-SA',
    })

    expect(manifest.entries[0].locale).toBe('ar-SA')
  })

  it('is an empty manifest for an empty plan, rather than a crash', () => {
    const manifest = buildExportManifest({
      plan: { entries: [], blocked: null },
      profile: profileFor('app-store'),
      variants: [],
      locale: 'en-US',
    })

    expect(manifest.entries).toEqual([])
    expect(exportManifestNames(manifest)).toEqual([])
    expect(reconcileExportManifest(manifest, [])).toMatchObject({ ok: true, expected: 0, written: 0 })
  })

  it('carries the blocked variant forward, so the manifest can say what it will not write', () => {
    const slides = [createTestSlide({ id: 'slide-1' }), createTestSlide({ id: 'slide-2', screenshot: null, screenshotName: null })]
    const variants = [
      variant({ slideIds: ['slide-1', 'slide-2'], deviceOverrides: [{ slideId: 'slide-2', screenshot: { name: 'b.png', dataUrl: createTestSlide().screenshot!, mimeType: 'image/png' } }] }),
      variant({ id: 'variant-pixel', name: 'Pixel', slideIds: ['slide-1', 'slide-2'] }),
    ]
    const manifest = buildExportManifest({
      plan: planFor(slides, variants),
      profile: profileFor('app-store'),
      variants,
      locale: 'en-US',
    })

    expect(manifest.blocked).toEqual({ variantId: 'variant-pixel', variantName: 'Pixel', slideNumbers: [2] })
    // The rows are still listed: a blocked plan still says what the author built.
    expect(manifest.entries).toHaveLength(4)
  })

  it('mints exactly the filenames the export plan would mint', () => {
    const slides = deck(3)
    const variants = twoVariants(slides)
    const plan = planFor(slides, variants)
    const manifest = buildExportManifest({ plan, profile: profileFor('app-store'), variants, locale: 'en-US' })

    expect(exportManifestNames(manifest)).toEqual(
      plan.entries.map((entry) => exportEntryName('app-store', entry.variantName, entry.slideNumber)),
    )
    // One name per row, and no two rows collide, which is why the variant is in it.
    expect(new Set(exportManifestNames(manifest)).size).toBe(manifest.entries.length)
  })
})

/**
 * The reconciliation the manifest exists for.
 *
 * The manifest is produced before export from the plan alone. If the bundle that
 * comes back out of the real ZIP writer does not match it exactly — same count,
 * same names, same order — then the thing the author was shown was not the thing
 * that was written.
 */
describe('the manifest reconciles against the real bundle', () => {
  it('matches a two-variant bundle on count, names, and order', async () => {
    const slides = deck(3)
    const variants = twoVariants(slides)
    const plan = planFor(slides, variants)
    const manifest = buildExportManifest({ plan, profile: profileFor('app-store'), variants, locale: 'en-US' })

    const zip = await writeRealBundle(plan, 'app-store')
    const written = writtenNames(zip)
    const reconciliation = reconcileExportManifest(manifest, written)

    expect(written).toHaveLength(manifest.entries.length)
    expect(written).toEqual(exportManifestNames(manifest))
    expect(reconciliation).toEqual({
      ok: true,
      expected: 6,
      written: 6,
      missing: [],
      unexpected: [],
      outOfOrder: [],
    })
  })

  it('reads back the same bytes, in the same order, that the plan asked for', async () => {
    const slides = deck(2)
    const variants = twoVariants(slides)
    const plan = planFor(slides, variants)
    const manifest = buildExportManifest({ plan, profile: profileFor('app-store'), variants, locale: 'en-US' })

    const zip = await writeRealBundle(plan, 'app-store')
    const names = writtenNames(zip)
    const bodies = await Promise.all(names.map((name) => zip.file(name)!.async('string')))

    expect(bodies).toEqual(plan.entries.map((entry) => `${entry.variantName}|${entry.slideNumber}`))
    // The row that owns a name is the row the bytes belong to.
    expect(manifest.entries.map((row) => `${row.variantName}|${row.slideNumber}`)).toEqual(bodies)
  })

  it('matches a landscape profile bundle, where the pixel size differs', async () => {
    const profile = profileFor('google-play-tablet-7-landscape')
    const variants = [variant({ exportProfileId: profile.id, slideIds: ['slide-1', 'slide-2'] })]
    const slides = deck(2)
    const plan = planFor(slides, variants, profile.id)
    const manifest = buildExportManifest({ plan, profile, variants, locale: 'en-US' })

    const zip = await writeRealBundle(plan, profile.id)

    expect(writtenNames(zip)).toEqual(exportManifestNames(manifest))
    expect(manifest.entries[0].dimensions).toBe('1920 × 1200')
    expect(reconcileExportManifest(manifest, writtenNames(zip)).ok).toBe(true)
  })

  it('matches the single default variant, which is what an untouched deck exports', async () => {
    const slides = deck(4)
    const variants = [variant({ id: 'variant-en-us', name: 'English', slideIds: slides.map((slide) => slide.id) })]
    const plan = planFor(slides, variants)
    const manifest = buildExportManifest({ plan, profile: profileFor('app-store'), variants, locale: 'en-US' })

    const zip = await writeRealBundle(plan, 'app-store')

    expect(writtenNames(zip)).toEqual([
      'app-store--english--slide-01.png',
      'app-store--english--slide-02.png',
      'app-store--english--slide-03.png',
      'app-store--english--slide-04.png',
    ])
    expect(reconcileExportManifest(manifest, writtenNames(zip)).ok).toBe(true)
  })
})

describe('reconcileExportManifest', () => {
  const manifestFor = (): ExportManifest => buildExportManifest({
    plan: planFor(deck(2), [variant({ slideIds: ['slide-1', 'slide-2'] })]),
    profile: profileFor('app-store'),
    variants: [variant({ slideIds: ['slide-1', 'slide-2'] })],
    locale: 'en-US',
  })

  it('names a file the bundle is missing', () => {
    const manifest = manifestFor()
    const result = reconcileExportManifest(manifest, ['app-store--iphone--slide-01.png'])

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['app-store--iphone--slide-02.png'])
    expect(result.expected).toBe(2)
    expect(result.written).toBe(1)
  })

  it('names a file the bundle has and the manifest does not', () => {
    const result = reconcileExportManifest(manifestFor(), [
      'app-store--iphone--slide-01.png',
      'app-store--iphone--slide-02.png',
      'app-store--stray--slide-03.png',
    ])

    expect(result.ok).toBe(false)
    expect(result.unexpected).toEqual(['app-store--stray--slide-03.png'])
  })

  it('reports the same names in a different order as out of order, not as missing', () => {
    const result = reconcileExportManifest(manifestFor(), [
      'app-store--iphone--slide-02.png',
      'app-store--iphone--slide-01.png',
    ])

    // Order is part of the contract, and a reordered bundle is still the right
    // files — so it is reported separately from a file that is genuinely absent.
    expect(result.missing).toEqual([])
    expect(result.unexpected).toEqual([])
    expect(result.outOfOrder).toEqual([
      'app-store--iphone--slide-01.png',
      'app-store--iphone--slide-02.png',
    ])
    expect(result.ok).toBe(false)
  })

  it('is a pure comparison that leaves the manifest alone', () => {
    const manifest = manifestFor()
    const before = JSON.stringify(manifest)
    reconcileExportManifest(manifest, [])
    expect(JSON.stringify(manifest)).toBe(before)
  })
})
