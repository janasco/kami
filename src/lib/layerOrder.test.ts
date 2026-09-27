import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import {
  DEFAULT_LAYER_ORDER,
  isDefaultLayerOrder,
  layerOrderForSlide,
  layerOrderZIndex,
  moveLayerInOrder,
  parseLayerOrder,
  resolveLayerOrder,
  serializeLayerOrder,
} from './layerOrder'
import { parseProjectDocument, serializeProject, type EditorProject } from './project'
import { validateProjectDocument } from './projectValidation'
import { createProjectDocument, createTestSlide } from '../test/projectFixtures'
import type { LayerId, Slide } from '../types'

/**
 * Tests for the optional per-slide stacking order.
 *
 * Two things have to hold together: a stored order always resolves to a complete
 * stacking list, and a project that does not use the field is untouched, both
 * when it is read and when it is written back. That is what keeps the addition
 * backward compatible without a version bump.
 */

const projectWith = (slides: Slide[]): EditorProject => ({
  name: 'Layer order project',
  slides,
  activeLocale: 'en-US',
  canvasMode: 'isolated',
  selectedExportProfileId: exportProfiles[0].id,
})

const slidesOf = (document: object) =>
  (document as { slides?: unknown }).slides as Array<Record<string, unknown>>

const reordered: LayerId[] = [
  'headline',
  'background-image',
  'screenshot',
  'accent-shape',
  'app-icon',
  'kicker',
  'supporting-text',
  'footer',
]

describe('resolving a stored order', () => {
  it('completes a partial order with the rest of the catalog', () => {
    expect(resolveLayerOrder(['headline'])).toEqual([
      'headline',
      'background-image',
      'accent-shape',
      'screenshot',
      'app-icon',
      'supporting-text',
      'kicker',
      'footer',
    ])
  })

  it('drops unknown ids, collapses repeats, and keeps every layer exactly once', () => {
    const resolved = resolveLayerOrder(['headline', 'not-a-layer', 'headline', 'footer'])

    expect(resolved).toHaveLength(DEFAULT_LAYER_ORDER.length)
    expect(new Set(resolved).size).toBe(DEFAULT_LAYER_ORDER.length)
    expect(resolved.slice(0, 2)).toEqual(['headline', 'footer'])
    expect(resolved).not.toContain('not-a-layer')
  })

  it('falls back to the catalog order for a missing or malformed value', () => {
    expect(resolveLayerOrder(undefined)).toEqual([...DEFAULT_LAYER_ORDER])
    expect(resolveLayerOrder(null)).toEqual([...DEFAULT_LAYER_ORDER])
    expect(resolveLayerOrder([])).toEqual([...DEFAULT_LAYER_ORDER])
  })
})

describe('serialising an order', () => {
  it('writes nothing for a slide that has not reordered anything', () => {
    expect(serializeLayerOrder(undefined)).toBeUndefined()
    expect(serializeLayerOrder(null)).toBeUndefined()
    expect(serializeLayerOrder([...DEFAULT_LAYER_ORDER])).toBeUndefined()
    expect(serializeLayerOrder([])).toBeUndefined()
  })

  it('writes a complete list for a custom order, so a partial one still restores', () => {
    expect(serializeLayerOrder(['headline'])).toEqual(resolveLayerOrder(['headline']))
    expect(serializeLayerOrder(reordered)).toEqual(reordered)
  })

  it('round-trips a value through parse and serialise', () => {
    expect(parseLayerOrder(reordered)).toEqual(reordered)
    expect(parseLayerOrder(undefined)).toBeUndefined()
    expect(parseLayerOrder('headline')).toBeUndefined()
    expect(parseLayerOrder([...DEFAULT_LAYER_ORDER])).toBeUndefined()
  })
})

describe('applying an order in the renderer', () => {
  it('leaves the stylesheet stacking alone for a default order', () => {
    expect(layerOrderZIndex(undefined, 'headline')).toBeUndefined()
    expect(layerOrderZIndex([...DEFAULT_LAYER_ORDER], 'headline')).toBeUndefined()
  })

  it('numbers the layers bottom to top for a custom order', () => {
    expect(layerOrderZIndex(reordered, 'headline')).toBe(1)
    expect(layerOrderZIndex(reordered, 'footer')).toBe(8)
  })

  it('reads a slide without an order as the catalog order', () => {
    expect(layerOrderForSlide({})).toEqual([...DEFAULT_LAYER_ORDER])
    expect(layerOrderForSlide({ layerOrder: reordered })).toEqual(reordered)
  })
})

describe('moving a layer through the stack', () => {
  it('swaps a layer with its neighbour', () => {
    const order = moveLayerInOrder(undefined, 'headline', 1)
    expect(order.indexOf('headline')).toBe(DEFAULT_LAYER_ORDER.indexOf('headline') + 1)
    expect(order).toHaveLength(DEFAULT_LAYER_ORDER.length)
  })

  it('does not move past either end of the stack', () => {
    expect(moveLayerInOrder(undefined, 'background-image', -1))
      .toEqual([...DEFAULT_LAYER_ORDER])
    expect(moveLayerInOrder(undefined, 'footer', 1))
      .toEqual([...DEFAULT_LAYER_ORDER])
  })

  it('returns to the catalog order, and then to no order at all', () => {
    const forward = moveLayerInOrder(undefined, 'background-image', 1)
    const back = moveLayerInOrder(forward, 'background-image', -1)
    expect(back).toEqual([...DEFAULT_LAYER_ORDER])
    expect(serializeLayerOrder(back)).toBeUndefined()
    expect(isDefaultLayerOrder(back)).toBe(true)
  })
})

describe('project document round-trip', () => {
  it('carries a custom order through save and reopen', () => {
    const original = projectWith([
      createTestSlide({ id: 'reordered', layerOrder: reordered }),
      createTestSlide({ id: 'default' }),
    ])

    const document = serializeProject(original)
    expect(validateProjectDocument(document).valid).toBe(true)
    expect(slidesOf(document)[0].layerOrder).toEqual(reordered)
    // A slide that never reordered writes no field at all.
    expect('layerOrder' in slidesOf(document)[1]).toBe(false)

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].layerOrder).toEqual(reordered)
    expect(result.project.slides[1].layerOrder).toBeUndefined()
    // The order does not disturb any other field on the way back.
    expect(result.project.slides[0].screenshot).toBe(original.slides[0].screenshot)
    expect(result.project.slides[0].title).toBe(original.slides[0].title)
  })

  it('opens a project that predates the field with the catalog order', () => {
    const legacy = createProjectDocument()
    expect('layerOrder' in slidesOf(legacy)[0]).toBe(false)

    const result = parseProjectDocument(JSON.stringify(legacy))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].layerOrder).toBeUndefined()
    expect(layerOrderForSlide(result.project.slides[0])).toEqual([...DEFAULT_LAYER_ORDER])
  })

  it('repairs a partial or duplicated stored order instead of rejecting it', () => {
    const document = createProjectDocument()
    slidesOf(document)[0].layerOrder = ['headline', 'headline', 'retired-layer']

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].layerOrder).toEqual(resolveLayerOrder(['headline']))
  })

  it('leaves the project version alone, because the field is optional', () => {
    const document = serializeProject(projectWith([createTestSlide({ layerOrder: reordered })]))
    expect(document.version).toBe(1)
    expect(JSON.stringify(document)).toContain('"layerOrder"')
  })
})
