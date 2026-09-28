// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import App from './App'
import { serializeProject } from './lib/project'
import { createTestSlide } from './test/projectFixtures'
import type { OutputVariant, Slide } from './types'

/**
 * A variant's `slideIds` has to be brought back in step with the deck on the way
 * *in*, not only on the way out.
 *
 * The failure, measured
 * --------------------
 * `commitEditorUpdate` reconciles every variant whenever the deck's shape
 * changes, and that does cover every deck edit — including the three that throw
 * the whole deck away (`startBlankSlide`, `loadDemoProject`,
 * `applyProjectTemplate`). What it does not cover is the draft load, because
 * `replaceEditor` installs the restored state directly rather than through it.
 *
 * That is the one ingress where a stale reference actually arrives. A document
 * written before variants covered the whole deck restores with each variant
 * naming only the slides it was created with, `restoreOutputVariants` filters to
 * slides that exist rather than adding the ones that are missing, and so nothing
 * downstream repairs it. Three slides, two variants naming one slide each:
 *
 *     "3 of 3 slides have a capture"     — the deck is complete
 *     "1 slide · en-US · deck device"     — each variant, twice
 *     "2 PNGs planned"                    — instead of 6
 *     "Nothing blocks the export"         — beside all of it
 *
 * Two thirds of the deck, exported away, reported as success. The plan was
 * faithful to the variants; the variants were wrong, and silently so.
 *
 * The tell was an inconsistency rather than a symptom: opening the *same*
 * document from a file already reconciled, because `openProjectFile` goes through
 * `commitEditorUpdate`. One document, two behaviours, decided by which door it
 * came in.
 *
 * The zero-slide case, argued rather than guessed
 * ----------------------------------------------
 * A deck can never be empty here: `deleteSlide` refuses to remove the last
 * slide, `startBlankSlide` installs one, and the demo, the templates, and a
 * restored project are all rejected or dereferenced at index 0 if they had none.
 * So the case is unreachable and the only thing to settle is what the rule should
 * say if it ever were reached. Emptied `slideIds` is right, and clearing the
 * variants would be actively wrong: a variant is a delivery target whose locale,
 * theme, name, and enabled flag survive every deck replacement the editor offers,
 * and `expandVariantRenders` of an empty deck is `[]` either way. Deleting the
 * variant would destroy a configuration to express something the deck's emptiness
 * already says.
 */

const AUTOSAVE_KEY = 'kami.screenshot-studio.autosave.v1'

/**
 * The serialized document, verbatim.
 *
 * This used to delete the `revision` block first, because the serializer stamped
 * `revision.createdAt` with `now` and the comparison had to carve it out. That
 * field no longer exists, so a byte comparison here is now the whole document
 * with no exclusion — which is the point of removing it.
 */
const documentBytes = (value: unknown): string => JSON.stringify(structuredClone(value))

const deck = (count: number, prefix = 'slide'): Slide[] =>
  Array.from({ length: count }, (_, i) => createTestSlide({ id: `${prefix}-${i + 1}`, title: `S${i + 1}` }))

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'v-en',
  name: 'English',
  canvasId: 'main-story',
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1', 'slide-2', 'slide-3'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

/**
 * Two variants, both naming only slide 1 of a three-slide deck: the state a
 * draft written before variants covered the deck is in. Two rather than one
 * because the loss is per-variant, and a fix that reconciled the first would
 * leave the second quietly short.
 */
const staleSubset = () => [
  variant({ id: 'v-en', name: 'English', slideIds: ['slide-1'] }),
  variant({ id: 'v-ar', name: 'Arabic', locale: 'ar-SA', slideIds: ['slide-1'] }),
]

/** A document exactly as the app would have written it. */
const draftFor = (outputVariants?: OutputVariant[]): string => {
  const project = {
    name: 'Probe deck',
    slides: deck(3),
    activeLocale: 'en-US' as const,
    canvasMode: 'isolated' as const,
    selectedExportProfileId: 'app-store' as const,
    ...(outputVariants ? { outputVariants } : {}),
  }
  return JSON.stringify(serializeProject(project))
}

const seedDraft = (outputVariants?: OutputVariant[]) => {
  window.localStorage.setItem(AUTOSAVE_KEY, draftFor(outputVariants))
  window.localStorage.setItem('kami.editor.onboarding.completed', 'true')
}

const buttons = () => [...document.querySelectorAll('button')] as HTMLButtonElement[]

/** Click what an author clicks, by the label they read. */
const click = (label: RegExp) => {
  const found = buttons().find((button) => label.test(button.textContent ?? ''))
  if (!found) {
    throw new Error(`no control labelled ${label}. on screen: ${buttons().map((b) => b.textContent?.trim()).join(' | ')}`)
  }
  fireEvent.click(found)
  return found
}

const reviewText = () => document.body.textContent ?? ''
const storeFilenames = () =>
  [...document.querySelectorAll('.store-preview__file')].map((node) => node.textContent ?? '')

/** The "N PNGs planned" line the Ship review shows the author. */
const plannedPngs = () => {
  const match = reviewText().match(/(\d+) PNGs? planned/)
  return match ? Number(match[1]) : null
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

/**
 * Every document the app autosaves, oldest first.
 *
 * The draft is the observable end of the whole chain — reconcile, plan, export,
 * persist — so a test that reads it is asserting on what the author would lose,
 * not on an intermediate value. `setItem` is spied rather than polled because the
 * write is behind a 600 ms debounce and reading the key directly cannot tell
 * "not written yet" from "wrote nothing".
 */
const draftWrites = () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem')
  const read = () => spy.mock.calls
    .filter(([key]) => key === AUTOSAVE_KEY)
    .map(([, value]) => JSON.parse(String(value)) as Record<string, unknown>)
  return { read, written: () => read().length }
}

const lastDraft = (drafts: Record<string, unknown>[]) => drafts.at(-1)!
const draftVariants = (document: Record<string, unknown>) => (document.outputVariants ?? []) as OutputVariant[]
const draftSlideIds = (document: Record<string, unknown>) => (document.slides as Slide[]).map((slide) => slide.id)

/** Mount the editor on a seeded draft and wait for the restore to land. */
const mountOnDraft = async () => {
  const spy = draftWrites()
  render(<App />)
  await waitFor(() => expect(buttons().some((b) => /Start from one blank slide/.test(b.textContent ?? ''))).toBe(true))
  return spy
}

describe('reopening a draft must not export a subset of the deck', () => {
  it('plans every slide of a draft whose variants name only some of them', async () => {
    // The failure this pins: the deck is three complete slides and the plan is two
    // files, with the review reporting that nothing blocks the export.
    seedDraft(staleSubset())
    const writes = await mountOnDraft()
    click(/5Ship/)

    await waitFor(() => expect(plannedPngs()).not.toBeNull())
    expect(plannedPngs()).toBe(6)

    // The store listing is the author's other view of the same plan, and it shows
    // the filenames, so it is asserted by name rather than by a count: a bundle
    // with two device variants cannot carry two files both called `slide-01.png`.
    // Checked on both variants, because the loss was per-variant and a fix that
    // reconciled the first would leave the second quietly short.
    for (const variantName of ['English', 'Arabic']) {
      const slug = variantName.toLowerCase()
      // The name is an input's value, not text, so the row is found by what the
      // author typed into it.
      const row = [...document.querySelectorAll('.ship-variant')].find(
        (node) => (node.querySelector('.ship-variant__input') as HTMLInputElement | null)?.value === variantName)
      if (!row) throw new Error(`no variant row for ${variantName}`)
      fireEvent.click([...row.querySelectorAll('button')].find((b) => /Preview/.test(b.textContent ?? ''))!)

      await waitFor(() => expect(storeFilenames()).toHaveLength(3))
      expect(storeFilenames()).toEqual([
        `app-store--${slug}--slide-01.png`,
        `app-store--${slug}--slide-02.png`,
        `app-store--${slug}--slide-03.png`,
      ])
    }

    // Each variant now describes itself as the whole deck rather than as one
    // slide, which is the sentence the Ship stage prints per row.
    const summaries = [...document.querySelectorAll('.ship-variant__summary')].map((node) => node.textContent)
    expect(summaries).toHaveLength(2)
    for (const summary of summaries) expect(summary).toMatch(/^3 slides · /)

    // And the healed state is what gets persisted, so the loss cannot come back on
    // the next reopen.
    await waitFor(() => expect(writes.written()).toBeGreaterThan(0))
    const healed = lastDraft(writes.read())
    for (const entry of draftVariants(healed)) expect(entry.slideIds).toEqual(draftSlideIds(healed))
  })

  it('leaves an untouched draft byte-identical on the way back in', async () => {
    // The constraint the whole document format rests on, asserted at the seam this
    // fix touches. A draft that is already in step must come back out the way it
    // went in, so the reconcile is pinned to re-pointing stale references and
    // nothing else: a fix that rebuilt each variant, reordered its ids, or
    // normalised its overrides would pass every other test here and still churn
    // the author's Git history on every open.
    const moved = { headline: { x: 24, y: 96, scale: 1, rotation: 0, widthScale: 1, heightScale: 1, flipX: false, flipY: false } }
    const stored = draftFor([
      variant({
        id: 'v-en',
        name: 'English',
        deviceOverrides: [{ slideId: 'slide-2', deviceFrameId: 'android-galaxy' }, { slideId: 'slide-1', layerTransforms: moved }],
      }),
      variant({ id: 'v-ar', name: 'Arabic', locale: 'ar-SA' }),
    ])
    window.localStorage.setItem(AUTOSAVE_KEY, stored)
    window.localStorage.setItem('kami.editor.onboarding.completed', 'true')

    const writes = await mountOnDraft()
    await waitFor(() => expect(writes.written()).toBeGreaterThan(0))
    expect(documentBytes(lastDraft(writes.read()))).toBe(documentBytes(JSON.parse(stored)))
  })

  it('keeps a draft that never used a variant as the single default record', async () => {
    // The shape every project authored before device variants has. The serializer
    // always writes one `outputVariants` record, substituting the default, so the
    // property to pin is that the reconcile invents nothing and re-derives
    // nothing: still the one legacy record, still named after the locale, still
    // covering the whole deck, and still the same bytes.
    seedDraft()
    const writes = await mountOnDraft()
    await waitFor(() => expect(writes.written()).toBeGreaterThan(0))
    const restored = lastDraft(writes.read())

    const variants = draftVariants(restored)
    expect(variants).toHaveLength(1)
    expect(variants[0].id).toBe('variant-en-us')
    expect(variants[0].name).toBe('English')
    expect(variants[0].slideIds).toEqual(draftSlideIds(restored))
    expect(documentBytes(restored)).toBe(documentBytes(JSON.parse(draftFor())))
  })
})

describe('the deck-replacing starters, which the reconcile already covered', () => {
  // These three replace `slides` wholesale, which is what the original report
  // called the hole. They are pinned because the whole argument for putting the
  // reconcile in the one funnel rather than in twelve call sites rests on their
  // being covered, and a fix applied to the draft load alone would leave them
  // unproven.

  it('re-points a restored draft’s variants when a template replaces the deck', async () => {
    seedDraft(staleSubset())
    const writes = await mountOnDraft()
    const before = writes.written()
    click(/Minimal product launch/)

    await waitFor(() => expect(writes.written()).toBeGreaterThan(before))
    const next = lastDraft(writes.read())
    const ids = draftSlideIds(next)
    expect(ids).toHaveLength(3)
    expect(draftVariants(next)).toHaveLength(2)
    for (const entry of draftVariants(next)) expect(entry.slideIds).toEqual(ids)
  })

  it('re-points a restored draft’s variants when a blank slide replaces the deck', async () => {
    seedDraft(staleSubset())
    const writes = await mountOnDraft()
    const before = writes.written()
    click(/Start from one blank slide/)

    await waitFor(() => expect(writes.written()).toBeGreaterThan(before))
    const next = lastDraft(writes.read())
    expect(draftSlideIds(next)).toHaveLength(1)
    for (const entry of draftVariants(next)) expect(entry.slideIds).toEqual(draftSlideIds(next))
  })

  it('re-points a restored draft’s variants when the demo replaces the deck', async () => {
    seedDraft(staleSubset())
    const writes = await mountOnDraft()
    const before = writes.written()
    click(/Load the 3-slide demo/)

    await waitFor(() => expect(writes.written()).toBeGreaterThan(before))
    const next = lastDraft(writes.read())
    const ids = draftSlideIds(next)
    expect(ids).toHaveLength(3)
    // The demo's slides are freshly minted ids, so nothing but a reconcile could
    // have put these here.
    expect(ids.every((id) => id.startsWith('demo-slide-'))).toBe(true)
    for (const entry of draftVariants(next)) expect(entry.slideIds).toEqual(ids)
  })
})
