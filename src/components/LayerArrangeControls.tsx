/**
 * The arrange bar: align, distribute, and stacking, in one place.
 *
 * Both editing surfaces offer the same actions against the same layer, so the
 * controls, their labels, and their disabled states come from one component.
 * Whether an action can apply is decided by `describeArrangeAvailability`, which
 * looks at the measured canvas boxes rather than at anything the caller has to
 * keep in sync.
 *
 * Every button hands back a {@link LayerArrangeAction} description. Nothing here
 * writes to the project, so one press is one undo step no matter which surface
 * asked for it.
 */

import { slideLayerLabels } from '../data'
import {
  alignActions,
  describeAlignAction,
  distributeActions,
  type AlignAction,
  type DistributeAction,
} from '../lib/layerGeometry'
import {
  arrangeScopes,
  describeArrangeAvailability,
  describeArrangeScope,
  describeLayerOrderDirection,
  type ArrangeScope,
  type LayerArrangeAction,
  type LayerOrderDirection,
} from '../lib/layerArrange'
import type { PreflightLayerBoundsBySlide } from '../lib/exportPreflight'
import type { ExportProfile, LayerId, Slide } from '../types'

/** Glyph for each align request, drawn from a box and a rule. */
const alignGlyph: Record<AlignAction, string> = {
  left: '⇤',
  'center-h': '⇷',
  right: '⇥',
  top: '⤒',
  'center-v': '⇳',
  bottom: '⤓',
}

const distributeGlyph: Record<DistributeAction, string> = {
  horizontal: '⇹',
  vertical: '⇳',
}

const orderDirection: LayerOrderDirection[] = ['forward', 'backward']

export interface LayerArrangeControlsProps {
  slide: Slide
  selectedLayerId: LayerId
  /** Measured layer boxes, already relative to the canvas, keyed by slide id. */
  layerBounds: PreflightLayerBoundsBySlide
  profile: ExportProfile
  onArrange: (action: LayerArrangeAction) => void
  idPrefix: string
  /** Which scope the align buttons act on. */
  scope: ArrangeScope
  onScopeChange: (scope: ArrangeScope) => void
}

export function LayerArrangeControls({
  slide,
  selectedLayerId,
  layerBounds,
  profile,
  onArrange,
  idPrefix,
  scope,
  onScopeChange,
}: LayerArrangeControlsProps) {
  const canvas = { width: profile.width, height: profile.height }
  const availability = describeArrangeAvailability({
    slide,
    selectedLayerId,
    bounds: layerBounds[slide.id],
    canvas,
  })
  const layerLabel = slideLayerLabels[selectedLayerId]

  return (
    <div className="layer-arrange">
      <div className="layer-arrange__group" role="group" aria-label="Arrange scope">
        {arrangeScopes.map((option) => (
          <button
            key={option}
            id={`${idPrefix}-scope-${option}`}
            className={`layer-arrange__scope${scope === option ? ' is-active' : ''}`}
            type="button"
            aria-pressed={scope === option}
            onClick={() => onScopeChange(option)}
          >
            {describeArrangeScope(option)}
          </button>
        ))}
      </div>

      <div className="layer-arrange__group" role="group" aria-label={`Align ${scope === 'layer' ? layerLabel.toLowerCase() : 'the composition'}`}>
        {alignActions.map((action) => (
          <button
            key={action}
            className="layer-arrange__action"
            type="button"
            disabled={!availability.align}
            title={availability.align ? undefined : availability.reason}
            aria-label={describeAlignAction(action)}
            onClick={() => onArrange({ kind: 'align', align: action, scope })}
          >
            <span aria-hidden="true">{alignGlyph[action]}</span>
          </button>
        ))}
      </div>

      <div className="layer-arrange__group" role="group" aria-label="Distribute layers">
        {distributeActions.map((action) => {
          const enabled = action === 'horizontal'
            ? availability.distributeHorizontal
            : availability.distributeVertical
          return (
            <button
              key={action}
              className="layer-arrange__action"
              type="button"
              disabled={!enabled}
              title={enabled ? undefined : availability.reason}
              aria-label={action === 'horizontal' ? 'Distribute horizontally' : 'Distribute vertically'}
              onClick={() => onArrange({ kind: 'distribute', distribute: action })}
            >
              <span aria-hidden="true">{distributeGlyph[action]}</span>
            </button>
          )
        })}
      </div>

      <div className="layer-arrange__group" role="group" aria-label="Layer stacking">
        {orderDirection.map((direction) => (
          <button
            key={direction}
            className="layer-arrange__action"
            type="button"
            disabled={!availability.order}
            aria-label={describeLayerOrderDirection(direction)}
            onClick={() => onArrange({ kind: 'order', direction })}
          >
            <span aria-hidden="true">{direction === 'forward' ? '⤒' : '⤓'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
