import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { deviceFramePresets, getFeaturedDeviceFramePresets, isFramelessDeviceId } from '../lib/devicePresets'
import { getDeviceCutoutPath } from '../lib/devicePresets'
import { DeviceFramePicker } from './DeviceFramePicker'
import { SlideRenderer } from './SlideCanvas'
import { createTestSlide } from '../test/projectFixtures'
import type { DeviceFrameId, Slide } from '../types'

/**
 * The device surfaces have two promises worth holding: the picker shows the
 * whole catalog in plain words, and the frame the slide renderer draws is the
 * one the catalog describes, in the editor and in the export alike.
 */

const profile = exportProfiles[0]

const renderPicker = (props: Partial<Parameters<typeof DeviceFramePicker>[0]> = {}) =>
  renderToStaticMarkup(createElement(DeviceFramePicker, {
    value: 'iphone',
    onChange: () => undefined,
    ...props,
  }))

const renderSlide = (slide: Slide, exportMode = false) => renderToStaticMarkup(createElement(SlideRenderer, {
  slide,
  slideNumber: 1,
  onImport: () => undefined,
  profile,
  locale: 'en-US',
  exportMode,
}))

/** The device body and aperture, which are identical in the editor and on export. */
const frameMarkup = (markup: string) => {
  const start = markup.indexOf('<div class="phone">')
  const end = markup.indexOf('class="phone-shadow"')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return markup.slice(start, end)
}

/** The wrapper that carries the catalog style variables for the frame. */
const wrapMarkup = (markup: string) => {
  const start = markup.indexOf('class="phone-wrap')
  const end = markup.indexOf('<div class="phone">')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return markup.slice(start, end)
}

const optionCount = (markup: string) => [...markup.matchAll(/class="device-option(?=[ "])/g)].length

describe('device picker', () => {
  it('offers every catalog preset, grouped by family, with a ratio and a description', () => {
    const markup = renderPicker()

    for (const family of ['iPhone', 'iPad', 'Android', 'Android tablets', 'No frame']) {
      expect(markup).toContain(`>${family}</span>`)
    }
    for (const preset of deviceFramePresets) {
      expect(markup).toContain(`>${preset.name}</strong>`)
      expect(markup).toContain(preset.description)
    }
    expect(markup).toContain('19.5:9 · 1125 × 2436')
    // Every option is a real button with its pressed state, not a styled list.
    expect(optionCount(markup)).toBe(deviceFramePresets.length)
    expect([...markup.matchAll(/aria-pressed="true"/g)]).toHaveLength(1)
  })

  it('marks the selected preset and describes what is showing', () => {
    const markup = renderPicker({ value: 'ipad-air' })

    expect(markup).toMatch(/class="device-option is-active" type="button" aria-pressed="true"/)
    expect(markup).toContain('iPad Air · Large tablet, square-ish display. The capture is shown at 1.44:1.')
  })

  it('resolves a legacy value so an old project still shows a pressed option', () => {
    const markup = renderPicker({ value: 'iphone-x' as DeviceFrameId })

    expect(markup).toMatch(/class="device-option is-active"[^>]*aria-pressed="true"/)
    expect(markup).toContain('iPhone · Notch phone, 19.5:9 display. The capture is shown at 19.5:9.')
  })

  it('keeps the compact picker to the shortlist until it is expanded', () => {
    const featured = getFeaturedDeviceFramePresets().map((preset) => preset.id)
    const compact = renderPicker({ compact: true })

    expect(optionCount(compact)).toBe(featured.length)
    expect(featured.length).toBeLessThan(deviceFramePresets.length)
    expect(compact).toContain('aria-expanded="false"')
    expect(compact).toContain(`Show all ${deviceFramePresets.length} devices`)
    for (const preset of deviceFramePresets.filter((item) => !featured.includes(item.id))) {
      expect(compact).not.toContain(`>${preset.name}</strong>`)
    }
  })

  it('opens the compact picker on the full catalog for a device off the shortlist', () => {
    const markup = renderPicker({ compact: true, value: 'android-galaxy' })

    expect(optionCount(markup)).toBe(deviceFramePresets.length)
    expect(markup).toContain('Galaxy · Curved-edge phone')
  })
})

describe('device frame rendering', () => {
  it('draws the body, the cutout, and the chrome from the catalog', () => {
    const notch = renderSlide(createTestSlide({ deviceFrameId: 'iphone' }))

    expect(wrapMarkup(notch)).toContain('--device-body-ratio:0.4782')
    expect(wrapMarkup(notch)).toContain('--device-bezel-inline:3.32%')
    expect(frameMarkup(notch)).toContain('class="phone"')
    expect(frameMarkup(notch)).toContain('data-device-cutout="notch"')
    expect(frameMarkup(notch)).toContain('viewBox="0 0 1125 2436"')
    expect(frameMarkup(notch)).toContain(getDeviceCutoutPath('iphone') ?? '')
    expect(frameMarkup(notch)).toContain('class="device-status-bar"')

    const island = frameMarkup(renderSlide(createTestSlide({ deviceFrameId: 'iphone-island' })))
    expect(island).toContain('data-device-cutout="island"')
    expect(island).toContain('viewBox="0 0 1179 2556"')
    expect(island).toContain(getDeviceCutoutPath('iphone-island') ?? '')

    const hole = frameMarkup(renderSlide(createTestSlide({ deviceFrameId: 'android-pixel' })))
    expect(hole).toContain('data-device-cutout="punch-hole"')
    expect(hole).toContain(getDeviceCutoutPath('android-pixel') ?? '')
  })

  it('draws no cutout for a frame that has none', () => {
    for (const id of ['none', 'canvas', 'ipad-mini', 'iphone-se'] as const) {
      const markup = renderSlide(createTestSlide({ deviceFrameId: id }))
      expect(frameMarkup(markup), id).not.toContain('device-cutout')
      expect(wrapMarkup(markup), id).toContain(`data-device-frameless="${isFramelessDeviceId(id)}"`)
    }
  })

  it('renders the same frame in the editor and in the export stage', () => {
    for (const id of ['iphone-island-max', 'android-tablet', 'none'] as const) {
      const slide = createTestSlide({ deviceFrameId: id, showDeviceStatusBar: true })
      expect(frameMarkup(renderSlide(slide, true)), id).toBe(frameMarkup(renderSlide(slide, false)))
    }
  })

  it('keeps the frameless aperture free of chrome even when the flag is on', () => {
    const markup = renderSlide(createTestSlide({
      deviceFrameId: 'canvas',
      showDeviceStatusBar: true,
    }))

    expect(wrapMarkup(markup)).toContain('data-device-frameless="true"')
    expect(wrapMarkup(markup)).toContain('--device-body-shadow:none')
    expect(frameMarkup(markup)).not.toContain('class="device-status-bar"')
    expect(frameMarkup(markup)).toContain('--screenshot-safe-top:0%')
  })
})
