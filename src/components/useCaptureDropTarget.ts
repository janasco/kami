/**
 * One drag-and-drop target for a slide's capture, shared by every surface that
 * accepts a capture drop.
 *
 * The Frame contact sheet, the Intake deck strip, and the device placeholder
 * all answer the same three questions — is this a drag I should claim, should I
 * light up, and what did it carry — so the answers live here once. A surface
 * supplies the slide it stands for and the two handlers, and gets back the
 * handlers to spread on its element plus the classes to show.
 *
 * Two rules keep this out of the way of the canvas:
 *
 * - A drag is only claimed when the data transfer types say it carries files or
 *   a Kami capture. The `dragover` default is never cancelled for anything else,
 *   so dragging a layer across the canvas, or a text selection across a card,
 *   behaves exactly as it did before.
 * - Nothing here takes pointer capture or cancels a pointer event. HTML drag
 *   events and pointer events are separate, so the existing layer dragging is
 *   untouched by a target becoming droppable.
 *
 * The depth counter matters because `dragenter` and `dragleave` fire for every
 * element the pointer crosses inside the target, including the thumbnail and
 * the label nested in a card. Counting them means the highlight survives a
 * child boundary and clears once the pointer really has left.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  encodeKamiCapture,
  isDroppableDrag,
  KAMI_CAPTURE_DRAG_TYPE,
  readDropIntent,
  type KamiCapturePayload,
} from '../lib/screenshotDrop'

export interface CaptureDropTargetOptions {
  /** The slide this target assigns to. */
  slideId: string
  /** The capture's name, carried in the drag so the notice can name it. */
  captureName?: string | null
  /** Whether this slide has a capture to offer as a drag source. */
  hasCapture?: boolean
  /** Image files dropped on the target. */
  onDropFiles?: (slideId: string, files: File[]) => void
  /** A capture dragged in from another slide. */
  onDropCapture?: (slideId: string, capture: KamiCapturePayload) => void
  /** Called after any drop, so a surface can clear its own pending state. */
  onDropped?: () => void
}

export interface CaptureDropTarget {
  /** True while a droppable drag is over the target. */
  active: boolean
  /** True while a capture is being dragged off this target. */
  dragging: boolean
  /** `is-drop-active` and `is-drag-source`, so the target can be styled. */
  className: string
  /**
   * Set on the target element so the affordance is findable in markup. Empty
   * when no handler was supplied: an element with nothing to accept is not a
   * target, and must not claim the drag of anything passing over it.
   */
  markerProps: { 'data-capture-drop-target'?: ''; 'data-drop-active'?: 'yes' }
  /** Spread onto the target element. */
  dropProps: {
    onDragEnter: (event: DragEvent<HTMLElement>) => void
    onDragOver: (event: DragEvent<HTMLElement>) => void
    onDragLeave: (event: DragEvent<HTMLElement>) => void
    onDrop: (event: DragEvent<HTMLElement>) => void
  }
  /**
   * Props for a drag source, or null when this target has no capture to offer.
   * A source advertises the Kami type plus a plain-text copy of the same
   * payload, because some browsers refuse to start a drag that offers only a
   * custom type.
   */
  dragSourceProps: {
    draggable: true
    onDragStart: (event: DragEvent<HTMLElement>) => void
    onDragEnd: (event: DragEvent<HTMLElement>) => void
  } | null
}

export function useCaptureDropTarget(options: CaptureDropTargetOptions): CaptureDropTarget {
  const {
    slideId,
    captureName = null,
    hasCapture = false,
    onDropFiles,
    onDropCapture,
    onDropped,
  } = options
  const [active, setActive] = useState(false)
  const [dragging, setDragging] = useState(false)
  const depthRef = useRef(0)
  // A surface that supplies neither handler has nothing to accept. The export
  // stage is the case that matters: it renders the same placeholder, and an
  // exported PNG must not claim a drag.
  const enabled = Boolean(onDropFiles || onDropCapture)

  const enter = useCallback((event: DragEvent<HTMLElement>) => {
    if (!enabled || !isDroppableDrag(event.dataTransfer)) return
    // Claiming the drag is what makes the drop allowed at all, and it is only
    // done for a drag this target can actually take.
    event.preventDefault()
    depthRef.current += 1
    setActive(true)
  }, [enabled])

  const over = useCallback((event: DragEvent<HTMLElement>) => {
    if (!enabled || !isDroppableDrag(event.dataTransfer)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    setActive(true)
  }, [enabled])

  const leave = useCallback((event: DragEvent<HTMLElement>) => {
    if (!enabled || !isDroppableDrag(event.dataTransfer)) return
    depthRef.current = Math.max(0, depthRef.current - 1)
    if (depthRef.current === 0) setActive(false)
  }, [enabled])

  const drop = useCallback((event: DragEvent<HTMLElement>) => {
    if (!enabled || !isDroppableDrag(event.dataTransfer)) return
    event.preventDefault()
    depthRef.current = 0
    setActive(false)
    setDragging(false)

    const intent = readDropIntent<File>(event.dataTransfer)
    if (intent.kind === 'files' && onDropFiles) onDropFiles(slideId, intent.files)
    else if (intent.kind === 'capture' && onDropCapture) onDropCapture(slideId, intent.capture)
    onDropped?.()
  }, [enabled, onDropCapture, onDropFiles, onDropped, slideId])

  const dragStart = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasCapture || !event.dataTransfer) return
    const payload: KamiCapturePayload = { slideId, name: captureName }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(KAMI_CAPTURE_DRAG_TYPE, encodeKamiCapture(payload))
    // The plain-text copy is the same JSON. It is what makes the drag start in
    // browsers that ignore a drag offering only a custom type, and it is read
    // back only when the Kami type is present.
    event.dataTransfer.setData('text/plain', encodeKamiCapture(payload))
    setDragging(true)
  }, [captureName, hasCapture, slideId])

  const dragEnd = useCallback(() => setDragging(false), [])

  const dropProps = useMemo(
    () => ({ onDragEnter: enter, onDragOver: over, onDragLeave: leave, onDrop: drop }),
    [drop, enter, leave, over],
  )
  const dragSourceProps = useMemo(
    () => (hasCapture
      ? { draggable: true as const, onDragStart: dragStart, onDragEnd: dragEnd }
      : null),
    [dragEnd, dragStart, hasCapture],
  )

  return {
    active,
    dragging,
    className: `${active ? 'is-drop-active' : ''}${dragging ? ' is-drag-source' : ''}`.trim(),
    markerProps: enabled
      ? (active
        ? { 'data-capture-drop-target': '', 'data-drop-active': 'yes' }
        : { 'data-capture-drop-target': '' })
      : {},
    dropProps,
    dragSourceProps,
  }
}
