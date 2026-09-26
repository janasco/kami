import { exportProfiles } from '../../data'
import type { ExportPreflightResult } from '../../lib/exportPreflight'
import type { FlowboardExportGate } from '../../lib/flowboardExportState'
import type { ExportProfile, ExportProfileId, Slide } from '../../types'

interface ShipStageProps {
  projectName: string
  slides: Slide[]
  selectedSlide: Slide
  profile: ExportProfile
  onProfileChange: (profileId: ExportProfileId) => void
  preflight: ExportPreflightResult
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

const issueSlideLabel = (slideNumbers: number[]) => {
  if (slideNumbers.length === 0) return 'Project'
  if (slideNumbers.length === 1) return `Slide ${slideNumbers[0]}`
  return `Slides ${slideNumbers.join(', ')}`
}

/**
 * Stage 5. A review surface rather than a toolbar: the preflight result, the
 * store profile, the deck facts the author should confirm, and the export.
 */
export function ShipStage({
  projectName,
  slides,
  selectedSlide,
  profile,
  onProfileChange,
  preflight,
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
                <li key={`${issue.code}-${issue.layerId ?? 'project'}-${index}`} className={issue.severity === 'blocking' ? 'is-blocking' : 'is-warning'}>
                  <span>{issue.message}</span>
                  <small>{issueSlideLabel(issue.slideNumbers)}</small>
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
              {exportGate.blocked
                ? exportGate.message
                : exportGate.exporting
                  ? exportGate.message
                  : exportDetail || `Exports ${slides.length} PNG${slides.length === 1 ? '' : 's'} for “${projectName.trim() || 'Untitled project'}”.`}
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
