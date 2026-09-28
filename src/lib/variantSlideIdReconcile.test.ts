import { describe, expect, it } from 'vitest'
import { reconcileVariantSlideIds } from './deviceVariants'
import { createTestSlide } from '../test/projectFixtures'
import { planExportEntries } from './exportPlan'
import { buildExportManifest } from './exportManifest'
import { exportProfiles } from '../data'
import type { OutputVariant, Slide } from '../types'

/**
 * A variant's `slideIds` has to stay current, or the export silently loses work.
 *
 * The failure was found by measurement, not by reading: a ten-slide deck with
 * three device variants produced three manifest rows instead of thirty, and every
 * variant still summarised itself as "1 slide". `addSlide` changed `slides` and
 * nothing else, so a new slide joined no variant, and `planExportEntries` — which
 * faithfully renders what the variants name — omitted it with no warning and no
 * blocked state.
 *
 * These tests pin the two halves that were broken, and the property that makes the
 * fix safe: a deck nobody edits must not be rewritten.
 */

const deck = (count: number): Slide[] =>
  Array.from({ length: count }, (_, i) => createTestSlide({ id: `slide-${i + 1}`, title: `Slide ${i + 1}` }))

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'v-en',
  name: 'English',
  canvasId: 'main-story',
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

describe('reconciling variant slide ids against the deck', () => {
  it('adds a slide the deck gained but the variant never named', () => {
    const slides = deck(3)
    const next = reconcileVariantSlideIds(slides, [variant()])
    expect(next?.[0].slideIds).toEqual(['slide-1', 'slide-2', 'slide-3'])
  })

  it('covers every variant, not just the first', () => {
    // The bug was per-variant: adding a slide had to touch all of them, and a fix
    // that only reconciled variants[0] would leave the rest quietly short.
    const slides = deck(4)
    const next = reconcileVariantSlideIds(slides, [
      variant({ id: 'v-en', name: 'English' }),
      variant({ id: 'v-ar', name: 'Arabic' }),
      variant({ id: 'v-es', name: 'Spanish' }),
    ])
    expect(next).toHaveLength(3)
    for (const entry of next!) {
      expect(entry.slideIds).toEqual(['slide-1', 'slide-2', 'slide-3', 'slide-4'])
    }
  })

  it('drops an id the deck no longer has', () => {
    // A dangling id is not a subset, it is a reference to something absent, and
    // the document validator rejects it — so a deleted slide would otherwise turn
    // a valid project into an invalid one.
    const slides = deck(2)
    const next = reconcileVariantSlideIds(slides, [variant({ slideIds: ['slide-1', 'slide-9'] })])
    expect(next?.[0].slideIds).toEqual(['slide-1', 'slide-2'])
  })

  it('orders ids by the deck, never by insertion time', () => {
    // Every 1-based number in the product is a deck position, so a variant that
    // had its ids appended must not report them out of order.
    const slides = deck(3)
    const next = reconcileVariantSlideIds(slides, [variant({ slideIds: ['slide-3'] })])
    expect(next?.[0].slideIds).toEqual(['slide-1', 'slide-2', 'slide-3'])
  })

  it('returns the same array when the deck and the variants already agree', () => {
    // The identity is what lets the caller skip a commit. Returning a fresh array
    // here would rewrite every variant on every keystroke in the name field and
    // would make an untouched deck stop serialising byte-identically.
    const slides = deck(2)
    const variants = [variant({ slideIds: ['slide-1', 'slide-2'] })]
    expect(reconcileVariantSlideIds(slides, variants)).toBe(variants)
  })

  it('leaves a deck with no variants alone', () => {
    // Identity, not equality: the caller uses the reference to decide whether to
    // commit, so a fresh empty array would read as a change.
    const none: OutputVariant[] = []
    expect(reconcileVariantSlideIds(deck(2), undefined)).toBeUndefined()
    expect(reconcileVariantSlideIds(deck(2), none)).toBe(none)
  })

  it('leaves an untouched deck byte-identical', () => {
    // The whole document format rests on this: a project that is only opened and
    // saved must produce the same bytes.
    const slides = deck(3)
    const variants = [variant({ slideIds: ['slide-1', 'slide-2', 'slide-3'] })]
    expect(reconcileVariantSlideIds(slides, variants)).toBe(variants)
  })

  it('survives a variant whose slideIds is missing or malformed', () => {
    // A hand-edited document can hold anything. The reconcile must produce a
    // usable variant rather than propagating a broken shape.
    const broken = { ...variant() } as Record<string, unknown>
    delete broken.slideIds
    const next = reconcileVariantSlideIds(deck(2), [broken as unknown as OutputVariant])
    expect(next?.[0].slideIds).toEqual(['slide-1', 'slide-2'])
  })

  it('reorders a variant whose ids are in the wrong order', () => {
    const next = reconcileVariantSlideIds(deck(3), [variant({ slideIds: ['slide-3', 'slide-1'] })])
    expect(next?.[0].slideIds).toEqual(['slide-1', 'slide-2', 'slide-3'])
  })

  it('keeps a variant whose deck has no slides at all, with nothing to name', () => {
    // The empty-deck decision, pinned so it cannot be re-litigated by whoever
    // reads the reconcile next.
    //
    // A deck cannot actually be empty here: `deleteSlide` refuses to remove the
    // last slide, `startBlankSlide` installs one, and the demo, the templates, and
    // a restored project are all dereferenced at index 0 if they had none. So the
    // case is unreachable, and the only thing left to decide is what the rule says
    // if it ever is reached.
    //
    // Empty `slideIds` is right, and clearing the variants would be actively
    // wrong. A variant is a delivery target whose name, locale, theme, enabled
    // flag, and device overrides survive every deck replacement the editor
    // offers — a template, the demo, a blank slide — and `expandVariantRenders` of
    // an empty deck is `[]` whichever way this goes. Deleting the variant would
    // throw away a delivery configuration to express something the deck's own
    // emptiness already says.
    const variants = [variant({ id: 'v-en', name: 'English' }), variant({ id: 'v-ar', name: 'Arabic' })]
    const next = reconcileVariantSlideIds([], variants)!
    expect(next).toHaveLength(2)
    for (const entry of next) {
      expect(entry.slideIds).toEqual([])
      // Everything that is not a slide reference survives.
      expect(entry.name).not.toBe('')
      expect(entry.locale).toBeTruthy()
      expect(entry.exportProfileId).toBeTruthy()
    }
  })

  it('does not give two variants the same slideIds array', () => {
    // One shared array would be a latent corruption: a later in-place edit to one
    // variant's ids would reach silently into the others, and a document that
    // validated would change meaning under the author's feet. `slideIds` is a
    // reference set by design, so the set itself is copied per variant — which is
    // why `createDefaultOutputVariant` copies too.
    const next = reconcileVariantSlideIds(deck(2), [
      variant({ id: 'v-en', name: 'English', slideIds: [] }),
      variant({ id: 'v-ar', name: 'Arabic', slideIds: [] }),
    ])!
    expect(next[0].slideIds).not.toBe(next[1].slideIds)
  })
})

describe('what the reconcile is for: the plan stops losing slides', () => {
  const profile = exportProfiles[0]

  it('turns three variants over three slides into nine manifest rows, not three', () => {
    const slides = deck(3)
    const variants = [
      variant({ id: 'v-en', name: 'English', slideIds: ['slide-1'] }),
      variant({ id: 'v-ar', name: 'Arabic', slideIds: ['slide-1'] }),
      variant({ id: 'v-es', name: 'Spanish', slideIds: ['slide-1'] }),
    ]

    // Before: every variant named only the slide it was created with.
    const before = planExportEntries({ slides, variants, profileId: 'app-store', requiresScreenshot: true })
    expect(before.entries).toHaveLength(3)

    // After a slide was added and the variants re-pointed.
    const reconciled = reconcileVariantSlideIds(slides, variants)!
    const after = planExportEntries({ slides, variants: reconciled, profileId: 'app-store', requiresScreenshot: true })
    expect(after.entries).toHaveLength(9)

    const manifest = buildExportManifest({ plan: after, profile, variants: reconciled, locale: 'en-US' })
    expect(manifest.entries).toHaveLength(9)
    // One file per variant per slide, and no two share a name.
    expect(new Set(manifest.entries.map((row) => row.filename)).size).toBe(9)
  })

  it('scales to the case that was measured: ten slides, three variants', () => {
    const slides = deck(10)
    const variants = [
      variant({ id: 'v-en', name: 'English', slideIds: ['slide-1'] }),
      variant({ id: 'v-ar', name: 'Arabic', slideIds: ['slide-1'] }),
      variant({ id: 'v-es', name: 'Spanish', slideIds: ['slide-1'] }),
    ]
    const reconciled = reconcileVariantSlideIds(slides, variants)!
    const plan = planExportEntries({ slides, variants: reconciled, profileId: 'app-store', requiresScreenshot: true })
    expect(plan.entries).toHaveLength(30)
    expect(plan.blocked).toBeNull()
  })
})
