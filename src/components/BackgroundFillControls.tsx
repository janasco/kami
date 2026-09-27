/**
 * One background fill editor, shared by the Inspector, the Refine tray, and the
 * Frame stage.
 *
 * Three surfaces already had to answer the same three questions — what paints the
 * back of this slide, which part of the background image matters, and how hard
 * the image sits into the theme — and they would have drifted the way the
 * transform controls did. The dropdown, the fields, the clamping, the labels, and
 * the merge keys all live here, and each caller only supplies its own id prefix
 * and its own slot for a heading, so the three cannot disagree.
 *
 * The control is deliberately one dropdown rather than a mode switch plus a fit
 * switch. `image` and `panoramic` mean the background image layer *is* the fill
 * and differ only in how far it bleeds, and `theme`, `solid`, and `gradient`
 * mean that layer is off, so there is no second switch that could contradict the
 * first.
 *
 * Focal point is two range inputs rather than a drag handle. A focal point that
 * cannot be reached from the keyboard is a focal point some authors cannot set,
 * and two labelled sliders also give the axis and the current value to a screen
 * reader for free. The value is normalized `0..1`, because one slide exports at
 * six profile sizes and a pixel focal point drifts on every one of them.
 *
 * Nothing here writes to the project: the control hands back a `Partial<Slide>`
 * and a merge key, and the caller's existing `onUpdate` decides the rest, exactly
 * as the hand-written fields did.
 */

import {
  backgroundBlendOptions,
  backgroundFillOptions,
  DEFAULT_BACKGROUND_COLOR,
} from '../data'
import {
  clampFocalPoint,
  describeBackgroundFill,
  formatFocalPoint,
  isDefaultFocalPoint,
  resolveBackgroundBlend,
  resolveBackgroundFill,
  resolveBackgroundGradient,
  usesBackgroundImageLayer,
} from '../lib/backgroundFill'
import type { BackgroundBlend, BackgroundFillKind, FocalPoint, Slide } from '../types'

export interface FocalPointFieldsProps {
  value: FocalPoint
  /** Prefixed onto the two input ids, so a page can show the pair twice. */
  idPrefix: string
  /**
   * Called with the whole clamped point rather than one axis, so a caller never
   * has to remember what the other axis was.
   */
  onChange: (point: FocalPoint) => void
  /** Announced prefix for the two sliders, e.g. "Background image". */
  label: string
}

/**
 * The two-axis focal point editor.
 *
 * Exported so the bulk bar moves a whole selection's focal point through exactly
 * the same control, the same labels, and the same clamping.
 */
export function FocalPointFields({ value, idPrefix, onChange, label }: FocalPointFieldsProps) {
  const point = clampFocalPoint(value)
  const centred = isDefaultFocalPoint(point)

  const setAxis = (axis: 'x' | 'y') => (next: number) => onChange(clampFocalPoint({ ...point, [axis]: next }))

  return (
    <div className="background-focal">
      <div className="background-focal__row">
        <div className="layer-opacity-control">
          <div className="layer-opacity-control__label">
            <label className="field-label" htmlFor={`${idPrefix}-focal-x`}>Horizontal</label>
            <output htmlFor={`${idPrefix}-focal-x`}>{Math.round(point.x * 100)}%</output>
          </div>
          <input
            id={`${idPrefix}-focal-x`}
            className="layer-opacity-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={point.x}
            aria-label={`${label} horizontal focal point`}
            aria-valuetext={`${Math.round(point.x * 100)} percent across`}
            onChange={(event) => setAxis('x')(Number(event.target.value))}
          />
        </div>
        <div className="layer-opacity-control">
          <div className="layer-opacity-control__label">
            <label className="field-label" htmlFor={`${idPrefix}-focal-y`}>Vertical</label>
            <output htmlFor={`${idPrefix}-focal-y`}>{Math.round(point.y * 100)}%</output>
          </div>
          <input
            id={`${idPrefix}-focal-y`}
            className="layer-opacity-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={point.y}
            aria-label={`${label} vertical focal point`}
            aria-valuetext={`${Math.round(point.y * 100)} percent down`}
            onChange={(event) => setAxis('y')(Number(event.target.value))}
          />
        </div>
      </div>
      <div className="background-focal__foot">
        <span className="background-focal__readout">{formatFocalPoint(point)}</span>
        <button
          className="text-button text-button--compact"
          type="button"
          disabled={centred}
          onClick={() => onChange({ x: 0.5, y: 0.5 })}
          aria-label={`Recentre the ${label.toLowerCase()}`}
        >
          Recentre
        </button>
      </div>
    </div>
  )
}

export interface BackgroundFillControlsProps {
  slide: Slide
  /**
   * Prefixed onto every control id, so the same control can appear twice on one
   * page without colliding.
   */
  idPrefix: string
  onUpdate: (updates: Partial<Slide>, mergeKey?: string) => void
  /** Rendered above the dropdown, for a surface's own heading. */
  actions?: React.ReactNode
}

export function BackgroundFillControls({ slide, idPrefix, onUpdate, actions }: BackgroundFillControlsProps) {
  const fill = resolveBackgroundFill(slide.backgroundFill)
  const kind = fill.kind
  const imageFill = usesBackgroundImageLayer(kind)
  const gradient = resolveBackgroundGradient(fill.gradient)
  /**
   * The stored angle is honoured as written, but a slider can only show a turn.
   * A hand-edited 720° reads as 0° here, which is the same paint, and moving the
   * slider then writes a plain angle.
   */
  const angleTurns = Math.round((((gradient.angle % 360) + 360) % 360))

  const setKind = (next: BackgroundFillKind) => {
    /*
     * Merging onto the existing record is what keeps a solid colour or a
     * gradient from being forgotten when the author steps through the fills to
     * look at an image and steps back. Everything that does not apply to the new
     * kind is dropped by the same normalizer the renderer and the document use.
     */
    const nextFill = resolveBackgroundFill({ ...slide.backgroundFill, kind: next })
    onUpdate(
      { backgroundFill: next === 'theme' ? undefined : nextFill },
      `background-fill:${slide.id}:${next}`,
    )
  }

  const setColor = (color: string) => onUpdate(
    { backgroundFill: { ...fill, color } },
    `background-fill:${slide.id}:color`,
  )

  const setStops = (stops: string[]) => onUpdate(
    { backgroundFill: { ...fill, gradient: { ...gradient, stops } } },
    `background-fill:${slide.id}:gradient`,
  )

  const setAngle = (angle: number) => onUpdate(
    { backgroundFill: { ...fill, gradient: { ...gradient, angle } } },
    `background-fill:${slide.id}:gradient`,
  )
  const setBlend = (blend: BackgroundBlend) => onUpdate(
    { backgroundFill: resolveBackgroundFill({ kind, blend }) },
    `background-fill:${slide.id}:blend:${blend}`,
  )

  const setFocalPoint = (focalPoint: FocalPoint) => onUpdate(
    // The centre is stored as no field at all, so a slide can go back to
    // unframed and stop claiming a focal point nobody chose.
    { backgroundFocalPoint: isDefaultFocalPoint(focalPoint) ? undefined : focalPoint },
    // Value-free, so one drag of either slider is one undo step.
    `background-focal:${slide.id}`,
  )

  return (
    <div className="background-fill-controls">
      {actions && <div className="background-fill-controls__actions">{actions}</div>}

      <label className="field-label" htmlFor={`${idPrefix}-background-fill`}>Background fill</label>
      <select
        id={`${idPrefix}-background-fill`}
        className="profile-select"
        value={kind}
        onChange={(event) => setKind(event.target.value as BackgroundFillKind)}
      >
        {backgroundFillOptions.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>

      {kind === 'solid' && (
        <div className="shape-controls">
          <div className="shape-controls__field">
            <label className="field-label" htmlFor={`${idPrefix}-background-color`}>Colour</label>
            <input
              id={`${idPrefix}-background-color`}
              className="shape-color-input"
              type="color"
              value={fill.color ?? DEFAULT_BACKGROUND_COLOR}
              aria-label="Background fill colour"
              onChange={(event) => setColor(event.target.value)}
            />
          </div>
        </div>
      )}

      {kind === 'gradient' && (
        <div className="background-gradient">
          <div className="shape-controls">
            {/*
              Only the first two stops get a control. A document may carry more,
              and they are preserved untouched: the picker offers the common case
              without pretending a gradient is limited to two colours.
            */}
            {gradient.stops.slice(0, 2).map((stop, index) => (
              <div className="shape-controls__field" key={index}>
                <label className="field-label" htmlFor={`${idPrefix}-background-stop-${index}`}>
                  {index === 0 ? 'From' : 'To'}
                </label>
                <input
                  id={`${idPrefix}-background-stop-${index}`}
                  className="shape-color-input"
                  type="color"
                  value={stop}
                  aria-label={`Background gradient ${index === 0 ? 'start' : 'end'} colour`}
                  onChange={(event) => {
                    const stops = [...gradient.stops]
                    stops[index] = event.target.value
                    setStops(stops)
                  }}
                />
              </div>
            ))}
          </div>
          <div className="layer-opacity-control">
            <div className="layer-opacity-control__label">
              <label className="field-label" htmlFor={`${idPrefix}-background-angle`}>Angle</label>
              <output htmlFor={`${idPrefix}-background-angle`}>{angleTurns}°</output>
            </div>
            <input
              id={`${idPrefix}-background-angle`}
              className="layer-opacity-slider"
              type="range"
              min="0"
              max="359"
              step="1"
              value={angleTurns}
              aria-label="Background gradient angle"
              aria-valuetext={`${angleTurns} degrees`}
              onChange={(event) => setAngle(Number(event.target.value))}
            />
          </div>
        </div>
      )}

      {imageFill && (
        <>
          <div className="shape-controls">
            <div className="shape-controls__field">
              <label className="field-label" htmlFor={`${idPrefix}-background-blend`}>Blend</label>
              <select
                id={`${idPrefix}-background-blend`}
                className="profile-select shape-controls__select"
                value={resolveBackgroundBlend(fill.blend)}
                onChange={(event) => setBlend(event.target.value as BackgroundBlend)}
              >
                {backgroundBlendOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div role="group" aria-labelledby={`${idPrefix}-focal-label`}>
            <span className="field-label" id={`${idPrefix}-focal-label`}>Focal point</span>
            <FocalPointFields
              value={clampFocalPoint(slide.backgroundFocalPoint)}
              idPrefix={`${idPrefix}-focal`}
              onChange={setFocalPoint}
              label="Background image"
            />
          </div>
        </>
      )}

      <p className="background-fill-hint">
        {imageFill && !slide.backgroundImage
          ? 'No background image on this slide yet, so the fill falls back to the theme paint.'
          : describeBackgroundFill(fill)}
      </p>
    </div>
  )
}
