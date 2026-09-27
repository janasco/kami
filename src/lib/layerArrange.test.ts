import { describe, expect, it } from 'vitest'
import {
  applyLayerArrange,
  arrangeableLayerIds,
  describeArrangeAvailability,
  describeLayerArrangeAction,
  layerArrangeMergeKey,
  type LayerArrangeAction,
} from './layerArrange'
import { pixelsToPercent, roundPercent, type CanvasSize } from './layerGeometry'
import type { PreflightLayerBounds } from './exportPreflight'
import type { LayerId, Slide } from '../types'
import { createTestSlide } from '../test/projectFixtures'

/**
 * Tests for the arrange actions applied to a slide.
 *
 * The measuring is stubbed with the same shape `collectExportPreflightBounds`
 * produces: rectangles in canvas pixels, already carrying each layer's stored
 * transform. What is under test is the decision, not the browser.
 */

const canvas: CanvasSize = { width: 1242, height: 2688 }

const boundsFor = (boxes: Partial<Record<LayerId, [number, number, number, number]>>): PreflightLayerBounds =>
  Object.fromEntries(
    Object.entries(boxes).map(([layerId, box]) => [layerId, { left: box[0], top: box[1], right: box[2], bottom: box[3] }]),
  ) as PreflightLayerBounds

const slideWith = (overrides: Partial<Slide> = {}): Slide => createTestSlide({
  id: 'slide-arrange',
  ...overrides,
})

const withTransform = (slide: Slide, layerId: LayerId, x: number, y: number): Slide => ({
  ...slide,
  layerTransforms: {
    ...slide.layerTransforms,
    [layerId]: { ...slide.layerTransforms[layerId], x, y },
  },
})

const apply = (
  slide: Slide,
  action: LayerArrangeAction,
  bounds: PreflightLayerBounds,
  selectedLayerId: LayerId = 'headline',
) => applyLayerArrange({ slide, action, selectedLayerId, bounds, canvas })

describe('arrange availability', () => {
  const slide = slideWith()

  it('aligns and distributes once three layers have been measured', () => {
    const availability = describeArrangeAvailability({
      slide,
      selectedLayerId: 'headline',
      bounds: boundsFor({
        headline: [100, 380, 1142, 800],
        screenshot: [400, 1150, 860, 2050],
        kicker: [100, 228, 620, 300],
      }),
      canvas,
    })

    expect(availability.align).toBe(true)
    expect(availability.distributeHorizontal).toBe(true)
    expect(availability.distributeVertical).toBe(true)
    expect(availability.order).toBe(true)
    expect(availability.reason).toBe('')
  })

  it('disables distribution, with a reason, when only one other layer is drawn', () => {
    const availability = describeArrangeAvailability({
      slide,
      selectedLayerId: 'headline',
      bounds: boundsFor({ headline: [100, 380, 1142, 800], screenshot: [400, 1150, 860, 2050] }),
      canvas,
    })

    expect(availability.align).toBe(true)
    expect(availability.distributeHorizontal).toBe(false)
    expect(availability.reason).toMatch(/three measured layers/)
  })

  it('disables everything that needs geometry before the canvas is measured', () => {
    const availability = describeArrangeAvailability({
      slide,
      selectedLayerId: 'headline',
      bounds: undefined,
      canvas,
    })

    expect(availability.align).toBe(false)
    expect(availability.distributeVertical).toBe(false)
    // Stacking is a pure list operation, so it never needs a measurement.
    expect(availability.order).toBe(true)
  })

  it('leaves the full-bleed background out of the layers it arranges', () => {
    expect(arrangeableLayerIds).not.toContain('background-image')
    expect(arrangeableLayerIds).toContain('headline')
  })
})

describe('aligning a layer', () => {
  it('moves the selected layer to the left edge of the canvas', () => {
    const slide = slideWith()
    const bounds = boundsFor({ headline: [300, 380, 1342, 800] })

    const result = apply(slide, { kind: 'align', align: 'left', scope: 'layer' }, bounds)
    expect(result.changed).toBe(true)
    // 300px left on a 1242px canvas.
    expect(result.slide.layerTransforms.headline.x)
      .toBe(roundPercent(pixelsToPercent(-300, canvas.width)))
    expect(result.slide.layerTransforms.headline.y).toBe(0)
  })

  it('accounts for the offset already stored on the layer', () => {
    const slide = withTransform(slideWith(), 'headline', 10, 0)
    // The measured box already includes that +10%, so the base box is the same
    // 300px inset, and the new offset replaces the old one rather than adding
    // to it: 10% - 24.15% = -14.15%.
    const measured = boundsFor({ headline: [424.2, 380, 1466.2, 800] })

    const result = apply(slide, { kind: 'align', align: 'left', scope: 'layer' }, measured)
    expect(result.slide.layerTransforms.headline.x)
      .toBe(roundPercent(10 + pixelsToPercent(-300, canvas.width)))
  })

  it('centres a layer on the canvas horizontally', () => {
    const slide = slideWith()
    const bounds = boundsFor({ headline: [0, 380, 400, 800] })

    const result = apply(slide, { kind: 'align', align: 'center-h', scope: 'layer' }, bounds)
    // The box centre is at 200 and the canvas centre at 621, so it moves 421px.
    expect(result.slide.layerTransforms.headline.x)
      .toBe(roundPercent(pixelsToPercent(421, canvas.width)))
    expect(result.slide.layerTransforms.headline.y).toBe(0)
  })

  it('does nothing when the layer is already on the edge it is asked to reach', () => {
    const slide = slideWith()
    const result = apply(slide, { kind: 'align', align: 'left', scope: 'layer' }, boundsFor({
      headline: [0, 380, 1042, 800],
    }))

    expect(result.changed).toBe(false)
    expect(result.slide).toBe(slide)
  })

  it('does nothing for a layer that was never measured', () => {
    const slide = slideWith()
    const result = apply(slide, { kind: 'align', align: 'left', scope: 'layer' }, boundsFor({ kicker: [0, 0, 10, 10] }))
    expect(result.changed).toBe(false)
  })
})

describe('aligning the composition', () => {
  it('moves the composition transform, not the layers', () => {
    const slide = withTransform(slideWith(), 'headline', 0, 0)
    const bounds = boundsFor({
      headline: [300, 380, 1342, 800],
      kicker: [300, 228, 820, 300],
    })

    const result = apply(slide, { kind: 'align', align: 'left', scope: 'composition' }, bounds)
    expect(result.changed).toBe(true)
    expect(result.slide.transform.x).toBe(roundPercent(pixelsToPercent(-300, canvas.width)))
    // No individual layer transform moved.
    expect(result.slide.layerTransforms).toBe(slide.layerTransforms)
  })

  it('accounts for a composition offset that is already applied', () => {
    const slide = { ...slideWith(), transform: { ...slideWith().transform, x: 10, y: 0 } }
    const bounds = boundsFor({
      headline: [424.2, 380, 1466.2, 800],
      kicker: [424.2, 228, 944.2, 300],
    })

    const result = apply(slide, { kind: 'align', align: 'left', scope: 'composition' }, bounds)
    // The composition box is 300px in, so the offset moves 300px left: 10% of
    // the canvas was already stored, so the new total is 10% - 24.15%.
    expect(result.slide.transform.x).toBe(roundPercent(10 + pixelsToPercent(-300, canvas.width)))
  })

  it('needs at least one measured layer', () => {
    const slide = slideWith()
    expect(apply(slide, { kind: 'align', align: 'left', scope: 'composition' }, boundsFor({})).changed)
      .toBe(false)
  })
})

describe('distributing a layer', () => {
  it('equalises the gaps around the selected layer', () => {
    const slide = slideWith()
    const bounds = boundsFor({
      kicker: [100, 100, 300, 300],
      headline: [320, 100, 520, 300],
      footer: [1000, 100, 1200, 300],
    })

    const result = apply(slide, { kind: 'distribute', distribute: 'horizontal' }, bounds)
    expect(result.changed).toBe(true)
    expect(result.slide.layerTransforms.headline.x)
      .toBe(roundPercent(pixelsToPercent(230, canvas.width)))
  })

  it('does nothing at the ends of the stack', () => {
    const slide = slideWith()
    const bounds = boundsFor({
      kicker: [100, 100, 300, 300],
      headline: [320, 100, 520, 300],
      footer: [1000, 100, 1200, 300],
    })

    expect(apply(slide, { kind: 'distribute', distribute: 'horizontal' }, bounds, 'kicker').changed)
      .toBe(false)
    expect(apply(slide, { kind: 'distribute', distribute: 'horizontal' }, bounds, 'footer').changed)
      .toBe(false)
  })

  it('ignores the full-bleed background when counting the layers', () => {
    const slide = slideWith()
    const bounds = boundsFor({
      'background-image': [0, 0, 1242, 2688],
      kicker: [100, 100, 300, 300],
      headline: [320, 100, 520, 300],
    })

    // Only two arrangeable layers, so there is no gap to equalise.
    expect(apply(slide, { kind: 'distribute', distribute: 'horizontal' }, bounds).changed).toBe(false)
  })
})

describe('stacking order', () => {
  it('brings a layer forward and stores the new order', () => {
    const slide = slideWith()
    const result = apply(slide, { kind: 'order', direction: 'forward' }, boundsFor({}))

    // The headline sits at index 4 in the catalog order, so one step forward puts
    // it just above the supporting text.
    expect(result.changed).toBe(true)
    expect(result.slide.layerOrder).toEqual([
      'background-image',
      'accent-shape',
      'screenshot',
      'app-icon',
      'supporting-text',
      'headline',
      'kicker',
      'footer',
    ])
  })

  it('drops the order again once the catalog order is restored', () => {
    const forward = apply(slideWith(), { kind: 'order', direction: 'forward' }, boundsFor({})).slide
    const back = apply(forward, { kind: 'order', direction: 'backward' }, boundsFor({}))

    expect(back.changed).toBe(true)
    expect(back.slide.layerOrder).toBeUndefined()
  })

  it('does nothing at the top or the bottom of the stack', () => {
    const slide = slideWith()
    expect(apply(slide, { kind: 'order', direction: 'backward' }, boundsFor({}), 'background-image').changed)
      .toBe(false)
    expect(apply(slide, { kind: 'order', direction: 'forward' }, boundsFor({}), 'footer').changed)
      .toBe(false)
  })

  it('needs no measurement at all', () => {
    const result = apply(slideWith(), { kind: 'order', direction: 'forward' }, boundsFor({}))
    expect(result.changed).toBe(true)
  })
})

describe('history keys and notices', () => {
  const action: LayerArrangeAction = { kind: 'align', align: 'left', scope: 'layer' }

  it('gives every press its own merge key', () => {
    expect(layerArrangeMergeKey(action, 'slide-1', 1))
      .not.toBe(layerArrangeMergeKey(action, 'slide-1', 2))
    expect(layerArrangeMergeKey(action, 'slide-1', 1))
      .toBe(layerArrangeMergeKey(action, 'slide-1', 1))
    expect(layerArrangeMergeKey(action, 'slide-1', 1))
      .toBe('layer-arrange:slide-1:1:align:left:layer')
  })

  it('never lets two different actions share a merge key', () => {
    const keys = [
      { kind: 'align', align: 'left', scope: 'layer' },
      { kind: 'align', align: 'left', scope: 'composition' },
      { kind: 'distribute', distribute: 'horizontal' },
      { kind: 'distribute', distribute: 'vertical' },
      { kind: 'order', direction: 'forward' },
      { kind: 'order', direction: 'backward' },
    ].map((candidate) => layerArrangeMergeKey(candidate as LayerArrangeAction, 'slide-1', 1))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('names the layer in the notice', () => {
    expect(describeLayerArrangeAction({ kind: 'align', align: 'center-h', scope: 'layer' }, 'headline'))
      .toBe('Center horizontally: Headline')
    expect(describeLayerArrangeAction({ kind: 'align', align: 'top', scope: 'composition' }, 'headline'))
      .toBe('Align top on the whole composition')
    expect(describeLayerArrangeAction({ kind: 'order', direction: 'backward' }, 'kicker'))
      .toBe('Send backward: Kicker')
  })
})
