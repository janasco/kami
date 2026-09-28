/**
 * Per-device export variants: what one variant renders, and what it is called.
 *
 * The rule that makes the whole feature migration-free lives here, in
 * `resolveDeviceOverride`: **a slide absent from `deviceOverrides` uses its own
 * fields.** A project with one default variant and no overrides therefore
 * behaves exactly as it did before this module existed, which is why the field
 * is optional, why `version` stays `1`, and why an untouched deck still
 * serializes byte for byte.
 *
 * The second rule is that a variant is a *reference* set, never a copy. It names
 * slides by id. Duplicating a slide per device would inflate `slides`, break the
 * synthetic `scene.width`, and desynchronise every consumer that reads a 1-based
 * slide position — `preflight.slideNumbers`, the "Open slide" button, the ZIP
 * numbering, and the deck strip.
 *
 * No React and no DOM, so every decision below is reachable from a test.
 */

import { slideLayerIds } from '../data'
import { getDeviceFramePreset, resolveDeviceFrameId } from './devicePresets'
import { resolveScreenshotFit } from './screenshotFit'
import type {
  DeviceFrameId,
  DeviceVariantSlideOverride,
  ExportProfileId,
  LayerTransforms,
  LocaleId,
  OutputVariant,
  Slide,
  ThemeId,
} from '../types'

/**
 * The id the serializer has always written for the single default variant.
 *
 * It is kept as the default rather than a fresh `crypto.randomUUID()` so that a
 * deck with no device variants keeps producing the same document, byte for
 * byte, that it produced before this feature.
 */
export const DEFAULT_VARIANT_ID = 'variant-en-us'

/** The name the serializer has always written for that variant. */
export const DEFAULT_VARIANT_NAME = 'English'

/** The canvas every editor deck has, and the only one the editor writes. */
export const AUTHORING_CANVAS_ID = 'main-story'

/** One slide as one variant renders it. */
export interface VariantRender {
  /**
   * 1-based position in the **authoring deck**, never in the variant.
   *
   * The variant may name a subset of the slides, so a render number that counted
   * within the variant would not index `slides` and every "open this slide"
   * affordance would point at the wrong one.
   */
  slideNumber: number
  /** The editor slide, untouched. Preflight numbering and navigation read this. */
  sourceSlide: Slide
  /** The slide with this variant's override merged onto it. What gets rendered. */
  slide: Slide
  /** The override that was applied, or null when the slide used its own fields. */
  override: DeviceVariantSlideOverride | null
  /** True when this render would show no capture at all. */
  missingCapture: boolean
}

export interface ResolvedDeviceOverride {
  slide: Slide
  override: DeviceVariantSlideOverride | null
}

/** The scalar fields a variant is allowed to restate, written out once. */
const OVERRIDABLE_DEVICE_FIELDS = ['deviceFrameId', 'showDeviceStatusBar', 'screenshotFit'] as const

/**
 * The override record for one slide inside one variant, or null.
 *
 * Last record wins on a duplicate slide id, because a hand-edited document can
 * list one twice and the later entry is the more likely intent, the same way the
 * rest of the reader treats a repeated reference.
 */
export const findDeviceOverride = (
  variant: Pick<OutputVariant, 'deviceOverrides'> | null | undefined,
  slideId: string,
): DeviceVariantSlideOverride | null => {
  const overrides = variant?.deviceOverrides
  if (!overrides || overrides.length === 0) return null
  let found: DeviceVariantSlideOverride | null = null
  for (const override of overrides) {
    if (override?.slideId === slideId) found = override
  }
  return found
}

/** How many slides in a variant carry a device override. */
export const deviceOverrideCount = (variant: Pick<OutputVariant, 'deviceOverrides'>): number => {
  const seen = new Set<string>()
  for (const override of variant.deviceOverrides ?? []) {
    if (typeof override?.slideId === 'string' && override.slideId.length > 0) seen.add(override.slideId)
  }
  return seen.size
}

/**
 * The device frame a variant shows for one slide, without merging the rest.
 *
 * A frameless preset never shows the status chrome whatever the flag says, and
 * that is resolved by the renderer through the shared status-bar helper, so the
 * preflight and the canvas cannot disagree about whether chrome is drawn.
 */
export const resolveVariantDeviceFrameId = (
  slide: Pick<Slide, 'deviceFrameId'>,
  override: DeviceVariantSlideOverride | null,
): DeviceFrameId => resolveDeviceFrameId(override?.deviceFrameId ?? slide.deviceFrameId)

/** Whether a variant has a capture for this render. */
export const hasVariantCapture = (slide: Slide, override: DeviceVariantSlideOverride | null): boolean =>
  Boolean(override?.screenshot?.dataUrl || slide.screenshot)

/**
 * Merges a variant's override onto a slide.
 *
 * The slide is returned by identity when the variant overrides nothing for it,
 * so the common case allocates nothing and React sees the very same slide
 * object it always did. Only the fields the override actually names are
 * replaced, and the transform maps are copied per named layer rather than
 * shared, so a later edit to one variant can never reach back into the deck.
 */
export const resolveDeviceOverride = (
  slide: Slide,
  variant: Pick<OutputVariant, 'deviceOverrides'> | null | undefined,
): ResolvedDeviceOverride => {
  const override = findDeviceOverride(variant, slide.id)
  if (!override) return { slide, override: null }

  const updates: Partial<Slide> = {}
  for (const field of OVERRIDABLE_DEVICE_FIELDS) {
    const value = override[field]
    if (value !== undefined) (updates as Record<string, unknown>)[field] = value
  }

  if (override.layerTransforms) {
    const layerTransforms: LayerTransforms = { ...slide.layerTransforms }
    for (const layerId of slideLayerIds) {
      const transform = override.layerTransforms[layerId]
      // Copied per layer, never shared with the deck, so a later edit to the
      // variant cannot move the slide.
      if (transform) layerTransforms[layerId] = { ...transform }
    }
    updates.layerTransforms = layerTransforms
  }

  if (override.screenshot?.dataUrl) {
    updates.screenshot = override.screenshot.dataUrl
    updates.screenshotName = override.screenshot.name
  }

  /*
   * A device frame the catalog does not have is resolved to a current one here,
   * so a stale spelling cannot reach the renderer. The validator reports the
   * stored value separately, because quietly drawing a different device would be
   * worse than refusing the document.
   */
  if (updates.deviceFrameId !== undefined) {
    updates.deviceFrameId = resolveDeviceFrameId(updates.deviceFrameId)
  }
  if (updates.screenshotFit !== undefined) {
    updates.screenshotFit = resolveScreenshotFit(updates.screenshotFit)
  }

  return { slide: { ...slide, ...updates }, override }
}

/**
 * The render list for one variant.
 *
 * Deck order is preserved and slides the variant does not name are skipped, so a
 * variant that renders two of five slides still reports those two by their real
 * 1-based deck positions.
 */
export const expandVariantRenders = (
  slides: readonly Slide[],
  variant: Pick<OutputVariant, 'slideIds' | 'deviceOverrides'>,
): VariantRender[] => {
  if (!Array.isArray(variant.slideIds)) return []
  const wanted = new Set(variant.slideIds)
  const renders: VariantRender[] = []
  slides.forEach((slide, index) => {
    if (!wanted.has(slide.id)) return
    const { slide: merged, override } = resolveDeviceOverride(slide, variant)
    renders.push({
      slideNumber: index + 1,
      sourceSlide: slide,
      slide: merged,
      override,
      missingCapture: !hasVariantCapture(slide, override),
    })
  })
  return renders
}

/**
 * Brings every variant's `slideIds` back in step with the deck it renders.
 *
 * The bug this exists to prevent
 * -----------------------------
 * `slideIds` is a reference set, which is the right design: copying slides per
 * device would inflate `slides` and break every 1-based position that preflight,
 * the ZIP numbering, and the "open this slide" affordances read. But a reference
 * set is only useful while it is *current*, and nothing maintained it. Creating a
 * variant snapshotted the deck's ids; adding a slide afterwards updated `slides`
 * and nothing else, so the new slide joined no variant and the export plan — which
 * faithfully renders what the variants name — silently omitted it.
 *
 * Measured on a ten-slide deck with three variants: three manifest rows instead of
 * thirty, no warning, and a manifest that looked complete because it only listed
 * the three files it was going to write.
 *
 * The rule
 * --------
 * A variant covers the whole deck, so after a reconcile its `slideIds` is the
 * deck's id list in deck order. That single statement covers both broken halves:
 *
 *  - A slide the deck gained is added, so it stops being silently omitted from
 *    every variant's export. A slide a variant has no override for renders
 *    exactly as the deck renders it, so including it costs nothing and changes no
 *    pixels.
 *  - An id the deck no longer has is dropped. A dangling id is not a subset, it is
 *    a reference to something absent, and the document validator rejects it — so a
 *    deleted slide would otherwise turn a valid project into an invalid one.
 *
 * Deck order is not negotiable: every 1-based number in the product is a deck
 * position, and `expandVariantRenders` reports a variant's slides by their real
 * deck positions.
 *
 * Why full coverage rather than opt-in: there is no control anywhere in the
 * editor that narrows a variant to a subset of slides, so a subset is not
 * authorable. Opting in per slide would leave the common case — add a slide,
 * export, quietly miss it — as the default. If a subset is ever wanted it should
 * be an explicit control, not the absence of an update.
 *
 * Returns the same array reference when nothing needed changing, so a caller can
 * use identity to skip a commit. That is what keeps an unedited deck byte
 * identical, and what stops every keystroke in a name field rewriting every
 * variant.
 */
export const reconcileVariantSlideIds = (
  slides: readonly Slide[],
  variants: OutputVariant[] | undefined,
): OutputVariant[] | undefined => {
  if (!variants || variants.length === 0) return variants

  const deckIds = slides.map((slide) => slide.id)
  const alreadyCurrent = (variant: OutputVariant) => {
    const ids = Array.isArray(variant.slideIds) ? variant.slideIds : []
    return ids.length === deckIds.length && ids.every((id, index) => id === deckIds[index])
  }

  if (variants.every(alreadyCurrent)) return variants
  return variants.map((variant) => (
    // `deckIds` is copied per variant, never shared between them. A variant is a
    // reference set of *slides* — that is the point, and duplicating the slides
    // would break every 1-based deck position — but the id list itself is an
    // ordinary mutable array, and handing the same instance to every variant
    // would let a later in-place edit to one reach silently into the others.
    // `createDefaultOutputVariant` copies for the same reason.
    alreadyCurrent(variant) ? variant : { ...variant, slideIds: [...deckIds] }
  ))
}

/** The enabled variants that target one profile, in document order. */
export const enabledVariantsForProfile = (
  variants: readonly OutputVariant[],
  profileId: ExportProfileId,
): OutputVariant[] => variants.filter((variant) => variant.enabled && variant.exportProfileId === profileId)

/** Every variant that targets one profile, enabled or not, in document order. */
export const variantsForProfile = (
  variants: readonly OutputVariant[],
  profileId: ExportProfileId,
): OutputVariant[] => variants.filter((variant) => variant.exportProfileId === profileId)

/**
 * Whether a profile can be written out as-is.
 *
 * A profile is `ready` only when **every enabled variant targeting it** is
 * complete. The status used to be `slides.every(s => s.screenshot)` over the
 * base deck, which reported a profile as ready while a variant with no capture
 * was quietly exporting a placeholder.
 */
export const isProfileReadyForVariants = (
  slides: readonly Slide[],
  variants: readonly OutputVariant[],
  profileId: ExportProfileId,
  requiresScreenshot: boolean,
): boolean => findIncompleteVariant(slides, variants, profileId, requiresScreenshot) === null

/**
 * The first enabled variant that is not exportable, with the 1-based deck
 * positions that block it, or null.
 *
 * Deterministic by document order, so the same document always names the same
 * variant and the same slides in the gate message, the preflight list, and the
 * ZIP refusal.
 */
export const findIncompleteVariant = (
  slides: readonly Slide[],
  variants: readonly OutputVariant[],
  profileId: ExportProfileId,
  requiresScreenshot: boolean,
): { variant: OutputVariant; slideNumbers: number[] } | null => {
  for (const variant of enabledVariantsForProfile(variants, profileId)) {
    if (!requiresScreenshot) continue
    const slideNumbers = expandVariantRenders(slides, variant)
      .filter((render) => render.missingCapture)
      .map((render) => render.slideNumber)
    if (slideNumbers.length > 0) return { variant, slideNumbers }
  }
  return null
}

/** The device frames a variant names, in first-seen order, for the summary line. */
export const variantDeviceFrameIds = (variant: Pick<OutputVariant, 'deviceOverrides'>): DeviceFrameId[] => {
  const seen: DeviceFrameId[] = []
  for (const override of variant.deviceOverrides ?? []) {
    if (override?.deviceFrameId === undefined) continue
    const resolved = resolveDeviceFrameId(override.deviceFrameId)
    if (!seen.includes(resolved)) seen.push(resolved)
  }
  return seen
}

/**
 * A one-line summary for the Ship stage and the variant switcher.
 *
 * It states the frame count, the locale, and how the device differs, because
 * those are the three things that make one variant different from another and
 * the author is scanning a list rather than reading it.
 */
export const describeDeviceVariant = (variant: OutputVariant, renders?: number): string => {
  const parts: string[] = []
  if (typeof renders === 'number') parts.push(`${renders} slide${renders === 1 ? '' : 's'}`)
  parts.push(variant.locale)
  const devices = variantDeviceFrameIds(variant)
  const overrideCount = deviceOverrideCount(variant)
  if (overrideCount === 0) parts.push('deck device')
  else if (devices.length === 0) parts.push(`${overrideCount} customised`)
  else parts.push(devices.map((id) => getDeviceFramePreset(id).name).join(', '))
  return parts.join(' · ')
}

/**
 * The default variant: what a deck with no device variants serializes to, and
 * therefore the shape every project authored before this field already has.
 */
export const createDefaultOutputVariant = ({
  slideIds,
  locale,
  themeId,
  exportProfileId,
  id = DEFAULT_VARIANT_ID,
  name = DEFAULT_VARIANT_NAME,
}: {
  slideIds: string[]
  locale: LocaleId
  themeId: ThemeId
  exportProfileId: ExportProfileId
  id?: string
  name?: string
}): OutputVariant => ({
  id,
  name,
  canvasId: AUTHORING_CANVAS_ID,
  locale,
  themeId,
  slideIds: [...slideIds],
  enabled: true,
  exportProfileId,
})
