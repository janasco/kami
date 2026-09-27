import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  backgroundFillOptions,
  deviceFramePresets,
  layouts,
  screenshotFitOptions,
  slideLayerIds,
  slideLayerLabels,
  themes,
} from '../../data'
import {
  describeBulkSlideCaveat,
  describeFramelessTargets,
  MIXED_BULK_VALUE,
  resolveTargetSlides,
  sharedValue,
  type BulkActionGroup,
  type BulkSlideAction,
} from '../../lib/flowboardBulkEdit'
import {
  describeFlowboardSelectionText,
  describeSelectModifier,
  formatSlideNumbers,
  isMultiSelectGesture,
  type FlowboardSelection,
} from '../../lib/flowboardSelection'
import type { BackgroundFillKind, DeviceFrameId, FocalPoint, LayerId, LayoutId, ScreenshotFit, Slide, ThemeId } from '../../types'
import { FocalPointFields } from '../BackgroundFillControls'
import { clampFocalPoint, resolveBackgroundFill } from '../../lib/backgroundFill'

export interface SlideSelectionHandlers {
  onClick: (event: MouseEvent<HTMLElement>) => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
}

/**
 * Card activation handlers.
 *
 * A plain click keeps the single-selection behaviour the editor already had. A
 * modifier click, or a secondary click on its own, adds or removes the card
 * from the multi-selection instead.
 */
export const createCardSelectionHandlers = (
  slideId: string,
  onSelect: (slideId: string) => void,
  onToggleSelect: (slideId: string) => void,
): SlideSelectionHandlers => ({
  onClick: (event) => {
    if (isMultiSelectGesture(event)) onToggleSelect(slideId)
    else onSelect(slideId)
  },
  onContextMenu: (event) => {
    // macOS also sends a context menu for Ctrl-click; the click handler owns that case.
    if (isMultiSelectGesture(event)) return
    event.preventDefault()
    onToggleSelect(slideId)
  },
})

interface SlideSelectionSummaryProps {
  selection: FlowboardSelection
  slideCount: number
  /** Prefix for the hint id, so two stages never share one. */
  idPrefix: string
  onSelectAll: () => void
  onClear: () => void
}

/**
 * The always-visible selection row: a live count, select all, and clear.
 *
 * It renders with fewer than two slides selected too, so the affordance is
 * discoverable before a second card is chosen, and the polite live region
 * announces every change for screen reader users.
 */
export function SlideSelectionSummary({
  selection,
  slideCount,
  idPrefix,
  onSelectAll,
  onClear,
}: SlideSelectionSummaryProps) {
  const hintId = `${idPrefix}-select-hint`
  const everythingSelected = slideCount > 0 && selection.selectedIds.length === slideCount

  return (
    <div className="flowboard-selection">
      <p className="flowboard-selection__status" role="status" aria-live="polite">
        {describeFlowboardSelectionText(selection, slideCount)}
      </p>
      <p className="flowboard-selection__legend">
        <span className="flowboard-selection__legend-item">
          <span className="flowboard-card__badge">Editing</span>
          the slide the canvas and Inspector edit
        </span>
        <span className="flowboard-selection__legend-item">
          <span className="flowboard-card__badge is-selected">Selected</span>
          the {selection.selectedIds.length} slide{selection.selectedIds.length === 1 ? '' : 's'} bulk actions apply to
        </span>
      </p>
      <div className="flowboard-selection__actions">
        <button
          className="button button--outline button--small"
          type="button"
          onClick={onSelectAll}
          disabled={everythingSelected}
          aria-label={`Select all ${slideCount} slide${slideCount === 1 ? '' : 's'} for bulk editing`}
        >
          <span aria-hidden="true">▦</span> Select all
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={onClear}
          disabled={selection.selectedIds.length === 0}
          aria-label="Clear the multi-selection"
        >
          <span aria-hidden="true">✕</span> Clear selection
        </button>
      </div>
      <p className="flowboard-hint" id={hintId}>{describeSelectModifier()}</p>
    </div>
  )
}

interface BulkActionBarProps {
  slides: Slide[]
  selection: FlowboardSelection
  /** Which compact groups to show. */
  groups: BulkActionGroup[]
  idPrefix: string
  onApply: (action: BulkSlideAction) => void
  onClear: () => void
  /** Result of the last applied action, announced politely. */
  notice: string | null
}

/**
 * The compact bulk action bar.
 *
 * It appears only when two or more slides are selected, drives every control
 * from the existing data catalogs, and disables an option once the whole
 * selection already holds it, so the bar never offers a change it would not
 * make.
 */
export function BulkActionBar({
  slides,
  selection,
  groups,
  idPrefix,
  onApply,
  onClear,
  notice,
}: BulkActionBarProps) {
  const targets = resolveTargetSlides(slides, selection.targetIds)
  const count = targets.length
  const label = `${count} selected slide${count === 1 ? '' : 's'}`
  const titleId = `${idPrefix}-bulk-title`
  const scope = `the ${label}`

  const [layerId, setLayerId] = useState<LayerId>('accent-shape')
  const layerLabel = slideLayerLabels[layerId]
  const layerSettings = targets
    .map((slide) => slide.layerSettings[layerId])
    .filter((settings): settings is Slide['layerSettings'][LayerId] => Boolean(settings))

  const sharedDevice = sharedValue(targets, (slide) => slide.deviceFrameId)
  const sharedFit = sharedValue(targets, (slide) => slide.screenshotFit)
  const sharedStatusBar = sharedValue(targets, (slide) => slide.showDeviceStatusBar)
  const sharedLayout = sharedValue(targets, (slide) => slide.layout)
  const sharedTheme = sharedValue(targets, (slide) => slide.theme)
  const sharedFill = sharedValue(targets, (slide) => resolveBackgroundFill(slide.backgroundFill).kind)
  /**
   * The focal point is two axes, so a mixed selection cannot honestly be shown
   * as a pair of sliders: whichever axis the author nudged would also commit the
   * other axis from whichever slide happened to come first. The bar therefore
   * offers only the one operation that is unambiguous on a mixed selection —
   * recentring — and the sliders once the selection already agrees.
   */
  const sharedFocal = sharedValue(targets, (slide) => {
    const point = clampFocalPoint(slide.backgroundFocalPoint)
    return `${point.x},${point.y}`
  })
  const focalValue = useMemo<FocalPoint | null>(() => {
    if (sharedFocal === null) return null
    const [x, y] = sharedFocal.split(',').map(Number)
    return { x, y }
  }, [sharedFocal])
  const sharedVisible = sharedValue(layerSettings, (settings) => settings.visible)
  const sharedOpacity = sharedValue(layerSettings, (settings) => settings.opacity)
  const opacityValue = sharedOpacity ?? layerSettings[0]?.opacity ?? 1
  const opacityPercent = Math.round(opacityValue * 100)
  /**
   * Only worth saying when the selection already agrees on an image fill and
   * part of it has no image to fill with. A mixed selection has no single fill
   * to caveat yet.
   */
  const fillCaveat = sharedFill === null
    ? null
    : describeBulkSlideCaveat({ kind: 'background-fill', backgroundFill: sharedFill }, targets)
  const framelessNote = describeFramelessTargets(targets)
  const missingLayerNote = layerSettings.length < count

  return (
    <section className="flowboard-panel flowboard-panel--wide flowboard-bulk" aria-labelledby={titleId}>
      <div className="flowboard-panel__heading flowboard-panel__heading--row">
        <div>
          <span className="eyebrow">Bulk edit</span>
          <h3 id={titleId}>{count} of {slides.length} slides selected</h3>
          <p className="flowboard-hint">
            Applies to slides {formatSlideNumbers(selection.targetSlideNumbers)}. One change is one undo step, autosaved
            like any other edit.
          </p>
        </div>
        <div className="flowboard-panel__heading-actions">
          <span className="flowboard-badge">Applies to {count} slide{count === 1 ? '' : 's'}</span>
          <button
            className="button button--outline button--small"
            type="button"
            onClick={onClear}
            aria-label={`Clear the selection of ${count} slide${count === 1 ? '' : 's'}`}
          >
            <span aria-hidden="true">✕</span> Clear selection
          </button>
        </div>
      </div>

      <div className="flowboard-bulk__groups">
        {groups.includes('framing') && (
          <div className="flowboard-bulk__group" role="group" aria-label={`Framing for ${scope}`}>
            <label className="field-label" htmlFor={`${idPrefix}-bulk-device`}>Device frame</label>
            <select
              id={`${idPrefix}-bulk-device`}
              className="profile-select"
              value={sharedDevice ?? MIXED_BULK_VALUE}
              aria-label={`Device frame for ${scope}`}
              onChange={(event) => onApply({ kind: 'device-frame', deviceFrameId: event.target.value as DeviceFrameId })}
            >
              {sharedDevice === null && <option value={MIXED_BULK_VALUE}>Mixed</option>}
              {deviceFramePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name} · {preset.description}</option>
              ))}
            </select>

            <span className="field-label" id={`${idPrefix}-bulk-fit-label`}>Screenshot fit</span>
            <div className="flowboard-bulk__segmented" role="group" aria-labelledby={`${idPrefix}-bulk-fit-label`}>
              {screenshotFitOptions.map((option) => {
                const active = sharedFit === option.id
                return (
                  <button
                    key={option.id}
                    className={`flowboard-bulk__option${active ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Set the ${option.label.toLowerCase()} fit for ${scope}`}
                    title={`${option.description} for ${scope}`}
                    disabled={active}
                    onClick={() => onApply({ kind: 'screenshot-fit', screenshotFit: option.id as ScreenshotFit })}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            <span className="field-label" id={`${idPrefix}-bulk-status-label`}>Status bar</span>
            <div className="flowboard-bulk__segmented" role="group" aria-labelledby={`${idPrefix}-bulk-status-label`}>
              {([true, false] as const).map((visible) => {
                const active = sharedStatusBar === visible
                return (
                  <button
                    key={String(visible)}
                    className={`flowboard-bulk__option${active ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Turn the device status bar ${visible ? 'on' : 'off'} for ${scope}`}
                    disabled={active}
                    onClick={() => onApply({ kind: 'device-status-bar', visible })}
                  >
                    {visible ? 'On' : 'Off'}
                  </button>
                )
              })}
            </div>
            {framelessNote && <p className="flowboard-hint">{framelessNote}</p>}
          </div>
        )}

        {groups.includes('style') && (
          <div className="flowboard-bulk__group" role="group" aria-label={`Style for ${scope}`}>
            <label className="field-label" htmlFor={`${idPrefix}-bulk-layout`}>Layout</label>
            <select
              id={`${idPrefix}-bulk-layout`}
              className="profile-select"
              value={sharedLayout ?? MIXED_BULK_VALUE}
              aria-label={`Layout for ${scope}`}
              onChange={(event) => onApply({ kind: 'layout', layout: event.target.value as LayoutId })}
            >
              {sharedLayout === null && <option value={MIXED_BULK_VALUE}>Mixed</option>}
              {layouts.map((layout) => (
                <option key={layout.id} value={layout.id}>{layout.name} · {layout.description}</option>
              ))}
            </select>

            <label className="field-label" htmlFor={`${idPrefix}-bulk-theme`}>Theme</label>
            <select
              id={`${idPrefix}-bulk-theme`}
              className="profile-select"
              value={sharedTheme ?? MIXED_BULK_VALUE}
              aria-label={`Theme for ${scope}`}
              onChange={(event) => onApply({ kind: 'theme', theme: event.target.value as ThemeId })}
            >
              {sharedTheme === null && <option value={MIXED_BULK_VALUE}>Mixed</option>}
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>{theme.name}</option>
              ))}
            </select>

            <p className="flowboard-hint">Copy and captures are never touched by a bulk style change.</p>

            <span className="field-label" id={`${idPrefix}-bulk-background-label`}>Background fill</span>
            <div className="flowboard-bulk__segmented" role="group" aria-labelledby={`${idPrefix}-bulk-background-label`}>
              {backgroundFillOptions.map((option) => {
                const active = sharedFill === option.id
                return (
                  <button
                    key={option.id}
                    className={`flowboard-bulk__option${active ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Set the ${option.label.toLowerCase()} background fill for ${scope}`}
                    title={`${option.description} for ${scope}`}
                    disabled={active}
                    onClick={() => onApply({ kind: 'background-fill', backgroundFill: option.id as BackgroundFillKind })}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            {fillCaveat && <p className="flowboard-hint">{fillCaveat}</p>}

            {focalValue
              ? (
                <FocalPointFields
                  value={focalValue}
                  idPrefix={`${idPrefix}-bulk-focal`}
                  label={`Background image for ${scope}`}
                  onChange={(point: FocalPoint) => onApply({ kind: 'focal-point', focalPoint: point })}
                />
              )
              : (
                <>
                  <span className="field-label">Focal point</span>
                  <button
                    className="button button--outline button--small"
                    type="button"
                    onClick={() => onApply({ kind: 'focal-point', focalPoint: { x: 0.5, y: 0.5 } })}
                  >
                    Recentre for {scope}
                  </button>
                  <p className="flowboard-hint">
                    The {label} disagree on the focal point, so only recentring is offered. Nudge one slide to align the
                    rest first.
                  </p>
                </>
              )}
          </div>
        )}

        {groups.includes('layers') && (
          <div className="flowboard-bulk__group" role="group" aria-label={`Layer visibility and opacity for ${scope}`}>
            <label className="field-label" htmlFor={`${idPrefix}-bulk-layer`}>Layer</label>
            <select
              id={`${idPrefix}-bulk-layer`}
              className="profile-select"
              value={layerId}
              aria-label={`Layer to show or hide for ${scope}`}
              onChange={(event) => setLayerId(event.target.value as LayerId)}
            >
              {slideLayerIds.map((id) => (
                <option key={id} value={id}>{slideLayerLabels[id]}</option>
              ))}
            </select>

            <span className="field-label" id={`${idPrefix}-bulk-visibility-label`}>Visibility</span>
            <div className="flowboard-bulk__segmented" role="group" aria-labelledby={`${idPrefix}-bulk-visibility-label`}>
              {([true, false] as const).map((visible) => {
                const active = sharedVisible === visible
                return (
                  <button
                    key={String(visible)}
                    className={`flowboard-bulk__option${active ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${visible ? 'Show' : 'Hide'} the ${layerLabel.toLowerCase()} layer for ${scope}`}
                    disabled={active}
                    onClick={() => onApply({ kind: 'layer-visibility', layerId, visible })}
                  >
                    {visible ? 'Show' : 'Hide'}
                  </button>
                )
              })}
            </div>

            <div className="layer-opacity-control">
              <div className="layer-opacity-control__label">
                <label className="field-label" htmlFor={`${idPrefix}-bulk-opacity`}>Opacity</label>
                <output htmlFor={`${idPrefix}-bulk-opacity`}>{opacityPercent}%</output>
              </div>
              <input
                id={`${idPrefix}-bulk-opacity`}
                className="layer-opacity-slider"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={opacityValue}
                aria-label={`${layerLabel} opacity for ${scope}`}
                aria-valuetext={`${opacityPercent} percent${sharedOpacity === null ? ', mixed across the selection' : ''}`}
                onChange={(event) => onApply({
                  kind: 'layer-opacity',
                  layerId,
                  opacity: Number(event.target.value),
                })}
              />
            </div>
            {missingLayerNote && <p className="flowboard-hint">Slides without this layer are left as they are.</p>}
          </div>
        )}
      </div>

      <p className="flowboard-bulk__status" role="status" aria-live="polite">
        {notice ?? `Pick a change above to apply it to all ${count} selected slides.`}
      </p>
    </section>
  )
}
