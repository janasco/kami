import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { createDemoProject } from './demoProject'
import {
  applySlideTextUpdate,
  applySlideTextUpdateToSlides,
  getSlideText,
} from './localization'
import {
  buildTranslationMatrix,
  collectIncompleteSlideNumbers,
  describeTranslationCellText,
  describeTranslationField,
  describeTranslationMatrixText,
  formatTranslationCompletion,
  isRequiredTranslationField,
  isSameTranslationCell,
  translationCellKey,
  translationLocaleDirection,
} from './translationMatrix'
import { parseProjectDocument, serializeProject, type EditorProject } from './project'
import { validateProjectDocument } from './projectValidation'
import { createTestSlide } from '../test/projectFixtures'
import type { Slide } from '../types'

const makeSlide = (overrides: Partial<Slide> & { id: string }): Slide => ({
  ...createTestSlide(),
  title: 'Plan less.',
  subtitle: 'Three calm next steps.',
  ...overrides,
})

/**
 * Two beats: the first is fully translated into Spanish, the second carries a
 * headline only and has no Arabic copy anywhere.
 */
const partiallyTranslatedDeck = (): Slide[] => [
  makeSlide({
    id: 'beat-1',
    translations: {
      'es-ES': { title: 'Planea menos.', subtitle: 'Tres pasos tranquilos.' },
    },
  }),
  makeSlide({
    id: 'beat-2',
    title: 'Find your flow.',
    subtitle: '',
    translations: {
      'es-ES': { title: 'Encuentra tu flujo.' },
    },
  }),
]

const projectWith = (slides: Slide[]): EditorProject => ({
  name: 'Matrix project',
  slides,
  activeLocale: 'en-US',
  canvasMode: 'isolated',
  selectedExportProfileId: exportProfiles[0].id,
})

describe('translation matrix state', () => {
  it('has one row per beat and one column per supported locale', () => {
    const matrix = buildTranslationMatrix(partiallyTranslatedDeck())

    expect(matrix.locales.map((locale) => locale.id)).toEqual(['en-US', 'es-ES', 'ar-SA'])
    expect(matrix.rows.map((row) => row.slideId)).toEqual(['beat-1', 'beat-2'])
    expect(matrix.rows[1].slideNumber).toBe(2)
    expect(matrix.rows[1].headline).toBe('Find your flow.')
    expect(matrix.rows[1].cells).toHaveLength(3)
    expect(matrix.rows[0].cells.map((cell) => cell.locale)).toEqual(['en-US', 'es-ES', 'ar-SA'])
  })

  it('marks the source locale as translated and reports missing translations elsewhere', () => {
    const matrix = buildTranslationMatrix(partiallyTranslatedDeck())
    const [source, spanish, arabic] = matrix.rows[0].cells

    expect(source.isSourceLocale).toBe(true)
    expect(source.missingFields).toEqual([])
    expect(source.complete).toBe(true)

    expect(spanish.missingFields).toEqual([])
    expect(spanish.complete).toBe(true)
    expect(spanish.fields[0].value).toBe('Planea menos.')

    expect(arabic.direction).toBe('rtl')
    expect(arabic.missingFields).toEqual(['title', 'subtitle'])
    expect(arabic.complete).toBe(false)
    // The Arabic cell still offers the English copy as a read-only fallback.
    expect(arabic.fields[0].value).toBe('Plan less.')
  })

  it('does not ask for supporting copy a beat never had', () => {
    const slides = partiallyTranslatedDeck()
    const matrix = buildTranslationMatrix(slides)
    const spanishHeadlineOnly = matrix.rows[1].cells[1]

    expect(isRequiredTranslationField(slides[1], 'subtitle')).toBe(false)
    expect(isRequiredTranslationField(slides[1], 'title')).toBe(true)
    expect(isRequiredTranslationField(slides[0], 'subtitle')).toBe(true)
    expect(spanishHeadlineOnly.fields[1].optional).toBe(true)
    expect(spanishHeadlineOnly.missingFields).toEqual([])
    expect(spanishHeadlineOnly.complete).toBe(true)
  })

  it('treats an unwritten headline as a gap in the source locale too', () => {
    const matrix = buildTranslationMatrix([makeSlide({ id: 'empty', title: '   ' })])
    const source = matrix.rows[0].cells[0]

    expect(source.missingFields).toEqual(['title'])
    expect(source.complete).toBe(false)
    expect(matrix.completeSlides).toBe(0)
  })

  it('falls back to an unknown locale name and a left-to-right direction', () => {
    expect(translationLocaleDirection('ar-SA')).toBe('rtl')
    expect(translationLocaleDirection('en-US')).toBe('ltr')
  })

  it('compares open cells by beat and locale', () => {
    expect(isSameTranslationCell({ slideId: 'a', locale: 'es-ES' }, { slideId: 'a', locale: 'es-ES' })).toBe(true)
    expect(isSameTranslationCell({ slideId: 'a', locale: 'es-ES' }, { slideId: 'a', locale: 'ar-SA' })).toBe(false)
    expect(isSameTranslationCell(null, { slideId: 'a', locale: 'es-ES' })).toBe(false)
    expect(isSameTranslationCell(null, null)).toBe(false)
    expect(translationCellKey('a', 'es-ES')).toBe('a::es-ES')
  })
})

describe('translation completion', () => {
  it('counts every required field and leaves unused fields out of the total', () => {
    const matrix = buildTranslationMatrix(partiallyTranslatedDeck())

    // Beat 1 needs a headline and supporting copy in three locales, beat 2 only
    // a headline, so 6 + 3 = 9 fields. Six of them already hold their own copy.
    expect(matrix.fieldTotal).toBe(9)
    expect(matrix.translatedFields).toBe(6)
    expect(matrix.missingFields).toBe(3)
    expect(matrix.summary).toBe('0/2 slides · 6/9 fields translated')
    expect(collectIncompleteSlideNumbers(matrix)).toEqual([1, 2])
    expect(matrix.complete).toBe(false)
  })

  it('reports a three-beat deck of untranslated copy as 6 of 18 fields', () => {
    const matrix = buildTranslationMatrix(createDemoProject().slides)

    // Every demo beat carries supporting copy, so the grid is 3 beats × 3
    // locales × 2 fields, of which the 6 English fields are already written.
    expect(matrix.fieldTotal).toBe(18)
    expect(matrix.translatedFields).toBe(6)
    expect(matrix.summary).toBe('0/3 slides · 6/18 fields translated')
  })

  it('reports a fully translated deck as complete', () => {
    const slides = [
      makeSlide({
        id: 'beat-1',
        translations: {
          'es-ES': { title: 'Planea menos.', subtitle: 'Tres pasos tranquilos.' },
          'ar-SA': { title: 'خطِّط أقل.', subtitle: 'ثلاث خطوات هادئة.' },
        },
      }),
    ]
    const matrix = buildTranslationMatrix(slides)

    expect(matrix.translatedFields).toBe(6)
    expect(matrix.fieldTotal).toBe(6)
    expect(matrix.complete).toBe(true)
    expect(matrix.completeSlides).toBe(1)
    expect(collectIncompleteSlideNumbers(matrix)).toEqual([])
    expect(describeTranslationMatrixText(matrix)).toContain('Every field in every locale has its own copy')
  })

  it('handles an empty deck without dividing by zero', () => {
    const matrix = buildTranslationMatrix([])

    expect(matrix.slideCount).toBe(0)
    expect(matrix.fieldTotal).toBe(0)
    expect(matrix.complete).toBe(false)
    expect(matrix.summary).toBe('0/0 slides · 0/0 fields translated')
    expect(describeTranslationMatrixText(matrix)).toBe('The deck has no beats to translate yet.')
  })

  it('formats the completion headline and the field sentences', () => {
    expect(formatTranslationCompletion({
      slideCount: 6,
      completeSlides: 4,
      translatedFields: 8,
      fieldTotal: 18,
    })).toBe('4/6 slides · 8/18 fields translated')

    const matrix = buildTranslationMatrix(partiallyTranslatedDeck())
    const cell = matrix.rows[0].cells[2]
    expect(describeTranslationField(cell.fields[0])).toBe('Headline missing')
    expect(describeTranslationCellText(cell)).toBe(
      'Slide 1, العربية (السعودية) (right-to-left): Headline missing, Supporting text missing',
    )
    // Beat 2 has no supporting copy of its own, so the field is not expected.
    const headlineOnly = matrix.rows[1].cells[2]
    expect(describeTranslationField(headlineOnly.fields[1])).toBe('Supporting text not used on this beat')
    expect(describeTranslationCellText(headlineOnly)).toBe(
      'Slide 2, العربية (السعودية) (right-to-left): Headline missing, Supporting text not used on this beat',
    )
  })
})

describe('translation matrix writes', () => {
  it('writes the source locale into the slide fields and mirrors them', () => {
    const slide = applySlideTextUpdate(makeSlide({ id: 'beat-1' }), 'en-US', 'title', 'Plan less, calmly.')

    expect(slide.title).toBe('Plan less, calmly.')
    expect(slide.translations?.['en-US']?.title).toBe('Plan less, calmly.')
    expect(slide.subtitle).toBe('Three calm next steps.')
  })

  it('writes a translation without touching the source copy', () => {
    const slide = applySlideTextUpdate(makeSlide({ id: 'beat-1' }), 'es-ES', 'title', 'Planea menos.')

    expect(slide.title).toBe('Plan less.')
    expect(getSlideText(slide, 'es-ES').title).toBe('Planea menos.')
    expect(getSlideText(slide, 'en-US').title).toBe('Plan less.')
  })

  it('returns the same slide once a field already holds the value', () => {
    const slide = makeSlide({ id: 'beat-1' })
    // The first write of English copy also mirrors it into translations, which
    // is the behaviour the Inspector has always had.
    const mirrored = applySlideTextUpdate(slide, 'en-US', 'title', slide.title)
    expect(mirrored).not.toBe(slide)
    expect(applySlideTextUpdate(mirrored, 'en-US', 'title', slide.title)).toBe(mirrored)
    expect(applySlideTextUpdate(slide, 'es-ES', 'title', 'Planea menos.')).not.toBe(slide)
  })

  it('leaves other beats untouched and reports a no-op array', () => {
    const slides = partiallyTranslatedDeck()
    const next = applySlideTextUpdateToSlides(slides, 'beat-2', 'es-ES', 'subtitle', 'Sin prisa.')

    expect(next[0]).toBe(slides[0])
    expect(next[1].translations?.['es-ES']).toEqual({ title: 'Encuentra tu flujo.', subtitle: 'Sin prisa.' })
    // The beat had no supporting copy of its own, so the total does not move.
    expect(buildTranslationMatrix(next).fieldTotal).toBe(9)
    expect(applySlideTextUpdateToSlides(slides, 'beat-2', 'es-ES', 'title', 'Encuentra tu flujo.')).toBe(slides)
    expect(applySlideTextUpdateToSlides(slides, 'beat-9', 'es-ES', 'title', 'Nada.')).toBe(slides)
  })

  it('completes a matrix as cells are filled in, one field at a time', () => {
    let slides = partiallyTranslatedDeck()
    expect(buildTranslationMatrix(slides).summary).toBe('0/2 slides · 6/9 fields translated')

    slides = applySlideTextUpdateToSlides(slides, 'beat-1', 'ar-SA', 'title', 'خطِّط أقل.')
    const midway = buildTranslationMatrix(slides)
    expect(midway.translatedFields).toBe(7)
    expect(midway.summary).toBe('0/2 slides · 7/9 fields translated')
    expect(midway.rows[0].cells[2].missingFields).toEqual(['subtitle'])

    slides = applySlideTextUpdateToSlides(slides, 'beat-1', 'ar-SA', 'subtitle', 'ثلاث خطوات هادئة.')
    const after = buildTranslationMatrix(slides)
    expect(after.completeSlides).toBe(1)
    expect(after.summary).toBe('1/2 slides · 8/9 fields translated')
    expect(after.missingFields).toBe(1)
    expect(collectIncompleteSlideNumbers(after)).toEqual([2])
  })
})

describe('translation matrix serialization', () => {
  it('round-trips matrix edits through the project document', () => {
    const slides = applySlideTextUpdateToSlides(
      partiallyTranslatedDeck(),
      'beat-1',
      'ar-SA',
      'title',
      'خطِّط أقل.',
    )
    const document = serializeProject(projectWith(slides))

    expect(validateProjectDocument(document).valid).toBe(true)
    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const reloaded = buildTranslationMatrix(result.project.slides)
    expect(reloaded.summary).toBe(buildTranslationMatrix(slides).summary)
    expect(reloaded.rows[0].cells[2].fields[0].value).toBe('خطِّط أقل.')
    expect(reloaded.rows[0].cells[2].missingFields).toEqual(['subtitle'])
  })

  it('adds nothing of its own to the saved document', () => {
    const slides = partiallyTranslatedDeck()
    const before = serializeProject(projectWith(slides))
    const after = serializeProject(projectWith(applySlideTextUpdateToSlides(
      slides,
      'beat-2',
      'es-ES',
      'title',
      'Encuentra tu ritmo.',
    )))

    const shape = (document: ReturnType<typeof serializeProject>) => ({
      top: Object.keys(document).sort(),
      locales: document.localization.locales,
      messageKeys: Object.keys(document.localization.messages).sort(),
    })

    expect(shape(after)).toEqual(shape(before))
    // Only a message value changed: the edit rides the existing locale map.
    expect(after.localization.messages['beat-2.title']).toEqual({
      'en-US': 'Find your flow.',
      'es-ES': 'Encuentra tu ritmo.',
    })
  })
})
