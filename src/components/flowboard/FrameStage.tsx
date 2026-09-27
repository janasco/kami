import { useState } from 'react'
import { deviceFramePresets, screenshotFitOptions } from '../../data'
import { isFramelessDeviceId } from '../../lib/devicePresets'
import { DEFAULT_DEVICE_STATUS_BAR_TIME } from '../../lib/deviceStatusBar'
import { describeScreenshotFit } from '../../lib/screenshotFit'
import { summarizeCapture } from '../../lib/flowboardStages'
import type { BulkActionGroup, BulkSlideAction } from '../../lib/flowboardBulkEdit'
import {
  describeSlideCardLabel,
  describeSlideCardState,
  type FlowboardSelection,
} from '../../lib/flowboardSelection'
import type { KamiCapturePayload } from '../../lib/screenshotDrop'
import type { DeviceFrameId, ExportProfile, ScreenshotFit, Slide } from '../../types'
import { BackgroundFillControls } from '../BackgroundFillControls'
import { BulkActionBar, SlideSelectionSummary, createCardSelectionHandlers } from './SlideSelection'
import { SlideDropTarget } from './SlideDropTarget'
import { SlideThumbnail } from './SlideThumbnail'

const idPrefix = 'flowboard-frame'

/** Bulk controls the Frame stage exposes: framing first, then layer visibility. */
const bulkGroups: BulkActionGroup[] = ['framing', 'layers']

interface FrameStageProps {
  slides: Slide[]
  selectedSlide: Slide
  selectedIndex: number
  selection: FlowboardSelection
  onSelect: (id: string) => void
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onUpdate: (updates: Partial<Slide>, mergeKey?: string) => void
  onApplyBulkAction: (action: BulkSlideAction) => void
  bulkNotice: string | null
  onImport: (slideId?: string) => void
  profile: ExportProfile
  /**
   * Image files dropped on a capture card. Resolves to the notice for the drop,
   * so the stage can state the outcome next to the card that was dropped on.
   */
  onDropFiles: (slideId: string, files: File[]) => Promise<string>
  /** A capture dragged from another card onto this one. */
  onDropCapture: (slideId: string, capture: KamiCapturePayload) => string
}

/**
 * Stage 2. A contact sheet of the deck's captures with the device, fit, and
 * status-bar decision for each one, plus the existing controls for whichever
 * capture is selected.
 *
 * Two or more selected cards add a compact bulk bar, so a whole deck can be
 * framed in one pass without touching the single-capture controls.
 */
export function FrameStage({
  slides,
  selectedSlide,
  selectedIndex,
  selection,
  onSelect,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onUpdate,
  onApplyBulkAction,
  bulkNotice,
  onImport,
  profile,
  onDropFiles,
  onDropCapture,
}: FrameStageProps) {
  const [dropNotice, setDropNotice] = useState<string | null>(null)
  const capture = summarizeCapture(selectedSlide)
  const frameless = isFramelessDeviceId(selectedSlide.deviceFrameId)
  const captureRequired = profile.preflight?.requirements.screenshot !== false
  const missing = slides.filter((slide) => !slide.screenshot)
  const selectHintId = `${idPrefix}-select-hint`

  /**
   * A file drop and a card drag both land here, and both end in the one live
   * region under the sheet, so the outcome of a drop is stated once instead of
   * once per card.
   */
  const dropFilesOnSlide = (slideId: string, files: File[]) => {
    void onDropFiles(slideId, files).then(setDropNotice)
  }

  const dropCaptureOnSlide = (slideId: string, dropped: KamiCapturePayload) => {
    setDropNotice(onDropCapture(slideId, dropped))
  }

  return (
    <div className="flowboard-stage-body flowboard-frame">
      {selection.bulk && (
        <BulkActionBar
          slides={slides}
          selection={selection}
          groups={bulkGroups}
          idPrefix={idPrefix}
          onApply={onApplyBulkAction}
          onClear={onClearSelection}
          notice={bulkNotice}
        />
      )}

      <section className="flowboard-panel flowboard-panel--wide" aria-labelledby="frame-sheet-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Contact sheet</span>
          <h3 id="frame-sheet-title">Every capture, side by side</h3>
          <p className="flowboard-hint">
            {missing.length > 0
              ? `${missing.length} slide${missing.length === 1 ? '' : 's'} still ${missing.length === 1 ? 'has' : 'have'} no capture${captureRequired ? ' and this profile requires one' : ' (optional on this profile)'}.`
              : 'Every slide has a capture. Select a card to change its framing.'}
          </p>
        </div>

        <SlideSelectionSummary
          selection={selection}
          slideCount={slides.length}
          idPrefix={idPrefix}
          onSelectAll={onSelectAll}
          onClear={onClearSelection}
        />

        <p className="flowboard-hint flowboard-drop-note" role="status" aria-live="polite">
          {dropNotice ?? 'Drop images on a card to replace that capture, or drop several to fill the deck in order. Drag a card onto another one to copy its capture.'}
        </p>

        <ul className="flowboard-contact-sheet" role="list" aria-describedby={selectHintId}>
          {slides.map((slide, index) => {
            const summary = summarizeCapture(slide)
            // The edited slide and the bulk selection are two separate states, so
            // a range selection reads as a range instead of a tint over one card.
            const card = describeSlideCardState(
              index + 1,
              slide.id === selectedSlide.id,
              selection.selectedIds.includes(slide.id),
            )
            const handlers = createCardSelectionHandlers(slide.id, onSelect, onToggleSelect)
            return (
              <li key={slide.id} className={card.className} data-selection-state={card.state}>
                <SlideDropTarget
                  slide={slide}
                  hint={slide.screenshot ? 'Drop to replace' : 'Drop to add'}
                  onDropFiles={dropFilesOnSlide}
                  onDropCapture={dropCaptureOnSlide}
                >
                  <button
                    className={`flowboard-capture-card${card.className ? ` ${card.className}` : ''}${slide.screenshot ? '' : ' is-empty'}`}
                    type="button"
                    data-selected={card.dataSelected}
                    data-selection-state={card.state}
                    onClick={handlers.onClick}
                    onContextMenu={handlers.onContextMenu}
                    aria-pressed={card.selected}
                    aria-current={card.editing ? 'true' : undefined}
                    aria-describedby={selectHintId}
                    aria-label={describeSlideCardLabel(
                      index + 1,
                      `${slide.screenshotName ?? 'No capture'}. ${summary.deviceName}, ${summary.fitLabel} fit, ${summary.statusBarLabel}, ${summary.fillLabel} background.`,
                      card,
                    )}
                  >
                    <span className="flowboard-card__mark" aria-hidden="true">{card.mark}</span>
                    <SlideThumbnail slide={slide} index={index} variant="capture" />
                    <span className="flowboard-capture-card__index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="flowboard-capture-card__meta">
                      <span className={`flowboard-card__badge${card.editing ? '' : ' is-selected'}`}>{card.badge}</span>
                      <strong>{slide.screenshotName ?? 'No capture yet'}</strong>
                      <span>{summary.deviceName}</span>
                      <span>{summary.fitLabel} fit</span>
                      <span className={summary.statusBarLabel === 'Status bar on' ? 'is-good' : 'is-muted'}>{summary.statusBarLabel}</span>
                      <span className={summary.fillLabel === 'Theme' ? 'is-muted' : ''}>{summary.fillLabel} background</span>
                    </span>
                  </button>
                </SlideDropTarget>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="flowboard-panel flowboard-panel--wide" aria-labelledby="frame-controls-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Selected capture</span>
          <h3 id="frame-controls-title">Editing slide {selectedIndex + 1} of {slides.length}</h3>
          <p className="flowboard-hint">
            {selection.bulk
              ? `These controls change slide ${selectedIndex + 1} only, the slide marked Editing above. Use the bulk bar for the other selected slides.`
              : 'Select a card to change its framing, or add a second card for bulk framing actions.'}
          </p>
        </div>

        <div className="flowboard-field-grid">
          <div className="flowboard-field">
            <span className="field-label">Device frame</span>
            <select
              className="profile-select"
              value={selectedSlide.deviceFrameId}
              aria-label="Device frame for the selected capture"
              onChange={(event) => onUpdate({ deviceFrameId: event.target.value as DeviceFrameId })}
            >
              {deviceFramePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} · {preset.description}
                </option>
              ))}
            </select>
          </div>

          <div className="flowboard-field flowboard-field--wide">
            <span className="field-label" id="flowboard-fit-label">Screenshot fit</span>
            <div className="screenshot-fit-options" role="group" aria-labelledby="flowboard-fit-label">
              {screenshotFitOptions.map((option) => {
                const active = selectedSlide.screenshotFit === option.id
                return (
                  <button
                    key={option.id}
                    className={`screenshot-fit-option${active ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onUpdate(
                      { screenshotFit: option.id as ScreenshotFit },
                      `screenshot-fit:${selectedSlide.id}:${option.id}`,
                    )}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                )
              })}
            </div>
            <p className="flowboard-hint">
              {selectedSlide.screenshot
                ? `${selectedSlide.screenshotName ?? 'The capture'} is shown with ${describeScreenshotFit(selectedSlide.screenshotFit).toLowerCase()}.`
                : 'Contain keeps the whole capture visible. Cover fills the frame and crops the edges.'}
            </p>
          </div>

          <div className="flowboard-field">
            <span className="field-label">Device status bar</span>
            <label className="layer-visibility-toggle" htmlFor="flowboard-device-status-bar">
              <span>{capture.statusBarLabel}</span>
              <input
                id="flowboard-device-status-bar"
                type="checkbox"
                checked={selectedSlide.showDeviceStatusBar}
                disabled={frameless}
                aria-label="Show device status bar on the selected capture"
                onChange={(event) => onUpdate(
                  { showDeviceStatusBar: event.target.checked },
                  `device-status-bar:${selectedSlide.id}:toggle`,
                )}
              />
              <span className="switch" aria-hidden="true" />
            </label>
            <p className="flowboard-hint">
              {frameless
                ? 'Frameless presets export the capture on its own, so no status chrome is drawn.'
                : `A fixed ${DEFAULT_DEVICE_STATUS_BAR_TIME} clock with signal, Wi-Fi, and battery keeps every export reproducible.`}
            </p>
          </div>

          <div className="flowboard-field flowboard-field--wide">
            <span className="field-label">Capture file</span>
            <div className="image-field">
              <div>
                <span className="image-field__name">{selectedSlide.screenshotName ?? 'No image selected'}</span>
              </div>
              <button className="button button--outline button--small" type="button" onClick={() => onImport(selectedSlide.id)}>
                {selectedSlide.screenshot ? 'Replace' : 'Import'}
              </button>
            </div>
          </div>

          <div className="flowboard-field flowboard-field--wide">
            <BackgroundFillControls
              slide={selectedSlide}
              idPrefix="flowboard-frame-background"
              onUpdate={onUpdate}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
