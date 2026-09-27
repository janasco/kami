import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { describeCanvasGuides } from '../lib/layerGeometry'
import { DEFAULT_LAYER_ORDER, layerOrderZIndex } from '../lib/layerOrder'
import { SlideRenderer } from './SlideCanvas'
import { createTestSlide } from '../test/projectFixtures'
import type { LayerId, Slide } from '../types'

/**
 * Server-render tests for the canvas overlay and the optional stacking order.
 *
 * The repository has no DOM test environment, so the guarantees are asserted
 * against markup: the guides appear only when asked for, they take no pointer,
 * they are absent from the export stage, and only a slide with a custom stacking
 * order carries an inline z-index.
 */

const profile = exportProfiles[0]

const render = (slide: Slide, props: { showGuides?: boolean; exportMode?: boolean } = {}) =>
  renderToStaticMarkup(createElement(SlideRenderer, {
    slide,
    slideNumber: 1,
    onImport: () => undefined,
    profile,
    locale: 'en-US',
    ...props,
  }))

/** The guide overlay, or an empty string when the canvas drew none. */
const guideOverlay = (markup: string) => {
  const start = markup.indexOf('class="canvas-guides"')
  if (start === -1) return ''
  const end = markup.indexOf('</div></div>', start)
  expect(end).toBeGreaterThan(start)
  return markup.slice(start, end)
}

describe('canvas guide visibility', () => {
  it('draws nothing until guides are asked for', () => {
    const markup = render(createTestSlide())
    expect(markup).not.toContain('canvas-guides')
    expect(markup).not.toContain('data-canvas-guides')
  })

  it('draws the safe area, the centre cross, and the thirds grid on request', () => {
    const markup = render(createTestSlide(), { showGuides: true })
    const overlay = guideOverlay(markup)

    expect(overlay).toContain('class="canvas-guide-safe-area"')
    expect(overlay).toContain('canvas-guide--vertical canvas-guide--center')
    expect(overlay).toContain('canvas-guide--horizontal canvas-guide--center')
    expect(overlay.match(/canvas-guide--thirds/g) ?? []).toHaveLength(4)
    // Every line is identifiable without a tooltip, which a pointer-transparent
    // overlay could never show.
    expect(overlay).toContain('data-guide="thirds-v-1"')
    expect(overlay).toContain('data-guide="center-h"')
  })

  it('takes no pointer and stays out of the accessibility tree', () => {
    const markup = render(createTestSlide(), { showGuides: true })

    // Inline, so the guarantee survives a stylesheet that never loads.
    expect(markup).toContain('style="pointer-events:none"')
    expect(markup).toMatch(/class="canvas-guides"[^>]*aria-hidden="true"/)
  })

  it('never enters the export stage, whatever the editor is showing', () => {
    expect(render(createTestSlide(), { showGuides: true, exportMode: true })).not.toContain('canvas-guides')
  })

  it('positions every guide as a percentage, so one canvas size covers all of them', () => {
    const markup = render(createTestSlide(), { showGuides: true })
    const guides = describeCanvasGuides({ width: profile.width, height: profile.height })

    for (const line of guides.lines) {
      const style = line.orientation === 'vertical' ? `left:${line.positionPercent}%` : `top:${line.positionPercent}%`
      expect(markup).toContain(style)
    }
  })

  it('does not add a guide element to the layer set the preflight measures', () => {
    const withGuides = render(createTestSlide(), { showGuides: true })
    const layerCount = (markup: string) => markup.match(/data-layer-id="/g)?.length ?? 0
    expect(layerCount(withGuides)).toBe(layerCount(render(createTestSlide())))
  })
})

describe('optional layer stacking order', () => {
  it('leaves the stylesheet stacking untouched for a slide with no order', () => {
    const markup = render(createTestSlide())
    for (const layerId of DEFAULT_LAYER_ORDER) {
      expect(layerOrderZIndex(undefined, layerId)).toBeUndefined()
    }
    // No layer element carries an inline z-index, so nothing about the existing
    // appearance depends on this feature.
    expect(markup).not.toMatch(/data-layer-id="[^"]*"[^>]*style="[^"]*z-index/)
  })

  it('numbers the layers bottom to top for a slide with a custom order', () => {
    const order: LayerId[] = [
      'headline',
      'background-image',
      'accent-shape',
      'screenshot',
      'app-icon',
      'kicker',
      'supporting-text',
      'footer',
    ]
    const markup = render(createTestSlide({ layerOrder: order }))

    for (const layerId of order) {
      const index = layerOrderZIndex(order, layerId)
      expect(markup).toContain(`data-layer-id="${layerId}"`)
      expect(index).toBe(order.indexOf(layerId) + 1)
    }
    // The headline is now the bottom layer, so it is drawn at z-index 1.
    expect(markup).toMatch(/data-layer-id="headline"[^>]*style="[^"]*z-index:1"/)
    expect(markup).toMatch(/data-layer-id="footer"[^>]*style="[^"]*z-index:8"/)
  })
})
