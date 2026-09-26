import { getTheme, numberSlide } from '../../data'
import { getScreenshotObjectFit } from '../../lib/screenshotFit'
import { summarizeCapture } from '../../lib/flowboardStages'
import type { Slide } from '../../types'

interface SlideThumbnailProps {
  slide: Slide
  index: number
  /** `capture` frames the capture alone, `slide` shows the themed composition. */
  variant?: 'slide' | 'capture'
  className?: string
}

/**
 * Lightweight card artwork for the Flowboard contact sheet and beat strip.
 * It intentionally avoids the full SlideRenderer so a long deck stays cheap
 * to scroll, while still reflecting theme, capture, and fit.
 */
export function SlideThumbnail({ slide, index, variant = 'slide', className = '' }: SlideThumbnailProps) {
  const theme = getTheme(slide.theme)
  const capture = summarizeCapture(slide)
  const title = slide.title.split('\n')[0].trim()

  if (variant === 'capture') {
    return (
      <div className={`flowboard-thumb flowboard-thumb--capture ${className}`.trim()}>
        <div className="flowboard-thumb__aperture" data-framed={capture.framed ? 'yes' : 'no'}>
          {slide.screenshot ? (
            <img
              src={slide.screenshot}
              alt={slide.screenshotName ? `${slide.screenshotName} on slide ${index + 1}` : `Capture on slide ${index + 1}`}
              style={{ objectFit: getScreenshotObjectFit(slide.screenshotFit) }}
              draggable={false}
            />
          ) : (
            <span className="flowboard-thumb__placeholder" aria-hidden="true">＋</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flowboard-thumb flowboard-thumb--slide ${className}`.trim()}
      style={{
        background: `linear-gradient(150deg, ${theme.colors[0]}, ${theme.colors[1]})`,
        color: theme.text ?? '#ffffff',
      }}
    >
      <span className="flowboard-thumb__number">{numberSlide(index)}</span>
      {title && <span className="flowboard-thumb__title">{title}</span>}
      <div className="flowboard-thumb__device" data-framed={capture.framed ? 'yes' : 'no'}>
        {slide.screenshot ? (
          <img
            src={slide.screenshot}
            alt=""
            style={{ objectFit: getScreenshotObjectFit(slide.screenshotFit) }}
            draggable={false}
          />
        ) : null}
      </div>
    </div>
  )
}
