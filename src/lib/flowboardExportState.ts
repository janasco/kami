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
 * `resolveFlowboardExportGate` folds the export status and the preflight result
 * into one value that both surfaces render, so the answer cannot drift. It is a
 * pure function of state the editor already holds: nothing here is serialized,
 * and the project format, validation, and export pipeline are untouched.
 */

import type { ExportPreflightResult } from './exportPreflight'

/** Mirrors the `ExportStatus` type the toolbar and the App shell own. */
export type FlowboardExportStatus = 'idle' | 'exporting' | 'success' | 'error' | 'validation'

export interface FlowboardExportGateInput {
  exportStatus: FlowboardExportStatus
  preflight: Pick<ExportPreflightResult, 'status' | 'blockingIssues' | 'warningIssues' | 'issues'>
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
export type FlowboardExportGateReason = 'ready' | 'warnings' | 'blocked' | 'exporting'

export interface FlowboardExportGate {
  /** The one value every Export control must read. */
  enabled: boolean
  reason: FlowboardExportGateReason
  /** True while an export is running, so progress copy stays honest. */
  exporting: boolean
  /** True when a preflight blocking issue stops the export. */
  blocked: boolean
  /** 1-based deck numbers of the first blocking issue, empty unless blocked. */
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
 * Folds the running export status and the preflight result into one gate.
 *
 * A blocking preflight issue always wins, because it is the state the author has
 * to fix first, and it keeps its slide numbers in the message. A running export
 * comes next, since a second run would overwrite the first. Warnings never
 * block: they are reported in the message and the export stays available.
 */
export const resolveFlowboardExportGate = ({
  exportStatus,
  preflight,
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
