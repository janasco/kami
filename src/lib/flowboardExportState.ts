/**
 * The single source of truth for whether the deck can be exported.
 *
 * The Flowboard top bar and the Ship stage both expose an Export control, and
 * they used to derive their own disabled state from slightly different inputs:
 * the top bar only looked at the running export, while the Ship stage also
 * blocked on a preflight failure and on the transient `validation` status. That
 * let the two surfaces disagree, for example a blocked deck that still showed an
 * enabled Export in the top bar.
 *
 * `resolveFlowboardExportGate` folds the export status, the preflight result,
 * and the export plan's own refusal into one value that both surfaces render, so
 * the answer cannot drift. It is a pure function of state the editor already
 * holds: nothing here is serialized, and the project format, validation, and
 * export pipeline are untouched.
 *
 * The plan's refusal is the third input because preflight and the plan fail
 * independently and were previously both allowed to be silent. Preflight checks
 * the deck against the profile; the plan decides whether the profile has any
 * files to write. A deck whose variants all target the App Store, switched to
 * Google Play, passed every preflight check — there is nothing wrong with the
 * deck — and then planned zero files, because no variant targets the profile the
 * author selected. With only the preflight in the gate, that read as ready.
 */

import { unassignedExportRefusal, type ExportPlanUnassigned } from './exportPlan'
import type { ExportPreflightResult } from './exportPreflight'

/** Mirrors the `ExportStatus` type the toolbar and the App shell own. */
export type FlowboardExportStatus = 'idle' | 'exporting' | 'success' | 'error' | 'validation'

export interface FlowboardExportGateInput {
  exportStatus: FlowboardExportStatus
  preflight: Pick<ExportPreflightResult, 'status' | 'blockingIssues' | 'warningIssues' | 'issues'>
  /**
   * Why the plan has no files in it, when it has none.
   *
   * Optional and additive, like `ExportPreflightInput.variants`: a caller that
   * knows nothing about the plan gets exactly the gate it got before the field
   * existed. It is a refusal, so it blocks — an export button that offers to
   * write an empty ZIP and then reports success is the failure this field
   * exists to prevent, and no surface that renders the gate may enable the
   * control while it is set.
   */
  unassigned?: ExportPlanUnassigned | null
  /** Slides in the deck, for the button and progress copy. */
  slideCount: number
  /** Slides already written, while an export runs. */
  completed?: number
  /**
   * Total the running export was started with. Zero until the first export, so
   * the deck length is the fallback and the progress copy never reads 0/0.
   */
  total?: number
}

/** Why the export control is in its current state. */
export type FlowboardExportGateReason = 'ready' | 'warnings' | 'blocked' | 'unassigned' | 'exporting'

export interface FlowboardExportGate {
  /** The one value every Export control must read. */
  enabled: boolean
  reason: FlowboardExportGateReason
  /** True while an export is running, so progress copy stays honest. */
  exporting: boolean
  /**
   * True when something stops the export: a preflight blocking issue, or a plan
   * that has no files in it and has said why.
   */
  blocked: boolean
  /**
   * 1-based deck numbers of the first blocking issue, empty unless blocked.
   *
   * Empty for an `unassigned` gate, and empty on purpose: none of the four
   * reasons an empty plan is empty is about a particular slide, so there is no
   * slide for an "Open slide" affordance to point at.
   */
  slideNumbers: number[]
  /** Sentence shared by the top bar title and the Ship stage hint. */
  message: string
  /** Label for the primary Export control. */
  label: string
  /** Number of non-blocking preflight warnings, for the warning copy. */
  warningCount: number
}

/** `1, 2 and 3` style list, shared with the preflight issue rows. */
export const formatIssueSlideNumbers = (slideNumbers: readonly number[]): string => {
  if (slideNumbers.length === 0) return ''
  if (slideNumbers.length === 1) return `slide ${slideNumbers[0]}`
  return `slides ${slideNumbers.join(', ')}`
}

const plural = (count: number, singular: string) =>
  `${count} ${count === 1 ? singular : `${singular}s`}`

/**
 * Folds the running export status, the preflight result, and the plan's own
 * refusal into one gate.
 *
 * A blocking preflight issue always wins, because it is the state the author has
 * to fix first, and it keeps its slide numbers in the message. A plan with
 * nothing in it comes next, and it blocks for the same reason: an enabled Export
 * control that writes an empty ZIP and reports success loses the author's work
 * silently, which is worse than a refused export. A running export comes after
 * both, since a second run would overwrite the first. Warnings never block:
 * they are reported in the message and the export stays available.
 */
export const resolveFlowboardExportGate = ({
  exportStatus,
  preflight,
  unassigned = null,
  slideCount,
  completed = 0,
  total,
}: FlowboardExportGateInput): FlowboardExportGate => {
  const blocking = preflight.blockingIssues
  const warningCount = preflight.warningIssues.length

  // A blocked status is authoritative even in the unlikely case that its issue
  // list is empty, so the gate never reports "ready" for a blocked deck.
  if (preflight.status === 'blocked') {
    const first = blocking[0]
    const where = first ? formatIssueSlideNumbers(first.slideNumbers) : ''
    return {
      enabled: false,
      reason: 'blocked',
      exporting: exportStatus === 'exporting',
      blocked: true,
      slideNumbers: first ? [...first.slideNumbers] : [],
      message: first
        ? where
          ? `Export blocked on ${where}: ${first.message}`
          : `Export blocked: ${first.message}`
        : 'Export blocked: resolve the blocking checks before exporting.',
      label: 'Resolve blocking checks',
      warningCount,
    }
  }

  /*
   * A plan with nothing in it, and a stated reason why.
   *
   * This sits below the preflight block and above the running export, which is
   * the only ordering that is right for both: a blocking check names something
   * concrete to fix, so it leads, and an export that is already running is a
   * fact about the past rather than an invitation, so a plan that has just
   * emptied does not interrupt it.
   *
   * `blocked: true` is what makes every surface that already renders refusals
   * pick this up without knowing the reason exists — the top bar's title, the
   * guided step's paragraph, and the Ship stage's export hint all read that one
   * flag. `slideNumbers` is empty on purpose: none of the four reasons is about
   * a particular slide, so there is nothing for an "Open slide" control to point
   * at, and a fabricated slide number would be a worse lie than none.
   */
  if (unassigned) {
    return {
      enabled: false,
      reason: 'unassigned',
      exporting: false,
      blocked: true,
      slideNumbers: [],
      message: unassignedExportRefusal(unassigned),
      label: 'Choose a device variant to export',
      warningCount,
    }
  }

  if (exportStatus === 'exporting') {
    const exportTotal = total && total > 0 ? total : slideCount
    const progress = Math.max(exportTotal, completed, 1)
    return {
      enabled: false,
      reason: 'exporting',
      exporting: true,
      blocked: false,
      slideNumbers: [],
      message: `Exporting PNG ${completed} of ${progress}…`,
      label: `Exporting ${completed}/${progress}`,
      warningCount,
    }
  }

  const label = exportStatus === 'error'
    ? 'Try the export again'
    : exportStatus === 'success'
      ? 'Export again'
      : 'Export PNGs as a ZIP'

  return {
    enabled: true,
    reason: warningCount > 0 ? 'warnings' : 'ready',
    exporting: false,
    blocked: false,
    slideNumbers: [],
    message: warningCount > 0
      ? `Preflight passed with ${plural(warningCount, 'warning')}. Warnings do not block the export.`
      : `Preflight passed for ${plural(slideCount, 'slide')}. Ready to export.`,
    label,
    warningCount,
  }
}
