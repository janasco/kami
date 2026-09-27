import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { SlideRenderer } from '../components/SlideCanvas'
import { createTestSlide, VALID_PNG_DATA_URL, VALID_SVG_DATA_URL } from '../test/projectFixtures'
import { getBackgroundFillStyle, PANORAMIC_MAX_BLEED } from './backgroundFill'
import type { BackgroundFill, Slide } from '../types'

const profile = exportProfiles[0]

const renderSlide = (slide: Slide, exportMode: boolean) => renderToStaticMarkup(createElement(SlideRenderer, {
  slide,
  slideNumber: 1,
  onImport: () => undefined,
  profile,
  locale: 'en-US',
  exportMode,
}))

/**
 * The background fill contract exactly as the canvas root publishes it.
 *
 * Only the variable block is sliced out. The rest of the root legitimately
 * differs between the editor and the export stage, which already have their own
 * regression test; what must not differ is the fill.
 */
const fillMarkup = (markup: string) => {
  const start = markup.indexOf('--background-fill')
  const end = markup.indexOf('--slide-transform-x')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return markup.slice(start, end)
}

/** The fill kind the stylesheet keys off, read from the canvas root itself. */
const fillKind = (markup: string) => markup.match(/data-background-fill="([a-z]+)"/)?.[1]

const backgroundSlide = (overrides: Partial<Slide> = {}): Slide => createTestSlide({
  theme: 'midnight',
  backgroundImage: {
    name: 'backdrop.png',
    dataUrl: VALID_PNG_DATA_URL,
    mimeType: 'image/png',
    width: 3000,
    height: 1000,
  },
  ...overrides,
})

const withFill = (fill?: BackgroundFill, focalPoint?: { x: number; y: number }): Slide =>
  backgroundSlide({ ...(fill ? { backgroundFill: fill } : {}), ...(focalPoint ? { backgroundFocalPoint: focalPoint } : {}) })

describe('background fill on the shared canvas renderer', () => {
  it('tags the canvas with the resolved fill, defaulting to the theme', () => {
    expect(fillKind(renderSlide(withFill(), false))).toBe('theme')
    expect(fillKind(renderSlide(withFill({ kind: 'panoramic' }), false))).toBe('panoramic')
    expect(fillKind(renderSlide(backgroundSlide({ backgroundFill: { kind: 'mesh' } as unknown as BackgroundFill }), false)))
      .toBe('theme')
  })

  it('publishes the fill contract on the canvas, not as JSX branches', () => {
    const gradient = { angle: 145, stops: ['#151525', '#5b4cf0'] }
    const markup = fillMarkup(renderSlide(withFill({ kind: 'gradient', gradient }, { x: 0.5, y: 0.42 }), false))
    const expected = getBackgroundFillStyle({
      fill: { kind: 'gradient', gradient },
      focalPoint: { x: 0.5, y: 0.42 },
      themeId: 'midnight',
      profileAspectRatio: profile.width / profile.height,
      intrinsicSize: { width: 3000, height: 1000 },
    })

    for (const [name, value] of Object.entries(expected)) {
      expect(markup).toContain(`${name}:${value}`)
    }
    expect(markup).toContain('--background-fill:gradient')
    expect(markup).toContain('--background-paint:linear-gradient(145deg, #151525, #5b4cf0)')
    expect(markup).toContain('--background-position:50% 42%')
    expect(markup).toContain('--background-blend:normal')
  })

  it('draws exactly the same fill in the editor and in the export stage', () => {
    const slide = withFill({ kind: 'panoramic', blend: 'screen' }, { x: 0.2, y: 0.75 })

    const preview = renderSlide(slide, false)
    const exported = renderSlide(slide, true)

    expect(fillMarkup(exported)).toBe(fillMarkup(preview))
    expect(fillKind(exported)).toBe(fillKind(preview))
    expect(fillMarkup(preview)).toContain(`--background-scale:${1 + PANORAMIC_MAX_BLEED}`)
  })

  it('keeps the theme paint under an image fill, so a missing image is not a hole', () => {
    const markup = fillMarkup(renderSlide(withFill({ kind: 'image' }), false))
    expect(markup).toContain('--background-paint:linear-gradient(145deg, #151525, #5b4cf0)')
  })

  it('adds no overscan when the image has no usable intrinsic size', () => {
    const noHint = backgroundSlide({
      backgroundImage: { name: 'backdrop.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' },
    })
    expect(fillMarkup(renderSlide({ ...noHint, backgroundFill: { kind: 'panoramic' } }, false)))
      .toContain('--background-scale:1')
    expect(fillMarkup(renderSlide(withFill({ kind: 'panoramic' }), false)))
      .toContain(`--background-scale:${1 + PANORAMIC_MAX_BLEED}`)
  })

  it('keeps the background image layer in the markup for every fill kind', () => {
    // The layer is always emitted; only the stylesheet decides whether the
    // chosen fill turns it off. A JSX branch here would put preview and export
    // on different code paths, which is what this milestone is avoiding.
    for (const fill of [undefined, { kind: 'image' } as BackgroundFill, { kind: 'panoramic' } as BackgroundFill]) {
      const markup = renderSlide(withFill(fill), true)
      expect(markup).toContain('canvas-background-image')
      expect(markup).toContain('data-layer-id="background-image"')
    }
    expect(renderSlide(backgroundSlide({
      backgroundImage: { name: 'vector.svg', dataUrl: VALID_SVG_DATA_URL, mimeType: 'image/svg+xml' },
    }), true)).toContain('data:image/svg+xml;base64,')
  })
})
