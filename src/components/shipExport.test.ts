import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDefaultOutputVariant } from '../lib/deviceVariants'
import { planExportEntries } from '../lib/exportPlan'
import { buildExportManifest, exportManifestNames } from '../lib/exportManifest'
import { runExportPreflight } from '../lib/exportPreflight'
import { resolveFlowboardExportGate } from '../lib/flowboardExportState'
import { exportProfiles } from '../data'
import { createTestSlide } from '../test/projectFixtures'
import { collectIds, makeFlowboardProps } from '../test/flowboardProps'
import { ShipStage, type ShipStageProps } from './flowboard/ShipStage'
import { RefineStage } from './flowboard/RefineStage'
import type { FlowboardProps } from './Flowboard'
import type { ExportProfile, ExportProfileId, OutputVariant, Slide } from '../types'

/**
 * The Ship stage's new surfaces, and the wiring between the two stages.
 *
 * Three things are load-bearing here and none of them is the picture:
 *
 * - **The manifest is derived, not stored.** The rows on the Ship stage are built
 *   from the plan the export is built from, so the names in the table and the
 *   names in the bundle are the same strings rather than two implementations that
 *   agree today. That is asserted by rebuilding the manifest from the same plan
 *   and comparing, not by matching literal text.
 * - **The variant entry point reaches the Refine canvas.** A button the author
 *   can press and a keyboard user can reach, pointing at the merged preview.
 * - **The store preview is a review, not a verdict.** It describes a surface and
 *   reports a deck; it never claims a store will reject anything.
 */

const noop = () => undefined

/**
 * The Ship stage props for one deck.
 *
 * `makeVariants` is handed the deck the stage is about to render, because the
 * demo project mints a fresh slide id on every call. Building variants from a
 * different invocation's slides produces a deck whose variants name nothing, and
 * every assertion after that fails for a reason that has nothing to do with the
 * code under test — which is a fixture bug that reads exactly like a product bug.
 */
const shipProps = (
  overrides: Partial<FlowboardProps> = {},
  makeVariants?: (slides: Slide[]) => OutputVariant[],
): ShipStageProps => {
  const base = makeFlowboardProps(overrides)
  const resolved = makeVariants ? makeVariants(base.slides) : base.variants
  const profile = exportProfiles.find((entry) => entry.id === resolved[0]?.exportProfileId) ?? base.profile
  const preflight = runExportPreflight({
    profile,
    slides: base.slides,
    activeLocale: base.activeLocale,
    variants: resolved,
  })
  const plan = planExportEntries({
    slides: base.slides,
    variants: resolved,
    profileId: profile.id,
    requiresScreenshot: profile.preflight?.requirements.screenshot !== false,
  })
  return {
    ...base,
    variants: resolved,
    profile,
    preflight,
    exportEntries: plan.entries,
    exportBlockedVariant: plan.blocked,
    exportGate: resolveFlowboardExportGate({ exportStatus: 'idle', preflight, slideCount: base.slides.length }),
    onGoToSlide: base.onSelect,
    activeLocale: base.activeLocale,
  }
}

const render = (props: ShipStageProps) => renderToStaticMarkup(createElement(ShipStage, props))

/** Two variants for whatever deck it is handed, both aimed at one store target. */
const twoVariants = (profileId: ExportProfileId) => (deck: Slide[]): OutputVariant[] => [
  createDefaultOutputVariant({
    slideIds: deck.map((slide) => slide.id),
    locale: 'en-US',
    themeId: 'midnight',
    exportProfileId: profileId,
  }),
  {
    id: 'variant-pixel',
    name: 'Pixel',
    canvasId: 'main-story',
    // A locale of its own, so the manifest's locale column has something real in
    // it that is not the editor's.
    locale: 'es-ES',
    themeId: 'midnight',
    slideIds: deck.map((slide) => slide.id),
    enabled: true,
    exportProfileId: profileId,
    deviceOverrides: [{ slideId: deck[1].id, deviceFrameId: 'android-pixel' }],
  },
]

/** The demo profile every fixture deck targets. */
const DEMO_PROFILE = 'app-store-1125'

describe('the export manifest on the Ship stage', () => {
  it('names every file the bundle will hold, and nothing else', () => {
    const props = shipProps({}, twoVariants(DEMO_PROFILE))
    const markup = render(props)

    const manifest = buildExportManifest({
      plan: { entries: props.exportEntries, blocked: props.exportBlockedVariant },
      profile: props.profile,
      variants: props.variants,
      locale: 'en-US',
    })

    expect(manifest.entries).toHaveLength(props.exportEntries.length)
    expect(manifest.entries.length).toBeGreaterThan(1)
    for (const name of exportManifestNames(manifest)) {
      expect(markup, name).toContain(name)
    }
    // And nothing in the table that is not in the manifest.
    const listed = new Set([...markup.matchAll(/[\w-]+--[\w-]+--slide-\d+\.png/g)].map((match) => match[0]))
    expect(listed).toEqual(new Set(exportManifestNames(manifest)))
  })

  it('is a real table, with a header row and a body row per file', () => {
    const props = shipProps({}, twoVariants(DEMO_PROFILE))
    const markup = render(props)

    expect(markup).toContain('In the ZIP')
    expect(markup).toContain('<table class="ship-manifest__table">')
    expect([...markup.matchAll(/<tbody>/g)]).toHaveLength(1)
    expect([...markup.matchAll(/<tr>/g)]).toHaveLength(props.exportEntries.length + 1)
    // A caption, so the table is named rather than being an anonymous grid.
    expect(markup).toContain('Export manifest:')
    // Header cells are scoped, so a screen reader can say which column it is in.
    expect([...markup.matchAll(/<th scope="col">/g)]).toHaveLength(5)
    expect([...markup.matchAll(/<th scope="row">/g)]).toHaveLength(props.exportEntries.length)
  })

  it('states the profile, the pixel size, and the count, in prose', () => {
    const props = shipProps({}, twoVariants(DEMO_PROFILE))
    const markup = render(props)

    expect(markup).toContain(`${props.profile.name}, written at ${props.profile.width} × ${props.profile.height} px`)
  })

  it('shows the locale each file is drawn in, not the editor locale', () => {
    const markup = render(shipProps({}, twoVariants(DEMO_PROFILE)))

    // The second variant writes Spanish while the editor is on English, and the
    // column has to say so or it is a lie.
    expect(markup).toContain('<td>es-ES</td>')
    expect(markup).toContain('<td>en-US</td>')
  })

  it('renders no manifest at all for a plan with nothing in it', () => {
    const markup = render(shipProps({}, () => []))
    expect(markup).not.toContain('In the ZIP')
    expect(markup).not.toContain('ship-manifest__table')
  })
})

describe('the store listing on the Ship stage', () => {
  it('names the store and the target, and shows the leading tiles', () => {
    const markup = render(shipProps())
    expect(markup).toContain('Store listing')
    expect(markup).toContain('App Store')
    expect(markup).toContain('store-preview__leading')
    // The cheap path, not a third full renderer per slide.
    expect(markup).not.toContain('slide-canvas')
  })

  it('describes the carousel and asserts nothing about what a store accepts', () => {
    const markup = render(shipProps())
    const section = markup.slice(markup.indexOf('class="store-preview"'))
    expect(section).toContain('shown side by side at the front of the carousel')
    expect(section).not.toMatch(/\b(must|requires|rejects?|at least|no more than)\b/i)
  })

  it('has no control of its own, so nothing on it is mouse-only', () => {
    const markup = render(shipProps())
    const section = markup.slice(markup.indexOf('class="store-preview"'), markup.indexOf('ship-profile-title'))
    expect(section).not.toMatch(/<button/)
    expect(section).not.toMatch(/<select/)
    expect(section).not.toMatch(/tabindex/)
  })

  it('describes the variant it is showing when a deck has two', () => {
    const markup = render(shipProps({ activeVariantId: 'variant-pixel' }, twoVariants(DEMO_PROFILE)))

    expect(markup).toContain('the “Pixel” variant')
    expect(markup).toContain(`${DEMO_PROFILE}--pixel--slide-01.png`)
  })
})

describe('the variant management entry point', () => {
  it('offers a keyboard-reachable button into the merged preview', () => {
    const markup = render({ ...shipProps({}, twoVariants(DEMO_PROFILE)), onOpenVariantPreview: noop })

    expect(markup).toContain('Show on canvas')
    // A real button, so Tab reaches it and Enter presses it.
    expect(markup).toMatch(/<button class="button button--quiet button--small" type="button"[^>]*>/)
    expect(markup).not.toMatch(/<div[^>]*onClick/)
  })

  it('disables the entry point when the variant does not render the selected slide', () => {
    const slides: Slide[] = [createTestSlide({ id: 'a' }), createTestSlide({ id: 'b' })]
    const props = shipProps({ slides, selectedSlide: slides[0], selectedIndex: 0 }, (deck) => [
      createDefaultOutputVariant({
        slideIds: [deck[1].id],
        locale: 'en-US',
        themeId: 'midnight',
        exportProfileId: DEMO_PROFILE,
      }),
    ])
    const markup = render({ ...props, onOpenVariantPreview: noop })

    expect(markup).toMatch(/<button[^>]*disabled[^>]*>[\s\S]{0,160}?Show on canvas/)
    expect(markup).toContain('does not render the selected slide')
  })

  it('omits the entry point entirely when the caller has nowhere to send the author', () => {
    const markup = render(shipProps({}, twoVariants(DEMO_PROFILE)))
    expect(markup).not.toContain('Show on canvas')
  })

  it('adds no form id that a control without a label would hide behind', () => {
    const markup = render({ ...shipProps({}, twoVariants(DEMO_PROFILE)), onOpenVariantPreview: noop })
    const ids = collectIds(markup)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('the Refine stage with the merged preview', () => {
  const refineProps = (overrides: Record<string, unknown> = {}) => {
    const base = makeFlowboardProps()
    return {
      canvas: {
        slides: base.slides,
        selectedSlide: base.selectedSlide,
        selectedIndex: 0,
        selectedId: base.selectedSlide.id,
        mode: base.canvasMode,
        onModeChange: base.onCanvasModeChange,
        onSelect: base.onSelect,
        onImport: base.onImportScreenshot,
        onTransformChange: base.onTransformChange,
        selectedLayerId: base.selectedLayerId,
        onLayerSelect: base.onLayerSelect,
        onLayerTransformChange: base.onLayerTransformChange,
        persistenceStatus: base.persistenceStatus,
        persistenceDetail: base.persistenceDetail,
        projectValidationNotice: base.projectValidationNotice,
        exportStatus: base.exportStatus,
        exportDetail: base.exportDetail,
        exportCompleted: 0,
        exportTotal: base.slides.length,
        profile: base.profile,
        locale: base.activeLocale,
      },
      inspector: {
        slide: base.selectedSlide,
        activeLocale: base.activeLocale,
        onLocaleChange: base.onLocaleChange,
        onUpdate: base.onUpdateSlide,
        onTextUpdate: base.onTextUpdate,
        onImport: base.onImportScreenshot,
        onImportIcon: base.onImportAppIcon,
        onRemoveIcon: base.onRemoveAppIcon,
        onImportBackground: base.onImportBackground,
        onRemoveBackground: base.onRemoveBackground,
        selectedLayerId: base.selectedLayerId,
        onLayerSelect: base.onLayerSelect,
        profile: base.profile,
        preflight: base.preflight,
        layerBounds: base.layerBounds,
        onArrange: base.onArrange,
        onProfileChange: base.onProfileChange,
        exportDisabled: false,
      },
      preflight: base.preflight,
      onGoToSlide: base.onSelect,
      ...overrides,
    }
  }

  /**
   * `withDeck` is handed the very props object the stage will render, so a
   * variant built from it names the slides the stage is actually showing. Built
   * from a second call it would name nothing and the preview would correctly
   * refuse to render — a fixture trap that looks exactly like a product bug.
   */
  const withDeck = (overrides: Record<string, unknown>) => (stage: Record<string, unknown>) => {
    const canvas = stage.canvas as { slides: Slide[]; profile: ExportProfile }
    return {
      variants: [
        createDefaultOutputVariant({
          slideIds: canvas.slides.map((slide) => slide.id),
          locale: 'en-US',
          themeId: 'midnight',
          exportProfileId: canvas.profile.id,
        }),
        {
          id: 'variant-pixel',
          name: 'Pixel',
          canvasId: 'main-story',
          locale: 'en-US',
          themeId: 'midnight',
          slideIds: canvas.slides.map((slide) => slide.id),
          enabled: true,
          exportProfileId: canvas.profile.id,
          // On the slide the stage opens on, so the assertion about the device on
          // screen is about the variant's override and nothing else.
          deviceOverrides: [{ slideId: canvas.slides[0].id, deviceFrameId: 'android-pixel' as const }],
        },
      ],
      ...overrides,
    }
  }

  /**
   * The element carrying `class="<marker>"`, cut out by walking its `div` nesting.
   *
   * A `slice` between two class names is not enough here: the property tray's
   * class attribute is a list, not a bare name, so a marker that matches the
   * tray fails to find it and the slice runs to the end of the document —
   * quietly asserting against the whole stage instead of the preview.
   */
  const elementAt = (markup: string, marker: string): string => {
    const at = markup.indexOf(`class="${marker}"`)
    if (at < 0) throw new Error(`no element with class="${marker}" in this markup`)
    const open = markup.lastIndexOf('<div', at)
    let depth = 0
    let index = open
    while (index < markup.length) {
      const nextOpen = markup.indexOf('<div', index)
      const nextClose = markup.indexOf('</div>', index)
      if (nextClose < 0) break
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1
        index = nextOpen + 4
        continue
      }
      depth -= 1
      index = nextClose + 6
      if (depth === 0) return markup.slice(open, index)
    }
    throw new Error(`unbalanced element with class="${marker}" in this markup`)
  }

  const renderRefine = (variantsFor?: (stage: Record<string, unknown>) => Record<string, unknown>) => {
    const stage = refineProps()
    return renderToStaticMarkup(createElement(
      RefineStage,
      (variantsFor ? { ...stage, ...variantsFor(stage) } : stage) as never,
    ))
  }

  it('draws the editable canvas and no picker when there are no variants to preview', () => {
    // The pre-existing shape: a caller that knows nothing about variants gets the
    // stage it had, with no control and no read-only surface.
    const markup = renderRefine()
    expect(markup).toContain('editor-workspace')
    expect(markup).not.toContain('variant-preview')
    expect(markup).toContain('Click any layer on the canvas to select it')
  })

  it('offers the picker and still draws the editable canvas on the deck', () => {
    const markup = renderRefine(withDeck({ variantPreviewId: '' }))

    expect(markup).toContain('refine-variant-preview')
    // The canvas the author has always been editing is still there, intact.
    expect(markup).toContain('editor-workspace')
    expect(markup).toContain('role="button"')
    expect(markup).toContain('The editable canvas is below')
  })

  it('swaps the editable canvas for the read-only one when a variant is previewing', () => {
    const markup = renderRefine(withDeck({ variantPreviewId: 'variant-pixel' }))

    expect(markup).toContain('data-variant-preview="read-only"')
    expect(markup).toContain('slide-canvas--export')
    // The device the variant overrides is the one on screen, which is the whole
    // point of the surface.
    expect(markup).toContain('slide-canvas--device-android-pixel')
    // The editable canvas is gone, and with it every write affordance. Scoped to
    // the preview: the property tray beside it is a separate surface that still
    // edits the deck's own slide, which is what it has always done.
    const preview = elementAt(markup, 'variant-preview')
    expect(markup).not.toContain('editor-workspace')
    expect(preview).toContain('data-variant-preview="read-only"')
    expect(preview).not.toContain('role="button"')
    expect(preview).not.toContain('tabindex="0"')
    expect(preview).not.toContain('aria-pressed=')
    expect(preview).not.toContain('data-capture-drop-target')
    expect(preview).not.toContain('canvas-guides')
  })

  it('falls back to the editable canvas when the chosen variant no longer exists', () => {
    const markup = renderRefine(withDeck({ variantPreviewId: 'variant-that-was-removed' }))

    expect(markup).toContain('editor-workspace')
    expect(markup).not.toContain('data-variant-preview="read-only"')
  })
})
