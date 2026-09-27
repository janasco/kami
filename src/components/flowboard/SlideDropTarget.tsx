/**
 * The drop target every capture surface shares.
 *
 * A Frame contact-sheet card, an Intake deck tile, and the device placeholder
 * all answer the same question — is a droppable drag over me, what did it
 * carry — so the handlers, the highlight, and the drag source live in one
 * component instead of being retyped per surface. The caller only decides what
 * the target looks like and what it says while it is lit.
 *
 * The wrapper is a plain element rather than the card or the tile itself, so the
 * surface keeps its own markup, its own classes, and its own click behaviour.
 * Nothing here touches pointer events or takes pointer capture, so a layer
 * dragged across this element keeps dragging.
 */

import type { ReactNode } from 'react'
import { useCaptureDropTarget } from '../useCaptureDropTarget'
import type { KamiCapturePayload } from '../../lib/screenshotDrop'
import type { Slide } from '../../types'

export interface SlideDropTargetProps {
  slide: Slide
  /** Extra class for the wrapper, so a surface can style it as it already does. */
  className?: string
  /** Text on the highlight while a droppable drag is over the target. */
  hint?: string
  /** Image files dropped on the target. Omitted where drops are not accepted. */
  onDropFiles?: (slideId: string, files: File[]) => void
  /** A capture dragged in from another slide card. */
  onDropCapture?: (slideId: string, capture: KamiCapturePayload) => void
  /** Called after any drop, so a surface can clear its own pending state. */
  onDropped?: () => void
  children?: ReactNode
}

export function SlideDropTarget({
  slide,
  className = '',
  hint,
  onDropFiles,
  onDropCapture,
  onDropped,
  children,
}: SlideDropTargetProps) {
  const drop = useCaptureDropTarget({
    slideId: slide.id,
    captureName: slide.screenshotName,
    hasCapture: Boolean(slide.screenshot),
    onDropFiles,
    onDropCapture,
    onDropped,
  })

  return (
    <div
      className={['flowboard-drop-target', className, drop.className].filter(Boolean).join(' ')}
      {...drop.markerProps}
      {...(drop.dragSourceProps ?? {})}
      {...drop.dropProps}
    >
      {drop.active && hint && <span className="flowboard-drop-hint" aria-hidden="true">{hint}</span>}
      {children}
    </div>
  )
}
