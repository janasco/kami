import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { exportRenderProps } from '../lib/exportRenderProps'
import { exportEntryName } from '../lib/exportPlan'
import {
  describeVariantPreview,
  resolveVariantPreview,
  variantPreviewChoices,
  BASE_PREVIEW_ID,
  type VariantPreview,
} from '../lib/variantPreview'
import type { ExportProfile, LocaleId, OutputVariant, Slide } from '../types'
import { SlideRenderer } from './SlideCanvas'

/**
 * The merged per-variant preview for the Refine canvas.
 *
 * Until now the Refine canvas always drew the base deck. A variant's device
 * override was merged in the export root and nowhere else, so a second device set
 * was something an author configured and then had to trust. This closes that gap.
 *
 * Three decisions, and each exists to stop this becoming a second editor:
 *
 * - **It is the export's own render.** The slide is merged by
 *   `resolveDeviceOverride` — the function the export uses — and handed to the one
 *   renderer through `exportRenderProps`, the same builder the off-screen export
 *   stage calls. There is no rendering logic here to fork, and the preview cannot
 *   show a device the export would not draw, because it asks the same code.
 * - **It cannot write, and cannot grow the ability to.** The prop object has no
 *   transform, select, nudge, or drop key in it, and it is always in export mode,
 *   which is the flag the renderer's own drag handlers gate on. No handler that
 *   writes to the align, distribute, or transform path is ever passed in, because
 *   there is no such handler to pass.
 * - **It does not look like the canvas you can edit.** A dashed frame, a badge
 *   that names the variant, and a live sentence saying what is on screen. A
 *   read-only surface that looks editable is worse than none at all: the author
 *   drags, nothing moves, and the feature reads as broken.
 *
 * Selecting "Deck" renders no canvas here, and the Refine stage draws its own
 * editable canvas exactly as it always has. Nothing is carried across, so there is
 * no state to restore and none that could drift.
 */

export interface RefineVariantPreviewProps {
  slides: Slide[]
  /** The deck slide the preview follows when the author has not chosen one. */
  selectedSlideId: string
  variants: OutputVariant[]
  /** `''` is the editable deck, not a variant. See {@link BASE_PREVIEW_ID}. */
  value: string
  onChange: (variantId: string) => void
  /**
   * The slide the author last stepped to inside this variant. Empty until they
   * use the stepper, at which point the preview holds its own position instead of
   * following the deck selection.
   */
  previewSlideId: string
  onPreviewSlideChange: (slideId: string) => void
  profile: ExportProfile
  /** The editor's active locale, the fallback for a variant that names none. */
  locale: LocaleId
  idPrefix?: string
}

export function RefineVariantPreview({
  slides,
  selectedSlideId,
  variants,
  value,
  onChange,
  previewSlideId,
  onPreviewSlideChange,
  profile,
  locale,
  idPrefix = 'refine-variant',
}: RefineVariantPreviewProps) {
  const choices = variantPreviewChoices(variants)
  const variant = variants.find((entry) => entry.id === value) ?? null
  /*
   * The previewed slide is the one the author stepped to, and otherwise the deck's
   * selected slide. A stepper position that the current variant does not render
   * is ignored rather than honoured, so switching variants never leaves the
   * preview pointing at a slide the export will not write.
   */
  const wanted = previewSlideId || selectedSlideId
  const preview = resolveVariantPreview({ slides, variant, slideId: wanted, locale })
  return (
    <div className="variant-preview" data-variant-preview={preview ? 'read-only' : 'deck'}>
      <div className="variant-preview__bar">
        <div className="variant-preview__pick">
          <label className="field-label" htmlFor={`${idPrefix}-preview`}>Show</label>
          <select
            id={`${idPrefix}-preview`}
            className="profile-select"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            {choices.map((choice) => (
              <option key={choice.id || BASE_PREVIEW_ID} value={choice.id}>{choice.name}</option>
            ))}
          </select>
        </div>
        {preview && (
          <p className="variant-preview__state" role="status" aria-live="polite">
            <span className="variant-preview__badge" aria-hidden="true">Read-only</span>
            {describeVariantPreview(preview, slides.length)}
          </p>
        )}
      </div>

      {preview
        ? (
          <VariantPreviewSurface
            preview={preview}
            slides={slides}
            variants={variants}
            profile={profile}
            locale={locale}
            onPreviewSlideChange={onPreviewSlideChange}
            idPrefix={idPrefix}
          />
        )
        : (
          <p className="flowboard-hint variant-preview__deck">
            {`The editable canvas is below. The property tray still edits slide ${deckPosition(slides, selectedSlideId)} of the deck.`}
          </p>
        )}
    </div>
  )
}

/** 1-based deck position, falling back to 1 rather than reporting a slide that is not there. */
const deckPosition = (slides: Slide[], slideId: string): number => {
  const index = slides.findIndex((slide) => slide.id === slideId)
  return index < 0 ? 1 : index + 1
}

/** The scaled frame the exported canvas is drawn inside, plus what it corresponds to. */
function VariantPreviewSurface({
  preview,
  slides,
  variants,
  profile,
  locale,
  onPreviewSlideChange,
  idPrefix,
}: {
  preview: VariantPreview
  slides: Slide[]
  variants: OutputVariant[]
  profile: ExportProfile
  locale: LocaleId
  onPreviewSlideChange: (slideId: string) => void
  idPrefix: string
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  /*
   * Export mode sets the canvas to the profile's real pixel size, because a
   * rasterised node has to be that size. On screen that is a 1242px column, so the
   * frame measures itself and scales the whole thing with a transform.
   *
   * A transform rather than a width override on purpose: the DOM inside the frame
   * stays byte-identical to what the export stage lays out, so this is the export
   * at a different size rather than a re-laid-out approximation of it. It is also
   * the one visual effect html-to-image reproduces reliably.
   */
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const width = frame.clientWidth
      if (width > 0) setScale(Math.min(1, width / profile.width))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [profile.width])

  return (
    <div className="variant-preview__body">
      <div
        className="variant-preview__frame"
        ref={frameRef}
        style={{ aspectRatio: `${profile.width} / ${profile.height}` } as CSSProperties}
      >
        <div
          className="variant-preview__canvas"
          style={{
            width: profile.width,
            height: profile.height,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          <SlideRenderer
            {...exportRenderProps({
              slide: preview.slide,
              slideNumber: preview.slideNumber,
              variantId: preview.variantId,
              profile,
              variants,
              locale,
              /*
               * The device placeholder is a button in the shared markup, and the
               * read-only prop set is fixed, so it is given a no-op. There is no
               * file picker behind a preview: a preview that opened one would be
               * the first thing on this surface that could change the project.
               */
              onImport: () => undefined,
            })}
          />
        </div>
      </div>

      <div className="variant-preview__meta">
        <dl className="flowboard-record">
          <div className="flowboard-record__row">
            <span>Export size</span>
            <strong>{profile.width} × {profile.height} px</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Deck slide</span>
            <strong>{preview.slideNumber} of {slides.length}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Device</span>
            <strong>{preview.usesDeckDevice ? 'The deck device' : 'This variant’s device'}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>File</span>
            <strong>
              {/* Minted by the export's own naming function, so the name quoted
                  here is the name in the bundle. */}
              <code className="variant-preview__file">
                {exportEntryName(profile.id, preview.variantName, preview.slideNumber)}
              </code>
            </strong>
          </div>
        </dl>

        {preview.renders.length > 1 && (
          <div className="flowboard-export-grid__form variant-preview__stepper">
            <label className="field-label" htmlFor={`${idPrefix}-slide`}>Slide in this variant</label>
            <select
              id={`${idPrefix}-slide`}
              className="profile-select"
              value={preview.slideId}
              onChange={(event) => onPreviewSlideChange(event.target.value)}
            >
              {preview.renders.map((render) => (
                <option key={render.slideId} value={render.slideId}>
                  {`Slide ${render.slideNumber} · ${render.usesDeckDevice ? 'deck device' : 'overridden device'}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}
