import type { LocaleId, Slide } from '../types'

/** The two text fields a slide carries in every locale. */
export type SlideTextField = 'title' | 'subtitle'

/**
 * The locale the deck is authored in. Its copy is the project source text, so
 * it is never reported as a missing translation.
 */
export const DEFAULT_SLIDE_LOCALE: LocaleId = 'en-US'

export interface SlideText {
  title: string
  subtitle: string
  isTitleTranslated: boolean
  isSubtitleTranslated: boolean
}

export function getSlideText(slide: Slide, locale: LocaleId): SlideText {
  if (locale === DEFAULT_SLIDE_LOCALE) {
    return {
      title: slide.title,
      subtitle: slide.subtitle,
      isTitleTranslated: true,
      isSubtitleTranslated: true,
    }
  }

  const translation = slide.translations?.[locale]
  const hasTitleTranslation = typeof translation?.title === 'string' && translation.title.length > 0
  return {
    title: hasTitleTranslation ? (translation?.title as string) : slide.title,
    subtitle: typeof translation?.subtitle === 'string' ? translation.subtitle : slide.subtitle,
    isTitleTranslated: hasTitleTranslation,
    isSubtitleTranslated: typeof translation?.subtitle === 'string',
  }
}

export const translationFieldLabel = (field: SlideTextField) =>
  field === 'title' ? 'headline' : 'supporting text'

/** Field label as it reads at the start of a sentence, for headings. */
export const slideTextFieldLabel = (field: SlideTextField) =>
  field === 'title' ? 'Headline' : 'Supporting text'

/**
 * Writes one text field for one locale and returns the same slide object when
 * nothing would change.
 *
 * Returning the identical reference is what lets the editor skip a commit, so
 * both the Inspector and the Story translation matrix share one rule: the
 * source locale edits the slide fields and mirrors them into `translations`,
 * every other locale only ever writes its own entry. A field written to the
 * empty string stays stored, which is how a translation is deliberately
 * cleared.
 */
export function applySlideTextUpdate(
  slide: Slide,
  locale: LocaleId,
  field: SlideTextField,
  value: string,
): Slide {
  if (locale === DEFAULT_SLIDE_LOCALE) {
    if (slide[field] === value && slide.translations?.[locale]?.[field] === value) return slide
    return {
      ...slide,
      [field]: value,
      translations: {
        ...slide.translations,
        [locale]: { ...slide.translations?.[locale], [field]: value },
      },
    }
  }

  if (slide.translations?.[locale]?.[field] === value) return slide
  return {
    ...slide,
    translations: {
      ...slide.translations,
      [locale]: { ...slide.translations?.[locale], [field]: value },
    },
  }
}

/**
 * Applies {@link applySlideTextUpdate} across a deck.
 *
 * The Inspector edits the active slide in the active locale while the Story
 * translation matrix can edit any beat in any locale, and both need the same
 * rule, the same reference behaviour, and therefore the same undo step. A write
 * that changes nothing returns the same array so the editor can skip a commit.
 */
export function applySlideTextUpdateToSlides(
  slides: Slide[],
  slideId: string,
  locale: LocaleId,
  field: SlideTextField,
  value: string,
): Slide[] {
  let changed = false
  const nextSlides = slides.map((slide) => {
    if (slide.id !== slideId) return slide
    const next = applySlideTextUpdate(slide, locale, field, value)
    if (next === slide) return slide
    changed = true
    return next
  })
  return changed ? nextSlides : slides
}
