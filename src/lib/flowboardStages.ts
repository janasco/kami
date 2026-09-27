/**
 * Flowboard stage model for the staged editor shell.
 *
 * This module is deliberately UI-only. It derives stage rollouts and stage
 * copy from the existing project data, preflight result, and persistence
 * status. Nothing here is serialized, so the project format, migrations, and
 * validation are untouched by the Flowboard prototype.
 */

import {
  DEFAULT_ACCENT_SHAPE_STYLE,
  backgroundFillOptions,
  deviceFramePresets,
  screenshotFitOptions,
  slideLayerIds,
} from '../data'
import { resolveBackgroundFill } from './backgroundFill'
import { isFramelessDeviceId } from './devicePresets'
import { shouldShowDeviceStatusBar } from './deviceStatusBar'
import { getSlideText } from './localization'
import type { ExportPreflightIssue, ExportPreflightResult } from './exportPreflight'
import type { BackgroundFillKind, DeviceFrameId, LocaleId, ScreenshotFit, Slide, SlideTransform } from '../types'

export type FlowboardStageId = 'intake' | 'frame' | 'story' | 'refine' | 'ship'

/**
 * Rollout of a stage. `idle` means the author has not reached the stage's work
 * yet, `attention` means there is a concrete gap, and `ready` means the stage
 * has nothing outstanding. Precedence is attention, then idle, then ready.
 */
export type FlowboardStageState = 'ready' | 'attention' | 'idle'

export interface FlowboardStageDefinition {
  id: FlowboardStageId
  name: string
  /** Short purpose line rendered under the stage name in the rail. */
  purpose: string
  /** One-line reminder used in the stage header and the context panel. */
  reminder: string
}

export const flowboardStageDefinitions: FlowboardStageDefinition[] = [
  {
    id: 'intake',
    name: 'Intake',
    purpose: 'Bring captures in and name the project.',
    reminder: 'Drop screenshots, set the project basics, then move on.',
  },
  {
    id: 'frame',
    name: 'Frame',
    purpose: 'Pick device, fit, and status bar per capture.',
    reminder: 'Every capture gets a device frame, a fit, and a status bar decision.',
  },
  {
    id: 'story',
    name: 'Story',
    purpose: 'Shape the beat order, layout, theme, and copy.',
    reminder: 'Arrange the beats, then give each one a layout, theme, and a line of copy.',
  },
  {
    id: 'refine',
    name: 'Refine',
    purpose: 'Position layers and clear preflight issues.',
    reminder: 'Drag layers on the canvas, then clear anything preflight flags.',
  },
  {
    id: 'ship',
    name: 'Ship',
    purpose: 'Review preflight, choose a profile, and export.',
    reminder: 'Confirm the checks, pick a store profile, and export the ZIP.',
  },
]

export const flowboardStageIds: FlowboardStageId[] = flowboardStageDefinitions.map((stage) => stage.id)

export const flowboardStageStateLabel: Record<FlowboardStageState, string> = {
  ready: 'Ready',
  attention: 'Needs attention',
  idle: 'Not started',
}

export const getFlowboardStageDefinition = (id: FlowboardStageId): FlowboardStageDefinition =>
  flowboardStageDefinitions.find((stage) => stage.id === id) ?? flowboardStageDefinitions[0]

export const nextFlowboardStage = (id: FlowboardStageId): FlowboardStageId => {
  const index = flowboardStageIds.indexOf(id)
  return flowboardStageIds[Math.min(index + 1, flowboardStageIds.length - 1)]
}

export const previousFlowboardStage = (id: FlowboardStageId): FlowboardStageId => {
  const index = flowboardStageIds.indexOf(id)
  return flowboardStageIds[Math.max(index - 1, 0)]
}

/**
 * How far a key moves through the stage list. Both axes are accepted so the
 * list is easy to drive from a vertical rail or a horizontal selector.
 */
const flowboardStageKeyOffsets: Record<string, number> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
}

/**
 * The stage a key press should move to, or null when the key is not a stage
 * key. Home and End jump to the ends of the list and the result is clamped, so
 * the first and last stages are reachable in every direction.
 *
 * This is the keyboard half of the step list, kept here so the navigation can
 * be checked without a DOM and so the rail and the compact selector share one
 * rule.
 */
export const flowboardStageKeyTarget = (id: FlowboardStageId, key: string): FlowboardStageId | null => {
  const index = flowboardStageIds.indexOf(id)
  if (index < 0) return null

  let nextIndex: number | null = null
  if (key in flowboardStageKeyOffsets) nextIndex = index + flowboardStageKeyOffsets[key]
  else if (key === 'Home') nextIndex = 0
  else if (key === 'End') nextIndex = flowboardStageIds.length - 1
  if (nextIndex === null) return null

  const clamped = Math.min(Math.max(nextIndex, 0), flowboardStageIds.length - 1)
  return flowboardStageIds[clamped]
}

export interface FlowboardStageSummary extends FlowboardStageDefinition {
  state: FlowboardStageState
  stateLabel: string
  /** Why the stage is in this state, phrased as the next useful action. */
  detail: string
}

export interface FlowboardCaptureSummary {
  deviceName: string
  fitLabel: string
  statusBarLabel: string
  fillLabel: string
  framed: boolean
}

export const describeDeviceFrame = (deviceFrameId: DeviceFrameId): string =>
  deviceFramePresets.find((preset) => preset.id === deviceFrameId)?.name ?? 'Unknown device'

const describeFit = (fit: ScreenshotFit): string =>
  screenshotFitOptions.find((option) => option.id === fit)?.label ?? 'Contain'

export const describeBackgroundFillKind = (fill: unknown): string =>
  backgroundFillOptions.find((option) => option.id === resolveBackgroundFill(fill).kind)?.label ?? 'Theme'

/**
 * Device, fit, fill, and status-bar summary shown on Frame capture cards.
 *
 * The fill belongs here because it is the same decision as the fit: it decides
 * what the back of the slide is. A card that says "Panoramic" tells the author
 * more than a card that silently disagrees with the canvas behind it.
 */
export const summarizeCapture = (slide: Pick<Slide, 'backgroundFill' | 'deviceFrameId' | 'showDeviceStatusBar' | 'screenshotFit'>): FlowboardCaptureSummary => {
  const framed = !isFramelessDeviceId(slide.deviceFrameId)
  return {
    deviceName: describeDeviceFrame(slide.deviceFrameId),
    fitLabel: describeFit(slide.screenshotFit),
    statusBarLabel: !framed ? 'No frame, no chrome' : shouldShowDeviceStatusBar(slide) ? 'Status bar on' : 'Status bar off',
    fillLabel: describeBackgroundFillKind(slide.backgroundFill),
    framed,
  }
}

const isDefaultTransform = (transform: SlideTransform): boolean =>
  transform.x === 0
  && transform.y === 0
  && transform.scale === 1
  && transform.rotation === 0
  && transform.widthScale === 1
  && transform.heightScale === 1
  && transform.flipX === false
  && transform.flipY === false

/** True once a slide has any layer moved away from the authored defaults. */
export const isRefinedSlide = (slide: Slide): boolean => {
  if (slideLayerIds.some((layerId) => !isDefaultTransform(slide.layerTransforms[layerId]))) return true
  if (!isDefaultTransform(slide.transform)) return true
  return slide.accentShapeStyle.type !== DEFAULT_ACCENT_SHAPE_STYLE.type
    || slide.accentShapeStyle.color.toLowerCase() !== DEFAULT_ACCENT_SHAPE_STYLE.color.toLowerCase()
}

/** Preflight issues that only the Refine stage can act on. */
const REFINE_ISSUE_CODES: ReadonlySet<ExportPreflightIssue['code']> = new Set([
  'hidden-required-layer',
  'zero-opacity-required-layer',
  'bounds-outside-canvas',
])

export const isRefineIssue = (issue: ExportPreflightIssue): boolean => REFINE_ISSUE_CODES.has(issue.code)

export interface FlowboardDeckFacts {
  slideCount: number
  captureCount: number
  /** 1-based slide numbers with no capture assigned. */
  slidesWithoutCapture: number[]
  slidesWithoutHeadline: number[]
  /** Distinct device frames across slides that carry a capture. */
  deviceFrameIds: DeviceFrameId[]
  /** Distinct fit policies across slides that carry a capture. */
  screenshotFits: ScreenshotFit[]
  /** Distinct status-bar choices across framed slides that carry a capture. */
  statusBarModes: boolean[]
  /**
   * Distinct background fills across the deck. Collected over every slide, not
   * only the ones with a capture: a background is a property of the slide, and a
   * slide still waiting for its capture can already have a different backdrop
   * from its neighbours.
   */
  backgroundFills: BackgroundFillKind[]
  mixedFraming: boolean
  mixedBackgroundFill: boolean
  refinedSlideCount: number
  layerIssueCount: number
}

export interface FlowboardDeckInput {
  projectName: string
  slides: Slide[]
  activeLocale: LocaleId
  preflight: ExportPreflightResult
  /** Set when the local draft or a project open reported a problem. */
  persistenceNeedsAttention?: boolean
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`

export const collectFlowboardDeckFacts = ({ slides, activeLocale, preflight }: FlowboardDeckInput): FlowboardDeckFacts => {
  const slidesWithoutCapture: number[] = []
  const slidesWithoutHeadline: number[] = []
  const deviceFrameIds = new Set<DeviceFrameId>()
  const screenshotFits = new Set<ScreenshotFit>()
  const statusBarModes = new Set<boolean>()
  const backgroundFills = new Set<BackgroundFillKind>()
  let captureCount = 0
  let refinedSlideCount = 0

  slides.forEach((slide, index) => {
    const slideNumber = index + 1
    backgroundFills.add(resolveBackgroundFill(slide.backgroundFill).kind)
    if (slide.screenshot) {
      captureCount += 1
      deviceFrameIds.add(slide.deviceFrameId)
      screenshotFits.add(slide.screenshotFit)
      if (!isFramelessDeviceId(slide.deviceFrameId)) statusBarModes.add(shouldShowDeviceStatusBar(slide))
    } else {
      slidesWithoutCapture.push(slideNumber)
    }

    if (getSlideText(slide, activeLocale).title.trim().length === 0) slidesWithoutHeadline.push(slideNumber)
    if (isRefinedSlide(slide)) refinedSlideCount += 1
  })

  return {
    slideCount: slides.length,
    captureCount,
    slidesWithoutCapture,
    slidesWithoutHeadline,
    deviceFrameIds: [...deviceFrameIds],
    screenshotFits: [...screenshotFits],
    statusBarModes: [...statusBarModes],
    backgroundFills: [...backgroundFills],
    mixedFraming: deviceFrameIds.size > 1 || screenshotFits.size > 1 || statusBarModes.size > 1,
    mixedBackgroundFill: backgroundFills.size > 1,
    refinedSlideCount,
    layerIssueCount: preflight.issues.filter(isRefineIssue).length,
  }
}

const rollup = (state: FlowboardStageState, detail: string) => ({ state, stateLabel: flowboardStageStateLabel[state], detail })

const evaluateIntake = (projectName: string, facts: FlowboardDeckFacts, persistenceNeedsAttention?: boolean) => {
  if (persistenceNeedsAttention) {
    return rollup('attention', 'The local browser draft reported a problem. Open the status detail before continuing.')
  }
  if (facts.captureCount === 0) {
    return rollup('idle', 'No captures yet. Drop screenshots, import a sequence, or open a saved project.')
  }
  if (projectName.trim().length === 0) {
    return rollup('attention', 'Give the project a name so the exported ZIP and JSON are recognisable.')
  }
  return rollup('ready', `${plural(facts.captureCount, 'capture')} in · “${projectName.trim()}” is named.`)
}

const evaluateFrame = (facts: FlowboardDeckFacts) => {
  if (facts.captureCount === 0) {
    return rollup('idle', 'Framing starts once a capture exists. Import or open a project first.')
  }
  if (facts.slidesWithoutCapture.length > 0) {
    return rollup('attention', `${plural(facts.slidesWithoutCapture.length, 'slide')} still ${facts.slidesWithoutCapture.length === 1 ? 'needs' : 'need'} a capture.`)
  }
  if (facts.mixedFraming) {
    return rollup('attention', 'Device, fit, or status bar choices differ across the deck. Align them or accept the mix.')
  }
  if (facts.mixedBackgroundFill) {
    const fills = facts.backgroundFills.map(describeBackgroundFillKind).join(' and ')
    return rollup('attention', `Background fills differ across the deck: ${fills}. Align them or accept the mix.`)
  }
  const devices = facts.deviceFrameIds.map(describeDeviceFrame).join(' and ')
  return rollup('ready', `${plural(facts.captureCount, 'capture')} framed with ${devices || 'no device frame'}.`)
}

const evaluateStory = (facts: FlowboardDeckFacts) => {
  if (facts.slideCount <= 1) {
    return rollup('idle', 'A one-slide deck is a cover, not a story. Add another beat.')
  }
  if (facts.slidesWithoutHeadline.length > 0) {
    return rollup('attention', `No headline on ${plural(facts.slidesWithoutHeadline.length, 'slide')}: ${facts.slidesWithoutHeadline.join(', ')}.`)
  }
  return rollup('ready', `${plural(facts.slideCount, 'beat')} ordered, each with a headline.`)
}

const evaluateRefine = (facts: FlowboardDeckFacts) => {
  if (facts.layerIssueCount > 0) {
    return rollup('attention', `${plural(facts.layerIssueCount, 'layer issue')} to clear: hidden, transparent, or out of bounds.`)
  }
  if (facts.refinedSlideCount === 0) {
    return rollup('idle', 'Every layer still sits at its default position. Drag a layer to start refining.')
  }
  return rollup('ready', `${plural(facts.refinedSlideCount, 'slide')} refined with no layer issues.`)
}

const evaluateShip = (facts: FlowboardDeckFacts, preflight: ExportPreflightResult) => {
  if (preflight.status === 'blocked') {
    return rollup('attention', `${plural(preflight.blockingIssues.length, 'blocking check')} must pass before export.`)
  }
  if (preflight.status === 'warnings') {
    return rollup('attention', `${plural(preflight.warningIssues.length, 'warning')} to review. Export still works.`)
  }
  if (facts.captureCount === 0) {
    return rollup('idle', 'Nothing to export until a capture exists. Start in Intake or Frame.')
  }
  return rollup('ready', `Preflight passed for ${plural(preflight.checkedSlides, 'slide')}. Ready to export.`)
}

export const evaluateFlowboardStages = (input: FlowboardDeckInput): FlowboardStageSummary[] => {
  const facts = collectFlowboardDeckFacts(input)
  const rollouts: Record<FlowboardStageId, ReturnType<typeof rollup>> = {
    intake: evaluateIntake(input.projectName, facts, input.persistenceNeedsAttention),
    frame: evaluateFrame(facts),
    story: evaluateStory(facts),
    refine: evaluateRefine(facts),
    ship: evaluateShip(facts, input.preflight),
  }

  return flowboardStageDefinitions.map((stage) => ({ ...stage, ...rollouts[stage.id] }))
}

export const getFlowboardStageSummary = (stages: FlowboardStageSummary[], id: FlowboardStageId): FlowboardStageSummary =>
  stages.find((stage) => stage.id === id) ?? { ...getFlowboardStageDefinition(id), ...rollup('idle', 'No summary available yet.') }

export interface FlowboardChecklistItem {
  id: string
  label: string
  hint: string
  done: boolean
  stageId: FlowboardStageId
}

/** Concise getting-started checklist for the Intake stage. */
export const buildFlowboardChecklist = (input: FlowboardDeckInput): FlowboardChecklistItem[] => {
  const facts = collectFlowboardDeckFacts(input)
  return [
    {
      id: 'name',
      label: 'Name the project',
      hint: input.projectName.trim().length > 0 ? input.projectName.trim() : 'Untitled project',
      done: input.projectName.trim().length > 0,
      stageId: 'intake',
    },
    {
      id: 'captures',
      label: 'Import captures',
      hint: facts.captureCount > 0
        ? `${plural(facts.captureCount, 'capture')} across ${plural(facts.slideCount, 'slide')}`
        : 'Drop PNG, JPG, or WebP files to begin',
      done: facts.captureCount > 0 && facts.slidesWithoutCapture.length === 0,
      stageId: 'frame',
    },
    {
      id: 'copy',
      label: 'Write the beats',
      hint: facts.slidesWithoutHeadline.length > 0
        ? `No headline on slide${facts.slidesWithoutHeadline.length === 1 ? '' : 's'} ${facts.slidesWithoutHeadline.join(', ')}`
        : `${plural(facts.slideCount, 'slide')} with a headline`,
      done: facts.slideCount > 0 && facts.slidesWithoutHeadline.length === 0,
      stageId: 'story',
    },
    {
      id: 'preflight',
      label: 'Pass preflight',
      hint: input.preflight.status === 'ready'
        ? 'All checks passed'
        : input.preflight.status === 'blocked'
          ? `${plural(input.preflight.blockingIssues.length, 'blocking check')}`
          : `${plural(input.preflight.warningIssues.length, 'warning')}`,
      done: input.preflight.status === 'ready',
      stageId: 'ship',
    },
  ]
}
