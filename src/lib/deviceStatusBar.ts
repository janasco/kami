import {
  canShowDeviceStatusBar,
  defaultShowDeviceStatusBar,
  deviceFramePresets,
  getDeviceFramePreset,
} from './devicePresets'
import type { DeviceFrameId, Slide } from '../types'

/**
 * Stable demo clock shown in the status chrome. Exported slides must be
 * reproducible, so the renderer never reads the user's system clock.
 */
export const DEFAULT_DEVICE_STATUS_BAR_TIME = '9:41'

/** Battery level drawn in the status chrome, as a 0–1 ratio. */
export const DEVICE_STATUS_BAR_BATTERY_LEVEL = 0.82

export interface DeviceStatusBarMetrics {
  /**
   * Top offset of the status bar measured from the top of the screenshot
   * aperture, in percent of the aperture height. This mirrors the OS safe area
   * so the chrome sits in the reserved band instead of over app content.
   */
  topPercent: number
  /** Status bar height as a percent of the aperture height. */
  heightPercent: number
  /** Horizontal inset as a percent of the aperture width. */
  inlinePaddingPercent: number
  /** Multiplier applied to the base status bar font size for this preset. */
  fontScale: number
}

/**
 * Chrome placement comes from the catalog, so a new device preset brings its
 * own metrics and nothing in the renderer has to special-case a frame. Frameless
 * presets carry placeholder values that keep the record total; their chrome is
 * never drawn.
 */
export const deviceStatusBarMetrics: Record<DeviceFrameId, DeviceStatusBarMetrics> =
  Object.fromEntries(
    deviceFramePresets.map((preset) => [preset.id, { ...preset.statusBar }]),
  ) as Record<DeviceFrameId, DeviceStatusBarMetrics>

const cloneMetrics = (metrics: DeviceStatusBarMetrics): DeviceStatusBarMetrics => ({ ...metrics })

/** Metrics for a device preset, safe to spread into a style object. */
export const getDeviceStatusBarMetrics = (deviceFrameId: DeviceFrameId): DeviceStatusBarMetrics =>
  cloneMetrics(deviceStatusBarMetrics[getDeviceFramePreset(deviceFrameId).id])

/**
 * Resolves whether a slide draws the status chrome. Frameless presets always
 * render the screenshot alone, regardless of the stored preference.
 */
export const shouldShowDeviceStatusBar = (slide: Pick<Slide, 'deviceFrameId' | 'showDeviceStatusBar'>) =>
  canShowDeviceStatusBar(slide.deviceFrameId) && slide.showDeviceStatusBar

/**
 * Resolves the stored flag for a slide, falling back to the device default when
 * an older project without the field is restored.
 */
export const resolveShowDeviceStatusBar = (
  deviceFrameId: DeviceFrameId,
  value: unknown,
): boolean => (typeof value === 'boolean' ? value : defaultShowDeviceStatusBar(deviceFrameId))

/** Formats the status clock. Values are passed through so a fixed demo time stays stable. */
export const formatDeviceStatusBarTime = (time: string = DEFAULT_DEVICE_STATUS_BAR_TIME): string => {
  const trimmed = time.trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_DEVICE_STATUS_BAR_TIME
}
