/**
 * Align, distribute, and stacking actions for the active slide.
 *
 * Each action is a small description rather than a prepared `Partial<Slide>`,
 * which is the same pattern the bulk action bar uses: the controls stay
 * declarative, the notice can describe what was asked for, and the editor
 * applies the result through `commitEditorUpdate` so autosave, undo, and redo
 * behave exactly like any other single edit.
 *
 * All of the measuring and deciding lives in `layerGeometry` and `layerOrder`.
 * This module is the part that knows about a slide: which layers may be
 * arranged, how a stored transform maps onto a measured box, and what to write
 * back.
 */

import { slideLayerIds, slideLayerLabels } from '../data'
import {
  alignDeltaPercent,
  describeAlignAction,
  describeDistributeAction,
  distributeDeltaPercent,
  frameRect,
  offsetRect,
  roundPercent,
  transformOffsetPx,
  untransformRect,
  unionRect,
  type AlignAction,
  type CanvasSize,
  type DistributeAction,
  type LayerRect,
} from './layerGeometry'
import { isDefaultLayerOrder, moveLayerInOrder, resolveLayerOrder } from './layerOrder'
import type { PreflightLayerBounds, PreflightRect } from './exportPreflight'
import type { LayerId, Slide } from '../types'

/** Whether an action moves one layer or the composition of every visible layer. */
export type ArrangeScope = 'layer' | 'composition'

export type LayerOrderDirection = 'forward' | 'backward'

export type LayerArrangeAction =
  | { kind: 'align'; align: AlignAction; scope: ArrangeScope }
  | { kind: 'distribute'; distribute: DistributeAction }
  | { kind: 'order'; direction: LayerOrderDirection }

/**
 * Layers that alignment and distribution consider.
 *
 * The background image is left out on purpose: it is a full-bleed backdrop whose
 * box is the whole canvas, so including it would make every alignment resolve to
 * "line up with the edge of the slide" and every distribution meaningless.
 */
export const arrangeableLayerIds: readonly LayerId[] = slideLayerIds.filter((id) => id !== 'background-image')

/** The align bar offers both scopes; distribution and stacking are layer-only. */
export const arrangeScopes: readonly ArrangeScope[] = ['layer', 'composition']

export const describeArrangeScope = (scope: ArrangeScope): string =>
  scope === 'layer' ? 'Selected layer' : 'Whole composition'

export const describeLayerOrderDirection = (direction: LayerOrderDirection): string =>
  direction === 'forward' ? 'Bring forward' : 'Send backward'

/** Sentence shown in the notice after an action is applied. */
export const describeLayerArrangeAction = (action: LayerArrangeAction, layerId: LayerId): string => {
  const layer = slideLayerLabels[layerId]
  switch (action.kind) {
    case 'align':
      return action.scope === 'composition'
        ? `${describeAlignAction(action.align)} on the whole composition`
        : `${describeAlignAction(action.align)}: ${layer}`
    case 'distribute':
      return `${describeDistributeAction(action.distribute)} around ${layer.toLowerCase()}`
    case 'order':
      return `${describeLayerOrderDirection(action.direction)}: ${layer}`
  }
}

/**
 * History merge key for one arrange action.
 *
 * The token makes every press its own undo step, which is what an align or a
 * stacking move is: a discrete decision, not a drag that should coalesce. The
 * action is in the key as well, so two different actions never share an entry
 * even if the editor is asked to merge them.
 */
export const layerArrangeMergeKey = (
  action: LayerArrangeAction,
  slideId: string,
  token: number,
): string => {
  const detail = action.kind === 'align'
    ? `align:${action.align}:${action.scope}`
    : action.kind === 'distribute'
      ? `distribute:${action.distribute}`
      : `order:${action.direction}`
  return `layer-arrange:${slideId}:${token}:${detail}`
}

/** A measured layer box in canvas pixels, or null when the layer is not drawn. */
const measuredRect = (bounds: PreflightLayerBounds | undefined, layerId: LayerId): LayerRect | null => {
  const rect: PreflightRect | undefined = bounds?.[layerId]
  if (!rect) return null
  const layer: LayerRect = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  return [layer.left, layer.top, layer.right, layer.bottom].every(Number.isFinite) ? layer : null
}

/**
 * The base box of one layer: its measured box with the stored translate removed.
 *
 * Alignment reasons about the untransformed box, so the offset it is about to
 * change is not counted twice.
 */
const baseBoxFor = (
  slide: Slide,
  layerId: LayerId,
  bounds: PreflightLayerBounds | undefined,
  canvas: CanvasSize,
): LayerRect | null => {
  const measured = measuredRect(bounds, layerId)
  return measured ? untransformRect(measured, slide.layerTransforms[layerId], canvas) : null
}

export interface ArrangeAvailability {
  align: boolean
  distributeHorizontal: boolean
  distributeVertical: boolean
  order: boolean
  /** Why an action is unavailable, for the disabled control's tooltip. */
  reason: string
}

export interface ArrangeAvailabilityInput {
  slide: Slide
  selectedLayerId: LayerId
  bounds: PreflightLayerBounds | undefined
  canvas: CanvasSize
}

/**
 * Which arrange actions the current slide can honour.
 *
 * Both surfaces ask this rather than deciding for themselves, so the Refine tray
 * and the full Inspector disable the same buttons with the same explanation.
 */
export const describeArrangeAvailability = ({
  slide,
  selectedLayerId,
  bounds,
  canvas,
}: ArrangeAvailabilityInput): ArrangeAvailability => {
  const unmeasured = 'The canvas has not been measured yet, so there is nothing to align against.'
  if (!Number.isFinite(canvas.width) || canvas.width <= 0 || !Number.isFinite(canvas.height) || canvas.height <= 0) {
    return { align: false, distributeHorizontal: false, distributeVertical: false, order: true, reason: unmeasured }
  }

  const boxes = arrangeableLayerIds
    .map((layerId) => ({ layerId, box: baseBoxFor(slide, layerId, bounds, canvas) }))
    .filter((entry): entry is { layerId: LayerId; box: LayerRect } => entry.box !== null)
  const selected = boxes.find((entry) => entry.layerId === selectedLayerId)
  const others = boxes.filter((entry) => entry.layerId !== selectedLayerId)
  const total = selected ? others.length + 1 : 0
  const composition = unionRect(boxes.map((entry) => entry.box))
  const hasRoom = total >= 3

  return {
    align: Boolean(selected) || Boolean(composition),
    distributeHorizontal: Boolean(selected) && hasRoom,
    distributeVertical: Boolean(selected) && hasRoom,
    order: true,
    reason: selected
      ? (hasRoom ? '' : 'Distribution needs at least three measured layers on the canvas.')
      : unmeasured,
  }
}

export interface LayerArrangeInput extends ArrangeAvailabilityInput {
  action: LayerArrangeAction
}

export interface LayerArrangeResult {
  /** The updated slide, or the one that was passed in when nothing moved. */
  slide: Slide
  changed: boolean
  description: string
}

/**
 * Applies one arrange action to a slide.
 *
 * The result is the same `Slide` object when the request cannot apply, so the
 * editor can skip the history entry entirely: an alignment that is already
 * satisfied, a distribution with no gap to equalise, and a stacking move at the
 * end of the stack are all no-ops rather than empty history steps.
 */
export const applyLayerArrange = ({
  slide,
  action,
  selectedLayerId,
  bounds,
  canvas,
}: LayerArrangeInput): LayerArrangeResult => {
  const description = describeLayerArrangeAction(action, selectedLayerId)
  const unchanged: LayerArrangeResult = { slide, changed: false, description }
  if (!Number.isFinite(canvas.width) || canvas.width <= 0 || !Number.isFinite(canvas.height) || canvas.height <= 0) {
    return unchanged
  }

  if (action.kind === 'order') {
    const order = resolveLayerOrder(slide.layerOrder)
    const next = moveLayerInOrder(order, selectedLayerId, action.direction === 'forward' ? 1 : -1)
    if (next.every((layerId, index) => layerId === order[index])) return unchanged
    return {
      slide: { ...slide, layerOrder: isDefaultLayerOrder(next) ? undefined : next },
      changed: true,
      description,
    }
  }

  if (action.kind === 'align') {
    const delta = action.scope === 'composition'
      ? alignCompositionDelta(slide, action.align, bounds, canvas)
      : alignLayerDelta(slide, selectedLayerId, action.align, bounds, canvas)
    if (!delta) return unchanged
    return { slide: delta, changed: true, description }
  }

  const subject = baseBoxFor(slide, selectedLayerId, bounds, canvas)
  if (!subject) return unchanged
  const others = arrangeableLayerIds
    .filter((layerId) => layerId !== selectedLayerId)
    .map((layerId) => baseBoxFor(slide, layerId, bounds, canvas))
  const delta = distributeDeltaPercent(action.distribute, subject, others, canvas)
  if (!delta || (delta.dx === 0 && delta.dy === 0)) return unchanged

  const transform = slide.layerTransforms[selectedLayerId]
  return {
    slide: {
      ...slide,
      layerTransforms: {
        ...slide.layerTransforms,
        [selectedLayerId]: {
          ...transform,
          x: roundPercent(transform.x + delta.dx),
          y: roundPercent(transform.y + delta.dy),
        },
      },
    },
    changed: true,
    description,
  }
}

/** The new `Slide` that puts the selected layer on the requested edge. */
const alignLayerDelta = (
  slide: Slide,
  layerId: LayerId,
  align: AlignAction,
  bounds: PreflightLayerBounds | undefined,
  canvas: CanvasSize,
): Slide | null => {
  const subject = baseBoxFor(slide, layerId, bounds, canvas)
  if (!subject) return null
  const delta = alignDeltaPercent(align, subject, [frameRect(canvas)], canvas)
  if (!delta || (delta.dx === 0 && delta.dy === 0)) return null

  const transform = slide.layerTransforms[layerId]
  return {
    ...slide,
    layerTransforms: {
      ...slide.layerTransforms,
      [layerId]: {
        ...transform,
        x: roundPercent(transform.x + delta.dx),
        y: roundPercent(transform.y + delta.dy),
      },
    },
  }
}

/**
 * The new `Slide` that puts the composition of visible layers on the requested
 * edge, by moving the composition transform rather than each layer.
 *
 * The composition box is the union of the measured layers with the composition
 * offset removed, so "centre the composition" means the drawn artwork is
 * centred, not that eight transforms all changed at once.
 */
const alignCompositionDelta = (
  slide: Slide,
  align: AlignAction,
  bounds: PreflightLayerBounds | undefined,
  canvas: CanvasSize,
): Slide | null => {
  const drawn = unionRect(arrangeableLayerIds.map((layerId) => measuredRect(bounds, layerId)))
  if (!drawn) return null
  const offset = transformOffsetPx(slide.transform, canvas)
  const composition = offsetRect(drawn, -offset.dx, -offset.dy)
  const delta = alignDeltaPercent(align, composition, [frameRect(canvas)], canvas)
  if (!delta || (delta.dx === 0 && delta.dy === 0)) return null

  return {
    ...slide,
    transform: {
      ...slide.transform,
      x: roundPercent(slide.transform.x + delta.dx),
      y: roundPercent(slide.transform.y + delta.dy),
    },
  }
}
