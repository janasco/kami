import { describe, expect, it } from 'vitest'
import {
  isNudgeKey,
  isTextEntryTarget,
  NUDGE_COARSE_STEP_PERCENT,
  NUDGE_DEFAULT_STEP_PERCENT,
  NUDGE_FINE_STEP_PERCENT,
  nudgeDeltaPercent,
  nudgeMergeKey,
  nudgeMergeSuffix,
  nudgePayload,
  nudgeStepPercent,
  resolveNudgeModifier,
  type NudgeKeyEvent,
} from './layerNudge'
import type { CanvasSize, LayerRect } from './layerGeometry'

/**
 * Tests for the payload one arrow key press writes.
 *
 * A nudge lands in the same unit a drag does, a canvas percentage, so what these
 * tests pin down is the step each modifier asks for, the direction the horizontal
 * arrows travel on a right-to-left slide, the clamp at the canvas edge, and the
 * merge key that decides how many undo steps a burst of presses becomes.
 */

const canvas: CanvasSize = { width: 1242, height: 2688 }

const key = (overrides: Partial<NudgeKeyEvent> = {}): NudgeKeyEvent => ({ key: 'ArrowRight', ...overrides })

describe('nudge keys and modifiers', () => {
  it('listens to the four arrows only', () => {
    expect(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].every(isNudgeKey)).toBe(true)
    expect(isNudgeKey('Enter')).toBe(false)
    expect(isNudgeKey('a')).toBe(false)
  })

  it('offers a default, a coarse, and a fine step', () => {
    expect(resolveNudgeModifier(key())).toBe('default')
    expect(resolveNudgeModifier(key({ shiftKey: true }))).toBe('coarse')
    expect(resolveNudgeModifier(key({ altKey: true }))).toBe('fine')
    expect(resolveNudgeModifier(key({ ctrlKey: true }))).toBe('fine')
    expect(resolveNudgeModifier(key({ metaKey: true }))).toBe('fine')
    expect(nudgeStepPercent('default')).toBe(NUDGE_DEFAULT_STEP_PERCENT)
    expect(nudgeStepPercent('coarse')).toBe(NUDGE_COARSE_STEP_PERCENT)
    expect(nudgeStepPercent('fine')).toBe(NUDGE_FINE_STEP_PERCENT)
  })

  it('prefers coarse over fine when both modifiers are held', () => {
    expect(resolveNudgeModifier(key({ shiftKey: true, altKey: true }))).toBe('fine')
  })

  it('ignores a key that is not an arrow, and a key a text field owns', () => {
    expect(resolveNudgeModifier(key({ key: 'Enter' }))).toBeNull()
    expect(resolveNudgeModifier(key({ targetTagName: 'INPUT' }))).toBeNull()
    expect(resolveNudgeModifier(key({ targetTagName: 'TEXTAREA' }))).toBeNull()
    expect(isTextEntryTarget('select')).toBe(true)
    expect(isTextEntryTarget('DIV')).toBe(false)
    expect(isTextEntryTarget(null)).toBe(false)
  })
})

describe('nudge deltas', () => {
  it('moves one canvas percentage per plain press', () => {
    expect(nudgeDeltaPercent('ArrowRight', key())).toEqual({ dx: 1, dy: 0 })
    expect(nudgeDeltaPercent('ArrowLeft', key({ key: 'ArrowLeft' }))).toEqual({ dx: -1, dy: 0 })
    expect(nudgeDeltaPercent('ArrowDown', key({ key: 'ArrowDown' }))).toEqual({ dx: 0, dy: 1 })
    expect(nudgeDeltaPercent('ArrowUp', key({ key: 'ArrowUp' }))).toEqual({ dx: 0, dy: -1 })
  })

  it('crosses the slide with Shift and lands on a guide with Alt', () => {
    expect(nudgeDeltaPercent('ArrowRight', key({ shiftKey: true })))
      .toEqual({ dx: NUDGE_COARSE_STEP_PERCENT, dy: 0 })
    expect(nudgeDeltaPercent('ArrowRight', key({ altKey: true })))
      .toEqual({ dx: NUDGE_FINE_STEP_PERCENT, dy: 0 })
  })

  it('mirrors the horizontal arrows on a right-to-left slide', () => {
    expect(nudgeDeltaPercent('ArrowRight', key(), 'rtl')).toEqual({ dx: -1, dy: 0 })
    expect(nudgeDeltaPercent('ArrowLeft', key({ key: 'ArrowLeft' }), 'rtl')).toEqual({ dx: 1, dy: 0 })
    // The vertical axes are the same in either direction.
    expect(nudgeDeltaPercent('ArrowDown', key({ key: 'ArrowDown' }), 'rtl')).toEqual({ dx: 0, dy: 1 })
  })

  it('produces nothing for a key a text field owns', () => {
    expect(nudgeDeltaPercent('ArrowLeft', key({ key: 'ArrowLeft', targetTagName: 'TEXTAREA' }))).toBeNull()
  })
})

describe('nudge payloads', () => {
  it('writes an absolute position, not a delta', () => {
    const payload = nudgePayload({
      transform: { x: 4, y: -2 },
      event: key(),
      canvas,
    })

    expect(payload).toMatchObject({
      position: { x: 5, y: -2 },
      stepPercent: NUDGE_DEFAULT_STEP_PERCENT,
      modifier: 'default',
      clamped: false,
    })
  })

  it('accumulates without float noise across a burst of fine steps', () => {
    let transform = { x: 0, y: 0 }
    for (let press = 0; press < 3; press += 1) {
      const payload = nudgePayload({ transform, event: key({ altKey: true }), canvas })
      transform = payload!.position
    }
    expect(transform).toEqual({ x: 0.3, y: 0 })
  })

  it('holds a layer at the canvas edge instead of pushing it off', () => {
    // A 300px-wide box already flush with the left edge, measured untransformed.
    const base: LayerRect = { left: 0, top: 1000, right: 300, bottom: 1300 }
    const payload = nudgePayload({
      transform: { x: 0, y: 0 },
      event: key({ key: 'ArrowLeft' }),
      canvas,
      base,
    })

    expect(payload!.position).toEqual({ x: 0, y: 0 })
    expect(payload!.clamped).toBe(true)
  })

  it('still nudges without a measurement, and reports that nothing was clamped', () => {
    const payload = nudgePayload({
      transform: { x: 0, y: 0 },
      event: key({ key: 'ArrowDown' }),
      canvas,
      base: null,
    })

    expect(payload!.position).toEqual({ x: 0, y: 1 })
    expect(payload!.clamped).toBe(false)
  })

  it('produces no payload for a key that is not a nudge', () => {
    expect(nudgePayload({ transform: { x: 0, y: 0 }, event: key({ key: 'Enter' }), canvas })).toBeNull()
    expect(nudgePayload({
      transform: { x: 0, y: 0 },
      event: key({ targetTagName: 'INPUT' }),
      canvas,
    })).toBeNull()
  })
})

describe('nudge history keys', () => {
  it('coalesces repeats in one direction and separates a change of direction', () => {
    expect(nudgeMergeSuffix(key())).toBe('nudge:default:ArrowRight')
    expect(nudgeMergeSuffix(key())).toBe(nudgeMergeSuffix(key()))
    expect(nudgeMergeSuffix(key({ key: 'ArrowLeft' }))).not.toBe(nudgeMergeSuffix(key()))
    expect(nudgeMergeSuffix(key({ shiftKey: true }))).not.toBe(nudgeMergeSuffix(key()))
  })

  it('uses the same key shape as every other layer transform edit', () => {
    expect(nudgeMergeKey('slide-1', 'headline', key()))
      .toBe('layer-transform:slide-1:headline:nudge:default:ArrowRight')
    expect(nudgeMergeKey('slide-1', 'headline', key({ key: 'Tab' }))).toBeNull()
  })
})
