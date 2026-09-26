import { getDeviceCutoutPath, getDeviceGeometry } from '../lib/devicePresets'
import type { DeviceFramePreset } from '../types'

/**
 * A tiny, entirely local preview of a device frame.
 *
 * The thumbnail is drawn from the same catalog numbers the slide renderer uses:
 * a rounded rectangle for the body, a rounded rectangle for the display, and the
 * computed cutout path. There is no image, no icon, and no manufacturer
 * artwork, so the picker cannot drift away from the exported frame.
 */

const BOX = 100
const PADDING = 6
const round = (value: number) => Math.round(value * 100) / 100

export interface DeviceFrameThumbnailProps {
  preset: DeviceFramePreset
  className?: string
}

export function DeviceFrameThumbnail({ preset, className }: DeviceFrameThumbnailProps) {
  const geometry = getDeviceGeometry(preset.id)
  const bezel = preset.body.bezelInline
  const scale = Math.min((BOX - PADDING * 2) / geometry.body.width, (BOX - PADDING * 2) / geometry.body.height)
  const width = geometry.body.width * scale
  const height = geometry.body.height * scale
  const x = (BOX - width) / 2
  const y = (BOX - height) / 2
  const screenX = x + bezel * scale
  const screenY = y + preset.body.bezelTop * scale
  const screenWidth = geometry.screen.width * scale
  const screenHeight = geometry.screen.height * scale
  const cutoutPath = getDeviceCutoutPath(geometry.id)

  return (
    <svg
      className={className ? `device-frame-thumb ${className}` : 'device-frame-thumb'}
      viewBox={`0 0 ${BOX} ${BOX}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x={round(x)}
        y={round(y)}
        width={round(width)}
        height={round(height)}
        rx={round(preset.body.cornerRadius * scale)}
        fill={geometry.palette.bodyBackground}
        stroke={geometry.palette.bodyBorderColor}
        strokeWidth={geometry.palette.bodyRingColor === null ? 0 : 1}
      />
      <rect
        x={round(screenX)}
        y={round(screenY)}
        width={round(screenWidth)}
        height={round(screenHeight)}
        rx={round(preset.body.screenCornerRadius * scale)}
        fill={geometry.palette.screenBackdrop}
      />
      {cutoutPath && (
        <g transform={`translate(${round(screenX)} ${round(screenY)}) scale(${round(scale)})`}>
          <path d={cutoutPath} fill={geometry.palette.bodyBackground} />
        </g>
      )}
    </svg>
  )
}
