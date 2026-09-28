import { useMemo } from 'react'
import { deviceFramePresets, exportProfiles, localeOptions, screenshotFitOptions } from '../../data'
import { describeDeviceVariant, expandVariantRenders, findDeviceOverride } from '../../lib/deviceVariants'
import { formatPreflightIssueLocation, type ExportPreflightResult } from '../../lib/exportPreflight'
import { type ExportEntry, type ExportPlan, type ExportPlanFiles } from '../../lib/exportPlan'
import { unassignedExportRefusal, variantExportRefusal } from '../../lib/exportPlan'
import { buildExportManifest, type ExportManifest } from '../../lib/exportManifest'
import { buildStorePreview, type StorePreview as StorePreviewModel } from '../../lib/storePreview'
import type { FlowboardExportGate } from '../../lib/flowboardExportState'
import { StorePreview } from '../StorePreview'
import type { DeviceFrameId, ExportProfile, ExportProfileId, LocaleId, OutputVariant, ScreenshotFit, Slide } from '../../types'

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
  /**
   * Set the language a variant is drawn in.
   *
   * This is the control that makes a multi-language set authorable at all. Until
   * it existed, a new variant inherited the deck's active locale and nothing could
   * change it afterwards, so a deck could only ever be exported in one language —
   * the field was in the document and unreachable from the editor.
   */
  onVariantLocaleChange: (variantId: string, locale: LocaleId) => void
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
   * Why the plan has no files in it, when it has none.
   *
   * Distinct from `exportBlockedVariant` because there is no variant to point at:
   * the plan is empty, so nothing is named. The sentence still names the store
   * target, which is the control the author has to change. Optional, so a caller
   * that knows nothing about the plan renders the stage it had.
   */
  exportUnassigned?: ExportPlan['unassigned']
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
  /**
   * Sends the Refine canvas to one variant's merged preview, at one deck slide.
   * The one way into that surface from here: the per-variant "Show on canvas"
   * control and every manifest row call this and nothing else, so a row can never
   * land the author somewhere the variant list would not have. Optional, because
   * a caller with nowhere to send the author simply has no such button.
   */
  onOpenVariantPreview?: (variantId: string, slideId: string) => void
  /** The editor's active locale, for the headline the store preview reports on. */
  activeLocale?: LocaleId
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
 * device variants and what each will write, the store listing as a reader would
 * meet it, the manifest of every file the export writes, the store profile, the
 * deck facts the author should confirm, and the export.
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
  onVariantLocaleChange,
  onVariantToggleEnabled,
  onVariantRename,
  onVariantAdd,
  onVariantRemove,
  onVariantOverrideChange,
  onVariantCaptureChange,
  exportEntries,
  exportBlockedVariant,
  exportUnassigned = null,
  exportGate,
  exportDetail,
  onExport,
  onSaveProject,
  onOpenProject,
  onGoToSlide,
  onOpenVariantPreview,
  activeLocale = 'en-US',
}: ShipStageProps) {
  const captureCount = slides.filter((slide) => slide.screenshot).length
  const iconCount = slides.filter((slide) => slide.appIcon && slide.layerSettings['app-icon'].visible).length
  const selectedNumber = slides.findIndex((slide) => slide.id === selectedSlide.id) + 1
  const activeVariant = variants.find((variant) => variant.id === activeVariantId) ?? variants[0]
  const enabledCount = variants.filter((variant) => variant.enabled).length

  /*
   * The manifest and the store preview are both derived from the plan, in a
   * `useMemo` because the Ship stage re-renders on every keystroke of the
   * variant name field and neither derivation depends on that. Nothing here is
   * stored: the manifest is a question asked of the plan, and a plan saved
   * yesterday cannot disagree with the export running today.
   */
  const plan: ExportPlanFiles = useMemo(
    () => ({ entries: exportEntries, blocked: exportBlockedVariant }),
    [exportBlockedVariant, exportEntries],
  )
  const manifest: ExportManifest = useMemo(
    () => buildExportManifest({ plan, profile, variants, locale: activeLocale }),
    [activeLocale, plan, profile, variants],
  )
  const storePreview: StorePreviewModel = useMemo(
    () => buildStorePreview({ plan, profile, variants, locale: activeLocale, variantId: activeVariant?.id }),
    [activeLocale, activeVariant?.id, plan, profile, variants],
  )

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
          {/*
            Both refusals mark this row, and the plan's own is checked first
            because it is the more fundamental one: with no files planned, the
            count below would read "0 PNGs planned" as though zero were a normal
            outcome of a deck the author had just finished. There is no variant
            to mark here, so the sentence is the store target and what to do
            about it.
          */}
          <li className={exportBlockedVariant || exportUnassigned ? 'is-blocked' : 'is-done'}>
            <span className="flowboard-review__mark" aria-hidden="true">{exportBlockedVariant || exportUnassigned ? '!' : '✓'}</span>
            <div className="flowboard-review__copy">
              <strong>Device variants</strong>
              <small>
                {exportUnassigned
                  ? unassignedExportRefusal(exportUnassigned)
                  : variants.length === 1
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
                    <div className="flowboard-export-grid__form">
                      <label className="field-label" htmlFor={`variant-locale-${variant.id}`}>Language</label>
                      <select
                        id={`variant-locale-${variant.id}`}
                        className="profile-select"
                        value={variant.locale}
                        onChange={(event) => onVariantLocaleChange(variant.id, event.target.value as LocaleId)}
                      >
                        {localeOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                            {option.direction === 'rtl' ? ' · right to left' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="flowboard-hint">
                        The language every PNG in this variant is drawn in. It is what the
                        filename records and what the store listing shows.
                      </p>
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
                    {/*
                      Only offered when the shell can actually send the author
                      there. A permanently disabled button teaches an author that
                      the feature is broken, which is worse than its absence.
                    */}
                    {onOpenVariantPreview && (
                      <div className="ship-variant__actions">
                        <button
                          className="button button--quiet button--small"
                          type="button"
                          onClick={() => onOpenVariantPreview(variant.id, selectedSlide.id)}
                          disabled={!variant.slideIds.includes(selectedSlide.id)}
                          title={variant.slideIds.includes(selectedSlide.id)
                            ? 'Show this variant’s export for the selected slide on the Refine canvas'
                            : 'This variant does not render the selected slide, so there is nothing to show for it'}
                        >
                          <span aria-hidden="true">◱</span> Show on canvas
                        </button>
                      </div>
                    )}
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

        {/*
          The manifest. Every row is derived from the plan, so the file names here
          are the names the bundle will carry, the sizes are the sizes it will be
          written at, and the locale is the locale each PNG is drawn in. Derived
          rather than stored, so there is nothing to go stale and nothing to
          migrate.

          Every row is also a way to look at the file it names, because a table of
          fifty-seven rows with no link out of it is a table an author can only
          read. The control is a real `<button>` inside the row's own header cell —
          not a click handler on the `<tr>`, which a keyboard could never reach —
          and it calls the very same `onOpenVariantPreview` the variant list above
          uses, so there is one route into the merged preview and not two that can
          disagree about where they land.
        */}
        {manifest.entries.length > 0 && (
          <div className="ship-variant__bundle">
            <h4 className="ship-variant__bundle-title">In the ZIP</h4>
            <p className="flowboard-hint">
              {`${manifest.entries.length} file${manifest.entries.length === 1 ? '' : 's'} for ${manifest.profileName}, written at ${manifest.width} × ${manifest.height} px. Names and order below are the order the export writes them in.`}
            </p>
            <div className="ship-manifest">
              <table className="ship-manifest__table">
                <caption className="visually-hidden">
                  {`Export manifest: ${manifest.entries.length} files for ${manifest.profileName}`}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Variant</th>
                    <th scope="col">Deck slide</th>
                    <th scope="col">Size</th>
                    <th scope="col">Locale</th>
                  </tr>
                </thead>
                <tbody>
                  {manifest.entries.map((entry) => (
                    <tr key={`${entry.variantId}-${entry.slideId}`}>
                      <th scope="row">
                        <code>{entry.filename}</code>
                        {/*
                          The button carries the filename's row, so it lives in the
                          row's header cell: a sixth column would be a data cell
                          with no header of its own, and a handler on the `<tr>`
                          would be invisible to the keyboard. The name has to say
                          which variant and which slide, because "Preview" fifty-
                          seven times over is not a name.
                        */}
                        {onOpenVariantPreview && (
                          <button
                            className="button button--quiet button--small ship-manifest__preview"
                            type="button"
                            aria-label={`Preview ${entry.variantName}, deck slide ${entry.slideNumber}`}
                            title={`Show how ${entry.filename} will be drawn on the Refine canvas. Read-only: nothing is exported and the deck does not change.`}
                            onClick={() => onOpenVariantPreview(entry.variantId, entry.slideId)}
                          >
                            <span aria-hidden="true">◱</span> Preview
                          </button>
                        )}
                      </th>
                      <td>{entry.variantName}</td>
                      <td>{entry.slideNumber}</td>
                      <td>{entry.dimensions}</td>
                      <td>{entry.locale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/*
        The store listing. It describes the surface a reader meets the set on and
        reports what this set contains, and every sentence in it comes from the
        listing catalog in `data.ts`. It asserts nothing about what a store will
        accept, because nothing in this editor can find out.
      */}
      <section className="flowboard-panel flowboard-panel--wide" aria-labelledby="ship-store-title">
        <StorePreview preview={storePreview} slides={slides} />
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
