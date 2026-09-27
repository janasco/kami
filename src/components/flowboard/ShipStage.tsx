import { deviceFramePresets, exportProfiles, screenshotFitOptions } from '../../data'
import { describeDeviceVariant, expandVariantRenders, findDeviceOverride } from '../../lib/deviceVariants'
import { formatPreflightIssueLocation, type ExportPreflightResult } from '../../lib/exportPreflight'
import { exportEntryName, type ExportEntry, type ExportPlan } from '../../lib/exportPlan'
import { variantExportRefusal } from '../../lib/exportPlan'
import type { FlowboardExportGate } from '../../lib/flowboardExportState'
import type { DeviceFrameId, ExportProfile, ExportProfileId, OutputVariant, ScreenshotFit, Slide } from '../../types'

export interface ShipStageProps {
  projectName: string
  slides: Slide[]
  selectedSlide: Slide
  profile: ExportProfile
  onProfileChange: (profileId: ExportProfileId) => void
  preflight: ExportPreflightResult
  variants: OutputVariant[]
  activeVariantId: string
  onVariantPreviewChange: (variantId: string) => void
  onVariantProfileChange: (variantId: string, profileId: ExportProfileId) => void
  onVariantToggleEnabled: (variantId: string) => void
  onVariantRename: (variantId: string, name: string) => void
  onVariantAdd: () => void
  onVariantRemove: (variantId: string) => void
  onVariantOverrideChange: (
    variantId: string,
    slideId: string,
    field: 'deviceFrameId' | 'showDeviceStatusBar' | 'screenshotFit',
    value: DeviceFrameId | boolean | ScreenshotFit | undefined,
  ) => void
  /**
   * Opens the picker for one slide of one variant. Reading the file and storing
   * it is the App's job, so this stage never handles a File itself.
   */
  onVariantCaptureChange: (variantId: string, slideId: string) => void
  exportEntries: ExportEntry[]
  exportBlockedVariant: ExportPlan['blocked']
  /**
   * The shared export gate. The top bar reads the same value, so the two Export
   * controls can never enable or block independently.
   */
  exportGate: FlowboardExportGate
  exportDetail: string
  onExport: () => void
  onSaveProject: () => void
  onOpenProject: () => void
  onGoToSlide: (slideId: string) => void
}

const preflightStatusLabel = {
  ready: 'Ready to export',
  warnings: 'Exports with warnings',
  blocked: 'Blocked',
} as const

/** Device presets that make sense for a second device set, in catalog order. */
const variantDeviceOptions = deviceFramePresets.filter((preset) => preset.id !== 'none')

/**
 * Stage 5. A review surface rather than a toolbar: the preflight result, the
 * device variants and what each will write, the store profile, the deck facts
 * the author should confirm, and the export.
 */
export function ShipStage({
  projectName,
  slides,
  selectedSlide,
  profile,
  onProfileChange,
  preflight,
  variants,
  activeVariantId,
  onVariantPreviewChange,
  onVariantProfileChange,
  onVariantToggleEnabled,
  onVariantRename,
  onVariantAdd,
  onVariantRemove,
  onVariantOverrideChange,
  onVariantCaptureChange,
  exportEntries,
  exportBlockedVariant,
  exportGate,
  exportDetail,
  onExport,
  onSaveProject,
  onOpenProject,
  onGoToSlide,
}: ShipStageProps) {
  const captureCount = slides.filter((slide) => slide.screenshot).length
  const iconCount = slides.filter((slide) => slide.appIcon && slide.layerSettings['app-icon'].visible).length
  const selectedNumber = slides.findIndex((slide) => slide.id === selectedSlide.id) + 1
  const activeVariant = variants.find((variant) => variant.id === activeVariantId) ?? variants[0]
  const enabledCount = variants.filter((variant) => variant.enabled).length

  return (
    <div className="flowboard-stage-body flowboard-ship">
      <section className="flowboard-panel flowboard-panel--wide" aria-labelledby="ship-review-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Review</span>
          <h3 id="ship-review-title">{preflightStatusLabel[preflight.status]}</h3>
          <p className="flowboard-hint">
            {preflight.checkedSlides} slide{preflight.checkedSlides === 1 ? '' : 's'} checked against {profile.name}.
          </p>
        </div>

        <ol className="flowboard-review" role="list">
          <li className={preflight.blockingIssues.length === 0 ? 'is-done' : 'is-blocked'}>
            <span className="flowboard-review__mark" aria-hidden="true">{preflight.blockingIssues.length === 0 ? '✓' : '!'}</span>
            <div className="flowboard-review__copy">
              <strong>Blocking checks</strong>
              <small>
                {preflight.blockingIssues.length === 0
                  ? 'Nothing blocks the export.'
                  : `${preflight.blockingIssues.length} blocking check${preflight.blockingIssues.length === 1 ? '' : 's'} to resolve.`}
              </small>
            </div>
          </li>
          <li className={preflight.warningIssues.length === 0 ? 'is-done' : 'is-warn'}>
            <span className="flowboard-review__mark" aria-hidden="true">{preflight.warningIssues.length === 0 ? '✓' : '·'}</span>
            <div className="flowboard-review__copy">
              <strong>Warnings</strong>
              <small>
                {preflight.warningIssues.length === 0
                  ? 'No warnings for this profile.'
                  : `${preflight.warningIssues.length} warning${preflight.warningIssues.length === 1 ? '' : 's'} do not block the export.`}
              </small>
            </div>
          </li>
          <li className={captureCount === slides.length ? 'is-done' : 'is-warn'}>
            <span className="flowboard-review__mark" aria-hidden="true">{captureCount === slides.length ? '✓' : '·'}</span>
            <div className="flowboard-review__copy">
              <strong>Captures</strong>
              <small>{captureCount} of {slides.length} slides have a capture · {iconCount} show an app icon</small>
            </div>
          </li>
          <li className={exportBlockedVariant ? 'is-blocked' : 'is-done'}>
            <span className="flowboard-review__mark" aria-hidden="true">{exportBlockedVariant ? '!' : '✓'}</span>
            <div className="flowboard-review__copy">
              <strong>Device variants</strong>
              <small>
                {variants.length === 1
                  ? 'One device set. Add a variant to export a second device from the same deck.'
                  : `${enabledCount} of ${variants.length} variant${variants.length === 1 ? '' : 's'} enabled · ${exportEntries.length} PNG${exportEntries.length === 1 ? '' : 's'} planned.`}
              </small>
            </div>
          </li>
          <li className="is-done">
            <span className="flowboard-review__mark" aria-hidden="true">✓</span>
            <div className="flowboard-review__copy">
              <strong>Project artifact</strong>
              <small>Save the JSON file to keep this deck in Git alongside the exported PNGs.</small>
            </div>
            <button className="button button--outline button--small" type="button" onClick={onSaveProject}>
              <span aria-hidden="true">↓</span> Save project JSON
            </button>
          </li>
        </ol>

        {preflight.issues.length > 0 && (
          <ul className="preflight-issues flowboard-ship-issues" aria-live="polite">
            {preflight.issues.map((issue, index) => {
              const targetId = issue.slideNumbers
                .map((slideNumber) => slides[slideNumber - 1]?.id)
                .find((id): id is string => Boolean(id))
              return (
                <li key={`${issue.code}-${issue.layerId ?? 'project'}-${issue.variantId ?? 'deck'}-${index}`} className={issue.severity === 'blocking' ? 'is-blocking' : 'is-warning'}>
                  <span>{issue.message}</span>
                  {/* The deck position and the variant, from one shared label. */}
                  <small>{formatPreflightIssueLocation(issue)}</small>
                  {targetId && (
                    <button className="text-button text-button--compact" type="button" onClick={() => onGoToSlide(targetId)}>
                      Open slide
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/*
        Device variants.

        A flat list of rows in the panel's own record idiom, not a grid of cards:
        the author is comparing a few short facts per variant, and a card per
        variant would nest a container inside the panel for no gain. Every control
        is a real form element, so the whole list is reachable and operable from
        the keyboard and announced properly.
      */}
      <section className="flowboard-panel flowboard-panel--wide" aria-labelledby="ship-variants-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Devices</span>
          <h3 id="ship-variants-title">Export variants</h3>
          <p className="flowboard-hint">
            One device set per variant. A slide with no override uses the deck’s own device, fit, and capture.
          </p>
        </div>

        <ul className="ship-variants" role="list">
          {variants.map((variant) => {
            const renders = expandVariantRenders(slides, variant)
            const missing = renders.filter((render) => render.missingCapture).length
            const isBlocked = exportBlockedVariant?.variantId === variant.id
            const isActive = activeVariant?.id === variant.id
            const profileName = exportProfiles.find((entry) => entry.id === variant.exportProfileId)?.name ?? variant.exportProfileId
            return (
              <li
                key={variant.id}
                className={`ship-variant${isActive ? ' is-active' : ''}${variant.enabled ? '' : ' is-off'}`}
              >
                <div className="ship-variant__row">
                  <label className="ship-variant__name">
                    <span className="visually-hidden">Variant name</span>
                    <input
                      className="ship-variant__input"
                      type="text"
                      value={variant.name}
                      maxLength={40}
                      onChange={(event) => onVariantRename(variant.id, event.target.value)}
                      onBlur={(event) => {
                        if (event.target.value.trim().length === 0) onVariantRename(variant.id, variant.name)
                      }}
                    />
                  </label>
                  <span className="ship-variant__summary">
                    {describeDeviceVariant(variant, renders.length)}
                  </span>
                  <button
                    className="button button--outline button--small"
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onVariantPreviewChange(variant.id)}
                    disabled={variants.length < 2}
                  >
                    {isActive ? 'Previewing' : 'Preview'}
                  </button>
                  <button
                    className="button button--quiet button--small"
                    type="button"
                    aria-pressed={variant.enabled}
                    onClick={() => onVariantToggleEnabled(variant.id)}
                  >
                    {variant.enabled ? 'On' : 'Off'}
                  </button>
                  <button
                    className="text-button text-button--compact"
                    type="button"
                    onClick={() => onVariantRemove(variant.id)}
                    disabled={variants.length < 2}
                  >
                    Remove
                  </button>
                </div>

                {isActive && (
                  <div className="ship-variant__detail">
                    <div className="flowboard-export-grid__form">
                      <label className="field-label" htmlFor={`variant-profile-${variant.id}`}>Store target</label>
                      <select
                        id={`variant-profile-${variant.id}`}
                        className="profile-select"
                        value={variant.exportProfileId}
                        onChange={(event) => onVariantProfileChange(variant.id, event.target.value as ExportProfileId)}
                      >
                        {exportProfiles.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} · {option.width} × {option.height} px
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="ship-variant__slides">
                      {renders.map((render) => {
                        const override = findDeviceOverride(variant, render.slide.id)
                        const frameId = (override?.deviceFrameId ?? render.sourceSlide.deviceFrameId) as DeviceFrameId
                        const fit = (override?.screenshotFit ?? render.sourceSlide.screenshotFit) as ScreenshotFit
                        const hasOwnCapture = Boolean(override?.screenshot?.dataUrl)
                        return (
                          <div className="ship-variant__slide" key={`${variant.id}-${render.slide.id}`}>
                            <span className="ship-variant__slide-name">
                              Slide {render.slideNumber}
                              {override ? '' : ' · deck device'}
                            </span>
                            <label className="visually-hidden" htmlFor={`variant-device-${variant.id}-${render.slide.id}`}>
                              Device for slide {render.slideNumber} of {variant.name}
                            </label>
                            <select
                              id={`variant-device-${variant.id}-${render.slide.id}`}
                              className="profile-select profile-select--compact"
                              value={frameId}
                              onChange={(event) => onVariantOverrideChange(variant.id, render.slide.id, 'deviceFrameId', event.target.value as DeviceFrameId)}
                            >
                              {variantDeviceOptions.map((preset) => (
                                <option key={preset.id} value={preset.id}>{preset.name}</option>
                              ))}
                            </select>
                            <label className="visually-hidden" htmlFor={`variant-fit-${variant.id}-${render.slide.id}`}>
                              Capture fit for slide {render.slideNumber} of {variant.name}
                            </label>
                            <select
                              id={`variant-fit-${variant.id}-${render.slide.id}`}
                              className="profile-select profile-select--compact"
                              value={fit}
                              onChange={(event) => onVariantOverrideChange(variant.id, render.slide.id, 'screenshotFit', event.target.value as ScreenshotFit)}
                            >
                              {screenshotFitOptions.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                            {override ? (
                              <button
                                className="text-button text-button--compact"
                                type="button"
                                onClick={() => onVariantOverrideChange(variant.id, render.slide.id, 'deviceFrameId', undefined)}
                              >
                                Use deck device
                              </button>
                            ) : (
                              <span className="ship-variant__slide-state">
                                {hasOwnCapture ? 'Own capture' : render.missingCapture ? 'No capture' : 'Deck capture'}
                              </span>
                            )}
                            <button
                              className="button button--quiet button--small"
                              type="button"
                              onClick={() => onVariantCaptureChange(variant.id, render.slide.id)}
                            >
                              {hasOwnCapture ? 'Replace capture' : 'Set capture'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    <p className="flowboard-hint">
                      {activeVariant.exportProfileId === profile.id
                        ? `Previewing the device set this profile exports. ${profileName} is the store target.`
                        : `This variant targets ${profileName}, so switching the store target below changes what it exports.`}
                      {missing > 0 ? ` ${missing} of ${renders.length} slides have no capture for this device.` : ''}
                    </p>
                  </div>
                )}

                {isBlocked && exportBlockedVariant && (
                  <p className="ship-variant__blocked" role="status">
                    {variantExportRefusal(exportBlockedVariant)}
                  </p>
                )}
                {!variant.enabled && (
                  <p className="ship-variant__off">This variant is off, so it is not exported.</p>
                )}
              </li>
            )
          })}
        </ul>

        <div className="flowboard-starter-actions">
          <button className="button button--quiet" type="button" onClick={onVariantAdd}>
            <span aria-hidden="true">＋</span> Add device variant
          </button>
        </div>

        {exportEntries.length > 0 && (
          <div className="ship-variant__bundle">
            <h4 className="ship-variant__bundle-title">In the ZIP</h4>
            <ul className="ship-variant__files" role="list">
              {exportEntries.map((entry) => (
                <li key={`${entry.variantId}-${entry.slideId}`}>
                  <code>{exportEntryName(profile.id, entry.variantName, entry.slideNumber)}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flowboard-panel flowboard-panel--wide" aria-labelledby="ship-profile-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Output</span>
          <h3 id="ship-profile-title">Export profile</h3>
        </div>
        <div className="flowboard-export-grid">
          <div className="flowboard-export-grid__form">
            <label className="field-label" htmlFor="flowboard-export-profile">Store target</label>
            <select
              id="flowboard-export-profile"
              className="profile-select"
              value={profile.id}
              disabled={!exportGate.enabled}
              onChange={(event) => onProfileChange(event.target.value as ExportProfileId)}
            >
              {exportProfiles.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} · {option.width} × {option.height} px
                </option>
              ))}
            </select>

            <button
              className="button button--primary flowboard-wide-action"
              type="button"
              onClick={onExport}
              disabled={!exportGate.enabled}
              aria-busy={exportGate.exporting}
              aria-describedby="ship-export-gate"
            >
              {exportGate.label} <span aria-hidden="true">→</span>
            </button>
            <p className="flowboard-hint" id="ship-export-gate" role="status" aria-live="polite">
              {exportGate.blocked || exportBlockedVariant
                ? exportBlockedVariant ? variantExportRefusal(exportBlockedVariant) : exportGate.message
                : exportGate.exporting
                  ? exportGate.message
                  : exportDetail || `Exports ${exportEntries.length} PNG${exportEntries.length === 1 ? '' : 's'} for “${projectName.trim() || 'Untitled project'}”.`}
            </p>
          </div>
          <div className="flowboard-record">
            <div className="flowboard-record__row">
              <span>Dimensions</span>
              <strong>{profile.width} × {profile.height} px</strong>
            </div>
            <div className="flowboard-record__row">
              <span>Orientation</span>
              <strong>{profile.orientation[0].toUpperCase() + profile.orientation.slice(1)}</strong>
            </div>
            <div className="flowboard-record__row">
              <span>Device class</span>
              <strong>{profile.deviceClass[0].toUpperCase() + profile.deviceClass.slice(1)}</strong>
            </div>
            <div className="flowboard-record__row">
              <span>Format</span>
              <strong>{profile.format.toUpperCase()} in one ZIP</strong>
            </div>
            <div className="flowboard-record__row">
              <span>Files</span>
              <strong>{exportEntries.length} PNG{exportEntries.length === 1 ? '' : 's'}</strong>
            </div>
            <div className="flowboard-record__row">
              <span>Safe area</span>
              <strong className="property-good">On</strong>
            </div>
            <div className="flowboard-record__row">
              <span>Editing slide</span>
              <strong>{selectedNumber} of {slides.length}</strong>
            </div>
          </div>
        </div>
        <div className="flowboard-starter-actions">
          <button className="button button--quiet" type="button" onClick={onSaveProject}>
            <span aria-hidden="true">↓</span> Save project JSON
          </button>
          <button className="button button--quiet" type="button" onClick={onOpenProject}>
            <span aria-hidden="true">↥</span> Open another project
          </button>
        </div>
      </section>
    </div>
  )
}
