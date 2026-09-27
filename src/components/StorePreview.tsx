import type { CSSProperties } from 'react'
import { storePreviewCapturesLine, type StorePreview as StorePreviewModel, type StorePreviewSlide } from '../lib/storePreview'
import { SlideThumbnail } from './flowboard/SlideThumbnail'
import type { Slide } from '../types'

/**
 * How the set reads in a store carousel.
 *
 * A review surface, not a rule engine. The editor cannot open a store carousel,
 * so the useful thing is the two halves of that sentence: describe the surface
 * the way a person would describe it, and report what this particular set
 * contains. Every sentence comes from the listing catalog in `data.ts`; nothing
 * here claims to know what a store will accept, because nothing here can find
 * out.
 *
 * On cost: the tiles are `SlideThumbnail`, the cheap path, deliberately. The
 * off-screen export root is already laid out one full renderer per exported
 * entry, and a third full set of renderers on a ten-slide deck is a real cost for
 * a picture nobody is going to look at closely. A tile is a thumbnail plus a
 * filename, which is what a carousel decision actually needs. The only surface
 * entitled to the full renderer is the one merged variant preview, because that
 * one exists to be looked at.
 */

export interface StorePreviewProps {
  /** The model, derived in `lib/storePreview` so the copy is testable. */
  preview: StorePreviewModel
  /**
   * The deck, so each tile has a slide to hand to the thumbnail. Read only, and
   * looked up by the slide id the plan already resolved.
   */
  slides: Slide[]
}

const slideById = (slides: Slide[], slideId: string, fallbackIndex: number): Slide =>
  slides.find((slide) => slide.id === slideId) ?? slides[fallbackIndex] ?? slides[0]

const IconMark = ({ present }: { present: boolean }) => (
  <span
    className={`store-preview__mark${present ? ' is-on' : ' is-off'}`}
    data-present={present ? 'yes' : 'no'}
    aria-hidden="true"
  >
    {present ? '●' : '○'}
  </span>
)

const Tile = ({ row, slide, index }: { row: StorePreviewSlide; slide: Slide; index: number }) => (
  <figure className="store-preview__tile">
    {/*
     * The cheap renderer, on purpose. See the note at the top of this file: this
     * is a tile in a carousel, not an export, and a full renderer per slide here
     * would be a third full set of them in the document.
     */}
    <SlideThumbnail slide={slide} index={index} />
    <figcaption className="store-preview__caption">
      <span className="store-preview__headline">{row.headline || 'No headline'}</span>
      <span className="store-preview__marks">
        <IconMark present={row.hasCapture} />
        <IconMark present={row.hasIcon} />
        <code className="store-preview__file">{row.filename}</code>
      </span>
    </figcaption>
  </figure>
)

export function StorePreview({ preview, slides }: StorePreviewProps) {
  const iconCount = preview.iconCount
  const iconLine = preview.slideCount === 0
    ? ''
    : `${iconCount} of ${preview.slideCount} image${preview.slideCount === 1 ? '' : 's'} draw${
      iconCount === 1 ? 's' : ''
    } an app icon${preview.missingIconNumbers.length === 0
      ? '.'
      : `. ${preview.missingIconNumbers.length === 1
        ? `Slide ${preview.missingIconNumbers[0]} draws none.`
        : `Slides ${preview.missingIconNumbers.join(', ')} draw none.`}`}`

  return (
    <section className="store-preview" aria-labelledby="store-preview-title">
      <div className="flowboard-panel__heading">
        <span className="eyebrow">Store listing</span>
        <h3 id="store-preview-title">How this set reads in {preview.listing.storeName}</h3>
        <p className="flowboard-hint">
          {`${preview.profileName} · ${preview.dimensions} px · ${preview.slideCount} image${
            preview.slideCount === 1 ? '' : 's'
          }${preview.variantName ? ` · the “${preview.variantName}” variant` : ''}.`}
        </p>
      </div>

      <dl className="store-preview__facts">
        <div className="flowboard-record__row">
          <dt>In the carousel</dt>
          <dd>{preview.listing.leading}</dd>
        </div>
        <div className="flowboard-record__row">
          <dt>App icon</dt>
          <dd>{preview.listing.icon}</dd>
        </div>
        <div className="flowboard-record__row">
          <dt>Headlines</dt>
          <dd>{preview.listing.headline}</dd>
        </div>
        <div className="flowboard-record__row">
          <dt>Captures</dt>
          <dd>{storePreviewCapturesLine(preview)}</dd>
        </div>
        {iconLine && (
          <div className="flowboard-record__row">
            <dt>Icons</dt>
            <dd>{iconLine}</dd>
          </div>
        )}
        <div className="flowboard-record__row">
          <dt>Longest first-line headline</dt>
          <dd>
            {preview.longestHeadline
              ? `${preview.longestHeadline.length} characters on slide ${preview.longestHeadline.slideNumber}, against about ${
                preview.listing.headlineReference
              } that read on one line here.`
              : 'No headline in the leading images yet.'}
          </dd>
        </div>
      </dl>

      {preview.leading.length > 0 && (
        <>
          <p className="store-preview__legend" id="store-preview-legend">
            <span className="store-preview__mark is-on" aria-hidden="true">●</span> has a capture
            {' · '}
            <span className="store-preview__mark is-on" aria-hidden="true">●</span> draws an app icon
          </p>
          <ul
            className="store-preview__leading"
            aria-describedby="store-preview-legend"
            // The tile frame is the target's own proportions, so a landscape
            // target shows a landscape tile. One custom property rather than a
            // second set of rules per profile.
            style={{ '--store-preview-aspect': `${preview.width} / ${preview.height}` } as CSSProperties}
          >
            {preview.leading.map((row, index) => (
              <li key={`${row.variantName}-${row.slideId}`}>
                <Tile
                  row={row}
                  index={row.slideNumber - 1}
                  slide={slideById(slides, row.slideId, index)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {preview.trailing.length > 0 && (
        <div className="store-preview__rest">
          <h4 className="store-preview__rest-title">
            {`The other ${preview.trailing.length} image${preview.trailing.length === 1 ? '' : 's'}`}
          </h4>
          <ul className="store-preview__rest-list" role="list">
            {preview.trailing.map((row) => (
              <li key={`${row.variantName}-${row.slideId}`}>
                <span className="store-preview__rest-name">{`Slide ${row.slideNumber}`}</span>
                <IconMark present={row.hasCapture} />
                <IconMark present={row.hasIcon} />
                <span className="store-preview__rest-headline">{row.headline || 'No headline'}</span>
                <code className="store-preview__file">{row.filename}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
