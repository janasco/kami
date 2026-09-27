/**
 * What an export will write, written down before anything renders.
 *
 * The export plan already decides the entries and mints their filenames. This
 * module turns that plan into a manifest a person can read and a program can
 * compare: one row per file, carrying the store profile, the device variant, the
 * deck position, the slide, the output name, the pixel size, and the locale the
 * PNG is drawn in.
 *
 * It is **derived, not stored.** Nothing here is persisted, so there is no field
 * to migrate, no version to move, and no way for a manifest saved today to
 * disagree with the plan the export is built from. A manifest is a question asked
 * of the plan, and the plan is the same object the export iterates.
 *
 * The load-bearing property is the one that makes it useful rather than
 * decorative: **the manifest must reconcile exactly against the real ZIP** —
 * same count, same names, same order. It is written from the plan before a
 * single pixel exists, and the archive that comes back out of the ZIP writer has
 * to match it entry for entry. If it does not, the thing the author was shown
 * before pressing Export was not the thing that was written, and
 * `reconcileExportManifest` is how that is detected rather than discovered later.
 *
 * No React and no DOM, so the whole thing is reachable from a test.
 */

import { exportEntryName, type ExportEntry, type ExportPlan } from './exportPlan'
import type { ExportProfile, LocaleId, OutputVariant } from '../types'

/** One file the export will write, described the way a person reads it. */
export interface ExportManifestEntry {
  /** The profile **id**, because that is what the filename carries. */
  profileId: string
  /** The profile's display name, for a person. */
  profileName: string
  variantId: string
  variantName: string
  /** 1-based position in the authoring deck, not in the variant. */
  slideNumber: number
  slideId: string
  /** The name the bundle will carry, minted by the same one function. */
  filename: string
  width: number
  height: number
  /** `width × height`, for a table cell that reads as one value. */
  dimensions: string
  /**
   * The locale this file is drawn in.
   *
   * That is the variant's own locale, not the editor's: a Spanish variant
   * writes a Spanish PNG while the author is reading English on the canvas. The
   * editor's locale is the fallback for a variant that names none, which is the
   * same fallback the export stage applies when it renders a node.
   */
  locale: LocaleId
}

export interface ExportManifest {
  profileId: string
  profileName: string
  width: number
  height: number
  /** The locale the editor itself is showing. Not what a row is drawn in. */
  editorLocale: LocaleId
  entries: ExportManifestEntry[]
  /** The refusal a blocked variant produces, carried so a surface can state it. */
  blocked: ExportPlan['blocked']
}

export interface BuildExportManifestInput {
  plan: ExportPlan
  profile: ExportProfile
  /**
   * The deck's variants, in document order. Only the locale is read from them;
   * everything else a row carries comes from the plan, which already merged the
   * variant's device override into the slide.
   */
  variants: readonly OutputVariant[]
  /** The editor's active locale: the fallback for a variant that names none. */
  locale: LocaleId
}

/**
 * The locale one entry renders in, resolved exactly as the export stage resolves
 * it: the variant's own locale, falling back to the editor's.
 *
 * Kept as its own function so the manifest and `ExportSlides` cannot drift — a
 * row that claims one locale while the PNG is drawn in another is precisely the
 * kind of quiet disagreement this module exists to prevent.
 */
export const exportEntryLocale = (
  entry: Pick<ExportEntry, 'variantId'>,
  variants: readonly OutputVariant[],
  fallback: LocaleId,
): LocaleId =>
  variants.find((variant) => variant.id === entry.variantId)?.locale ?? fallback

/** The manifest for one profile's plan, in the order the files are written. */
export const buildExportManifest = ({
  plan,
  profile,
  variants,
  locale,
}: BuildExportManifestInput): ExportManifest => ({
  profileId: profile.id,
  profileName: profile.name,
  width: profile.width,
  height: profile.height,
  editorLocale: locale,
  blocked: plan.blocked,
  entries: plan.entries.map((entry) => ({
    profileId: profile.id,
    profileName: profile.name,
    variantId: entry.variantId,
    variantName: entry.variantName,
    slideNumber: entry.slideNumber,
    slideId: entry.slideId,
    filename: exportEntryName(profile.id, entry.variantName, entry.slideNumber),
    width: profile.width,
    height: profile.height,
    dimensions: `${profile.width} × ${profile.height}`,
    locale: exportEntryLocale(entry, variants, locale),
  })),
})

/** The names every file will carry, in order. The ZIP reader's whole job. */
export const exportManifestNames = (manifest: ExportManifest): string[] =>
  manifest.entries.map((entry) => entry.filename)

export interface ManifestReconciliation {
  ok: boolean
  expected: number
  written: number
  /** In the manifest, absent from the bundle. */
  missing: string[]
  /** In the bundle, absent from the manifest. */
  unexpected: string[]
  /**
   * In both, at a different index.
   *
   * Reported separately from `missing` because a reordered bundle is a different
   * fault from an incomplete one: every file is there, and only the sequence is
   * wrong. Folding it into `missing` would report a file as absent when it is
   * present, which is the kind of false alarm that teaches an author to ignore
   * this check.
   */
  outOfOrder: string[]
}

/**
 * Compares a manifest against the names a real archive ended up holding.
 *
 * Deliberately takes plain strings rather than a `JSZip`, so it is a comparison
 * of two lists and not a second ZIP reader: the test supplies the names read back
 * out of a genuinely generated archive, and this function only has to be honest
 * about the difference. It reads both manifests and never mutates either.
 */
export const reconcileExportManifest = (
  manifest: ExportManifest,
  written: readonly string[],
): ManifestReconciliation => {
  const expected = exportManifestNames(manifest)
  const missing = expected.filter((name) => !written.includes(name))
  const unexpected = written.filter((name) => !expected.includes(name))
  const outOfOrder = expected.filter((name, index) => written.includes(name) && written.indexOf(name) !== index)

  return {
    ok: missing.length === 0
      && unexpected.length === 0
      && outOfOrder.length === 0
      && expected.length === written.length,
    expected: expected.length,
    written: written.length,
    missing,
    unexpected,
    outOfOrder,
  }
}
