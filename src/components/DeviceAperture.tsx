import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { getDeviceCutoutPath, getDeviceCutoutViewBox, getDeviceGeometry } from '../lib/devicePresets'
import { shouldShowDeviceStatusBar } from '../lib/deviceStatusBar'
import { resolveScreenshotFit, getScreenshotFitStyle } from '../lib/screenshotFit'
import type { Slide } from '../types'
import { DeviceStatusBar } from './DeviceStatusBar'

/**
 * The screenshot aperture shared by the editor canvas and the export stage.
 *
 * Both call sites render this component, so the fit policy, the safe area, the
 * device cutout, and the status chrome resolve identically for a preview and for
 * an exported PNG.
 */

export function DevicePlaceholder({ onImport }: { onImport?: () => void }) {
  return (
    <button className="device-placeholder" type="button" onClick={onImport}>
      <span className="device-placeholder__icon" aria-hidden="true">↑</span>
      <strong>Add your screenshot</strong>
      <span>PNG, JPG, or WebP</span>
    </button>
  )
}

interface DeviceApertureProps {
  slide: Pick<Slide, 'deviceFrameId' | 'showDeviceStatusBar' | 'screenshotFit'>
  screenshot: string | null
  slideNumber: number
  onImport?: () => void
}

export function DeviceAperture({ slide, screenshot, slideNumber, onImport }: DeviceApertureProps) {
  const [screenshotFailed, setScreenshotFailed] = useState(false)
  const fit = resolveScreenshotFit(slide.screenshotFit)
  const geometry = getDeviceGeometry(slide.deviceFrameId)
  const cutoutPath = getDeviceCutoutPath(geometry.id)

  useEffect(() => {
    setScreenshotFailed(false)
  }, [screenshot])

  const hasScreenshot = Boolean(screenshot) && !screenshotFailed
  const style = {
    ...getScreenshotFitStyle({ ...slide, screenshotFit: fit }),
    // Only a rendered capture needs a backdrop; the placeholder keeps the
    // light aperture background so its own label stays readable.
    ...(hasScreenshot ? {} : { '--screenshot-backdrop': 'transparent' }),
  } as unknown as CSSProperties

  return (
    <div
      className="phone__screen"
      data-screenshot-fit={fit}
      data-device-frame={geometry.id}
      style={style}
    >
      <div className="phone__media" data-screenshot-state={hasScreenshot ? 'image' : 'placeholder'}>
        {hasScreenshot ? (
          <img
            src={screenshot ?? undefined}
            alt={`Screenshot for slide ${slideNumber}`}
            draggable={false}
            onError={() => setScreenshotFailed(true)}
          />
        ) : (
          <DevicePlaceholder onImport={onImport} />
        )}
      </div>
      {/*
        The cutout is one computed path in display-pixel coordinates, drawn over
        the capture and under the status chrome. Its view box is the display, so
        the same markup scales to any export size.
      */}
      {cutoutPath && (
        <svg
          className="device-cutout"
          data-device-cutout={geometry.cutout.kind}
          viewBox={getDeviceCutoutViewBox(geometry.id)}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d={cutoutPath} />
        </svg>
      )}
      {shouldShowDeviceStatusBar(slide) && <DeviceStatusBar deviceFrameId={slide.deviceFrameId} />}
    </div>
  )
}
