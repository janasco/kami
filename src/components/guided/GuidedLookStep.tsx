import { screenshotFitOptions } from '../../data'
import { getFeaturedDeviceFramePresets, isFramelessDeviceId } from '../../lib/devicePresets'
import { sharedValue, type BulkSlideAction } from '../../lib/flowboardBulkEdit'
import type { DeviceFrameId, ScreenshotFit, Slide } from '../../types'
import { DeviceFramePicker } from '../DeviceFramePicker'

interface GuidedLookStepProps {
  slides: Slide[]
  /** Notice from the last change, phrased with the number of real changes. */
  notice: string | null
  /**
   * Applies one change to the whole deck in a single history entry, so undo
   * behaves exactly like a single-slide edit and nothing else is touched.
   */
  onApplyToAllSlides: (action: BulkSlideAction) => void
}

/**
 * Guided step 2, in plain language: a phone style and a fit for the whole set.
 *
 * Both choices are offered once for the whole deck, because a first-time
 * author wants one consistent look rather than a per-slide control set. Each
 * button reuses an existing bulk action, and the per-slide framing controls
 * stay one disclosure away in the More options panel.
 */
export function GuidedLookStep({ slides, notice, onApplyToAllSlides }: GuidedLookStepProps) {
  const deviceFrameId = sharedValue(slides, (slide) => slide.deviceFrameId)
  const screenshotFit = sharedValue(slides, (slide) => slide.screenshotFit)
  const statusBar = sharedValue(slides, (slide) => slide.showDeviceStatusBar)
  // A mixed deck is not frameless: the toggle stays available so the author can
  // settle the deck either way.
  const frameless = isFramelessDeviceId(deviceFrameId)
  const mixedStyle = deviceFrameId === null
  const slideWord = slides.length === 1 ? 'slide' : 'slides'

  return (
    <section className="guided-card" aria-labelledby="guided-look-title">
      <div className="guided-card__heading">
        <h2 id="guided-look-title">Phone style</h2>
        <p>
          {mixedStyle
            ? `Your ${slideWord} do not all use the same style yet. Choose one for the whole set.`
            : `Your ${slideWord} all use the same style. You can change it later.`}
        </p>
      </div>

      {/*
        The shortlist is the whole set of decisions a first-time author needs.
        The rest of the catalog sits one disclosure away, so this step stays
        short without hiding a device.
      */}
      <div className="guided-choices" role="group" aria-label="Phone style">
        {getFeaturedDeviceFramePresets().map((preset) => {
          const active = deviceFrameId === preset.id
          return (
            <button
              key={preset.id}
              className={`guided-choice${active ? ' is-active' : ''}`}
              type="button"
              aria-pressed={active}
              onClick={() => onApplyToAllSlides({ kind: 'device-frame', deviceFrameId: preset.id as DeviceFrameId })}
            >
              <strong>{preset.name === 'No frame' ? 'No phone frame' : `${preset.name} frame`}</strong>
              <span>{preset.description}</span>
            </button>
          )
        })}
      </div>

      <details className="guided-disclosure">
        <summary className="text-button text-button--compact">More device styles</summary>
        <DeviceFramePicker
          compact
          idPrefix="guided-device"
          label="All device frames"
          value={deviceFrameId ?? 'iphone'}
          onChange={(id) => onApplyToAllSlides({ kind: 'device-frame', deviceFrameId: id })}
        />
      </details>

      <div className="guided-card__heading">
        <h2 id="guided-look-fit-title">How the screenshot sits in the frame</h2>
      </div>
      <div className="guided-choices" role="group" aria-labelledby="guided-look-fit-title">
        {screenshotFitOptions.map((option) => {
          const active = screenshotFit === option.id
          const plain = option.id === 'contain' ? 'Show the whole screenshot' : 'Fill the frame'
          return (
            <button
              key={option.id}
              className={`guided-choice${active ? ' is-active' : ''}`}
              type="button"
              aria-pressed={active}
              onClick={() => onApplyToAllSlides({ kind: 'screenshot-fit', screenshotFit: option.id as ScreenshotFit })}
            >
              <strong>{plain}</strong>
              <span>{option.description}</span>
            </button>
          )
        })}
      </div>

      <label className="guided-toggle" htmlFor="guided-status-bar">
        <span>
          <strong>Show the phone status bar</strong>
          <small>The clock, signal, and battery along the top of the frame.</small>
        </span>
        <input
          id="guided-status-bar"
          type="checkbox"
          checked={statusBar === true}
          disabled={frameless}
          onChange={(event) => onApplyToAllSlides({ kind: 'device-status-bar', visible: event.target.checked })}
        />
      </label>

      {frameless ? (
        <p className="guided-hint">
          Without a phone frame there is nothing to draw a status bar on, so this choice is off.
        </p>
      ) : statusBar === null ? (
        <p className="guided-hint">
          Some of your slides show the status bar and some do not. Choose one to make them match.
        </p>
      ) : null}
      {notice && <p className="guided-notice" role="status" aria-live="polite">{notice}</p>}
    </section>
  )
}
