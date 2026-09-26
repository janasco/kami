import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { flowboardStageIds, flowboardStageKeyTarget, type FlowboardStageId, type FlowboardStageSummary } from '../../lib/flowboardStages'

/**
 * The stage list, in its two shapes.
 *
 * - `rail` is the compact vertical list inside the right rail.
 * - `bar` is the horizontal selector that sits above the stage content on a
 *   phone, where the rail is a sheet the author has to open.
 *
 * Both shapes render the same five stages with the same states, and both keep
 * the roving focus and arrow-key movement, so moving between them never changes
 * how the shell is operated.
 */
export type FlowboardStepsVariant = 'rail' | 'bar'

interface FlowboardStepsProps {
  stages: FlowboardStageSummary[]
  activeId: FlowboardStageId
  onSelect: (id: FlowboardStageId) => void
  variant?: FlowboardStepsVariant
}

const stateGlyph: Record<FlowboardStageSummary['state'], string> = {
  ready: '✓',
  attention: '!',
  idle: '○',
}

/**
 * Stage navigation for the Full Editor.
 *
 * Every stage is freely reachable, so this is a list of buttons with roving
 * focus and arrow-key movement rather than a gated wizard. It carries the stage
 * name and its state only: the reason for that state is stated once, in the
 * rail, instead of being repeated on every entry.
 */
export function FlowboardSteps({ stages, activeId, onSelect, variant = 'rail' }: FlowboardStepsProps) {
  const buttonRefs = useRef(new Map<FlowboardStageId, HTMLButtonElement>())
  const activeIndex = Math.max(0, flowboardStageIds.indexOf(activeId))

  const focusStage = (id: FlowboardStageId) => {
    onSelect(id)
    buttonRefs.current.get(id)?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: FlowboardStageId) => {
    const target = flowboardStageKeyTarget(id, event.key)
    if (!target) return
    event.preventDefault()
    focusStage(target)
  }

  return (
    <nav
      className={`flowboard-steps flowboard-steps--${variant}`}
      aria-label={variant === 'bar' ? 'Editor steps' : 'Steps'}
    >
      {variant === 'rail' && (
        <div className="flowboard-steps__heading">
          <span className="eyebrow">Flowboard</span>
          <strong>Steps</strong>
        </div>
      )}
      <ol className="flowboard-steps__list" role="list">
        {stages.map((stage, index) => {
          const isActive = stage.id === activeId
          return (
            <li key={stage.id}>
              <button
                className={`flowboard-step flowboard-step--${stage.state}${isActive ? ' is-active' : ''}`}
                type="button"
                ref={(element) => {
                  if (element) buttonRefs.current.set(stage.id, element)
                  else buttonRefs.current.delete(stage.id)
                }}
                tabIndex={index === activeIndex ? 0 : -1}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`${stage.name} stage, ${stage.stateLabel}. ${stage.purpose}`}
                onClick={() => onSelect(stage.id)}
                onKeyDown={(event) => handleKeyDown(event, stage.id)}
              >
                <span className="flowboard-step__index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="flowboard-step__name">{stage.name}</span>
                <span className={`flowboard-step__state flowboard-step__state--${stage.state}`}>
                  <i aria-hidden="true">{stateGlyph[stage.state]}</i>
                  <span className="flowboard-step__state-text">{stage.stateLabel}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
