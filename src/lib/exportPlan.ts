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
 * No DOM and no React, so every part of that is reachable from a test.
 */

import { expandVariantRenders, findIncompleteVariant } from './deviceVariants'
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

export interface ExportPlan {
  entries: ExportEntry[]
  /** The variant that refuses to export, with the deck positions that block it. */
  blocked: { variantId: string; variantName: string; slideNumbers: number[] } | null
}

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
  }
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

/** Lowercase, hyphenated, ASCII. Shared with the project ZIP name. */
const slug = (value: string): string => {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'variant'
}
