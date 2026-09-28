/**
 * What one export actually writes, decided before anything is rendered.
 *
 * The export iterates enabled variants and then the slides each variant names,
 * so a two-variant deck produces two renders of every slide. That list is the
 * single source for three things that must never disagree: the export stage
 * nodes, the ZIP entry names, and the store preview the author is shown before
 * pressing Export.
 *
 * Two rules are load-bearing:
 *
 * - **A variant with a missing capture blocks that variant's export.** A
 *   placeholder PNG reaches a store review and is a rejection there, and it is
 *   indistinguishable from a finished slide once it is in the bundle.
 * - **The filename is minted here and only here.** The scheme is
 *   `<profile>--<variant>--slide-NN.png`, because a bundle with two device
 *   variants cannot carry two files both called `slide-01.png`, and the store
 *   preview is only useful if the name in it is the name in the ZIP.
 *
 * A third rule is about the refusal channels, and it is the one that was missing:
 *
 * - **An empty plan must name why it is empty, on every route to emptiness.**
 *   `blocked` is computed by iterating the enabled variants for the profile, so
 *   it can only ever speak about a variant. A plan with no variants — or with
 *   variants that name no slide, or none switched on — has no variant to blame,
 *   and `blocked` came back `null`. The refusal channel and the emptiness
 *   channel were the same channel, and they were silent exactly when they were
 *   needed: the export wrote an empty ZIP and reported success, with a green ✓
 *   on the review row and an enabled Export button. So emptiness gets its own
 *   field, `unassigned`, and it is set whenever `entries` is empty.
 *
 * No DOM and no React, so every part of that is reachable from a test.
 */

import { exportProfiles } from '../data'
import {
  enabledVariantsForProfile,
  expandVariantRenders,
  findIncompleteVariant,
  variantsForProfile,
} from './deviceVariants'
import type { OutputVariant, Slide } from '../types'

/** One file the export will write. */
export interface ExportEntry {
  variantId: string
  variantName: string
  /** 1-based position in the authoring deck, not in the variant. */
  slideNumber: number
  slideId: string
  /** The slide with the variant's override merged on. What the renderer draws. */
  slide: Slide
}

/**
 * Why a plan has nothing in it.
 *
 * A named union rather than a free-form note, so a surface can branch on the
 * reason and so a new route to an empty plan cannot be added without a sentence
 * for it. The four reasons are the four ways the two filters below can both come
 * out empty while the deck still has slides.
 */
export type ExportPlanUnassignedReason =
  /** The deck itself has no slides, so there is nothing for any variant to name. */
  | 'no-slides'
  /** Nothing in the document targets the selected store target. */
  | 'no-variant-for-profile'
  /** Every variant that targets the selected store target is turned off. */
  | 'all-variants-disabled'
  /** An enabled variant names no slide the deck has: no ids, or none of them. */
  | 'variant-names-no-slides'

export interface ExportPlanUnassigned {
  reason: ExportPlanUnassignedReason
  /**
   * The store target the author has selected, in both spellings.
   *
   * The name is carried because the sentence is read by a person, and "targets
   * `google-play`" is not a sentence a person can act on.
   */
  profileId: string
  profileName: string
  /**
   * The variant to point the author at, when the reason is about one.
   *
   * Null for the two reasons that are not about a variant: an empty deck, and a
   * store target nothing aims at.
   */
  variantId: string | null
  variantName: string | null
}

export interface ExportPlan {
  entries: ExportEntry[]
  /** The variant that refuses to export, with the deck positions that block it. */
  blocked: { variantId: string; variantName: string; slideNumbers: number[] } | null
  /**
   * Why the plan has nothing in it, when it has nothing in it.
   *
   * `null` exactly when `entries` is not empty. The two are the same fact read
   * from opposite ends, and a plan cannot be empty without saying which of the
   * four routes emptied it.
   *
   * Never both set with `blocked`: an empty plan has no variant for `blocked` to
   * name, because the two are computed from the same filter and an empty filter
   * has no first element.
   */
  unassigned: ExportPlanUnassigned | null
}

/**
 * The part of a plan the manifest and the store preview read.
 *
 * Named rather than widened in place, because the refusals are what the *export*
 * and the *gate* read. The two derived surfaces ask a different question — which
 * files — and no files is a legitimate manifest of nothing there, not a failure
 * to explain. So they take the two fields they use and cannot be handed a plan
 * whose emptiness nobody stated.
 */
export type ExportPlanFiles = Pick<ExportPlan, 'entries' | 'blocked'>

export interface PlanExportEntriesInput {
  slides: readonly Slide[]
  variants: readonly OutputVariant[]
  profileId: OutputVariant['exportProfileId']
  /**
   * Whether the profile requires a capture on every render. A feature graphic
   * does not, so a deck of text-only slides is exportable to it.
   */
  requiresScreenshot: boolean
}

/**
 * The full export list for one profile: every enabled variant targeting it, each
 * with the slides it names, in document order then deck order.
 *
 * The order is the order the files are written and the order the store preview
 * lists them, so a change to either is visible in the other.
 */
export const planExportEntries = ({
  slides,
  variants,
  profileId,
  requiresScreenshot,
}: PlanExportEntriesInput): ExportPlan => {
  const entries: ExportEntry[] = []
  for (const variant of variants) {
    if (!variant.enabled || variant.exportProfileId !== profileId) continue
    for (const render of expandVariantRenders(slides, variant)) {
      entries.push({
        variantId: variant.id,
        variantName: variant.name,
        slideNumber: render.slideNumber,
        slideId: render.slide.id,
        slide: render.slide,
      })
    }
  }

  const incomplete = findIncompleteVariant(slides, variants, profileId, requiresScreenshot)
  return {
    entries,
    blocked: incomplete
      ? { variantId: incomplete.variant.id, variantName: incomplete.variant.name, slideNumbers: incomplete.slideNumbers }
      : null,
    // Set from the *result*, not from the inputs: the one question this field
    // answers is "did that loop write anything", and asking it here means a
    // route to emptiness nobody has thought of is still reported rather than
    // silently writing an empty bundle. `unassignedRefusal` is what names which
    // route it was.
    unassigned: entries.length === 0 ? unassignedRefusal({ slides, variants, profileId }) : null,
  }
}

/**
 * Why a plan with no entries has no entries, as data rather than as a throw.
 *
 * The four reasons are the four ways the plan's own filter can produce nothing
 * while the deck still has slides, and they are ordered from the most fundamental
 * to the most specific so the sentence names the thing the author has to change
 * first: an empty deck is empty before any variant is consulted, and a store
 * target nothing aims at is the answer before a variant's own slide list is.
 *
 * Deliberately exhaustive rather than defensive. This runs only when `entries`
 * came out empty, and every branch below is one way that can happen, so there is
 * no case in which it has nothing to report — a function that could return null
 * here would put the original bug back, one layer down.
 */
const unassignedRefusal = ({
  slides,
  variants,
  profileId,
}: {
  slides: readonly Slide[]
  variants: readonly OutputVariant[]
  profileId: OutputVariant['exportProfileId']
}): ExportPlanUnassigned => {
  const profileName = exportProfiles.find((profile) => profile.id === profileId)?.name ?? profileId
  const scope = { profileId, profileName, variantId: null, variantName: null }
  const forVariant = (variant: OutputVariant) => ({
    ...scope,
    variantId: variant.id,
    variantName: variant.name,
  })

  if (slides.length === 0) return { ...scope, reason: 'no-slides' }

  const targeting = variantsForProfile(variants, profileId)
  // Nothing aims at this store target at all. This is the reported route: the
  // author switched the store target, every variant kept its own, and the
  // profile filter matched nothing — so `blocked`, which iterates that same
  // filter, had no variant to name and reported no problem.
  if (targeting.length === 0) return { ...scope, reason: 'no-variant-for-profile' }

  const enabled = enabledVariantsForProfile(variants, profileId)
  // Every variant that does aim at it is switched off, which is a deliberate
  // state the author set and is easy to leave behind after choosing a target.
  if (enabled.length === 0) return { ...forVariant(targeting[0]), reason: 'all-variants-disabled' }

  // An enabled variant for this profile whose `slideIds` is not an array, is
  // empty, or names only slides the deck no longer has. The first such variant
  // is named, in document order, so the sentence points at one row of the
  // variant list rather than at the deck in general.
  return { ...forVariant(enabled[0]), reason: 'variant-names-no-slides' }
}

/**
 * The ZIP entry name for one file.
 *
 * `<profile>--<variant>--slide-NN.png`, with the profile id and the variant name
 * both reduced to a filename-safe slug. The profile id is used rather than the
 * profile display name because it is stable: renaming a profile in the catalog
 * must not change what a bundle written last month is called.
 */
export const exportEntryName = (profileId: string, variantName: string, slideNumber: number): string =>
  `${slug(profileId)}--${slug(variantName)}--slide-${String(slideNumber).padStart(2, '0')}.png`

/** The names of every file a plan will write, in order. */
export const exportEntryNames = (entries: readonly ExportEntry[], profileId: string): string[] =>
  entries.map((entry) => exportEntryName(profileId, entry.variantName, entry.slideNumber))

/**
 * The refusal a blocked variant produces.
 *
 * Thrown before anything is rendered, so a blocked variant cannot leave a
 * half-written bundle on disk with a placeholder inside it.
 */
export const variantExportRefusal = (blocked: NonNullable<ExportPlan['blocked']>): string => {
  const where = blocked.slideNumbers.length === 1
    ? `slide ${blocked.slideNumbers[0]}`
    : `slides ${blocked.slideNumbers.join(', ')}`
  return `The “${blocked.variantName}” variant has no capture on ${where}, so it was not exported. Add the capture or turn that variant off.`
}

/**
 * The refusal an empty plan produces, one sentence per reason.
 *
 * A sentence builder over a return value, like {@link variantExportRefusal} and
 * for the same reason: the plan states *what* is wrong as data, and this says it
 * in words, so no surface has to re-derive the wording and no two of them can
 * describe the same refusal differently.
 *
 * Every sentence ends in the thing the author can do about it, and every one says
 * the store target by name — the author changed a profile dropdown and has to be
 * told which target the export is now aimed at, or the sentence describes a
 * problem they cannot locate.
 */
export const unassignedExportRefusal = (unassigned: ExportPlanUnassigned): string => {
  const target = `“${unassigned.profileName}”`
  switch (unassigned.reason) {
    case 'no-slides':
      return 'This project has no slides, so there is nothing to export. Add a slide first.'
    case 'no-variant-for-profile':
      return `No device variant targets ${target}, so this export would write nothing. Point a variant at it, or switch the store target back to one a variant targets.`
    case 'all-variants-disabled':
      return `Every device variant for ${target} is turned off, so this export would write nothing. Turn one on, or switch the store target to a variant you want.`
    case 'variant-names-no-slides':
      return `The “${unassigned.variantName}” variant targets ${target} but names no slide in this project, so this export would write nothing. Give it the project’s slides, or turn it off.`
  }
}

/** Lowercase, hyphenated, ASCII. Shared with the project ZIP name. */
const slug = (value: string): string => {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'variant'
}
