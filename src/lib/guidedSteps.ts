/**
 * Guided mode step model.
 *
 * Guided mode is a four-step path through work the editor already does:
 * add screenshots, choose a look, write your words, download. The steps are
 * derived from the same deck facts the Flowboard stages use, so the guided
 * copy can never claim a step is finished while a stage still reports work
 * outstanding, and vice versa.
 *
 * Like the stage model, this module is UI-only: it reads the project, the
 * active locale, and the preflight result, and returns which step to show and
 * why. Nothing here is serialized, so the project format, migrations, and
 * validation are untouched.
 */

import { describeDeviceFrame, collectFlowboardDeckFacts, type FlowboardStageId } from './flowboardStages'
import type { ExportPreflightResult } from './exportPreflight'
import type { LocaleId, Slide } from '../types'

export type GuidedStepId = 'screenshots' | 'look' | 'words' | 'download'

export interface GuidedStepDefinition {
  id: GuidedStepId
  /** Plain-language step title, used as the heading and the progress label. */
  title: string
  /** One reassuring sentence under the title. */
  summary: string
  /** What the sticky footer's Back button returns to, or null on step 1. */
  backLabel: string | null
}

export const guidedStepDefinitions: GuidedStepDefinition[] = [
  {
    id: 'screenshots',
    title: 'Add your screenshots',
    summary: 'Choose one app screenshot for each slide. Everything else can wait.',
    backLabel: null,
  },
  {
    id: 'look',
    title: 'Choose a look',
    summary: 'Pick a phone style and decide whether a screenshot fills the frame or fits inside it.',
    backLabel: 'Back to your screenshots',
  },
  {
    id: 'words',
    title: 'Write your words',
    summary: 'Add a headline and, if you want, one line of supporting text to each slide.',
    backLabel: 'Back to your look',
  },
  {
    id: 'download',
    title: 'Download',
    summary: 'Check your slides, then download the images ready for the app stores.',
    backLabel: 'Back to your words',
  },
]

export const guidedStepIds: GuidedStepId[] = guidedStepDefinitions.map((step) => step.id)

export const getGuidedStepDefinition = (id: GuidedStepId): GuidedStepDefinition =>
  guidedStepDefinitions.find((step) => step.id === id) ?? guidedStepDefinitions[0]

export const nextGuidedStep = (id: GuidedStepId): GuidedStepId => {
  const index = guidedStepIds.indexOf(id)
  return guidedStepIds[Math.min(index + 1, guidedStepIds.length - 1)]
}

export const previousGuidedStep = (id: GuidedStepId): GuidedStepId => {
  const index = guidedStepIds.indexOf(id)
  return guidedStepIds[Math.max(index - 1, 0)]
}

/**
 * Which existing stage each step shows behind its More options disclosure, so
 * the full control set stays reachable without a second renderer.
 */
export const guidedStepStage: Record<GuidedStepId, FlowboardStageId> = {
  screenshots: 'intake',
  look: 'frame',
  words: 'story',
  download: 'ship',
}

/** The reverse mapping, used when a stage sends the author to a guided step. */
export const guidedStageStep: Record<FlowboardStageId, GuidedStepId> = {
  intake: 'screenshots',
  frame: 'look',
  story: 'words',
  refine: 'look',
  ship: 'download',
}

export interface GuidedDeckInput {
  slides: Slide[]
  activeLocale: LocaleId
  preflight: ExportPreflightResult
}

export interface GuidedStepProgress {
  id: GuidedStepId
  title: string
  /** True when the deck already satisfies this step. */
  done: boolean
}

export interface GuidedStepState {
  /** The step to show: the first unfinished one, or the last step. */
  step: GuidedStepId
  steps: GuidedStepProgress[]
  /** 1-based position of the current step. */
  stepNumber: number
  stepCount: number
  /** Plain-language status line for the current step. */
  status: string
  /** True when every step is done, so the flow has nothing left to ask for. */
  complete: boolean
  /** Facts the step components need for their own copy. */
  captureCount: number
  slideCount: number
  slidesWithoutCapture: number[]
  slidesWithoutHeadline: number[]
  mixedFraming: boolean
  deviceNames: string[]
  blocked: boolean
  warningCount: number
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`

const listSlides = (slideNumbers: number[]): string =>
  slideNumbers.join(', ').replace(/,(\d+)$/, ', and $1')

/**
 * True when the deck satisfies a step.
 *
 * The checks are the same ones the stages use, in the same order, so the
 * guided progress marker and the stage rail state agree: screenshots on every
 * slide, one consistent phone style across the deck, a headline on every slide,
 * and a preflight that does not block.
 */
const evaluateSteps = (facts: ReturnType<typeof collectFlowboardDeckFacts>, blocked: boolean): Record<GuidedStepId, boolean> => {
  const capturesDone = facts.slideCount > 0 && facts.slidesWithoutCapture.length === 0
  return {
    screenshots: capturesDone,
    look: capturesDone && !facts.mixedFraming,
    words: facts.slideCount > 0 && facts.slidesWithoutHeadline.length === 0,
    download: facts.captureCount > 0 && !blocked,
  }
}

const statusFor = (step: GuidedStepId, state: Omit<GuidedStepState, 'status' | 'step' | 'steps' | 'stepNumber' | 'stepCount' | 'complete'>): string => {
  if (step === 'screenshots') {
    if (state.captureCount === 0) return 'No screenshots yet. Add at least one to get started.'
    // A slide with no capture is one of the slides the count left out, so the
    // numbers here always describe a partially filled deck.
    return `${plural(state.captureCount, 'screenshot')} on ${state.slideCount - state.slidesWithoutCapture.length} of ${plural(state.slideCount, 'slide')}. Slide ${listSlides(state.slidesWithoutCapture)} ${state.slidesWithoutCapture.length === 1 ? 'has' : 'have'} none yet.`
  }

  if (step === 'look') {
    if (state.slidesWithoutCapture.length > 0) {
      return 'Add a screenshot to every slide before choosing a look.'
    }
    if (state.mixedFraming) {
      return 'Your slides use different phone styles. Pick one style for the whole set, or leave the mix as it is.'
    }
    return `Every slide uses the same style: ${state.deviceNames.length > 0 ? state.deviceNames.join(' and ') : 'no phone frame'}.`
  }

  if (step === 'words') {
    if (state.slidesWithoutHeadline.length === 0) return 'Every slide has a headline. Add supporting text if you want more detail.'
    return `No headline on slide ${listSlides(state.slidesWithoutHeadline)}. A few words are enough to start.`
  }

  if (state.blocked) return 'Some checks need attention before the download works. Open More options to see them.'
  if (state.warningCount > 0) {
    return `${plural(state.warningCount, 'check')} to review. The download still works.`
  }
  return `Ready to download ${plural(state.captureCount, 'image')}.`
}

/**
 * The one primary action for the current step.
 *
 * Every guided step has exactly one: on the first step it is the add action
 * while a slide is still missing a screenshot, and the move-on action once the
 * step is done. The last step's primary action is the download itself.
 */
export type GuidedPrimaryKind = 'add-screenshots' | 'next' | 'download'

export interface GuidedPrimaryAction {
  label: string
  kind: GuidedPrimaryKind
}

export const guidedPrimaryAction = (state: GuidedStepState): GuidedPrimaryAction => {
  if (state.step === 'screenshots') {
    return state.slidesWithoutCapture.length > 0
      ? { label: 'Add my screenshots', kind: 'add-screenshots' }
      : { label: 'Next: choose a look', kind: 'next' }
  }
  if (state.step === 'look') return { label: 'Next: write your words', kind: 'next' }
  if (state.step === 'words') return { label: 'Next: download', kind: 'next' }
  return {
    label: state.blocked ? 'Download is not ready yet' : 'Download my slides',
    kind: 'download',
  }
}

/**
 * The status line for a step.
 *
 * Pass a step explicitly when the shell is showing a step the author asked for
 * rather than the one the deck currently needs, so the sentence under the title
 * always describes the step that is actually on screen.
 */
export const guidedStepStatus = (state: GuidedStepState, step: GuidedStepId = state.step): string =>
  statusFor(step, state)

/**
 * Derives the guided step from the deck.
 *
 * The current step is the first unfinished one, so the author is always shown
 * the next thing that actually needs doing. When everything is done, the last
 * step stays on screen because that is where the download is.
 */
export function deriveGuidedStep(input: GuidedDeckInput): GuidedStepState {
  // The shared fact collector only reads slides, the active locale, and the
  // preflight result. The project name is part of its wider input type but
  // plays no part in a guided step, so it is passed as an explicit blank
  // rather than threading a field through that nothing here would read.
  const facts = collectFlowboardDeckFacts({ ...input, projectName: '' })
  const blocked = input.preflight.status === 'blocked'
  const done = evaluateSteps(facts, blocked)

  const steps: GuidedStepProgress[] = guidedStepDefinitions.map((definition) => ({
    id: definition.id,
    title: definition.title,
    done: done[definition.id],
  }))

  const step = steps.find((entry) => !entry.done)?.id ?? guidedStepIds[guidedStepIds.length - 1]
  const stepIndex = guidedStepIds.indexOf(step)
  const base = {
    captureCount: facts.captureCount,
    slideCount: facts.slideCount,
    slidesWithoutCapture: facts.slidesWithoutCapture,
    slidesWithoutHeadline: facts.slidesWithoutHeadline,
    mixedFraming: facts.mixedFraming,
    deviceNames: facts.deviceFrameIds.map(describeDeviceFrame),
    blocked,
    warningCount: input.preflight.warningIssues.length,
  }

  return {
    step,
    steps,
    stepNumber: stepIndex + 1,
    stepCount: guidedStepIds.length,
    status: statusFor(step, base),
    complete: steps.every((entry) => entry.done),
    ...base,
  }
}
