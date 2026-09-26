import { getSlideText } from '../../lib/localization'
import type { SlideTextField } from '../../lib/localization'
import type { LocaleId, Slide } from '../../types'

interface GuidedWordsStepProps {
  slides: Slide[]
  selectedSlide: Slide
  selectedIndex: number
  activeLocale: LocaleId
  /** 1-based slide numbers with no headline yet. */
  slidesWithoutHeadline: number[]
  onSelect: (slideId: string) => void
  onAddSlide: () => void
  onTextUpdate: (field: SlideTextField, value: string) => void
}

/**
 * Guided step 3, in plain language: a headline and one line of supporting text.
 *
 * The slide list picks which slide the two boxes edit, and the boxes write
 * through the same handler the Inspector and the Refine tray use, so undo,
 * autosave, and the translation matrix keep working. Every other copy control
 * stays in More options.
 */
export function GuidedWordsStep({
  slides,
  selectedSlide,
  selectedIndex,
  activeLocale,
  slidesWithoutHeadline,
  onSelect,
  onAddSlide,
  onTextUpdate,
}: GuidedWordsStepProps) {
  const text = getSlideText(selectedSlide, activeLocale)
  const written = slidesWithoutHeadline.length === 0

  return (
    <section className="guided-card" aria-labelledby="guided-words-title">
      <div className="guided-card__heading">
        <h2 id="guided-words-title">Slide {selectedIndex + 1} of {slides.length}</h2>
        <p>
          {written
            ? 'Every slide has a headline. Add supporting text if you want more detail.'
            : `Still to do: slide ${slidesWithoutHeadline.join(', ')}.`}
        </p>
      </div>

      <ul className="guided-beat-list" role="list">
        {slides.map((slide, index) => {
          const headline = getSlideText(slide, activeLocale).title.trim()
          const selected = slide.id === selectedSlide.id
          return (
            <li key={slide.id}>
              <button
                className={`guided-beat${selected ? ' is-selected' : ''}${headline ? ' is-done' : ''}`}
                type="button"
                onClick={() => onSelect(slide.id)}
                aria-pressed={selected}
              >
                <span className="guided-beat__mark" aria-hidden="true">{headline ? '✓' : index + 1}</span>
                <span className="guided-beat__copy">
                  <strong>{headline || `Slide ${index + 1}`}</strong>
                  <small>{headline ? 'Headline added' : 'No headline yet'}</small>
                </span>
              </button>
            </li>
          )
        })}
        <li>
          <button className="button button--outline button--small" type="button" onClick={onAddSlide}>
            <span aria-hidden="true">＋</span> Add another slide
          </button>
        </li>
      </ul>

      <label className="field-label" htmlFor="guided-headline">Headline</label>
      <textarea
        id="guided-headline"
        rows={2}
        value={text.title}
        onChange={(event) => onTextUpdate('title', event.target.value)}
      />
      <label className="field-label" htmlFor="guided-supporting">Supporting text (optional)</label>
      <textarea
        id="guided-supporting"
        rows={2}
        value={text.subtitle}
        onChange={(event) => onTextUpdate('subtitle', event.target.value)}
      />
      <p className="guided-hint">Changes save in this browser as you type, and you can undo them in the full editor.</p>
    </section>
  )
}
