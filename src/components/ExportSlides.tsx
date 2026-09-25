import type { RefObject } from 'react'
import type { ExportProfile, LocaleId, Slide } from '../types'
import { SlideRenderer } from './SlideCanvas'

interface ExportSlidesProps {
  slides: Slide[]
  profile: ExportProfile
  locale: LocaleId
  stageRef: RefObject<HTMLDivElement | null>
}

export function ExportSlides({ slides, profile, locale, stageRef }: ExportSlidesProps) {
  return (
    <div
      ref={stageRef}
      className="export-render-root"
      style={{ width: profile.width }}
      aria-hidden="true"
    >
      {slides.map((slide, index) => (
        <div
          className="export-slide"
          data-export-slide={index}
          key={slide.id}
          style={{ width: profile.width, height: profile.height }}
        >
          <SlideRenderer
            slide={slide}
            slideNumber={index + 1}
            onImport={() => undefined}
            profile={profile}
            locale={locale}
            exportMode
          />
        </div>
      ))}
    </div>
  )
}
