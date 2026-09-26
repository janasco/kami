import { useState } from 'react'
import {
  formatDeviceAspectRatio,
  getDeviceFamilyGroups,
  getFeaturedDeviceFamilyGroups,
  getDeviceFramePreset,
  type DeviceFamilyGroup,
} from '../lib/devicePresets'
import type { DeviceFrameId, DeviceFramePreset } from '../types'
import { DeviceFrameThumbnail } from './DeviceFrameThumbnail'

/**
 * Device picker for the editor sidebar.
 *
 * Presets are grouped by family and each option carries the three things an
 * author needs in order to choose without previewing every slide: the name, the
 * aspect ratio the capture will be shown at, and one line describing the frame.
 * The thumbnail is drawn from the same catalog geometry the slide renderer uses,
 * so a button and an exported frame cannot drift apart.
 *
 * Nothing here is decorative: every option is a real button, and the current
 * choice is the pressed one, so the control is usable with a keyboard alone.
 */

export interface DeviceFramePickerProps {
  value: DeviceFrameId
  onChange: (deviceFrameId: DeviceFrameId) => void
  /**
   * Shows the curated shortlist and keeps the rest of the catalog one
   * disclosure away, for surfaces that cannot show every option at once.
   */
  compact?: boolean
  /** Prefix for the generated group labels, unique per picker on a page. */
  idPrefix?: string
  /** Accessible name for the picker as a whole. */
  label?: string
}

const countPresets = (groups: readonly DeviceFamilyGroup[]) =>
  groups.reduce((total, group) => total + group.presets.length, 0)

const DeviceOption = ({
  preset,
  selected,
  onSelect,
}: {
  preset: DeviceFramePreset
  selected: boolean
  onSelect: () => void
}) => (
  <button
    className={`device-option${selected ? ' is-active' : ''}`}
    type="button"
    aria-pressed={selected}
    onClick={onSelect}
  >
    <DeviceFrameThumbnail preset={preset} />
    <span className="device-option__text">
      <strong>{preset.name}</strong>
      <span className="device-option__meta">
        {formatDeviceAspectRatio(preset)} · {preset.screen.width} × {preset.screen.height}
      </span>
      <span className="device-option__description">{preset.description}</span>
    </span>
  </button>
)

const DeviceGroup = ({
  group,
  labelId,
  value,
  onChange,
}: {
  group: DeviceFamilyGroup
  labelId: string
  value: DeviceFrameId
  onChange: (deviceFrameId: DeviceFrameId) => void
}) => (
  <div className="device-picker__group">
    <span className="device-picker__group-label" id={labelId}>{group.label}</span>
    <div className="device-picker__options" role="group" aria-labelledby={labelId}>
      {group.presets.map((preset) => (
        <DeviceOption
          key={preset.id}
          preset={preset}
          selected={preset.id === value}
          onSelect={() => onChange(preset.id)}
        />
      ))}
    </div>
  </div>
)

export function DeviceFramePicker({
  value,
  onChange,
  compact = false,
  idPrefix = 'device-frame',
  label = 'Device frame',
}: DeviceFramePickerProps) {
  const [override, setOverride] = useState<boolean | null>(null)
  const allGroups = getDeviceFamilyGroups()
  const featuredGroups = getFeaturedDeviceFamilyGroups()
  const selected = getDeviceFramePreset(value)
  const onShortlist = featuredGroups.some((group) => group.presets.some((preset) => preset.id === selected.id))
  // A shortlist would hide the current choice when it is not on it, so an
  // uncommon device opens on the whole catalog.
  const expanded = override ?? !onShortlist
  const visibleGroups = compact && !expanded ? featuredGroups : allGroups
  const hiddenCount = countPresets(allGroups) - countPresets(featuredGroups)

  return (
    <div className="device-picker" data-device-picker={compact ? 'compact' : 'full'}>
      <div className="device-picker__list" role="group" aria-label={label}>
        {visibleGroups.map((group) => (
          <DeviceGroup
            key={group.id}
            group={group}
            labelId={`${idPrefix}-${group.id}`}
            value={selected.id}
            onChange={onChange}
          />
        ))}
      </div>
      {compact && hiddenCount > 0 && (
        <button
          className="text-button text-button--compact device-picker__more"
          type="button"
          aria-expanded={expanded}
          onClick={() => setOverride(!expanded)}
        >
          {expanded
            ? 'Show the shortlist'
            : `Show all ${countPresets(allGroups)} devices (${hiddenCount} more)`}
        </button>
      )}
      <p className="device-status-hint" aria-live="polite">
        {`${selected.name} · ${selected.description}. The capture is shown at ${formatDeviceAspectRatio(selected)}.`}
      </p>
    </div>
  )
}
