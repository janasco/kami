/**
 * Choosing which slide a merged per-variant preview shows, and proving what it is.
 *
 * Until now the Refine canvas always drew the base deck: a variant's device
 * override was merged in the export root and nowhere else, so an author had no
 * way to see the second device set they had just configured. This module is the
 * decision behind that preview, and it is pure so the decision is testable.
 *
 * Two rules, and both are about not forking state:
 *
 * - **The preview reads the deck, it never writes it.** The resolved slide comes
 *   out of `resolveDeviceOverride`, the same function the export uses, and is
 *   handed to the renderer with the read-only prop set from `exportRenderProps`.
 *   There is no copy of the deck, no partial variant state to reconcile, and
 *   therefore no way for what is shown to be anything other than what is exported.
 * - **A variant is a subset, and the preview says so.** A variant may name two
 *   of five slides. Asking it to draw a slide it does not render does not quietly
 *   fall back to the deck, because that would show the author a device they did
 *   not choose; it resolves to the first slide the variant does render and says
 *   which slide was asked for.
 *
 * No React and no DOM.
 */

import {
  deviceOverrideCount,
  expandVariantRenders,
  hasVariantCapture,
  resolveDeviceOverride,
} from './deviceVariants'
import type { LocaleId, OutputVariant, Slide } from '../types'

/** The value that means "the editable deck", which is not a variant at all. */
export const BASE_PREVIEW_ID = ''

/** One row in the variant picker. */
export interface VariantPreviewChoice {
  id: string
  name: string
}

/**
 * The variant picker, with the deck first.
 *
 * The deck is an option rather than an absence so the control can always say
 * which of the two things is on screen, and so returning to editing is a
 * selection an author makes rather than a mode they have to discover. The names
 * are short on purpose: a select is read once, and the facts that make a variant
 * different are stated in the live sentence beside the control rather than baked
 * into every option.
 */
export const variantPreviewChoices = (variants: readonly OutputVariant[]): VariantPreviewChoice[] => [
  { id: BASE_PREVIEW_ID, name: 'Deck' },
  ...variants.map((variant) => ({ id: variant.id, name: variant.name })),
]

/** One slide as one variant renders it, for the preview's slide stepper. */
export interface VariantPreviewSlide {
  slideNumber: number
  slideId: string
  /** True when the variant overrides nothing for this slide. */
  usesDeckDevice: boolean
  missingCapture: boolean
}

export interface VariantPreview {
  variantId: string
  variantName: string
  /** The locale the render draws in, which is the variant's, not the editor's. */
  locale: LocaleId
  /** The resolved slide: the deck's slide with this variant's override merged on. */
  slide: Slide
  /** 1-based position in the authoring deck. */
  slideNumber: number
  slideId: string
  /**
   * The deck slide the caller asked for, when the variant does not render it.
   * `null` when the requested slide is the one on screen.
   */
  requestedSlideId: string | null
  /** True when the resolved slide would show no capture at all. */
  missingCapture: boolean
  /** True when this render uses the deck's own device rather than an override. */
  usesDeckDevice: boolean
  /** How many slides of the deck carry an override for this variant. */
  overrideCount: number
  /** The slides this variant renders, in deck order. */
  renders: VariantPreviewSlide[]
}

export interface ResolveVariantPreviewInput {
  slides: readonly Slide[]
  /**
   * The variant to preview, or null for the editable deck. Null is not an error:
   * it is the answer "show the canvas the author can edit".
   */
  variant: Pick<OutputVariant, 'id' | 'name' | 'locale' | 'slideIds' | 'deviceOverrides'> | null | undefined
  /** The deck slide currently selected, which is where the preview starts. */
  slideId: string
  /** The editor's active locale: the fallback for a variant that names none. */
  locale: LocaleId
}

/**
 * The one slide a merged preview shows, or null when the deck is being edited.
 *
 * Read-only by construction: it returns a resolved `Slide` and the facts about
 * it, and there is no setter, no partial update, and no handler anywhere in the
 * returned object through which the deck could be written.
 */
export const resolveVariantPreview = ({
  slides,
  variant,
  slideId,
  locale,
}: ResolveVariantPreviewInput): VariantPreview | null => {
  if (!variant) return null

  const renders = expandVariantRenders(slides, variant)
  if (renders.length === 0) return null

  const wanted = renders.find((render) => render.slide.id === slideId)
  // A variant that skips the selected slide still has something to show, and it
  // shows its own first render rather than the deck's, so the device on screen is
  // always the device that variant exports.
  const chosen = wanted ?? renders[0]
  const { slide: resolved, override } = resolveDeviceOverride(chosen.sourceSlide, variant)

  return {
    variantId: variant.id,
    variantName: variant.name,
    locale: variant.locale ?? locale,
    slide: resolved,
    slideNumber: chosen.slideNumber,
    slideId: chosen.slide.id,
    requestedSlideId: chosen.slide.id === slideId ? null : slideId,
    missingCapture: !hasVariantCapture(chosen.sourceSlide, override),
    usesDeckDevice: override === null,
    overrideCount: deviceOverrideCount(variant),
    renders: renders.map((render) => ({
      slideNumber: render.slideNumber,
      slideId: render.slide.id,
      usesDeckDevice: render.override === null,
      missingCapture: render.missingCapture,
    })),
  }
}

/**
 * What the preview says about itself, in one sentence.
 *
 * Every clause is a fact the module can verify from the variant: which variant,
 * which deck slide, whether it overrides that slide, and whether it is
 * incomplete. Nothing here asserts what a store will do with the result.
 */
export const describeVariantPreview = (preview: VariantPreview, deckSize: number): string => {
  const parts = [`Read-only preview of “${preview.variantName}”, slide ${preview.slideNumber} of ${deckSize}`]
  parts.push(preview.usesDeckDevice ? 'the deck device, unchanged' : 'the device this variant overrides')
  if (preview.requestedSlideId) parts.push('this variant does not render the selected slide, so it shows its first')
  if (preview.missingCapture) parts.push('this render has no capture, so the variant cannot export')
  return `${parts.join(', ')}.`
}
