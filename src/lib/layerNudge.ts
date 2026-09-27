/**
 * Keyboard nudging for the selected layer.
 *
 * The arrow keys move a layer by a step on the canvas percentage, which is the
 * unit a transform is already stored in, so a nudge and a drag land in exactly
 * the same place. Three steps are offered: a plain press, a coarse press for
 * crossing a slide quickly, and a fine press for landing on a guide.
 *
 * Two rules are enforced here rather than in the components, because both are
 * about not surprising the author:
 *
 * - A key that belongs to a text field is never a nudge. The check is on the tag
 *   name the caller passes in, so it is the same list the canvas already uses to
 *   decide whether a pointer belongs to a control.
 * - The delta is clamped to the canvas when the layer's box has been measured,
 *   and left alone when it has not, so a missing measurement degrades to a
 *   plain nudge instead of blocking the key.
 */

import { clampOffsetPercent, roundPercent, type CanvasSize, type LayerRect } from './layerGeometry'
import type { SlideTransform } from '../types'

/** A plain arrow press. */
export const NUDGE_DEFAULT_STEP_PERCENT = 1
/** Shift plus an arrow, for crossing the slide. */
export const NUDGE_COARSE_STEP_PERCENT = 10
/** Alt, Ctrl, or Command plus an arrow, for landing on a guide. */
export const NUDGE_FINE_STEP_PERCENT = 0.1

export type NudgeModifier = 'default' | 'coarse' | 'fine'

/** Reading direction of the canvas, which mirrors the horizontal arrows. */
export type TextDirection = 'ltr' | 'rtl'

export const nudgeKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const
export type NudgeKey = (typeof nudgeKeys)[number]

/** The minimal shape of a keyboard event this module needs. */
export interface NudgeKeyEvent {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  /** Target tag name, upper case. Used to stay out of text fields. */
  targetTagName?: string | null
}

export interface NudgeDelta {
  dx: number
  dy: number
}

export interface NudgePayload {
  /** The offset to store, already rounded and clamped. */
  position: Pick<SlideTransform, 'x' | 'y'>
  /** Identifies this gesture to the history merge key. */
  mergeSuffix: string
  /** The step that was applied, for the status line. */
  stepPercent: number
  modifier: NudgeModifier
  /** True when the canvas edge held the layer back from the requested position. */
  clamped: boolean
}

/** Tags that own their own arrow keys, so a nudge must not intercept them. */
const TEXT_ENTRY_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']

/** True when the key is one of the four arrows a nudge listens for. */
export const isNudgeKey = (key: string): key is NudgeKey =>
  (nudgeKeys as readonly string[]).includes(key)

/**
 * True when the event came from something the author is typing in or choosing
 * from, so the arrow keys belong to that control and not to the canvas.
 */
export const isTextEntryTarget = (tagName: string | null | undefined): boolean =>
  TEXT_ENTRY_TAGS.includes((tagName ?? '').toUpperCase())

/**
 * Chooses the step size from the modifier.
 *
 * Shift is coarse, and Alt, Control, or Command is fine. Returns null when the
 * key is not a nudge key or the event was already handled, which is what lets
 * the focused layer and the window listener share one implementation: the first
 * to run prevents the default, and the second sees it and steps aside.
 */
export const resolveNudgeModifier = (event: NudgeKeyEvent): NudgeModifier | null => {
  if (!isNudgeKey(event.key)) return null
  if (isTextEntryTarget(event.targetTagName)) return null
  if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) return 'coarse'
  if (event.altKey || event.ctrlKey || event.metaKey) return 'fine'
  return 'default'
}

/** The step a modifier selects, as a canvas percentage. */
export const nudgeStepPercent = (modifier: NudgeModifier): number => {
  switch (modifier) {
    case 'coarse': return NUDGE_COARSE_STEP_PERCENT
    case 'fine': return NUDGE_FINE_STEP_PERCENT
    case 'default': return NUDGE_DEFAULT_STEP_PERCENT
  }
}

/**
 * The percentage delta for one key press.
 *
 * The horizontal arrows follow the reading direction, because on a right-to-left
 * slide the author's mental model of "right" is the direction the arrow points,
 * not the direction the layer has to travel.
 */
export const nudgeDeltaPercent = (
  key: string,
  event: NudgeKeyEvent,
  direction: TextDirection = 'ltr',
): NudgeDelta | null => {
  const modifier = resolveNudgeModifier(event)
  if (modifier === null || !isNudgeKey(key)) return null
  const step = nudgeStepPercent(modifier)
  const inline = direction === 'rtl' ? -1 : 1

  switch (key) {
    case 'ArrowLeft': return { dx: -step * inline, dy: 0 }
    case 'ArrowRight': return { dx: step * inline, dy: 0 }
    case 'ArrowUp': return { dx: 0, dy: -step }
    case 'ArrowDown': return { dx: 0, dy: step }
  }
}

/**
 * Identifies a nudge gesture to the history merge key.
 *
 * The key and the modifier are both in the suffix, so a burst in one direction
 * coalesces while a change of direction is its own step. Returns null when the
 * event is not a nudge at all.
 */
export const nudgeMergeSuffix = (event: NudgeKeyEvent): string | null => {
  const modifier = resolveNudgeModifier(event)
  return modifier === null ? null : `nudge:${modifier}:${event.key}`
}

export interface NudgePayloadInput {
  /** The layer transform being moved. */
  transform: Pick<SlideTransform, 'x' | 'y'>
  event: NudgeKeyEvent
  direction?: TextDirection
  canvas: CanvasSize
  /**
   * The layer's untransformed box on the canvas. Supplied when the caller has
   * measured it, so the result can be held inside the canvas.
   */
  base?: LayerRect | null
}

/**
 * The full payload one key press writes: the position, and the history merge
 * suffix that decides whether a held key becomes one undo step.
 *
 * The suffix carries the key and the modifier, so a burst in one direction
 * coalesces while a change of direction is its own step.
 */
export const nudgePayload = ({ transform, event, direction = 'ltr', canvas, base = null }: NudgePayloadInput): NudgePayload | null => {
  const modifier = resolveNudgeModifier(event)
  const mergeSuffix = nudgeMergeSuffix(event)
  const delta = nudgeDeltaPercent(event.key, event, direction)
  if (modifier === null || !delta || mergeSuffix === null) return null

  const requested = { x: transform.x + delta.dx, y: transform.y + delta.dy }
  const clampedPosition = base
    ? clampOffsetPercent({ base, canvas, ...requested })
    : { dx: roundPercent(requested.x), dy: roundPercent(requested.y) }

  return {
    position: { x: clampedPosition.dx, y: clampedPosition.dy },
    mergeSuffix,
    stepPercent: nudgeStepPercent(modifier),
    modifier,
    clamped: clampedPosition.dx !== roundPercent(requested.x) || clampedPosition.dy !== roundPercent(requested.y),
  }
}

/**
 * The history merge key a nudge commits under.
 *
 * Nudges use the same key shape as every other layer transform edit, so the
 * gesture coalesces with its own repeats and with nothing else.
 */
export const nudgeMergeKey = (
  slideId: string,
  layerId: string,
  event: NudgeKeyEvent,
): string | null => {
  const suffix = nudgeMergeSuffix(event)
  return suffix === null ? null : `layer-transform:${slideId}:${layerId}:${suffix}`
}
