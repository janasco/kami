/**
 * Translation matrix for the Story stage.
 *
 * The editor stores localized copy on each slide (`Slide.translations`) and
 * already resolves a locale to readable text with `getSlideText`. This module
 * only reads that data and shapes it as a grid: one row per beat, one column
 * per supported locale, and one entry per translatable text field.
 *
 * Nothing here is serialized. The matrix is a read model over slides the
 * project already carries, so saving, validation, templates, and the project
 * document are untouched by showing it.
 */

import { localeOptions } from '../data'
import {
  DEFAULT_SLIDE_LOCALE,
  getSlideText,
  slideTextFieldLabel,
  type SlideTextField,
} from './localization'
import type { LocaleId, LocaleOption, Slide } from '../types'

/** The two fields a cell can report on, in the order the editor shows them. */
export const TRANSLATION_FIELDS: readonly SlideTextField[] = ['title', 'subtitle'] as const

/** Identifies one cell of the matrix: a beat and a locale. */
export interface TranslationCellRef {
  slideId: string
  locale: LocaleId
}

export interface TranslationFieldState {
  field: SlideTextField
  /** `Headline` or `Supporting text`. */
  label: string
  /** Copy for this field in this locale, with the English fallback applied. */
  value: string
  /** The slide carries its own copy for this field in this locale. */
  translated: boolean
  /**
   * True when the deck never needed a translation for this field, for example
   * supporting text on a beat that has none in the source locale.
   */
  optional: boolean
}

export interface TranslationCell {
  slideId: string
  /** 1-based deck position, used in labels and announcements. */
  slideNumber: number
  locale: LocaleId
  label: string
  direction: LocaleOption['direction']
  /** True for the locale the deck is authored in. */
  isSourceLocale: boolean
  fields: TranslationFieldState[]
  /** Required fields with no copy of their own, empty when the cell is done. */
  missingFields: SlideTextField[]
  complete: boolean
}

export interface TranslationRow {
  slideId: string
  slideNumber: number
  /** Source-locale headline, used as the row header. */
  headline: string
  /** Source-locale supporting copy, empty when the beat has none. */
  supporting: string
  cells: TranslationCell[]
  /** Every locale of this beat has every required field. */
  complete: boolean
}

export interface TranslationMatrix {
  sourceLocale: LocaleId
  locales: LocaleOption[]
  rows: TranslationRow[]
  slideCount: number
  /** Beats that are complete in every locale. */
  completeSlides: number
  /** Fields the deck carries, one per slide, locale, and required field. */
  fieldTotal: number
  translatedFields: number
  /** Required fields still missing anywhere in the deck. */
  missingFields: number
  complete: boolean
  /** `3/3 slides · 6/18 fields translated`. */
  summary: string
}

/** Stable key for one cell, used for React keys and for the open-cell state. */
export const translationCellKey = (slideId: string, locale: LocaleId): string => `${slideId}::${locale}`

/** True when both refs point at the same beat and locale. */
export const isSameTranslationCell = (
  a: TranslationCellRef | null,
  b: TranslationCellRef | null,
): boolean => Boolean(a) && Boolean(b) && a?.slideId === b?.slideId && a?.locale === b?.locale

/** Human name of a locale, falling back to the id for an unknown one. */
export const translationLocaleLabel = (locale: LocaleId): string =>
  localeOptions.find((option) => option.id === locale)?.label ?? locale

/** Text direction of a locale, defaulting to left-to-right. */
export const translationLocaleDirection = (locale: LocaleId): LocaleOption['direction'] =>
  localeOptions.find((option) => option.id === locale)?.direction ?? 'ltr'

/**
 * Whether a field is expected at all for a slide.
 *
 * The headline is always expected, because an empty one is a story gap the
 * Story stage already flags. Supporting copy is only expected when the source
 * locale has some, so a headline-only deck is not shown as permanently behind.
 */
export const isRequiredTranslationField = (slide: Slide, field: SlideTextField): boolean =>
  field === 'title' || slide.subtitle.trim().length > 0

const readField = (slide: Slide, locale: LocaleId, field: SlideTextField): TranslationFieldState => {
  const text = getSlideText(slide, locale)
  const value = field === 'title' ? text.title : text.subtitle
  const hasLocaleCopy = field === 'title' ? text.isTitleTranslated : text.isSubtitleTranslated
  // `getSlideText` always reports the source locale as translated, so a beat
  // with no headline written yet is the only gap that lives there.
  const translated = locale === DEFAULT_SLIDE_LOCALE
    ? value.trim().length > 0
    : hasLocaleCopy

  return {
    field,
    label: slideTextFieldLabel(field),
    value,
    translated,
    optional: !isRequiredTranslationField(slide, field),
  }
}

const buildCell = (slide: Slide, slideNumber: number, locale: LocaleId): TranslationCell => {
  const fields = TRANSLATION_FIELDS.map((field) => readField(slide, locale, field))
  const missingFields = fields
    .filter((state) => state.optional === false && !state.translated)
    .map((state) => state.field)

  return {
    slideId: slide.id,
    slideNumber,
    locale,
    label: translationLocaleLabel(locale),
    direction: translationLocaleDirection(locale),
    isSourceLocale: locale === DEFAULT_SLIDE_LOCALE,
    fields,
    missingFields,
    complete: missingFields.length === 0,
  }
}

/** The compact headline number, for example `3/3 slides · 6/18 fields translated`. */
export const formatTranslationCompletion = (counts: {
  slideCount: number
  completeSlides: number
  translatedFields: number
  fieldTotal: number
}): string =>
  `${counts.completeSlides}/${counts.slideCount} slides · ${counts.translatedFields}/${counts.fieldTotal} fields translated`

/**
 * Builds the whole grid, plus the completion counts the panel summarises.
 *
 * The counts follow the same rule as export preflight: a field counts once it
 * holds its own copy, and a field the deck never needed is left out of the
 * total. A 3-beat deck whose beats all carry supporting copy therefore reports
 * 18 fields, of which 6 are the source locale.
 */
export const buildTranslationMatrix = (slides: readonly Slide[]): TranslationMatrix => {
  const locales = localeOptions
  let fieldTotal = 0
  let translatedFields = 0
  let completeSlides = 0

  const rows = slides.map((slide, index) => {
    const slideNumber = index + 1
    const cells = locales.map((option) => buildCell(slide, slideNumber, option.id))
    const complete = cells.every((cell) => cell.complete)

    cells.forEach((cell) => {
      cell.fields.forEach((state) => {
        if (state.optional) return
        fieldTotal += 1
        if (state.translated) translatedFields += 1
      })
    })
    if (complete) completeSlides += 1

    const sourceText = getSlideText(slide, DEFAULT_SLIDE_LOCALE)
    return {
      slideId: slide.id,
      slideNumber,
      headline: sourceText.title,
      supporting: sourceText.subtitle,
      cells,
      complete,
    }
  })

  return {
    sourceLocale: DEFAULT_SLIDE_LOCALE,
    locales,
    rows,
    slideCount: slides.length,
    completeSlides,
    fieldTotal,
    translatedFields,
    missingFields: fieldTotal - translatedFields,
    complete: fieldTotal > 0 && fieldTotal === translatedFields,
    summary: formatTranslationCompletion({
      slideCount: slides.length,
      completeSlides,
      translatedFields,
      fieldTotal,
    }),
  }
}

/** Per-field wording used inside a cell, for badges and screen readers. */
export const describeTranslationField = (state: TranslationFieldState): string => {
  if (state.optional) return `${state.label} not used on this beat`
  return state.translated ? `${state.label} translated` : `${state.label} missing`
}

/** One-cell summary, for the cell's accessible name. */
export const describeTranslationCellText = (cell: TranslationCell): string => {
  const parts = cell.fields.map(describeTranslationField)
  const localeNote = cell.isSourceLocale
    ? 'source language'
    : cell.direction === 'rtl'
      ? 'right-to-left'
      : 'left-to-right'
  return `Slide ${cell.slideNumber}, ${cell.label} (${localeNote}): ${parts.join(', ')}`
}

/** Deck-level sentence for the polite live region beside the summary. */
export const describeTranslationMatrixText = (matrix: TranslationMatrix): string => {
  if (matrix.slideCount === 0) return 'The deck has no beats to translate yet.'
  const scope = `Source language ${matrix.sourceLocale}.`
  if (matrix.missingFields === 0) {
    return `${matrix.summary}. Every field in every locale has its own copy. ${scope}`
  }
  return `${matrix.summary}. ${matrix.missingFields} field${matrix.missingFields === 1 ? '' : 's'} still fall back to the source language. ${scope}`
}

/** Deck numbers whose cells still miss a required field, for the stage hint. */
export const collectIncompleteSlideNumbers = (matrix: TranslationMatrix): number[] =>
  matrix.rows.filter((row) => !row.complete).map((row) => row.slideNumber)
