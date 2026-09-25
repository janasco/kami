import type { LocaleId, Slide } from '../types'

export interface SlideText {
  title: string
  subtitle: string
  isTitleTranslated: boolean
  isSubtitleTranslated: boolean
}

export function getSlideText(slide: Slide, locale: LocaleId): SlideText {
  if (locale === 'en-US') {
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

export const translationFieldLabel = (field: 'title' | 'subtitle') =>
  field === 'title' ? 'headline' : 'supporting text'
