/**
 * What the single renderer is given when it is not being edited.
 *
 * There is exactly one renderer — `SlideRenderer` in `SlideCanvas.tsx` — and it
 * has two modes. In editor mode it takes a dozen props: which layer is selected,
 * where a drag should be written, which arrow key should nudge, where a dropped
 * file should land. In export mode it takes six, and writes nothing.
 *
 * Those six props are built here, once, and this is the module the export stage
 * **and** the merged per-variant preview both call. Two consequences, both the
 * point of the exercise:
 *
 * - The two surfaces cannot drift. The preview is not a reimplementation of the
 *   export render; it is the same call with a different slide.
 * - A read-only render is structural, not a promise. The returned object has no
 *   key through which a transform, a selection, a nudge, or a drop could be
 *   written back, so a call site cannot pass one even by accident, and
 *   `exportMode` is what the renderer's own drag handlers gate on.
 *
 * No React and no DOM: the shape is the whole contract, and it is testable.
 */

import { exportEntryLocale } from './exportManifest'
import type { ExportProfile, LocaleId, OutputVariant, Slide } from '../types'

/**
 * The complete prop set of a non-editing render.
 *
 * `exportMode` is `true` and not merely `boolean`: the renderer treats it as the
 * flag that turns dragging off, and a type that admits `false` here would let a
 * call site opt back into the write path while believing it had not.
 */
export interface ExportRenderProps {
  slide: Slide
  slideNumber: number
  onImport: () => void
  profile: ExportProfile
  locale: LocaleId
  exportMode: true
}

export interface ExportRenderPropsInput {
  /** The slide to draw, already resolved: base slide plus any device override. */
  slide: Slide
  /** 1-based position in the authoring deck, which is what an author recognises. */
  slideNumber: number
  /** Which variant's locale the render draws in. */
  variantId: string
  profile: ExportProfile
  variants: readonly OutputVariant[]
  /** The editor's active locale: the fallback for a variant that names none. */
  locale: LocaleId
  /**
   * The only callback a non-editing render accepts. It exists because the device
   * placeholder is a button in the shared markup; the export stage passes a
   * no-op, and the merged preview does the same, because neither is a place a
   * file picker can be opened from.
   */
  onImport: () => void
}

/**
 * The props for one non-editing render of one slide.
 *
 * The locale resolution is shared with the manifest, so a manifest row and the
 * PNG it describes cannot claim different languages.
 */
export const exportRenderProps = ({
  slide,
  slideNumber,
  variantId,
  profile,
  variants,
  locale,
  onImport,
}: ExportRenderPropsInput): ExportRenderProps => ({
  slide,
  slideNumber,
  onImport,
  profile,
  locale: exportEntryLocale({ variantId }, variants, locale),
  exportMode: true,
})
