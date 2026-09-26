import type { CSSProperties } from 'react'
import { DEFAULT_SCREENSHOT_FIT, screenshotFitOptions } from '../data'
import { getDeviceGeometry } from './devicePresets'
import { getDeviceStatusBarMetrics, shouldShowDeviceStatusBar } from './deviceStatusBar'
import type { ScreenshotFit, Slide } from '../types'

/** Percent of the aperture height kept clear below the status chrome. */
const SAFE_AREA_GAP_PERCENT = 1.2

/**
 * Inline inset applied while the status chrome is visible. It keeps capture
 * content off the rounded frame edge and away from the clock and indicators.
 */
const SAFE_AREA_INLINE_PERCENT = 1.6

const roundPercent = (value: number) => Math.round(value * 100) / 100

/** Slice of a slide that the fit policy needs. */
export type ScreenshotFitSlide = Pick<Slide, 'deviceFrameId' | 'showDeviceStatusBar' | 'screenshotFit'>

export interface ScreenshotSafeArea {
  /** Top inset as a percent of the aperture height. */
  topPercent: number
  /** Left/right inset as a percent of the aperture width. */
  inlinePercent: number
}

/** Type guard for stored or untrusted fit values. */
export const isScreenshotFit = (value: unknown): value is ScreenshotFit =>
  typeof value === 'string' && screenshotFitOptions.some((option) => option.id === value)

/**
 * Resolves a stored fit value, tolerating older projects that predate the
 * field and hand-edited documents that use different casing or padding.
 */
export const resolveScreenshotFit = (value: unknown): ScreenshotFit => {
  if (isScreenshotFit(value)) return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (isScreenshotFit(normalized)) return normalized
  }
  return DEFAULT_SCREENSHOT_FIT
}

/** The CSS `object-fit` keyword a fit policy maps to. */
export const getScreenshotObjectFit = (fit: unknown): 'cover' | 'contain' =>
  resolveScreenshotFit(fit) === 'cover' ? 'cover' : 'contain'

/**
 * Resolves the inset the capture keeps inside the aperture. The device status
 * chrome reserves a band at the top, so the capture starts below it instead of
 * colliding with the clock. A cutout that reaches past that band is respected
 * too, because a capture must never sit under a notch or a camera hole. With no
 * chrome the capture fills the aperture.
 */
export const getScreenshotSafeArea = (slide: Pick<ScreenshotFitSlide, 'deviceFrameId' | 'showDeviceStatusBar'>): ScreenshotSafeArea => {
  if (!shouldShowDeviceStatusBar(slide)) return { topPercent: 0, inlinePercent: 0 }

  const metrics = getDeviceStatusBarMetrics(slide.deviceFrameId)
  const reservedTop = Math.max(
    metrics.topPercent + metrics.heightPercent,
    getDeviceGeometry(slide.deviceFrameId).cutout.bottomPercent,
  )
  return {
    topPercent: roundPercent(reservedTop + SAFE_AREA_GAP_PERCENT),
    inlinePercent: SAFE_AREA_INLINE_PERCENT,
  }
}

/**
 * Style variables shared by the editor preview and the export renderer. Both
 * draw the same aperture, so a fit change previews exactly as it exports.
 */
export const getScreenshotFitStyle = (slide: ScreenshotFitSlide): CSSProperties => {
  const safeArea = getScreenshotSafeArea(slide)
  return {
    '--screenshot-object-fit': getScreenshotObjectFit(slide.screenshotFit),
    '--screenshot-safe-top': `${safeArea.topPercent}%`,
    '--screenshot-safe-inline': `${safeArea.inlinePercent}%`,
  } as unknown as CSSProperties
}

/** Human-readable summary used by the Inspector hint. */
export const describeScreenshotFit = (fit: unknown): string =>
  screenshotFitOptions.find((option) => option.id === resolveScreenshotFit(fit))?.description ?? ''
