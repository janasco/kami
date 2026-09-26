import type { CSSProperties } from 'react'
import {
  DEFAULT_DEVICE_STATUS_BAR_TIME,
  DEVICE_STATUS_BAR_BATTERY_LEVEL,
  formatDeviceStatusBarTime,
  getDeviceStatusBarMetrics,
} from '../lib/deviceStatusBar'
import type { DeviceFrameId } from '../types'

interface DeviceStatusBarProps {
  deviceFrameId: DeviceFrameId
  /** Fixed clock label; defaults to a stable demo time instead of the system clock. */
  time?: string
  batteryLevel?: number
}

const clampLevel = (level: number) => (Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0.82)

/** Battery shell geometry in a 26 × 12 view box. */
const BATTERY_INNER = { x: 2.4, width: 17.6, y: 2.4, height: 7.2 }

function SignalIcon() {
  return (
    <svg className="device-status-icon device-status-icon--signal" viewBox="0 0 16 12" aria-hidden="true" focusable="false">
      <rect x="0" y="7.6" width="3.1" height="4.4" rx="1.1" />
      <rect x="4.3" y="5.1" width="3.1" height="6.9" rx="1.1" />
      <rect x="8.6" y="2.6" width="3.1" height="9.4" rx="1.1" />
      <rect x="12.9" y="0" width="3.1" height="12" rx="1.1" />
    </svg>
  )
}

function WifiIcon() {
  return (
    <svg className="device-status-icon device-status-icon--wifi" viewBox="0 0 16 12" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M1 4.3a10.4 10.4 0 0 1 14 0" strokeWidth="1.7" />
        <path d="M3.7 7.1a6.5 6.5 0 0 1 8.6 0" strokeWidth="1.7" />
        <path d="M6.2 9.7a2.9 2.9 0 0 1 3.6 0" strokeWidth="1.7" />
      </g>
      <circle cx="8" cy="11.1" r="1.15" />
    </svg>
  )
}

function BatteryIcon({ level }: { level: number }) {
  const fillWidth = Number((BATTERY_INNER.width * clampLevel(level)).toFixed(2))
  return (
    <svg className="device-status-icon device-status-icon--battery" viewBox="0 0 26 12" aria-hidden="true" focusable="false">
      <rect
        x="0.6"
        y="0.6"
        width="22.2"
        height="10.8"
        rx="3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.75"
      />
      <rect
        x={BATTERY_INNER.x}
        y={BATTERY_INNER.y}
        width={fillWidth}
        height={BATTERY_INNER.height}
        rx="1.6"
      />
      <rect x="23.7" y="4" width="1.9" height="4" rx="0.95" opacity="0.75" />
    </svg>
  )
}

/**
 * Decorative device status chrome drawn inside the screenshot aperture. All
 * shapes are local CSS/SVG so previews and exports stay self-contained and
 * deterministic.
 */
export function DeviceStatusBar({ deviceFrameId, time = DEFAULT_DEVICE_STATUS_BAR_TIME, batteryLevel }: DeviceStatusBarProps) {
  const metrics = getDeviceStatusBarMetrics(deviceFrameId)

  return (
    <div
      className="device-status-bar"
      data-device-status-bar={deviceFrameId}
      style={{
        '--device-status-bar-top': `${metrics.topPercent}%`,
        '--device-status-bar-height': `${metrics.heightPercent}%`,
        '--device-status-bar-padding': `${metrics.inlinePaddingPercent}%`,
        '--device-status-bar-scale': metrics.fontScale,
      } as unknown as CSSProperties}
    >
      <span className="device-status-bar__time">{formatDeviceStatusBarTime(time)}</span>
      <span className="device-status-bar__indicators">
        <SignalIcon />
        <WifiIcon />
        <BatteryIcon level={batteryLevel ?? DEVICE_STATUS_BAR_BATTERY_LEVEL} />
      </span>
    </div>
  )
}
