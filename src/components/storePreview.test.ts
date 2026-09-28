import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { parseStylesheet } from '../test/stylesheet'
import { renderToStaticMarkup } from 'react-dom/server'
import { AUTHORING_CANVAS_ID } from '../lib/deviceVariants'
import { planExportEntries } from '../lib/exportPlan'
import { buildStorePreview, type StorePreview as StorePreviewModel } from '../lib/storePreview'
import { exportProfiles } from '../data'
import { collectIds } from '../test/flowboardProps'
import { createTestSlide } from '../test/projectFixtures'
import { StorePreview } from './StorePreview'
import type { ExportProfileId, LocaleId, OutputVariant, Slide } from '../types'

/**
 * Markup tests for the store-listing preview, in the shape
 * `captureDropTargets.test.ts` uses: render to static markup and check the
 * affordances that have to be there, plus the stylesheet rules they rely on.
 *
 * The performance constraint is asserted here too, because it is a structural
 * claim rather than a measurement: this surface renders the cheap thumbnail
 * component, and there is exactly one full renderer in the editor for anything
 * that is not being edited. A third set of full renderers on a ten-slide deck is
 * a real cost, so the rule is written down where a regression would break it.
 */

const deck = (count = 5): Slide[] =>
  Array.from({ length: count }, (_, index) => createTestSlide({ id: `slide-${index + 1}` }))

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'variant-en-us',
  name: 'English',
  canvasId: AUTHORING_CANVAS_ID,
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: [],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

const modelFor = (
  slides: Slide[],
  overrides: { profileId?: ExportProfileId; locale?: LocaleId; variants?: OutputVariant[]; variantId?: string } = {},
): StorePreviewModel => {
  const profileId = overrides.profileId ?? 'app-store'
  const variants = overrides.variants ?? [variant({
    slideIds: slides.map((slide) => slide.id),
    exportProfileId: profileId,
  })]
  return buildStorePreview({
    plan: planExportEntries({ slides, variants, profileId, requiresScreenshot: true }),
    profile: exportProfiles.find((entry) => entry.id === profileId) ?? exportProfiles[0],
    variants,
    locale: overrides.locale ?? 'en-US',
    variantId: overrides.variantId,
  })
}

const render = (slides: Slide[], overrides: Parameters<typeof modelFor>[1] = {}) =>
  renderToStaticMarkup(createElement(StorePreview, {
    preview: modelFor(slides, overrides),
    slides,
  }))

describe('the store listing preview', () => {
  it('names the store and the target from the catalog, not from the component', () => {
    const markup = render(deck(4))
    expect(markup).toContain('App Store')
    expect(markup).toContain('App Store portrait 1242')
    expect(markup).toContain('1242 × 2688')
  })

  it('shows the leading tiles, and says how many sit side by side', () => {
    const markup = render(deck(5))
    // Three thumbnails for the three leading images, no more.
    expect([...markup.matchAll(/flowboard-thumb--slide/g)]).toHaveLength(3)
    expect(markup).toContain('The first 3 images are shown side by side')
  })

  it('shows one leading tile for a landscape target, because it is shown on its own', () => {
    const markup = render(deck(5), { profileId: 'google-play-tablet-7-landscape' })
    expect([...markup.matchAll(/flowboard-thumb--slide/g)]).toHaveLength(1)
    expect(markup).toContain('shown on its own at full width')
  })

  it('names the file under each leading tile, exactly as the bundle names it', () => {
    const markup = render(deck(3))
    expect(markup).toContain('app-store--english--slide-01.png')
    expect(markup).toContain('app-store--english--slide-03.png')
  })

  /**
   * The rest of the set is a ledger, not a second set of renders. A carousel
   * shows the front; the tail only has to be countable and honest about what it
   * is missing.
   */
  it('lists the rest of the set as text, without a renderer per slide', () => {
    const markup = render(deck(6))
    expect([...markup.matchAll(/flowboard-thumb--slide/g)]).toHaveLength(3)
    expect(markup).toContain('store-preview__rest')
    expect(markup).toMatch(/Slide 6/)
    expect(markup).not.toContain('slide-canvas')
  })

  it('states capture completeness in words, naming what is missing', () => {
    const slides = deck(4)
    slides[2] = createTestSlide({ id: 'slide-3', screenshot: null, screenshotName: null })
    const markup = render(slides)

    expect(markup).toContain('3 of 4 images have a capture')
    expect(markup).toContain('Slide 3 has none.')
  })

  it('states icon presence, and says which slides draw none', () => {
    const slides = deck(3)
    slides[1] = createTestSlide({ id: 'slide-2', appIcon: null })
    const markup = render(slides)

    expect(markup).toContain('2 of 3 images draw an app icon')
    expect(markup).toContain('Slide 2 draws none.')
  })

  it('reports the longest leading headline against a reading length, without ruling', () => {
    const slides = [
      createTestSlide({ id: 'slide-1', title: 'Short' }),
      createTestSlide({ id: 'slide-2', title: 'A headline long enough that it will certainly wrap inside a narrow tile' }),
      createTestSlide({ id: 'slide-3', title: 'Also short' }),
    ]
    const markup = render(slides)

    expect(markup).toContain('Longest first-line headline')
    expect(markup).toContain('71 characters')
    expect(markup).toContain('against about 30 that read on one line here')
    // Descriptive, not a verdict: nothing is called a failure.
    expect(markup).not.toMatch(/\b(fail|failed|invalid|reject|error|too long)\b/i)
  })

  it('says which variant set it is describing when a deck has more than one', () => {
    const slides = deck(3)
    const variants = [
      variant({ id: 'variant-iphone', name: 'iPhone', slideIds: slides.map((s) => s.id) }),
      variant({ id: 'variant-pixel', name: 'Pixel', slideIds: slides.map((s) => s.id) }),
    ]
    const markup = render(slides, { variants, variantId: 'variant-pixel' })

    expect(markup).toContain('the “Pixel” variant')
    expect(markup).toContain('app-store--pixel--slide-01.png')
  })

  /**
   * The cheap path, asserted rather than assumed. `SlideThumbnail` is the
   * component that deliberately avoids the full renderer, so a tile is a
   * thumbnail plus a filename — and the tile's own slide number comes from the
   * plan, not from an index that could be off by the variant's position.
   */
  it('renders each tile with the cheap thumbnail and the right slide number', () => {
    const markup = render(deck(4))
    // No full renderer anywhere in this surface.
    expect(markup).not.toContain('slide-canvas')
    expect(markup).toContain('flowboard-thumb__number')
    // 01, 02, 03 — and no NaN from a mis-derived index.
    expect(markup).toContain('>01<')
    expect(markup).toContain('>03<')
    expect(markup).not.toContain('NaN')
  })

  it('carries no interactive affordance of its own, so there is nothing to reach by keyboard', () => {
    const markup = render(deck(5))
    expect(markup).not.toMatch(/<button/)
    expect(markup).not.toMatch(/<a\s/)
    expect(markup).not.toMatch(/<div[^>]*onClick/)
    expect(markup).not.toContain('tabindex')
  })

  it('labels its thumbnails, and duplicates no form id', () => {
    const markup = render(deck(3))
    const ids = collectIds(markup)
    expect(new Set(ids).size).toBe(ids.length)
    // The thumbnail's own alt text names the slide, so the set is readable.
    expect(markup).toContain('on slide 1')
  })

  it('is a section with a heading, so it is reachable by heading navigation', () => {
    const markup = render(deck(3))
    expect(markup).toMatch(/<section class="store-preview" aria-labelledby="store-preview-title">/)
    expect(markup).toMatch(/<h3 id="store-preview-title">/)
  })

  it('handles a deck with nothing planned, without inventing content', () => {
    const markup = render([])
    expect(markup).toContain('No images are planned for this target yet.')
    expect(markup).not.toContain('flowboard-thumb--slide')
  })
})

describe('the store preview stylesheet', () => {
  const css = parseStylesheet('src/components/flowboard/flowboard.css')

  it('lays the leading tiles out in one flexible row that wraps', () => {
    expect(css.value('.store-preview__leading', 'display')).toBe('flex')
    expect(css.value('.store-preview__leading', 'flex-wrap')).toBe('wrap')
  })

  it('gives every tile a stable frame, so a changing headline cannot resize the row', () => {
    expect(css.value('.store-preview__tile', 'aspect-ratio')).toBeDefined()
    expect(css.value('.store-preview__headline', 'min-width')).toBe('0px')
    expect(css.value('.store-preview__headline', 'overflow-wrap')).toBe('anywhere')
  })

  it('reuses the thumbnail size rather than restyling a slide', () => {
    // The tiles are the cheap path, so the stylesheet dresses them and never
    // reaches inside to redraw a layer.
    expect(css.hasRule('.store-preview__tile .flowboard-thumb')).toBe(true)
  })
})
