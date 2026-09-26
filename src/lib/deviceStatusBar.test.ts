import { describe, expect, it } from 'vitest'
import { defaultShowDeviceStatusBar, deviceFramePresets } from '../data'
import {
  DEFAULT_DEVICE_STATUS_BAR_TIME,
  deviceStatusBarMetrics,
  formatDeviceStatusBarTime,
  getDeviceStatusBarMetrics,
  resolveShowDeviceStatusBar,
  shouldShowDeviceStatusBar,
} from './deviceStatusBar'
import type { DeviceFrameId, Slide } from '../types'

const slideFor = (deviceFrameId: DeviceFrameId, showDeviceStatusBar: boolean): Pick<Slide, 'deviceFrameId' | 'showDeviceStatusBar'> =>
  ({ deviceFrameId, showDeviceStatusBar })

describe('device status bar defaults', () => {
  it('enables the chrome for framed presets and disables it for frameless output', () => {
    expect(defaultShowDeviceStatusBar('iphone')).toBe(true)
    expect(defaultShowDeviceStatusBar('android')).toBe(true)
    expect(defaultShowDeviceStatusBar('none')).toBe(false)
  })

  it('covers every device frame preset', () => {
    for (const preset of deviceFramePresets) {
      expect(typeof defaultShowDeviceStatusBar(preset.id)).toBe('boolean')
      expect(getDeviceStatusBarMetrics(preset.id).topPercent).toBeGreaterThan(0)
      expect(getDeviceStatusBarMetrics(preset.id).heightPercent).toBeGreaterThan(0)
    }
  })

  it('resolves stored values and falls back to the device default for older projects', () => {
    expect(resolveShowDeviceStatusBar('iphone', true)).toBe(true)
    expect(resolveShowDeviceStatusBar('iphone', false)).toBe(false)
    expect(resolveShowDeviceStatusBar('android', undefined)).toBe(true)
    expect(resolveShowDeviceStatusBar('none', undefined)).toBe(false)
    expect(resolveShowDeviceStatusBar('iphone', 'true')).toBe(true)
    expect(resolveShowDeviceStatusBar('none', 'true')).toBe(false)
  })
})

describe('device status bar rendering rules', () => {
  it('never draws over frameless output', () => {
    expect(shouldShowDeviceStatusBar(slideFor('iphone', true))).toBe(true)
    expect(shouldShowDeviceStatusBar(slideFor('android', true))).toBe(true)
    expect(shouldShowDeviceStatusBar(slideFor('iphone', false))).toBe(false)
    expect(shouldShowDeviceStatusBar(slideFor('none', true))).toBe(false)
    expect(shouldShowDeviceStatusBar(slideFor('none', false))).toBe(false)
  })

  it('keeps the status bar inside the safe area of the aperture', () => {
    for (const [id, metrics] of Object.entries(deviceStatusBarMetrics)) {
      expect(metrics.topPercent, `${id} top offset`).toBeGreaterThan(0)
      expect(metrics.topPercent + metrics.heightPercent, `${id} safe band`).toBeLessThan(20)
      expect(metrics.inlinePaddingPercent, `${id} inline padding`).toBeGreaterThan(0)
      expect(metrics.fontScale, `${id} font scale`).toBeGreaterThan(0)
    }
    expect(deviceStatusBarMetrics.android.topPercent).toBeLessThan(deviceStatusBarMetrics.iphone.topPercent)
  })

  it('hands out a copy so callers cannot mutate shared metrics', () => {
    const metrics = getDeviceStatusBarMetrics('iphone')
    metrics.topPercent = 99
    expect(getDeviceStatusBarMetrics('iphone').topPercent).toBe(deviceStatusBarMetrics.iphone.topPercent)
  })
})

describe('device status bar clock', () => {
  it('uses a fixed demo-friendly time instead of the system clock', () => {
    expect(DEFAULT_DEVICE_STATUS_BAR_TIME).toBe('9:41')
    expect(formatDeviceStatusBarTime()).toBe('9:41')
    expect(formatDeviceStatusBarTime('10:08')).toBe('10:08')
    expect(formatDeviceStatusBarTime('   ')).toBe('9:41')
  })
})
