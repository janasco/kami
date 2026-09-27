/**
 * Optional per-slide layer ordering.
 *
 * Stacking used to be fixed by the stylesheet, so the only way to change it was
 * to edit CSS. A slide can now carry its own bottom-to-top order as a list of
 * layer ids, which is resolved on read and written on save.
 *
 * The field is optional and additive at every step, which is why the project
 * version does not move:
 *
 * - A slide without the field resolves to {@link DEFAULT_LAYER_ORDER}, so an
 *   older project, an older autosave, and a fresh slide all draw exactly as they
 *   did before.
 * - A stored order is never trusted wholesale. Unknown ids are dropped, repeats
 *   are collapsed, and anything missing is appended in the default order, so a
 *   hand-edited or partial list still yields every layer exactly once.
 * - A slide whose order resolves back to the default writes no field at all, so
 *   an untouched deck saves byte-for-byte as it did.
 *
 * The order is applied as a `z-index` inside the canvas content wrapper rather
 * than by moving elements in the DOM. The wrapper is already a stacking context,
 * and leaving the markup order alone means a customized slide is the only case
 * where the stacking changes at all.
 */

import { slideLayerIds } from '../data'
import type { LayerId, Slide } from '../types'

/** Bottom-to-top order used by a slide that has no custom order. */
export const DEFAULT_LAYER_ORDER: readonly LayerId[] = slideLayerIds

/** Narrowing guard for a value that came out of the project file. */
export const isLayerId = (value: unknown): value is LayerId =>
  typeof value === 'string' && (DEFAULT_LAYER_ORDER as readonly string[]).includes(value)

/**
 * Completes an order into a full stacking list.
 *
 * Ids that are not layers, and ids repeated inside the stored list, are dropped.
 * Any layer the list does not mention is appended in the default order, so the
 * result always has every layer once and never depends on the caller having
 * remembered to handle a new layer.
 */
export const resolveLayerOrder = (order?: readonly unknown[] | null): LayerId[] => {
  const seen = new Set<LayerId>()
  const resolved: LayerId[] = []

  if (Array.isArray(order)) {
    for (const value of order) {
      if (!isLayerId(value) || seen.has(value)) continue
      seen.add(value)
      resolved.push(value)
    }
  }

  for (const layerId of DEFAULT_LAYER_ORDER) {
    if (seen.has(layerId)) continue
    resolved.push(layerId)
  }

  return resolved
}

/**
 * True when the slide draws in the default stacking order.
 *
 * An absent, empty, or malformed value counts as the default: there is no stored
 * order to honour, so the catalog order is what the slide uses.
 */
export const isDefaultLayerOrder = (order?: readonly LayerId[] | null): boolean => {
  if (!Array.isArray(order)) return true
  if (order.length !== DEFAULT_LAYER_ORDER.length) return false
  return order.every((layerId, index) => layerId === DEFAULT_LAYER_ORDER[index])
}

/** The stacking order a slide actually draws in. */
export const layerOrderForSlide = (slide: Pick<Slide, 'layerOrder'>): LayerId[] =>
  isDefaultLayerOrder(slide.layerOrder) ? [...DEFAULT_LAYER_ORDER] : resolveLayerOrder(slide.layerOrder)

/**
 * The `z-index` a layer takes from a custom order, or undefined when the
 * stylesheet value should stand.
 *
 * Returning undefined for a default order is the important half: it leaves the
 * existing per-layer stacking untouched for every deck that has not asked for a
 * different one.
 */
export const layerOrderZIndex = (order: readonly LayerId[] | undefined, layerId: LayerId): number | undefined => {
  if (isDefaultLayerOrder(order)) return undefined
  const index = resolveLayerOrder(order).indexOf(layerId)
  return index < 0 ? undefined : index + 1
}

/**
 * Moves one layer through the stack.
 *
 * A layer already at the top or the bottom stays where it is, so the caller can
 * compare the result and skip a no-op instead of writing a new array.
 */
export const moveLayerInOrder = (
  order: readonly LayerId[] | undefined,
  layerId: LayerId,
  direction: 1 | -1,
): LayerId[] => {
  const resolved = resolveLayerOrder(order)
  const index = resolved.indexOf(layerId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= resolved.length) return resolved

  const next = [...resolved]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  return next
}

/**
 * Turns a stored order into the value to save, or undefined when there is
 * nothing worth saving.
 *
 * Returning undefined keeps the field out of a deck that has not reordered
 * anything, which is what makes the addition backward compatible rather than a
 * new requirement on every project.
 */
export const serializeLayerOrder = (order?: readonly unknown[] | null): LayerId[] | undefined => {
  if (!Array.isArray(order)) return undefined
  const resolved = resolveLayerOrder(order)
  return isDefaultLayerOrder(resolved) ? undefined : resolved
}

/** The inverse of {@link serializeLayerOrder}, tolerant of a malformed value. */
export const parseLayerOrder = (value: unknown): LayerId[] | undefined => {
  if (!Array.isArray(value)) return undefined
  return serializeLayerOrder(value)
}
