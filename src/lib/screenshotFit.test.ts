import { describe, expect, it } from 'vitest'
import { DEFAULT_SCREENSHOT_FIT, deviceFramePresets, screenshotFitOptions } from '../data'
import { isFramelessDeviceId } from './devicePresets'
import { deviceStatusBarMetrics } from './deviceStatusBar'
import {
  describeScreenshotFit,
  getScreenshotFitStyle,
  getScreenshotObjectFit,
  getScreenshotSafeArea,
  isScreenshotFit,
  resolveScreenshotFit,
  type ScreenshotFitSlide,
} from './screenshotFit'
import type { DeviceFrameId } from '../types'

const slideFor = (
  overrides: Partial<ScreenshotFitSlide> = {},
): ScreenshotFitSlide => ({
  deviceFrameId: 'iphone',
  showDeviceStatusBar: true,
  screenshotFit: DEFAULT_SCREENSHOT_FIT,
  ...overrides,
})

describe('screenshot fit resolution', () => {
  it('defaults to contain so an imported capture is never cropped', () => {
    expect(DEFAULT_SCREENSHOT_FIT).toBe('contain')
    expect(resolveScreenshotFit(undefined)).toBe('contain')
    expect(resolveScreenshotFit(null)).toBe('contain')
    expect(resolveScreenshotFit('stretch')).toBe('contain')
    expect(resolveScreenshotFit(7)).toBe('contain')
  })

  it('accepts stored values and tolerates loose spellings', () => {
    expect(resolveScreenshotFit('cover')).toBe('cover')
    expect(resolveScreenshotFit('contain')).toBe('contain')
    expect(resolveScreenshotFit(' Cover ')).toBe('cover')
    expect(resolveScreenshotFit('CONTAIN')).toBe('contain')
    expect(isScreenshotFit('cover')).toBe(true)
    expect(isScreenshotFit('fill')).toBe(false)
  })

  it('maps the policy to object-fit keywords', () => {
    expect(getScreenshotObjectFit('cover')).toBe('cover')
    expect(getScreenshotObjectFit('contain')).toBe('contain')
    expect(getScreenshotObjectFit(undefined)).toBe('contain')
  })

  it('describes every option in the Inspector', () => {
    expect(screenshotFitOptions.map((option) => option.id)).toEqual(['contain', 'cover'])
    for (const option of screenshotFitOptions) {
      expect(describeScreenshotFit(option.id)).toBe(option.description)
    }
  })
})

describe('screenshot safe area', () => {
  it('reserves the status bar band so the capture clears the chrome', () => {
    const iphone = deviceStatusBarMetrics.iphone
    expect(getScreenshotSafeArea(slideFor())).toEqual({
      topPercent: iphone.topPercent + iphone.heightPercent + 1.2,
      inlinePercent: 1.6,
    })
  })

  it('fills the aperture when the chrome is hidden or frameless', () => {
    expect(getScreenshotSafeArea(slideFor({ showDeviceStatusBar: false })))
      .toEqual({ topPercent: 0, inlinePercent: 0 })
    for (const preset of deviceFramePresets) {
      const safeArea = getScreenshotSafeArea(slideFor({
        deviceFrameId: preset.id,
        showDeviceStatusBar: true,
      }))
      if (isFramelessDeviceId(preset.id)) {
        expect(safeArea).toEqual({ topPercent: 0, inlinePercent: 0 })
      } else {
        const metrics = deviceStatusBarMetrics[preset.id]
        expect(safeArea.topPercent).toBeCloseTo(metrics.topPercent + metrics.heightPercent + 1.2, 2)
        expect(safeArea.inlinePercent).toBe(1.6)
      }
    }
  })

  it('keeps the reserved band inside the aperture for every framed preset', () => {
    for (const preset of deviceFramePresets.filter((item) => !isFramelessDeviceId(item.id))) {
      const safeArea = getScreenshotSafeArea(slideFor({ deviceFrameId: preset.id as DeviceFrameId }))
      expect(safeArea.topPercent).toBeGreaterThan(0)
      expect(safeArea.topPercent).toBeLessThan(20)
      expect(safeArea.inlinePercent).toBeGreaterThan(0)
      expect(safeArea.inlinePercent).toBeLessThan(5)
    }
  })

  it('hands out a fresh object so callers cannot mutate the policy', () => {
    const first = getScreenshotSafeArea(slideFor())
    first.topPercent = 99
    expect(getScreenshotSafeArea(slideFor()).topPercent).not.toBe(99)
  })
})

describe('screenshot fit style contract', () => {
  it('emits the variables the aperture stylesheet consumes', () => {
    const style = getScreenshotFitStyle(slideFor({ screenshotFit: 'cover' })) as unknown as Record<string, string>

    expect(style['--screenshot-object-fit']).toBe('cover')
    expect(style['--screenshot-safe-top']).toBe('7.8%')
    expect(style['--screenshot-safe-inline']).toBe('1.6%')
  })

  it('drops the safe area when the chrome is off', () => {
    const style = getScreenshotFitStyle(slideFor({ showDeviceStatusBar: false })) as unknown as Record<string, string>

    expect(style['--screenshot-safe-top']).toBe('0%')
    expect(style['--screenshot-safe-inline']).toBe('0%')
    expect(style['--screenshot-object-fit']).toBe('contain')
  })

  it('is stable for the same slide so preview and export agree', () => {
    const slide = slideFor({ deviceFrameId: 'android', screenshotFit: 'cover' })
    expect(getScreenshotFitStyle(slide)).toEqual(getScreenshotFitStyle(slide))
  })
})
