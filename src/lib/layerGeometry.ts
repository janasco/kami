/**
 * Pure geometry for the layer canvas.
 *
 * Everything an arrangement action needs to decide *where a layer should end
 * up* lives here as plain numbers: converting the stored canvas percentages to
 * pixels, the delta an align or distribute request produces, the distances at
 * which a position snaps to a guide, and the guide set itself.
 *
 * Two deliberate constraints keep this module honest:
 *
 * - It measures nothing. Callers hand in rectangles already expressed in canvas
 *   pixels, which is what `collectExportPreflightBounds` already produces, and
 *   take back a percentage delta to add to a transform that is already stored.
 * - It knows nothing about React, the DOM, or the project file. That is what
 *   makes the rules testable without a browser, and it is why both the Refine
 *   tray, the full Inspector, the keyboard nudge, and the align bar can share
 *   one answer instead of three.
 *
 * The stored `x` and `y` on a transform are a percentage of the canvas box, and
 * the renderer applies them as a `translate(x cqw, y cqh)`. So a percentage is
 * always resolved against the canvas extent, never against the layer, and a
 * rectangle measured from the DOM has the current offset already baked in.
 * `untransformRect` removes it again when alignment has to reason about the
 * layer's untransformed box.
 */

import type { SlideTransform } from '../types'

/** A rectangle on the canvas, in canvas pixels, origin at the top-left corner. */
export interface LayerRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** The canvas box itself, in pixels. */
export interface CanvasSize {
  width: number
  height: number
}

/** Offsets are written back as a delta rather than an absolute value. */
export interface GeometryDelta {
  dx: number
  dy: number
}

export type AlignAction = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'
export type DistributeAction = 'horizontal' | 'vertical'
export type GuideAxis = 'horizontal' | 'vertical'

/** Every align request the arrange bar can make, in reading order. */
export const alignActions: readonly AlignAction[] = ['left', 'center-h', 'right', 'top', 'center-v', 'bottom']

/** Every distribute request the arrange bar can make. */
export const distributeActions: readonly DistributeAction[] = ['horizontal', 'vertical']

/** Axis a distribute request spreads layers along. */
export const distributeAxis = (action: DistributeAction): GuideAxis =>
  action === 'horizontal' ? 'horizontal' : 'vertical'

/** Short, human phrase for one align request. */
export const describeAlignAction = (action: AlignAction): string => {
  switch (action) {
    case 'left': return 'Align left'
    case 'center-h': return 'Center horizontally'
    case 'right': return 'Align right'
    case 'top': return 'Align top'
    case 'center-v': return 'Center vertically'
    case 'bottom': return 'Align bottom'
  }
}

/** Short, human phrase for one distribute request. */
export const describeDistributeAction = (action: DistributeAction): string =>
  action === 'horizontal' ? 'Distribute horizontally' : 'Distribute vertically'

/**
 * Decimals kept on a stored canvas percentage.
 *
 * Two are enough for the finest nudge step and keep a burst of nudges from
 * accumulating float noise such as 0.30000000000000004 in the saved project.
 */
export const LAYER_PERCENT_PRECISION = 2

/**
 * Rounds to a stored percentage, or to 0 when the input is not a number.
 *
 * A rounded value of zero is normalised to positive zero, so a clamp that lands
 * exactly on an edge never stores `-0` and never shows a minus sign in a field.
 */
export const roundPercent = (value: number, precision = LAYER_PERCENT_PRECISION): number => {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** precision
  const rounded = Math.round(value * factor) / factor
  return rounded === 0 ? 0 : rounded
}

/** Canvas percentage to canvas pixels. A non-finite input is treated as zero. */
export const percentToPixels = (percent: number, extent: number): number =>
  Number.isFinite(percent) && Number.isFinite(extent) ? (percent / 100) * extent : 0

/** Canvas pixels to canvas percentage, so the inverse of the stored unit. */
export const pixelsToPercent = (pixels: number, extent: number): number =>
  Number.isFinite(pixels) && Number.isFinite(extent) && extent !== 0 ? (pixels / extent) * 100 : 0

const isUsableRect = (rect: LayerRect | null | undefined): rect is LayerRect => {
  if (!rect) return false
  return [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
    && rect.right >= rect.left
    && rect.bottom >= rect.top
}

export const rectWidth = (rect: LayerRect): number => rect.right - rect.left
export const rectHeight = (rect: LayerRect): number => rect.bottom - rect.top
export const rectCenterX = (rect: LayerRect): number => (rect.left + rect.right) / 2
export const rectCenterY = (rect: LayerRect): number => (rect.top + rect.bottom) / 2

/** The canvas box as a rectangle, which is what alignment aligns against. */
export const frameRect = (canvas: CanvasSize): LayerRect => ({
  left: 0,
  top: 0,
  right: canvas.width,
  bottom: canvas.height,
})

/** Moves a rectangle by a pixel offset. */
export const offsetRect = (rect: LayerRect, dx: number, dy: number): LayerRect => ({
  left: rect.left + dx,
  top: rect.top + dy,
  right: rect.right + dx,
  bottom: rect.bottom + dy,
})

/** The smallest rectangle containing every input, or null when none is usable. */
export const unionRect = (rects: readonly (LayerRect | null | undefined)[]): LayerRect | null => {
  const usable = rects.filter(isUsableRect)
  if (usable.length === 0) return null
  return {
    left: Math.min(...usable.map((rect) => rect.left)),
    top: Math.min(...usable.map((rect) => rect.top)),
    right: Math.max(...usable.map((rect) => rect.right)),
    bottom: Math.max(...usable.map((rect) => rect.bottom)),
  }
}

/** The pixel offset a stored transform applies on a canvas of this size. */
export const transformOffsetPx = (
  transform: Pick<SlideTransform, 'x' | 'y'>,
  canvas: CanvasSize,
): GeometryDelta => ({
  dx: percentToPixels(transform.x, canvas.width),
  dy: percentToPixels(transform.y, canvas.height),
})

/**
 * Undoes the stored translate on a measured rectangle.
 *
 * A rectangle read from the DOM has the layer's current `x`/`y` already applied,
 * so alignment would otherwise chase the offset it is trying to change. Only the
 * translate is removed: scale, rotation, and flips are left in place, which is
 * why the align result is a delta rather than an absolute position.
 */
export const untransformRect = (
  rect: LayerRect,
  transform: Pick<SlideTransform, 'x' | 'y'>,
  canvas: CanvasSize,
): LayerRect => {
  const offset = transformOffsetPx(transform, canvas)
  return offsetRect(rect, -offset.dx, -offset.dy)
}

/**
 * Pixel delta that moves `subject` onto the shared edge or centre of `targets`.
 *
 * Returns null when there is nothing to align to, and a zero delta when the
 * layer is already where it is asked to go, so a caller can treat a zero result
 * as "no change" without a second comparison.
 */
export const alignDeltaPercent = (
  action: AlignAction,
  subject: LayerRect,
  targets: readonly (LayerRect | null | undefined)[],
  canvas: CanvasSize,
): GeometryDelta | null => {
  if (!isUsableRect(subject)) return null
  const target = unionRect(targets)
  if (!target) return null

  const dx = (value: number) => roundPercent(pixelsToPercent(value, canvas.width))
  const dy = (value: number) => roundPercent(pixelsToPercent(value, canvas.height))

  switch (action) {
    case 'left': return { dx: dx(target.left - subject.left), dy: 0 }
    case 'right': return { dx: dx(target.right - subject.right), dy: 0 }
    case 'center-h': return { dx: dx(rectCenterX(target) - rectCenterX(subject)), dy: 0 }
    case 'top': return { dx: 0, dy: dy(target.top - subject.top) }
    case 'bottom': return { dx: 0, dy: dy(target.bottom - subject.bottom) }
    case 'center-v': return { dx: 0, dy: dy(rectCenterY(target) - rectCenterY(subject)) }
  }
}

/**
 * Percentage delta that puts `subject` into an even spread with `others`.
 *
 * The subject keeps its size and every other layer stays where it is, so this is
 * "make the gaps around the selected layer even" rather than a whole-selection
 * distribution. Returns null when the request cannot apply: fewer than three
 * boxes, or the subject already sitting at either end of the stack, where there
 * is no gap left to equalise.
 */
export const distributeDeltaPercent = (
  action: DistributeAction,
  subject: LayerRect,
  others: readonly (LayerRect | null | undefined)[],
  canvas: CanvasSize,
): GeometryDelta | null => {
  if (!isUsableRect(subject)) return null
  const axis = distributeAxis(action)
  const extent = axis === 'horizontal' ? canvas.width : canvas.height
  if (!Number.isFinite(extent) || extent <= 0) return null

  const start = (rect: LayerRect) => (axis === 'horizontal' ? rect.left : rect.top)
  const end = (rect: LayerRect) => (axis === 'horizontal' ? rect.right : rect.bottom)
  const boxes = [...others.filter(isUsableRect), subject]
  if (boxes.length < 3) return null

  const sorted = [...boxes].sort((a, b) => start(a) - start(b) || end(a) - end(b))
  const index = sorted.indexOf(subject)
  if (index <= 0 || index === sorted.length - 1) return null

  const occupied = sorted.reduce((total, rect) => total + (end(rect) - start(rect)), 0)
  const span = end(sorted[sorted.length - 1]) - start(sorted[0])
  const gap = (span - occupied) / (sorted.length - 1)
  const preceding = sorted.slice(0, index).reduce((total, rect) => total + (end(rect) - start(rect)), 0)
  const delta = start(sorted[0]) + preceding + index * gap - start(subject)
  if (!Number.isFinite(delta)) return null

  const percent = roundPercent(pixelsToPercent(delta, extent))
  return axis === 'horizontal' ? { dx: percent, dy: 0 } : { dx: 0, dy: percent }
}

/** Default snap distance, as a canvas percentage. */
export const DEFAULT_SNAP_THRESHOLD_PERCENT = 0.5

export interface SnapResult {
  /** The value to store: the candidate when it snapped, the input otherwise. */
  value: number
  snapped: boolean
  /** The candidate that won, or null when nothing was close enough. */
  target: number | null
}

/**
 * Snaps one canvas percentage to the closest candidate within a threshold.
 *
 * A threshold of zero snaps only on an exact hit, and a non-finite input is
 * returned untouched, so a caller can pass a value straight from a drag without
 * guarding it first.
 */
export const snapPercent = (
  value: number,
  candidates: readonly number[],
  thresholdPercent = DEFAULT_SNAP_THRESHOLD_PERCENT,
): SnapResult => {
  if (!Number.isFinite(value)) return { value, snapped: false, target: null }
  const threshold = Number.isFinite(thresholdPercent) ? Math.abs(thresholdPercent) : 0
  let best: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    if (!Number.isFinite(candidate)) continue
    const distance = Math.abs(candidate - value)
    if (distance > threshold || distance >= bestDistance) continue
    best = candidate
    bestDistance = distance
  }

  return best === null
    ? { value, snapped: false, target: null }
    : { value: roundPercent(best), snapped: true, target: best }
}

/**
 * Clamps one axis of a layer offset so its box stays on the canvas.
 *
 * A layer at least as large as the canvas cannot have both edges held, so it is
 * centred on the axis instead: pinning one edge of an oversized layer would push
 * most of it off the export.
 */
const clampAxisPercent = (
  baseStart: number,
  baseSize: number,
  canvasSize: number,
  offsetPercent: number,
): number => {
  if (![baseStart, baseSize, canvasSize, offsetPercent].every(Number.isFinite)) return offsetPercent
  if (canvasSize <= 0) return offsetPercent
  if (baseSize >= canvasSize) {
    return roundPercent(pixelsToPercent(canvasSize / 2 - (baseStart + baseSize / 2), canvasSize))
  }
  const min = pixelsToPercent(-baseStart, canvasSize)
  const max = pixelsToPercent(canvasSize - baseStart - baseSize, canvasSize)
  return roundPercent(Math.min(Math.max(offsetPercent, min), max))
}

export interface ClampOffsetInput {
  /** The layer's untransformed box on the canvas, in pixels. */
  base: LayerRect
  canvas: CanvasSize
  /** Candidate `x`, as a canvas percentage. */
  x: number
  /** Candidate `y`, as a canvas percentage. */
  y: number
}

/**
 * Keeps a candidate offset inside the canvas where that is possible.
 *
 * Callers without a measured box skip this entirely, which is why every
 * consumer treats the clamp as best effort rather than as a rule.
 */
export const clampOffsetPercent = ({ base, canvas, x, y }: ClampOffsetInput): GeometryDelta => ({
  dx: clampAxisPercent(base.left, rectWidth(base), canvas.width, x),
  dy: clampAxisPercent(base.top, rectHeight(base), canvas.height, y),
})

/**
 * The store margin the canvas guides draw, as a percentage of the canvas.
 *
 * Store listings reserve a margin outside the artwork, and a landscape canvas
 * needs proportionally more of it vertically because the art is shorter. These
 * are authoring guides only: nothing in the export path reads them.
 */
export const PORTRAIT_CANVAS_SAFE_AREA = { topPercent: 4, bottomPercent: 4, inlinePercent: 5 } as const
export const LANDSCAPE_CANVAS_SAFE_AREA = { topPercent: 6, bottomPercent: 6, inlinePercent: 4 } as const

export interface CanvasSafeArea {
  topPercent: number
  bottomPercent: number
  inlinePercent: number
}

/** Picks the margin that matches the orientation of the export profile. */
export const resolveCanvasSafeArea = (canvas: CanvasSize): CanvasSafeArea =>
  canvas.width > canvas.height
    ? { ...LANDSCAPE_CANVAS_SAFE_AREA }
    : { ...PORTRAIT_CANVAS_SAFE_AREA }

export type CanvasGuideKind = 'safe-area' | 'center' | 'thirds'

export interface CanvasGuideLine {
  id: string
  kind: 'center' | 'thirds'
  orientation: GuideAxis
  /** Distance from the leading edge, as a percentage of that axis. */
  positionPercent: number
  label: string
}

export interface CanvasGuides {
  canvas: CanvasSize
  safeArea: CanvasSafeArea
  /** The safe-area box, as insets in percent. */
  safeAreaInset: { top: number; right: number; bottom: number; left: number }
  lines: CanvasGuideLine[]
  /**
   * Guides are decoration over the artwork. They never take a pointer, and they
   * are never rendered into the export stage, so the constant is part of the
   * contract rather than a hint.
   */
  interactive: false
}

/** The two lines a third-divided canvas needs on one axis. */
const thirdPositions = [100 / 3, 200 / 3]

/**
 * Builds the guide overlay for one canvas: the store margin, the centre cross,
 * and the thirds grid.
 *
 * Positions are percentages, so the same description drives the preview at any
 * size and the overlay never has to be measured.
 */
export const describeCanvasGuides = (canvas: CanvasSize): CanvasGuides => {
  const safeArea = resolveCanvasSafeArea(canvas)
  const center = 50
  const lines: CanvasGuideLine[] = [
    { id: 'center-v', kind: 'center', orientation: 'vertical', positionPercent: center, label: 'Vertical centre' },
    { id: 'center-h', kind: 'center', orientation: 'horizontal', positionPercent: center, label: 'Horizontal centre' },
    ...thirdPositions.map((position, index): CanvasGuideLine => ({
      id: `thirds-v-${index + 1}`,
      kind: 'thirds',
      orientation: 'vertical',
      positionPercent: roundPercent(position),
      label: `Vertical third ${index + 1}`,
    })),
    ...thirdPositions.map((position, index): CanvasGuideLine => ({
      id: `thirds-h-${index + 1}`,
      kind: 'thirds',
      orientation: 'horizontal',
      positionPercent: roundPercent(position),
      label: `Horizontal third ${index + 1}`,
    })),
  ]

  return {
    canvas,
    safeArea,
    safeAreaInset: {
      top: safeArea.topPercent,
      right: safeArea.inlinePercent,
      bottom: safeArea.bottomPercent,
      left: safeArea.inlinePercent,
    },
    lines,
    interactive: false,
  }
}

/**
 * The positions one axis snaps to: both edges, the centre, both thirds, and the
 * safe-area inset on that axis.
 */
export const guideSnapPositions = (guides: CanvasGuides, axis: GuideAxis): number[] => {
  const safeAreaPosition = axis === 'horizontal'
    ? guides.safeArea.inlinePercent
    : guides.safeArea.topPercent
  return [
    0,
    safeAreaPosition,
    ...thirdPositions.map((position) => roundPercent(position)),
    50,
    roundPercent(100 - safeAreaPosition),
    100,
  ].sort((a, b) => a - b)
}
