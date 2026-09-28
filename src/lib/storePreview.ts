/**
 * How a set reads in a store carousel, as a model a component can render.
 *
 * The store listing is a review surface, not a rule engine. The editor cannot
 * open a store carousel, so the one honest thing it can do is describe the
 * surface the way a person would describe it — how many images sit side by side
 * at the front, where the icon tile goes, how a long headline wraps — and then
 * report what this particular set actually contains. Every sentence in this
 * module is written to survive being wrong about a store and right about the
 * deck.
 *
 * The rows come from the export plan rather than from the deck, because the
 * capture a store would be shown is the one a variant merges in. A variant that
 * supplies a capture for a slide the deck has none for is a real case, and
 * reading the raw deck would report it as missing when the export has it.
 *
 * No React and no DOM, so the whole model is reachable from a test.
 */

import { getStoreListing, type StoreListing } from '../data'
import { exportEntryLocale } from './exportManifest'
import { exportEntryName, type ExportPlanFiles } from './exportPlan'
import { getSlideText } from './localization'
import { summarizeCapture } from './flowboardStages'
import type { ExportProfile, LocaleId, OutputVariant, Slide } from '../types'

/** The first line of a slide's headline, which is the line a tile leads with. */
export const storeHeadline = (slide: Slide, locale: LocaleId): string =>
  getSlideText(slide, locale).title.split('\n')[0].trim()

/** One image as the carousel would show it. */
export interface StorePreviewSlide {
  /** 1-based position in the authoring deck. */
  slideNumber: number
  slideId: string
  /** The name the bundle carries, so the tile and the file are one fact. */
  filename: string
  variantName: string
  hasCapture: boolean
  hasIcon: boolean
  /** Whether a device frame wraps the capture, which is what a tile shows. */
  framed: boolean
  headline: string
  headlineLength: number
  /** Whether this headline is longer than one line of this tile's shape. */
  wrapsHeadline: boolean
}

export interface StorePreview {
  profileId: string
  profileName: string
  width: number
  height: number
  dimensions: string
  /** The per-store copy, straight from the catalog beside `exportProfiles`. */
  listing: StoreListing
  leadingImages: number
  variantId: string
  variantName: string
  /** The locale the exported images are drawn in. */
  locale: LocaleId
  /** The tiles a carousel places side by side at the front. */
  leading: StorePreviewSlide[]
  /** Everything after them, in export order. */
  trailing: StorePreviewSlide[]
  slideCount: number
  captureCount: number
  iconCount: number
  /** Deck positions with no capture, which is what blocks a variant's export. */
  missingCaptureNumbers: number[]
  /** Deck positions that draw no icon. */
  missingIconNumbers: number[]
  /** The longest headline among the leading tiles, which is the one that wraps. */
  longestHeadline: { slideNumber: number; length: number } | null
}

export interface BuildStorePreviewInput {
  /** The files and the block. See `BuildExportManifestInput.plan` for why. */
  plan: ExportPlanFiles
  profile: ExportProfile
  /**
   * The deck's variants, in document order. Read for one thing only: the locale
   * the exported images are drawn in, which is the variant's rather than the
   * editor's, so the headline this model measures is the headline a reader of
   * that store would actually see.
   */
  variants: readonly OutputVariant[]
  /** The editor's active locale, the fallback for a variant that names none. */
  locale: LocaleId
  /**
   * Which variant's set to describe. A two-variant deck writes two sets, and
   * describing both at once would be describing neither, so the caller names one
   * and this defaults to the first one the plan writes.
   */
  variantId?: string
}

/** The first variant the plan writes, in plan order. */
const firstPlannedVariantId = (entries: ExportPlanFiles['entries']): string => {
  for (const entry of entries) return entry.variantId
  return ''
}

/**
 * The store-listing model for one variant's exported set.
 *
 * Reads the plan, so the capture, the icon, and the filename are the ones the
 * export will really use, and the headline is read in the locale the export will
 * really draw it in.
 */
export const buildStorePreview = ({
  plan,
  profile,
  variants,
  locale,
  variantId,
}: BuildStorePreviewInput): StorePreview => {
  const listing = getStoreListing(profile)
  const wantedId = variantId ?? firstPlannedVariantId(plan.entries)
  const entries = plan.entries.filter((entry) => entry.variantId === wantedId)
  /*
   * The locale is resolved before any headline is read, because a Spanish
   * variant writes a Spanish image: measuring the English copy while showing a
   * Spanish tile would be reporting the length of something nobody sees.
   */
  const entryLocale = exportEntryLocale({ variantId: wantedId }, variants, locale)
  const rows: StorePreviewSlide[] = entries.map((entry) => {
    const headline = storeHeadline(entry.slide, entryLocale)
    return {
      slideNumber: entry.slideNumber,
      slideId: entry.slideId,
      filename: exportEntryName(profile.id, entry.variantName, entry.slideNumber),
      variantName: entry.variantName,
      hasCapture: Boolean(entry.slide.screenshot),
      hasIcon: Boolean(entry.slide.appIcon) && entry.slide.layerSettings['app-icon'].visible,
      framed: summarizeCapture(entry.slide).framed,
      headline,
      headlineLength: headline.length,
      wrapsHeadline: headline.length > listing.headlineReference,
    }
  })

  const leading = rows.slice(0, listing.leadingImages)
  const trailing = rows.slice(listing.leadingImages)
  let longestHeadline: StorePreview['longestHeadline'] = null
  for (const row of leading) {
    if (!longestHeadline || row.headlineLength > longestHeadline.length) {
      longestHeadline = { slideNumber: row.slideNumber, length: row.headlineLength }
    }
  }

  const first = entries[0]
  return {
    profileId: profile.id,
    profileName: profile.name,
    width: profile.width,
    height: profile.height,
    dimensions: `${profile.width} × ${profile.height}`,
    listing,
    leadingImages: listing.leadingImages,
    variantId: first?.variantId ?? '',
    variantName: first?.variantName ?? '',
    locale: entryLocale,
    leading,
    trailing,
    slideCount: rows.length,
    captureCount: rows.filter((row) => row.hasCapture).length,
    iconCount: rows.filter((row) => row.hasIcon).length,
    missingCaptureNumbers: rows.filter((row) => !row.hasCapture).map((row) => row.slideNumber),
    missingIconNumbers: rows.filter((row) => !row.hasIcon).map((row) => row.slideNumber),
    longestHeadline,
  }
}

/**
 * The one line about capture completeness, in words.
 *
 * A count, not a verdict: the deck might legitimately export a feature graphic
 * with no capture at all, so this says what is there rather than whether it is
 * enough.
 */
export const storePreviewCapturesLine = (preview: StorePreview): string => {
  if (preview.slideCount === 0) return 'No images are planned for this target yet.'
  const have = `${preview.captureCount} of ${preview.slideCount} image${preview.slideCount === 1 ? '' : 's'} ${
    preview.captureCount === 1 ? 'has' : 'have'} a capture`
  if (preview.missingCaptureNumbers.length === 0) return `All ${preview.slideCount} images have a capture.`
  const missing = preview.missingCaptureNumbers
  const where = missing.length === 1
    ? `Slide ${missing[0]} has none.`
    : `Slides ${missing.join(', ')} have none.`
  return `${have}. ${where}`
}
