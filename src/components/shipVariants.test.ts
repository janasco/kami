import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDefaultOutputVariant } from '../lib/deviceVariants'
import { runExportPreflight } from '../lib/exportPreflight'
import { planExportEntries, variantExportRefusal } from '../lib/exportPlan'
import { resolveFlowboardExportGate } from '../lib/flowboardExportState'
import { exportProfiles } from '../data'
import { createTestSlide, VALID_PNG_DATA_URL } from '../test/projectFixtures'
import { collectIds, makeFlowboardProps } from '../test/flowboardProps'
import { ShipStage, type ShipStageProps } from './flowboard/ShipStage'
import type { FlowboardProps } from './Flowboard'
import type { ExportProfileId, OutputVariant, Slide } from '../types'

/**
 * Server-render tests for the Ship stage's device-variant surface.
 *
 * There is no DOM test environment, so these render to static markup. That is
 * enough for the things this UI can get wrong: a duplicate form id, a control
 * with no label, a name the ZIP does not use, or a blocked variant that is
 * described nowhere.
 */

const shipProps = (overrides: Partial<FlowboardProps> = {}): ShipStageProps => {
  const base = makeFlowboardProps(overrides)
  /*
   * The plan and the preflight follow the variant's own store target rather than
   * the catalog's first profile, because that is the pairing the App builds: a
   * profile and the variants that target it are one decision.
   */
  const profile = exportProfiles.find((entry) => entry.id === base.variants[0].exportProfileId) ?? base.profile
  const preflight = runExportPreflight({
    profile,
    slides: base.slides,
    activeLocale: 'en-US',
    variants: base.variants,
  })
  const plan = planExportEntries({
    slides: base.slides,
    variants: base.variants,
    profileId: profile.id,
    requiresScreenshot: profile.preflight?.requirements.screenshot !== false,
  })
  return {
    ...base,
    profile,
    preflight,
    exportEntries: plan.entries,
    exportBlockedVariant: plan.blocked,
    exportGate: resolveFlowboardExportGate({
      exportStatus: 'idle',
      preflight,
      slideCount: base.slides.length,
    }),
    onGoToSlide: base.onSelect,
  }
}

const noop = () => undefined

/** The plan, preflight, and entries for one explicit variant set. */
const withVariants = (props: ShipStageProps, variants: OutputVariant[]): ShipStageProps => {
  const preflight = runExportPreflight({
    profile: props.profile,
    slides: props.slides,
    activeLocale: 'en-US',
    variants,
  })
  const plan = planExportEntries({
    slides: props.slides,
    variants,
    profileId: props.profile.id,
    requiresScreenshot: true,
  })
  return {
    ...props,
    variants,
    activeVariantId: variants[0].id,
    preflight,
    exportEntries: plan.entries,
    exportBlockedVariant: plan.blocked,
    exportGate: resolveFlowboardExportGate({ exportStatus: 'idle', preflight, slideCount: props.slides.length }),
    onGoToSlide: noop,
  }
}

const render = (props: ShipStageProps) => renderToStaticMarkup(createElement(ShipStage, props))

/** Two variants, both aimed at the profile the stage is showing. */
const twoVariants = (slides: Slide[], profileId: ExportProfileId): OutputVariant[] => [
  createDefaultOutputVariant({
    slideIds: slides.map((slide) => slide.id),
    locale: 'en-US',
    themeId: 'midnight',
    exportProfileId: profileId,
  }),
  {
    id: 'variant-pixel',
    name: 'Pixel',
    canvasId: 'main-story',
    locale: 'en-US',
    themeId: 'midnight',
    slideIds: slides.map((slide) => slide.id),
    enabled: true,
    exportProfileId: profileId,
    deviceOverrides: [{ slideId: slides[0].id, deviceFrameId: 'android-pixel' }],
  },
]

describe('Ship stage device variants', () => {
  it('shows one row for the deck default variant, and says the deck device is used', () => {
    const markup = render(shipProps())
    expect(markup).toContain('Export variants')
    expect(markup).toContain('deck device')
    expect(markup).toContain('Add device variant')
  })

  it('lists every variant with its own name, and a store target per variant', () => {
    const props = shipProps()
    const markup = render({ ...withVariants(props, twoVariants(props.slides, props.profile.id)), activeVariantId: 'variant-pixel' })

    expect(markup).toContain('Pixel')
    expect(markup).toMatch(/id="variant-profile-variant-pixel"/)
    expect(markup).toContain('Use deck device')
  })

  /**
   * Every control has to be reachable and operable from the keyboard, and to
   * announce itself. There is no pointer-only affordance on this surface: the
   * variant name is a labelled text input, the device and fit are labelled
   * selects, and every action is a real button.
   */
  it('labels every control and duplicates no form id', () => {
    const props = shipProps()
    const markup = render({ ...withVariants(props, twoVariants(props.slides, props.profile.id)), activeVariantId: 'variant-pixel' })

    const ids = collectIds(markup)
    expect(new Set(ids).size).toBe(ids.length)

    for (const id of ids) {
      const at = markup.indexOf(`id="${id}"`)
      const isLabelled = markup.includes(`for="${id}"`)
        || markup.includes(`aria-labelledby="${id}"`)
        || markup.includes(`aria-describedby="${id}"`)
        || markup.includes(`aria-label`)
      const isHiddenInput = at >= 0 && /type="(file|hidden)"/.test(markup.slice(at, at + 200))
      expect(isLabelled || isHiddenInput, `control ${id} has no label`).toBe(true)
    }

    // Every form control is a native element, so Tab and Enter just work.
    expect(markup).not.toMatch(/<div[^>]*onClick/)
    expect(markup).toContain('<button class="button button--quiet" type="button"')
  })

  it('names every file the export will write, exactly as the ZIP names them', () => {
    const props = shipProps()
    const markup = render(withVariants(props, twoVariants(props.slides, props.profile.id)))

    expect(markup).toContain('In the ZIP')
    expect(markup).toContain(`${props.profile.id}--english--slide-01.png`)
    expect(markup).toContain(`${props.profile.id}--pixel--slide-01.png`)
  })

  it('states the refusal when a variant has a missing capture, rather than only disabling a button', () => {
    const slides: Slide[] = [
      createTestSlide({ id: 'a' }),
      createTestSlide({ id: 'b', screenshot: null, screenshotName: null }),
    ]
    const base = shipProps({ slides, selectedSlide: slides[0], selectedIndex: 0 })
    const props = withVariants(base, [
      // The deck variant supplies the capture the slide itself lacks, so it is
      // exportable; the second variant is not, and it is the one that is named.
      {
        ...createDefaultOutputVariant({
          slideIds: ['a', 'b'],
          locale: 'en-US',
          themeId: 'midnight',
          exportProfileId: base.profile.id,
          id: 'variant-deck',
          name: 'Deck device',
        }),
        deviceOverrides: [{ slideId: 'b', screenshot: { name: 'wide.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' } }],
      },
      {
        id: 'variant-pixel',
        name: 'Pixel',
        canvasId: 'main-story',
        locale: 'en-US',
        themeId: 'midnight',
        slideIds: ['a', 'b'],
        enabled: true,
        exportProfileId: base.profile.id,
        deviceOverrides: [{ slideId: 'a', deviceFrameId: 'android-pixel', screenshot: { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' } }],
      },
    ])
    // The Pixel variant renders slide b with no capture, so its own export stops.
    const plan = planExportEntries({ slides, variants: props.variants, profileId: props.profile.id, requiresScreenshot: true })
    const markup = render({ ...props, activeVariantId: 'variant-pixel' })

    expect(plan.blocked?.variantName).toBe('Pixel')
    expect(markup).toContain(variantExportRefusal(plan.blocked!))
    // And the variant-scoped preflight issue names the deck position and the variant.
    expect(markup).toContain('Slide 2 · Pixel')
  })

  /**
   * The capture control has to be reachable in both states. It is the only way
   * a variant can supply a capture for a slide the deck has none for, which is
   * the exact situation that otherwise blocks its export.
   */
  it('offers the capture control whether or not the variant already has one', () => {
    const slides: Slide[] = [createTestSlide({ id: 'a' }), createTestSlide({ id: 'b', screenshot: null, screenshotName: null })]
    const base = shipProps({ slides, selectedSlide: slides[0], selectedIndex: 0 })
    const props = withVariants(base, [{
      id: 'variant-tablet',
      name: 'Tablet',
      canvasId: 'main-story',
      locale: 'en-US',
      themeId: 'midnight',
      slideIds: ['a', 'b'],
      enabled: true,
      exportProfileId: base.profile.id,
      deviceOverrides: [{ slideId: 'a', screenshot: { name: 'a-wide.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' } }],
    }])
    const markup = render(props)

    // Slide a has an override and offers a replacement; slide b has none and
    // still offers to set one, because that is how a blocked variant is unblocked.
    expect(markup).toContain('Replace capture')
    expect(markup).toContain('Set capture')
    expect(props.exportBlockedVariant?.slideNumbers).toEqual([2])
  })

  it('marks a disabled variant as not exported, in words', () => {
    const props = shipProps()
    const variants = twoVariants(props.slides, props.profile.id)
    const markup = render(withVariants(props, variants.map((variant, index) => (index === 1 ? { ...variant, enabled: false } : variant))))
    expect(markup).toContain('This variant is off, so it is not exported.')
    expect(markup).not.toContain('app-store--pixel--slide-01.png')
  })
})
