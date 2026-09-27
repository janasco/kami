/**
 * One layer transform editor, shared by the Refine tray and the full Inspector.
 *
 * Both surfaces already had to offer position, scale, and rotation for the
 * selected layer, and they had drifted: the tray clamped a value the Inspector
 * accepted, and each kept its own field list, unit hints, and aria labels. The
 * numbers, the clamping, and the markup now live here, and each caller only
 * supplies its own id prefix and its own slot for extra actions, so the two
 * panels cannot disagree about what a transform is.
 *
 * Nothing about where an edit is stored lives in this component either: it hands
 * back a `Partial<Slide>` and a merge key, and the caller's existing
 * `onUpdate` decides the rest, exactly as the hand-written fields did.
 */

import { DEFAULT_SLIDE_TRANSFORM, slideLayerLabels, TRANSFORM_SIZE_MAX, TRANSFORM_SIZE_MIN } from '../data'
import type { LayerId, LayerTransforms, Slide, SlideTransform } from '../types'

/** The transform fields a numeric input can write. */
export type LayerTransformField = 'x' | 'y' | 'scale' | 'rotation' | 'widthScale' | 'heightScale'

/** Every numeric field, in the order the grid renders them. */
export const layerTransformFields: readonly LayerTransformField[] = [
  'x', 'y', 'scale', 'rotation', 'widthScale', 'heightScale',
]

/** The four fields the primary grid shows. */
export const layerTransformPrimaryFields: readonly LayerTransformField[] = ['x', 'y', 'scale', 'rotation']

/** The two size fields the secondary grid shows. */
export const layerTransformSizeFields: readonly LayerTransformField[] = ['widthScale', 'heightScale']

/** The id segment a field contributes, exposed so a test can name every input. */
export const layerTransformFieldId = (prefix: string, field: LayerTransformField): string =>
  `${prefix}-${idSegmentByField[field]}`

const unitByField: Record<LayerTransformField, string> = {
  x: '%',
  y: '%',
  scale: '×',
  rotation: '°',
  widthScale: '×',
  heightScale: '×',
}

const labelByField: Record<LayerTransformField, string> = {
  x: 'Position X',
  y: 'Position Y',
  scale: 'Scale',
  rotation: 'Rotation',
  widthScale: 'Width scale',
  heightScale: 'Height scale',
}

const describedByField: Record<LayerTransformField, string> = {
  x: 'position X percentage',
  y: 'position Y percentage',
  scale: 'scale',
  rotation: 'rotation in degrees',
  widthScale: 'width scale',
  heightScale: 'height scale',
}

/**
 * The id segment for a field, in the kebab case the existing field ids use.
 *
 * The camel-case field name is the TypeScript key, and putting it straight into
 * an id would quietly rename `layer-transform-width-scale`, which is a public
 * label other surfaces and tests refer to.
 */
const idSegmentByField: Record<LayerTransformField, string> = {
  x: 'x',
  y: 'y',
  scale: 'scale',
  rotation: 'rotation',
  widthScale: 'width-scale',
  heightScale: 'height-scale',
}

/**
 * The value a field accepts, or null when the input cannot be stored.
 *
 * `scale` only has to stay positive, which is what both inputs already declared
 * as their minimum. The two size scales are the ones with a real range, so they
 * are held inside it: a size scale outside the range produces a project the
 * validator rejects on the next open.
 */
export const sanitizeLayerTransformValue = (field: LayerTransformField, value: number): number | null => {
  if (!Number.isFinite(value)) return null
  if (field === 'scale') return value > 0 ? value : null
  if (field === 'widthScale' || field === 'heightScale') {
    return Math.min(TRANSFORM_SIZE_MAX, Math.max(TRANSFORM_SIZE_MIN, value))
  }
  return value
}

export interface LayerTransformUpdate {
  updates: Partial<Slide>
  /** The key that decides whether a burst of typing is one undo step. */
  mergeKey: string
}

/**
 * The update one field edit writes, or null when the value is not storable.
 *
 * The field-specific merge key is unchanged from the hand-written version, so
 * typing in a field still coalesces into one undo step after the shared
 * extraction.
 */
export const layerTransformUpdate = (
  slide: Slide,
  layerId: LayerId,
  field: LayerTransformField,
  value: number,
): LayerTransformUpdate | null => {
  const safeValue = sanitizeLayerTransformValue(field, value)
  const transform = slide.layerTransforms[layerId]
  if (safeValue === null || !transform || transform[field] === safeValue) return null

  return {
    updates: {
      layerTransforms: {
        ...slide.layerTransforms,
        [layerId]: { ...transform, [field]: safeValue },
      } as LayerTransforms,
    },
    mergeKey: `layer-transform:${slide.id}:${layerId}:${field}`,
  }
}

/** True when the transform still holds every default value for its layer. */
export const isDefaultLayerTransform = (transform: SlideTransform): boolean =>
  layerTransformFields.every((field) => transform[field] === DEFAULT_SLIDE_TRANSFORM[field])
  && transform.flipX === DEFAULT_SLIDE_TRANSFORM.flipX
  && transform.flipY === DEFAULT_SLIDE_TRANSFORM.flipY

/** The update that restores the defaults for one layer. */
export const layerTransformResetUpdate = (slide: Slide, layerId: LayerId): LayerTransformUpdate => ({
  updates: {
    layerTransforms: {
      ...slide.layerTransforms,
      [layerId]: { ...DEFAULT_SLIDE_TRANSFORM },
    } as LayerTransforms,
  },
  mergeKey: `layer-transform:${slide.id}:${layerId}:reset`,
})

export interface LayerTransformControlsProps {
  slide: Slide
  layerId: LayerId
  /**
   * Prefixed onto every field id, so the same control can appear twice on one
   * page without colliding. `"layer-transform"` reproduces the Inspector ids and
   * `"flowboard-transform"` the Refine tray ids.
   */
  idPrefix: string
  onUpdate: (updates: Partial<Slide>, mergeKey?: string) => void
  /** Rendered above the grids, for a surface's own heading actions. */
  actions?: React.ReactNode
}

const TransformField = ({
  field,
  id,
  label,
  describedBy,
  value,
  onCommit,
}: {
  field: LayerTransformField
  id: string
  label: string
  describedBy: string
  value: number
  onCommit: (value: number) => void
}) => (
  <div className="transform-field">
    <label className="field-label" htmlFor={id}>{label}</label>
    <div className="transform-input-wrap">
      <input
        id={id}
        className="transform-input"
        type="number"
        min={field === 'widthScale' || field === 'heightScale' ? TRANSFORM_SIZE_MIN : undefined}
        max={field === 'widthScale' || field === 'heightScale' ? TRANSFORM_SIZE_MAX : undefined}
        step={field === 'scale' || field === 'widthScale' || field === 'heightScale' ? '0.05' : '1'}
        value={value}
        aria-label={describedBy}
        onChange={(event) => onCommit(Number(event.target.value))}
      />
      <span aria-hidden="true">{unitByField[field]}</span>
    </div>
  </div>
)

export function LayerTransformControls({
  slide,
  layerId,
  idPrefix,
  onUpdate,
  actions,
}: LayerTransformControlsProps) {
  const transform = slide.layerTransforms[layerId]
  const layerLabel = slideLayerLabels[layerId]

  const commit = (field: LayerTransformField) => (value: number) => {
    const update = layerTransformUpdate(slide, layerId, field, value)
    if (!update) return
    onUpdate(update.updates, update.mergeKey)
  }

  const setFlip = (flip: 'flipX' | 'flipY', value: boolean) => {
    if (transform[flip] === value) return
    onUpdate({
      layerTransforms: {
        ...slide.layerTransforms,
        [layerId]: { ...transform, [flip]: value },
      },
    }, `layer-transform:${slide.id}:${layerId}:${flip}`)
  }

  return (
    <div className="layer-transform-controls">
      {actions && <div className="layer-transform-controls__actions">{actions}</div>}
      <div className="transform-grid">
        {layerTransformPrimaryFields.map((field) => (
          <TransformField
            key={field}
            field={field}
            id={layerTransformFieldId(idPrefix, field)}
            label={labelByField[field]}
            describedBy={`${layerLabel} ${describedByField[field]}`}
            value={transform[field]}
            onCommit={commit(field)}
          />
        ))}
      </div>
      <div className="transform-grid transform-grid--size" role="group" aria-label="Layer size">
        {layerTransformSizeFields.map((field) => (
          <TransformField
            key={field}
            field={field}
            id={layerTransformFieldId(idPrefix, field)}
            label={labelByField[field]}
            describedBy={`${layerLabel} ${describedByField[field]}`}
            value={transform[field]}
            onCommit={commit(field)}
          />
        ))}
      </div>
      <div className="transform-flip-controls" role="group" aria-label={`${layerLabel} flips`}>
        <label className="transform-flip-control" htmlFor={`${idPrefix}-flip-x`}>
          <input
            id={`${idPrefix}-flip-x`}
            type="checkbox"
            checked={transform.flipX}
            onChange={(event) => setFlip('flipX', event.target.checked)}
          />
          <span>Flip horizontal</span>
        </label>
        <label className="transform-flip-control" htmlFor={`${idPrefix}-flip-y`}>
          <input
            id={`${idPrefix}-flip-y`}
            type="checkbox"
            checked={transform.flipY}
            onChange={(event) => setFlip('flipY', event.target.checked)}
          />
          <span>Flip vertical</span>
        </label>
      </div>
    </div>
  )
}

export interface LayerTransformResetButtonProps {
  slide: Slide
  layerId: LayerId
  onUpdate: (updates: Partial<Slide>, mergeKey?: string) => void
  className?: string
}

/**
 * The reset control, shared by both surfaces so "is this layer at its defaults"
 * is answered once.
 */
export function LayerTransformResetButton({
  slide,
  layerId,
  onUpdate,
  className = 'text-button text-button--compact',
}: LayerTransformResetButtonProps) {
  const transform = slide.layerTransforms[layerId]
  return (
    <button
      className={className}
      type="button"
      disabled={isDefaultLayerTransform(transform)}
      onClick={() => {
        const update = layerTransformResetUpdate(slide, layerId)
        onUpdate(update.updates, update.mergeKey)
      }}
      aria-label={`Reset ${slideLayerLabels[layerId]} transform`}
    >
      Reset
    </button>
  )
}
