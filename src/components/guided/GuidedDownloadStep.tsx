import { exportProfiles } from '../../data'
import { filenamePart } from '../../lib/exportSlides'
import type { FlowboardExportGate } from '../../lib/flowboardExportState'
import type { ExportPreflightResult } from '../../lib/exportPreflight'
import type { ExportProfile, ExportProfileId, Slide } from '../../types'

interface GuidedDownloadStepProps {
  projectName: string
  slides: Slide[]
  selectedSlide: Slide
  captureCount: number
  profile: ExportProfile
  onProfileChange: (profileId: ExportProfileId) => void
  preflight: ExportPreflightResult
  exportGate: FlowboardExportGate
  exportDetail: string
  onSaveProject: () => void
  /** Opens the advanced Ship stage, where every check is listed. */
  onShowChecks: () => void
}

/**
 * Guided step 4, in plain language: check the deck, then download.
 *
 * The step itself is the summary, the size choice, and an honest explanation
 * of anything standing in the way. The download button lives in the sticky
 * footer so the step keeps exactly one primary action, and it reads the same
 * export gate the Full Editor uses, so the two surfaces cannot disagree.
 */
export function GuidedDownloadStep({
  projectName,
  slides,
  selectedSlide,
  captureCount,
  profile,
  onProfileChange,
  preflight,
  exportGate,
  exportDetail,
  onSaveProject,
  onShowChecks,
}: GuidedDownloadStepProps) {
  const title = projectName.trim() || 'Untitled screenshot project'
  const selectedNumber = slides.findIndex((slide) => slide.id === selectedSlide.id) + 1
  const blockingIssues = preflight.blockingIssues

  return (
    <section className="guided-card" aria-labelledby="guided-download-title">
      <div className="guided-card__heading">
        <h2 id="guided-download-title">{title}</h2>
        <p>
          {slides.length} {slides.length === 1 ? 'slide' : 'slides'} · {captureCount}{' '}
          {captureCount === 1 ? 'screenshot' : 'screenshots'} · {profile.name}
        </p>
      </div>

      <label className="field-label" htmlFor="guided-export-profile">Image size</label>
      <select
        id="guided-export-profile"
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
      <p className="guided-hint">
        {profile.width} × {profile.height} px PNG files, delivered as one ZIP called {filenamePart(title)}.zip.
      </p>

      {/*
        The blocked reason is rendered as text, not only as a tooltip on a
        disabled button, so the author can read why the download is not
        available and what to do about it.
      */}
      <div
        className={`guided-gate guided-gate--${exportGate.reason}`}
        role="status"
        aria-live="polite"
      >
        <p className="guided-gate__message">
          {exportGate.exporting || exportGate.blocked ? exportGate.message : (exportDetail || exportGate.message)}
        </p>
        {blockingIssues.length > 0 && (
          <ul className="guided-gate__issues" role="list">
            {blockingIssues.map((issue, index) => (
              <li key={`${issue.code}-${issue.layerId ?? 'project'}-${index}`}>
                <span>{issue.message}</span>
                <small>
                  {issue.slideNumbers.length === 0
                    ? 'The whole project'
                    : `Slide ${issue.slideNumbers.join(', ')}`}
                </small>
              </li>
            ))}
          </ul>
        )}
        {(exportGate.blocked || preflight.warningIssues.length > 0) && (
          <button className="text-button" type="button" onClick={onShowChecks}>
            Show me the checks
          </button>
        )}
      </div>

      <p className="guided-hint">
        On the last slide you are editing ({selectedNumber} of {slides.length}).{' '}
        <button className="text-button" type="button" onClick={onSaveProject}>
          Save the project file
        </button>{' '}
        if you want to keep the deck in Git.
      </p>
    </section>
  )
}
