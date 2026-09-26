import type { Slide } from '../../types'
import { SlideThumbnail } from '../flowboard/SlideThumbnail'

interface GuidedScreenshotsStepProps {
  slides: Slide[]
  captureCount: number
  /** 1-based slide numbers with no screenshot yet. */
  slidesWithoutCapture: number[]
  selectedSlideId: string
  onSelect: (slideId: string) => void
  onReplaceScreenshot: (slideId: string) => void
}

/**
 * Guided step 1, in plain language: one screenshot per slide.
 *
 * The list is the whole step. Each row is a real slide with its existing
 * thumbnail, a sentence about whether a screenshot is on it, and one button
 * that opens the existing per-slide import. Adding several at once reuses the
 * existing import dialog through the footer's primary action, so no import
 * logic is duplicated here.
 */
export function GuidedScreenshotsStep({
  slides,
  captureCount,
  slidesWithoutCapture,
  selectedSlideId,
  onSelect,
  onReplaceScreenshot,
}: GuidedScreenshotsStepProps) {
  return (
    <section className="guided-card" aria-labelledby="guided-screenshots-title">
      <div className="guided-card__heading">
        <h2 id="guided-screenshots-title">Your slides</h2>
        <p>
          {slidesWithoutCapture.length === 0
            ? 'Every slide has a screenshot. Change one any time.'
            : slidesWithoutCapture.length === 1
              ? `Slide ${slidesWithoutCapture[0]} still needs a screenshot.`
              : `Slides ${slidesWithoutCapture.join(', ')} still need a screenshot.`}
        </p>
      </div>

      <ul className="guided-slide-list" role="list">
        {slides.map((slide, index) => {
          const hasScreenshot = Boolean(slide.screenshot)
          const selected = slide.id === selectedSlideId
          return (
            <li key={slide.id} className={`guided-slide-row${selected ? ' is-selected' : ''}`}>
              <button
                className="guided-slide-row__pick"
                type="button"
                onClick={() => onSelect(slide.id)}
                aria-pressed={selected}
              >
                <span className="guided-slide-row__number" aria-hidden="true">{index + 1}</span>
                <SlideThumbnail slide={slide} index={index} variant="capture" />
                <span className="guided-slide-row__copy">
                  <strong>
                    {slide.screenshotName ?? (hasScreenshot ? 'Screenshot added' : 'No screenshot yet')}
                  </strong>
                  <small>{hasScreenshot ? 'Screenshot added' : 'Add a screenshot to this slide'}</small>
                </span>
              </button>
              <button
                className="button button--outline button--small"
                type="button"
                onClick={() => onReplaceScreenshot(slide.id)}
              >
                {hasScreenshot ? 'Change' : 'Add'}
                <span className="visually-hidden"> the screenshot on slide {index + 1}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="guided-hint">
        {captureCount} of {slides.length} {slides.length === 1 ? 'slide has' : 'slides have'} a
        screenshot. PNG, JPG, or WebP.
      </p>
    </section>
  )
}
