import { describe, expect, it } from 'vitest'
import { planExportEntries, type ExportEntry } from './exportPlan'
import { createTestSlide } from '../test/projectFixtures'
import type { OutputVariant, Slide } from '../types'

/**
 * The export stage holds every entry only while an export is running.
 *
 * Measured motivation: on a nineteen-slide deck with three variants, 2,736 of the
 * document's 4,249 elements were the off-screen export stage, and ten keystrokes in
 * a variant name field cost 905ms. Hiding that cost introduced a way for the stage
 * to be short when the export read it, and that failure is silent — a ZIP missing
 * two of three languages, reported as a success.
 *
 * These tests pin the two halves of the safety argument. The selection rule is
 * reproduced here as a pure function because the invariant worth protecting is
 * positional: `collectExportPreflightBounds` pairs `slideNodes.slice(0, N)` with
 * `measuredSlideIds` by position, so the first N mounted nodes must be the measured
 * variant's slides.
 */

const deck = (count: number): Slide[] =>
  Array.from({ length: count }, (_, i) => createTestSlide({ id: `slide-${i + 1}` }))

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'v-en',
  name: 'English',
  canvasId: 'main-story',
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: [],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

/** The rule App.tsx uses, restated so it can be tested without a DOM. */
const selectMountedEntries = (
  entries: readonly ExportEntry[],
  measuredVariantId: string | undefined,
  inFlight: boolean,
): ExportEntry[] => {
  if (inFlight || !measuredVariantId) return entries as ExportEntry[]
  return entries.filter((entry) => entry.variantId === measuredVariantId)
}

/** The rule `collectExportPreflightBounds` uses: positional pairing over the first N nodes. */
const firstMeasuredNodes = (mounted: readonly ExportEntry[], count: number) => mounted.slice(0, count)

describe('choosing what the export stage holds', () => {
  const slides = deck(4)
  const variants = [
    variant({ id: 'v-en', name: 'English', locale: 'en-US', slideIds: slides.map((s) => s.id) }),
    variant({ id: 'v-ar', name: 'Arabic', locale: 'ar-SA', slideIds: slides.map((s) => s.id) }),
    variant({ id: 'v-es', name: 'Spanish', locale: 'es-ES', slideIds: slides.map((s) => s.id) }),
  ]
  const plan = planExportEntries({ slides, variants, profileId: 'app-store', requiresScreenshot: true })

  it('plans one entry per slide per variant', () => {
    expect(plan.entries).toHaveLength(12)
  })

  it('mounts every entry while an export is in flight', () => {
    // The rasteriser queries `[data-export-slide]` on the live stage, so a short
    // stage is a short ZIP.
    expect(selectMountedEntries(plan.entries, 'v-en', true)).toHaveLength(12)
  })

  it('mounts one variant while idle, which is all the measurement reads', () => {
    expect(selectMountedEntries(plan.entries, 'v-en', false)).toHaveLength(4)
  })

  it('keeps the measurement positional pairing valid while idle', () => {
    // The invariant. `collectExportPreflightBounds` does
    // `slideNodes.slice(0, slideIds.length)` and pairs by index, so those first N
    // nodes must be the measured variant's slides, in deck order.
    const mounted = selectMountedEntries(plan.entries, 'v-en', false)
    const firstFour = firstMeasuredNodes(mounted, slides.length)
    expect(firstFour).toHaveLength(slides.length)
    expect(firstFour.map((entry) => entry.slideId)).toEqual(['slide-1', 'slide-2', 'slide-3', 'slide-4'])
    expect(firstFour.every((entry) => entry.variantId === 'v-en')).toBe(true)
  })

  it('keeps that same pairing valid while the full stage is mounted', () => {
    const mounted = selectMountedEntries(plan.entries, 'v-en', true)
    const firstFour = firstMeasuredNodes(mounted, slides.length)
    expect(firstFour.map((entry) => entry.slideId)).toEqual(['slide-1', 'slide-2', 'slide-3', 'slide-4'])
    expect(firstFour.every((entry) => entry.variantId === 'v-en')).toBe(true)
  })

  it('changes nothing for a single-variant deck', () => {
    // The common case. One variant means the measured variant is every variant, so
    // the idle stage already held everything the export needed.
    const single = [variant({ slideIds: slides.map((s) => s.id) })]
    const singlePlan = planExportEntries({ slides, variants: single, profileId: 'app-store', requiresScreenshot: true })
    const idle = selectMountedEntries(singlePlan.entries, 'v-en', false)
    const inFlight = selectMountedEntries(singlePlan.entries, 'v-en', true)
    expect(idle).toHaveLength(inFlight.length)
    expect(idle).toHaveLength(4)
  })

  it('mounts everything rather than nothing when no variant is measurable', () => {
    // A deck whose only variant is disabled or on another profile has no measured
    // variant. Holding nothing would silently disable the preflight rather than
    // falling back to a full stage.
    expect(selectMountedEntries(plan.entries, undefined, false)).toHaveLength(12)
  })

  it('never mounts fewer nodes than the measurement pass will read', () => {
    // The guard the export itself relies on: the stage is at least as long as
    // `measuredSlideIds`, so `slice` can never come up short.
    for (const measured of ['v-en', 'v-ar', 'v-es', undefined]) {
      const mounted = selectMountedEntries(plan.entries, measured, false)
      expect(mounted.length).toBeGreaterThanOrEqual(slides.length)
    }
  })
})
