import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { SlideRenderer } from '../components/SlideCanvas'
import { createTestSlide } from '../test/projectFixtures'
import type { Slide } from '../types'

const profile = exportProfiles[0]

const renderSlide = (slide: Slide, exportMode: boolean) => renderToStaticMarkup(createElement(SlideRenderer, {
  slide,
  slideNumber: 1,
  onImport: () => undefined,
  profile,
  locale: 'en-US',
  exportMode,
}))

/** Slice out the aperture, from the screen element up to the frame shadow. */
const apertureMarkup = (markup: string) => {
  const start = markup.indexOf('class="phone__screen"')
  const end = markup.indexOf('class="phone-shadow"')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return markup.slice(start, end)
}

describe('shared device aperture renderer', () => {
  it('draws the same aperture in the editor and in the export stage', () => {
    const slide = createTestSlide({ screenshotFit: 'cover' })

    const preview = apertureMarkup(renderSlide(slide, false))
    const exported = apertureMarkup(renderSlide(slide, true))

    expect(preview).toContain('--screenshot-object-fit:cover')
    expect(exported).toBe(preview)
  })

  it('applies the contain policy to an imported capture', () => {
    const markup = apertureMarkup(renderSlide(createTestSlide({ screenshotFit: 'contain' }), false))

    expect(markup).toContain('data-screenshot-fit="contain"')
    expect(markup).toContain('--screenshot-object-fit:contain')
    expect(markup).toContain('class="phone__media" data-screenshot-state="image"')
  })

  it('reserves the status bar band so the capture clears the chrome', () => {
    const framed = apertureMarkup(renderSlide(createTestSlide({
      deviceFrameId: 'iphone',
      showDeviceStatusBar: true,
    }), false))
    expect(framed).toMatch(/--screenshot-safe-top:7\.8%/)
    expect(framed).toMatch(/--screenshot-safe-inline:1\.6%/)
    expect(framed).toContain('class="device-status-bar"')

    const frameless = apertureMarkup(renderSlide(createTestSlide({
      deviceFrameId: 'none',
      showDeviceStatusBar: true,
    }), false))
    expect(frameless).toContain('--screenshot-safe-top:0%')
    expect(frameless).toContain('--screenshot-safe-inline:0%')
    expect(frameless).not.toContain('device-status-bar')
  })

  it('falls back to the import prompt without a backdrop when a slide has no capture', () => {
    const markup = apertureMarkup(renderSlide(createTestSlide({ screenshot: null, screenshotName: null }), false))

    expect(markup).toContain('class="device-placeholder"')
    expect(markup).toContain('--screenshot-backdrop:transparent')
  })
})
