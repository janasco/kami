import { describe, expect, it } from 'vitest'
import {
  alignDeltaPercent,
  clampOffsetPercent,
  DEFAULT_SNAP_THRESHOLD_PERCENT,
  describeCanvasGuides,
  distributeDeltaPercent,
  frameRect,
  guideSnapPositions,
  percentToPixels,
  pixelsToPercent,
  rectCenterX,
  resolveCanvasSafeArea,
  roundPercent,
  snapPercent,
  unionRect,
  untransformRect,
  type CanvasSize,
  type LayerRect,
} from './layerGeometry'

/**
 * Tests for the canvas geometry the editor stores its edits in.
 *
 * The stored unit is a canvas percentage, so almost every rule here is a
 * conversion between that and a measured pixel box. The canvas is the 1242 ×
 * 2688 App Store profile, which is the size the editor authors against.
 */

const canvas: CanvasSize = { width: 1242, height: 2688 }

const rect = (left: number, top: number, right: number, bottom: number): LayerRect => ({
  left,
  top,
  right,
  bottom,
})

describe('percentage and pixel conversion', () => {
  it('round-trips a percentage through pixels', () => {
    expect(percentToPixels(50, canvas.width)).toBe(621)
    expect(percentToPixels(-12.5, canvas.height)).toBe(-336)
    expect(pixelsToPercent(percentToPixels(7.25, canvas.width), canvas.width)).toBeCloseTo(7.25, 10)
  })

  it('treats a zero or non-finite extent as no conversion at all', () => {
    expect(pixelsToPercent(100, 0)).toBe(0)
    expect(percentToPixels(Number.NaN, canvas.width)).toBe(0)
    expect(pixelsToPercent(Number.POSITIVE_INFINITY, canvas.width)).toBe(0)
  })

  it('rounds a stored percentage to a fixed precision', () => {
    expect(roundPercent(0.1 + 0.2)).toBe(0.3)
    expect(roundPercent(1 / 3)).toBe(0.33)
    expect(roundPercent(Number.NaN)).toBe(0)
  })

  it('builds the canvas box and the union of a set of boxes', () => {
    expect(frameRect(canvas)).toEqual({ left: 0, top: 0, right: 1242, bottom: 2688 })
    expect(unionRect([rect(10, 20, 30, 40), rect(5, 25, 25, 60)])).toEqual({
      left: 5,
      top: 20,
      right: 30,
      bottom: 60,
    })
    expect(unionRect([null, undefined])).toBeNull()
  })
})

describe('alignment', () => {
  it('moves a layer to each canvas edge as a percentage delta', () => {
    const subject = rect(200, 400, 700, 1000)

    expect(alignDeltaPercent('left', subject, [frameRect(canvas)], canvas))
      .toEqual({ dx: roundPercent(pixelsToPercent(-200, canvas.width)), dy: 0 })
    expect(alignDeltaPercent('right', subject, [frameRect(canvas)], canvas))
      .toEqual({ dx: roundPercent(pixelsToPercent(542, canvas.width)), dy: 0 })
    expect(alignDeltaPercent('top', subject, [frameRect(canvas)], canvas))
      .toEqual({ dx: 0, dy: roundPercent(pixelsToPercent(-400, canvas.height)) })
    expect(alignDeltaPercent('bottom', subject, [frameRect(canvas)], canvas))
      .toEqual({ dx: 0, dy: roundPercent(pixelsToPercent(1688, canvas.height)) })
  })

  it('centres a layer on both axes', () => {
    const centred = rect(200, 934, 1042, 1754)
    const horizontal = alignDeltaPercent('center-h', centred, [frameRect(canvas)], canvas)
    const vertical = alignDeltaPercent('center-v', centred, [frameRect(canvas)], canvas)

    expect(rectCenterX({ ...centred, left: centred.left + horizontal!.dx * 12.42 })).toBeCloseTo(621, 6)
    expect(vertical!.dx).toBe(0)
    expect(vertical!.dy).toBe(0)
  })

  it('reports no delta when the layer is already aligned', () => {
    const subject = rect(0, 0, 100, 100)
    expect(alignDeltaPercent('left', subject, [frameRect(canvas)], canvas)).toEqual({ dx: 0, dy: 0 })
    expect(alignDeltaPercent('top', subject, [frameRect(canvas)], canvas)).toEqual({ dx: 0, dy: 0 })
  })

  it('aligns against the union of several targets', () => {
    const subject = rect(300, 0, 500, 100)
    const delta = alignDeltaPercent('left', subject, [rect(100, 0, 200, 100), rect(50, 0, 200, 100)], canvas)
    expect(delta).toEqual({ dx: roundPercent(pixelsToPercent(-250, canvas.width)), dy: 0 })
  })

  it('refuses to align against nothing usable', () => {
    expect(alignDeltaPercent('left', rect(0, 0, 10, 10), [], canvas)).toBeNull()
    expect(alignDeltaPercent('left', rect(0, 0, 10, 10), [null], canvas)).toBeNull()
  })
})

describe('distribution', () => {
  // Three equal 200px boxes: the middle one is short of the even gap by 25px on
  // each side, because the outer two only leave 500px of free space to share.
  const first = rect(100, 100, 300, 300)
  const subject = rect(320, 100, 520, 300)
  const last = rect(1000, 100, 1200, 300)

  it('spreads the selected layer evenly between its neighbours', () => {
    const delta = distributeDeltaPercent('horizontal', subject, [first, last], canvas)
    // span 1100 - occupied 600 = 500 free, two gaps of 250; the subject should
    // start at 100 + 200 + 250 = 550, which is 230px to the right of 320.
    expect(delta).toEqual({ dx: roundPercent(pixelsToPercent(230, canvas.width)), dy: 0 })
  })

  it('uses the vertical axis for a vertical request', () => {
    const top = rect(0, 0, 100, 100)
    const middle = rect(0, 120, 100, 220)
    const bottom = rect(0, 800, 100, 900)
    const delta = distributeDeltaPercent('vertical', middle, [top, bottom], canvas)
    // span 900 - occupied 300 = 600 free, two gaps of 300; the middle box should
    // start at 0 + 100 + 300 = 400, which is 280px below its current 120.
    expect(delta!.dx).toBe(0)
    expect(delta!.dy).toBe(roundPercent(pixelsToPercent(280, canvas.height)))
  })

  it('does nothing at either end of the stack', () => {
    expect(distributeDeltaPercent('horizontal', first, [subject, last], canvas)).toBeNull()
    expect(distributeDeltaPercent('horizontal', last, [first, subject], canvas)).toBeNull()
  })

  it('needs a third box before there is a gap to equalise', () => {
    expect(distributeDeltaPercent('horizontal', subject, [first], canvas)).toBeNull()
    expect(distributeDeltaPercent('horizontal', subject, [], canvas)).toBeNull()
  })
})

describe('snap thresholds', () => {
  const candidates = [0, 33.33, 50, 66.67, 100]

  it('snaps to the closest candidate inside the threshold', () => {
    expect(snapPercent(49.7, candidates)).toEqual({ value: 50, snapped: true, target: 50 })
    expect(snapPercent(33.2, candidates).target).toBe(33.33)
  })

  it('leaves a value alone when nothing is close enough', () => {
    expect(snapPercent(40, candidates)).toEqual({ value: 40, snapped: false, target: null })
    expect(snapPercent(40, candidates, 10).target).toBe(33.33)
  })

  it('snaps only on an exact hit at a zero threshold', () => {
    expect(snapPercent(50.4, candidates, 0).snapped).toBe(false)
    expect(snapPercent(50, candidates, 0)).toEqual({ value: 50, snapped: true, target: 50 })
  })

  it('passes a non-finite value straight through', () => {
    expect(snapPercent(Number.NaN, candidates).snapped).toBe(false)
  })

  it('uses a half-percent default threshold', () => {
    expect(DEFAULT_SNAP_THRESHOLD_PERCENT).toBe(0.5)
    expect(snapPercent(50.4, candidates).snapped).toBe(true)
    expect(snapPercent(50.6, candidates).snapped).toBe(false)
  })
})

describe('clamping an offset to the canvas', () => {
  it('holds a layer inside the canvas edge', () => {
    // A 300px box already sitting at the left edge cannot move further left.
    const base = rect(0, 1000, 300, 1300)
    expect(clampOffsetPercent({ base, canvas, x: -5, y: 0 })).toEqual({ dx: 0, dy: 0 })
    // Nor can it be pushed off the right edge.
    expect(clampOffsetPercent({ base: rect(942, 0, 1242, 300), canvas, x: 4, y: 0 }).dx)
      .toBeCloseTo(0, 6)
  })

  it('allows a free move when the requested position is inside', () => {
    const base = rect(400, 1000, 700, 1300)
    expect(clampOffsetPercent({ base, canvas, x: 3.5, y: -1.25 })).toEqual({ dx: 3.5, dy: -1.25 })
  })

  it('centres a layer that is larger than the canvas instead of pinning an edge', () => {
    // A box wider and taller than the canvas: holding one edge would push most of
    // it off the export, so the only stable answer is to centre it.
    const oversized = rect(0, 0, 2000, 3000)
    const clamped = clampOffsetPercent({ base: oversized, canvas, x: 0, y: 0 })
    expect(clamped.dx).toBe(roundPercent(pixelsToPercent(621 - 1000, canvas.width)))
    expect(clamped.dy).toBe(roundPercent(pixelsToPercent(1344 - 1500, canvas.height)))
  })

  it('leaves a degenerate canvas alone rather than dividing by zero', () => {
    expect(clampOffsetPercent({ base: rect(0, 0, 10, 10), canvas: { width: 0, height: 0 }, x: 4, y: 4 }))
      .toEqual({ dx: 4, dy: 4 })
  })
})

describe('untransforming a measured box', () => {
  it('removes the stored translate so alignment is not chasing its own offset', () => {
    const measured = rect(300, 500, 800, 1100)
    const base = untransformRect(measured, { x: 10, y: 5 }, canvas)

    expect(base.left).toBeCloseTo(measured.left - 124.2, 6)
    expect(base.top).toBeCloseTo(measured.top - 134.4, 6)
    // A box keeps its size either way.
    expect(base.right - base.left).toBeCloseTo(measured.right - measured.left, 6)
  })
})

describe('canvas guides', () => {
  it('describes a store margin, a centre cross, and the thirds grid', () => {
    const guides = describeCanvasGuides(canvas)

    expect(guides.safeArea).toEqual({ topPercent: 4, bottomPercent: 4, inlinePercent: 5 })
    expect(guides.safeAreaInset).toEqual({ top: 4, right: 5, bottom: 4, left: 5 })
    expect(guides.lines.filter((line) => line.kind === 'center')).toHaveLength(2)
    expect(guides.lines.filter((line) => line.kind === 'thirds')).toHaveLength(4)
    expect(guides.lines.map((line) => line.positionPercent)).toEqual(
      expect.arrayContaining([50, 33.33, 66.67]),
    )
    expect(guides.lines.every((line) => line.label.length > 0)).toBe(true)
  })

  it('reserves more of a landscape canvas vertically', () => {
    expect(resolveCanvasSafeArea({ width: 1920, height: 1200 }))
      .toEqual({ topPercent: 6, bottomPercent: 6, inlinePercent: 4 })
    expect(describeCanvasGuides({ width: 1024, height: 500 }).safeAreaInset)
      .toEqual({ top: 6, right: 4, bottom: 6, left: 4 })
  })

  it('is never interactive, because a guide must not take a pointer', () => {
    expect(describeCanvasGuides(canvas).interactive).toBe(false)
  })

  it('offers both edges, the centre, both thirds, and the safe inset to snap to', () => {
    const guides = describeCanvasGuides(canvas)
    expect(guideSnapPositions(guides, 'horizontal')).toEqual([0, 5, 33.33, 50, 66.67, 95, 100])
    expect(guideSnapPositions(guides, 'vertical')).toEqual([0, 4, 33.33, 50, 66.67, 96, 100])
  })
})
