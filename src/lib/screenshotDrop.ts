/**
 * Drop planning for app captures.
 *
 * A drop is a question the editor cannot answer by itself: which slide does
 * this file land on, does it replace a capture or fill an empty one, does the
 * deck need a new slide, and which files are not captures at all. This module
 * answers all of it as a pure plan, so the same decision can be unit tested and
 * so the Frame cards, the Intake deck strip, and the device placeholder can
 * never disagree about what a drop means.
 *
 * Two rules decide the assignment:
 *
 * - One capture replaces the capture on the slide it was dropped on. Nothing
 *   else moves, and no slide is created for it.
 * - Several captures are assigned in order from that slide forward. When the
 *   images run past the end of the deck, the surplus is placed on new slides
 *   appended in the same order, so dropping six images on a three-slide deck
 *   fills three slides and adds three more.
 *
 * The plan is UI-only. It names existing slide ids and describes slides that
 * would have to be created; it never builds a project, never mutates a slide,
 * and adds no field to the project document. The caller writes the plan through
 * the same `commitEditorUpdate` path as every other edit, so one drop is one
 * undo step and autosaves like any other change.
 *
 * This module also owns the drag-and-drop vocabulary: the Kami-only data
 * transfer type used to move a capture from one slide card to another, and the
 * reader that tells a native file drop apart from a capture copy.
 */

import {
  formatFileSize,
  isAcceptedScreenshotFile,
  SCREENSHOT_IMPORT_MAX_BYTES,
} from './screenshotImport'

/**
 * The one data transfer type Kami registers for its own drags.
 *
 * A capture dragged between slide cards is not a file: the bytes already live
 * in the project, and the browser would hand over a `File` for a text selection
 * or a remote image just as readily. Naming the type keeps the two apart, so a
 * native file drop still arrives as files and a capture copy still arrives as a
 * payload, and neither can be mistaken for the other.
 */
export const KAMI_CAPTURE_DRAG_TYPE = 'application/x-kami-capture'

/** What the drop carried, told apart by the data transfer types alone. */
export type DropIntentKind = 'capture' | 'files' | 'none'

/**
 * The subset of a dragged file this module reads. The caller keeps the real
 * `File`; a test can pass a plain object with the same three fields.
 */
export interface DroppedFileLike {
  name: string
  type?: string
  size?: number
}

/** How a single dropped file is treated. */
export type DroppedFileKind = 'capture' | 'project' | 'rejected'

export interface DroppedFileClassification {
  kind: DroppedFileKind
  /** Why the file cannot be used, or null when it can. */
  reason: string | null
}

/** A `screenshot-studio.json` document, which opens as a project instead. */
export const isProjectDropFile = (file: DroppedFileLike): boolean =>
  /\.json$/i.test(file.name) || (file.type ?? '').toLowerCase() === 'application/json'

/**
 * Classifies one dropped file.
 *
 * A project document is recognised first, so a JSON file never reaches the
 * image checks, and a file Kami cannot use is rejected with the reason rather
 * than dropped without a word.
 */
export const classifyDroppedFile = (file: DroppedFileLike): DroppedFileClassification => {
  if (isProjectDropFile(file)) return { kind: 'project', reason: null }
  if (!isAcceptedScreenshotFile(file)) {
    return { kind: 'rejected', reason: `${file.name} is not a PNG, JPG, or WebP image.` }
  }
  if (typeof file.size === 'number' && file.size > SCREENSHOT_IMPORT_MAX_BYTES) {
    return {
      kind: 'rejected',
      reason: `Too large: ${formatFileSize(file.size)}. The limit is 10 MB per image.`,
    }
  }
  return { kind: 'capture', reason: null }
}

/** How the captures in one drop are placed. */
export type CaptureDropStrategy = 'replace-target' | 'assign-forward'

/** One capture, and the slide it is meant for. */
export interface PlannedCapture<TFile extends DroppedFileLike> {
  /** The file as it was dropped, so the caller can read it. */
  file: TFile
  name: string
  /**
   * 1-based deck position the capture lands on. A capture that needs a new
   * slide still gets the number it will have once the slide exists, so the
   * notice can say where the deck grew.
   */
  slideNumber: number
  /** The slide that receives the capture, or null when one must be created. */
  slideId: string | null
  /** True when the capture replaces one already on that slide. */
  replaces: boolean
  /** True when the deck does not have a slide for this capture yet. */
  createsSlide: boolean
}

/** A dropped project document. */
export interface PlannedProjectFile<TFile extends DroppedFileLike> {
  file: TFile
  name: string
}

/** A dropped file Kami will not use, with the reason it is refused. */
export interface RejectedDropFile<TFile extends DroppedFileLike> {
  file: TFile
  name: string
  reason: string
}

/** The slide fields the planner reads. Nothing else about a slide matters here. */
export interface CaptureDropSlide {
  id: string
  screenshot: string | null
}

export interface CaptureDropPlan<TFile extends DroppedFileLike> {
  /** The slide the drop was aimed at. */
  targetSlideId: string
  /** 1-based position of that slide, or 0 when it is not in the deck. */
  targetSlideNumber: number
  strategy: CaptureDropStrategy
  /** Accepted captures in drop order. */
  captures: PlannedCapture<TFile>[]
  /** Project documents in the drop, in drop order. */
  projects: PlannedProjectFile<TFile>[]
  /** Files that cannot be used, in drop order. */
  rejected: RejectedDropFile<TFile>[]
  /** How many captures were placed, the same length as `captures`. */
  assignedCount: number
  /** How many of those land on a slide that already has a capture. */
  replacedCount: number
  /** How many need a slide the deck does not have yet. */
  createdSlideCount: number
  /** How many slides the deck holds once the plan is applied. */
  slideCountAfter: number
  /** The one sentence the surface shows for this drop. */
  notice: string
  /**
   * True when applying the plan would change nothing. A project document is
   * never opened by a slide drop, so a drop of one changes nothing either.
   */
  empty: boolean
}

/**
 * One capture replaces the capture on the target slide; two or more are placed
 * in order from it. Deriving the strategy from the count keeps the common
 * single-file drop a replace with no new slide, which is what an author
 * dropping one file onto a card means.
 */
export const resolveCaptureDropStrategy = (captureCount: number): CaptureDropStrategy =>
  captureCount <= 1 ? 'replace-target' : 'assign-forward'

const plural = (count: number, singular: string) => `${count} ${count === 1 ? singular : `${singular}s`}`

/** `slide 2` for one position, `slides 2 to 4` for a run of them. */
const slideRangeLabel = (first: number, last: number): string =>
  first === last ? `slide ${first}` : `slides ${first} to ${last}`

/**
 * One concise sentence for a drop: what was placed, what replaced what, how
 * many slides were added, and what was refused. A refusal is always named, so a
 * drop that was partly ignored says so instead of reading as a success.
 */
export const describeCaptureDropPlan = (plan: Omit<CaptureDropPlan<DroppedFileLike>, 'notice'>): string => {
  const { assignedCount, captures, createdSlideCount, projects, rejected, replacedCount } = plan
  const parts: string[] = []

  if (assignedCount === 0) {
    parts.push('Nothing was placed.')
  } else if (assignedCount === 1) {
    const capture = captures[0]
    parts.push(replacedCount > 0
      ? `Replaced the capture on slide ${capture.slideNumber} with ${capture.name}.`
      : `Added ${capture.name} to ${slideRangeLabel(capture.slideNumber, capture.slideNumber)}.`)
  } else {
    const replacedNote = replacedCount > 0 ? `, replacing ${plural(replacedCount, 'existing capture')}` : ''
    parts.push(
      `${plural(assignedCount, 'capture')} placed in order on ${slideRangeLabel(
        captures[0].slideNumber,
        captures[captures.length - 1].slideNumber,
      )}${replacedNote}.`,
    )
  }

  if (createdSlideCount > 0) parts.push(`${plural(createdSlideCount, 'new slide')} added.`)
  if (projects.length > 0) {
    // A project document is never opened by a drop aimed at one slide: doing so
    // would replace the whole deck, which is not what the drop meant.
    parts.push(
      `${projects[0].name} is a project file, not a capture. Open a project from the Intake dropzone.`,
    )
  }
  if (rejected.length > 0) {
    const names = rejected.slice(0, 2).map((entry) => entry.name)
    const rest = rejected.length - names.length
    parts.push(`Not placed: ${names.join(' and ')}${rest > 0 ? ` and ${rest} more` : ''}.`)
  }
  if (assignedCount > 0) parts.push('Undo is available.')

  return parts.join(' ')
}

export interface CaptureDropInput<TFile extends DroppedFileLike> {
  /** The dropped files, in the order the browser reported them. */
  files: readonly TFile[]
  /** The deck, in order. Only the id and the capture are read. */
  slides: readonly CaptureDropSlide[]
  /** The slide the drop was aimed at. */
  targetSlideId: string
  /** Overrides the count-derived strategy, for a caller that knows better. */
  strategy?: CaptureDropStrategy
}

/**
 * Plans one drop against one slide.
 *
 * Files are classified first, so a project document or a text file never
 * becomes an assignment, and the accepted captures are then placed from the
 * target slide forward. A target that is no longer in the deck is refused
 * rather than guessed at, except on an empty deck, where every capture simply
 * becomes the first slide.
 */
export const planScreenshotDrop = <TFile extends DroppedFileLike>(
  input: CaptureDropInput<TFile>,
): CaptureDropPlan<TFile> => {
  const { files, slides, targetSlideId } = input
  const rejected: RejectedDropFile<TFile>[] = []
  const projects: PlannedProjectFile<TFile>[] = []
  const captureFiles: TFile[] = []

  for (const file of files) {
    const classified = classifyDroppedFile(file)
    if (classified.kind === 'project') projects.push({ file, name: file.name })
    else if (classified.kind === 'capture') captureFiles.push(file)
    else rejected.push({ file, name: file.name, reason: classified.reason ?? `${file.name} cannot be used here.` })
  }

  const targetIndex = slides.findIndex((slide) => slide.id === targetSlideId)
  // A deck with no slides has nothing to aim at, which is the one case where a
  // drop can still succeed: every capture becomes a new slide. A target that is
  // missing from a deck that has slides is a stale id, and is refused below
  // rather than guessed at.
  const targetMissing = targetIndex < 0 && slides.length > 0
  const startIndex = targetIndex < 0 ? 0 : targetIndex
  const strategy = input.strategy ?? resolveCaptureDropStrategy(captureFiles.length)
  const captures: PlannedCapture<TFile>[] = []

  if (targetMissing) {
    for (const file of captureFiles) {
      rejected.push({ file, name: file.name, reason: `Slide ${targetSlideId} is no longer in the deck.` })
    }
  } else {
    captureFiles.forEach((file, order) => {
      // A replace is one capture. Extra files in the same drop are refused
      // rather than silently pushed onto slides the author did not aim at.
      if (strategy === 'replace-target' && order > 0) {
        rejected.push({
          file,
          name: file.name,
          reason: 'Only one capture can replace the capture on a slide.',
        })
        return
      }
      const index = startIndex + order
      const slide = index < slides.length ? slides[index] : null
      captures.push({
        file,
        name: file.name,
        slideId: slide?.id ?? null,
        slideNumber: index + 1,
        replaces: Boolean(slide?.screenshot),
        createsSlide: slide === null,
      })
    })
  }

  const createdSlideCount = captures.filter((capture) => capture.createsSlide).length
  const plan: Omit<CaptureDropPlan<TFile>, 'notice'> = {
    targetSlideId,
    targetSlideNumber: targetIndex + 1,
    strategy,
    captures,
    projects,
    rejected,
    assignedCount: captures.length,
    replacedCount: captures.filter((capture) => capture.replaces).length,
    createdSlideCount,
    slideCountAfter: slides.length + createdSlideCount,
    empty: captures.length === 0,
  }

  return { ...plan, notice: describeCaptureDropPlan(plan) }
}

/** The slide a capture copy names: which slide it is on, and what it is called. */
export interface KamiCapturePayload {
  /** The slide the capture currently sits on. */
  slideId: string
  /** The capture's file name, used in the notice. */
  name: string | null
}

/** Serialised onto the drag, so a capture copy carries no file bytes. */
export const encodeKamiCapture = (payload: KamiCapturePayload): string => JSON.stringify(payload)

/**
 * Reads a capture payload back off a drag.
 *
 * A payload from another program, a truncated string, or a drag that never
 * carried one all resolve to null rather than throwing, because a drop that
 * cannot be understood has to be ignorable.
 */
export const decodeKamiCapture = (raw: string | null | undefined): KamiCapturePayload | null => {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { slideId, name } = parsed as { slideId?: unknown; name?: unknown }
    if (typeof slideId !== 'string' || slideId.length === 0) return null
    return { slideId, name: typeof name === 'string' ? name : null }
  } catch {
    return null
  }
}

/** The part of a `DataTransfer` this module reads, so a test can supply one. */
export interface DataTransferLike<TFile> {
  types: readonly string[]
  getData: (format: string) => string
  files: ArrayLike<TFile> | null
}

/**
 * True when the drag is something a capture target should accept.
 *
 * Only the types are read, never the payload: a `DataTransfer` is protected
 * while a drag hovers, so its files are still empty and its data still reads as
 * an empty string. Deciding from the types is also what keeps a pointer drag of
 * a layer, or any drag Kami did not start, from being swallowed as a drop.
 */
export const isDroppableDrag = (transfer: DataTransferLike<unknown> | null | undefined): boolean => {
  if (!transfer) return false
  return transfer.types.includes('Files') || transfer.types.includes(KAMI_CAPTURE_DRAG_TYPE)
}

export type DropIntent<TFile> =
  | { kind: 'capture'; capture: KamiCapturePayload; files: [] }
  | { kind: 'files'; capture: null; files: TFile[] }
  | { kind: 'none'; capture: null; files: [] }

/**
 * Reads what a completed drop carried.
 *
 * A Kami capture type wins over files, so dragging a card onto a card is
 * always a copy even if the browser also offers the underlying image, and a
 * drop with neither is reported as empty instead of being treated as a file
 * drop with no files.
 */
export const readDropIntent = <TFile>(
  transfer: DataTransferLike<TFile> | null | undefined,
): DropIntent<TFile> => {
  if (!transfer) return { kind: 'none', capture: null, files: [] }
  if (transfer.types.includes(KAMI_CAPTURE_DRAG_TYPE)) {
    const capture = decodeKamiCapture(transfer.getData(KAMI_CAPTURE_DRAG_TYPE))
    if (capture) return { kind: 'capture', capture, files: [] }
  }
  if (transfer.types.includes('Files')) {
    const files = transfer.files ? Array.from(transfer.files) : []
    if (files.length > 0) return { kind: 'files', capture: null, files }
  }
  return { kind: 'none', capture: null, files: [] }
}
