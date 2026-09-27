import type { RefObject } from 'react'
import type { ExportProfile, LocaleId, OutputVariant } from '../types'
import type { ExportEntry } from '../lib/exportPlan'
import { exportRenderProps } from '../lib/exportRenderProps'
import { SlideRenderer } from './SlideCanvas'

interface ExportSlidesProps {
  /** The export plan, in the order the files are written. */
  entries: readonly ExportEntry[]
  /**
   * The deck's variants, so a render is labelled with the locale it actually
   * draws in rather than the editor's active one. A deck with one variant has
   * one entry per slide and that variant's locale is the editor's, so nothing
   * about the export changes.
   */
  variants: readonly OutputVariant[]
  profile: ExportProfile
  locale: LocaleId
  stageRef: RefObject<HTMLDivElement | null>
}

/**
 * The off-screen export stage: one node per planned entry, in plan order.
 *
 * The variant is already resolved into each entry, so the node, the ZIP name, and
 * the store preview all come from the same plan. Every node carries its variant
 * and deck position as data attributes, so a mislaid node is visible in the DOM
 * rather than only in a wrong filename.
 *
 * The renderer's props come from `exportRenderProps`, the same builder the merged
 * variant preview uses. That is what makes the preview a preview rather than a
 * second implementation: both surfaces hand the one renderer the identical
 * read-only prop set, so a preview that showed something the export would not is
 * not a state the code can reach.
 */
export function ExportSlides({ entries, variants, profile, locale, stageRef }: ExportSlidesProps) {
  return (
    <div
      ref={stageRef}
      className="export-render-root"
      style={{ width: profile.width }}
      aria-hidden="true"
    >
      {entries.map((entry, index) => (
        <div
          className="export-slide"
          data-export-slide={index}
          data-export-variant={entry.variantId}
          data-export-deck-slide={entry.slideNumber}
          key={`${entry.variantId}-${entry.slideId}`}
          style={{ width: profile.width, height: profile.height }}
        >
          <SlideRenderer
            {...exportRenderProps({
              slide: entry.slide,
              // The deck position, not the position in the bundle: the deck is
              // the coordinate system every "open this slide" affordance uses,
              // and an alt text that said slide 7 of a 3-slide deck is noise.
              slideNumber: entry.slideNumber,
              variantId: entry.variantId,
              profile,
              variants,
              locale,
              onImport: () => undefined,
            })}
          />
        </div>
      ))}
    </div>
  )
}
