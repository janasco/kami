import { describe, expect, it } from 'vitest'
import { createSlide, DEFAULT_ACCENT_SHAPE_STYLE, starterSlide } from '../data'
import {
  buildFlowboardChecklist,
  collectFlowboardDeckFacts,
  evaluateFlowboardStages,
  flowboardStageIds,
  flowboardStageKeyTarget,
  getFlowboardStageSummary,
  isRefineIssue,
  isRefinedSlide,
  nextFlowboardStage,
  previousFlowboardStage,
  summarizeCapture,
  type FlowboardDeckInput,
} from './flowboardStages'
import type { ExportPreflightResult } from './exportPreflight'
import type { Slide } from '../types'

const cleanPreflight = (overrides: Partial<ExportPreflightResult> = {}): ExportPreflightResult => ({
  status: 'ready',
  issues: [],
  blockingIssues: [],
  warningIssues: [],
  checkedSlides: 1,
  profileId: 'app-store',
  ...overrides,
})

const withCapture = (slide: Slide, overrides: Partial<Slide> = {}): Slide => ({
  ...slide,
  screenshot: 'data:image/png;base64,iVBORw0KGgo=',
  screenshotName: 'capture.png',
  ...overrides,
})

const deckInput = (overrides: Partial<FlowboardDeckInput> = {}): FlowboardDeckInput => ({
  projectName: 'Kami launch',
  slides: [withCapture(starterSlide)],
  activeLocale: 'en-US',
  preflight: cleanPreflight(),
  ...overrides,
})

const stateOf = (input: FlowboardDeckInput, id: (typeof flowboardStageIds)[number]) =>
  getFlowboardStageSummary(evaluateFlowboardStages(input), id).state

describe('flowboard stage definitions', () => {
  it('exposes the five freely navigable stages in order', () => {
    expect(flowboardStageIds).toEqual(['intake', 'frame', 'story', 'refine', 'ship'])
  })

  it('walks forwards and backwards without leaving the rail', () => {
    expect(nextFlowboardStage('intake')).toBe('frame')
    expect(nextFlowboardStage('ship')).toBe('ship')
    expect(previousFlowboardStage('intake')).toBe('intake')
    expect(previousFlowboardStage('refine')).toBe('story')
  })
})

describe('evaluateFlowboardStages', () => {
  it('reports an untouched deck as not started everywhere', () => {
    const stages = evaluateFlowboardStages(deckInput({ slides: [starterSlide] }))
    expect(stages.map((stage) => stage.id)).toEqual(flowboardStageIds)
    expect(stages.every((stage) => stage.state === 'idle')).toBe(true)
  })

  it('marks a framed single-capture deck ready in intake, frame, and ship', () => {
    const input = deckInput()
    expect(stateOf(input, 'intake')).toBe('ready')
    expect(stateOf(input, 'frame')).toBe('ready')
    expect(stateOf(input, 'ship')).toBe('ready')
    // A one-slide deck has not shaped a story yet.
    expect(stateOf(input, 'story')).toBe('idle')
    expect(stateOf(input, 'refine')).toBe('idle')
  })

  it('asks for a project name once captures exist', () => {
    expect(stateOf(deckInput({ projectName: '   ' }), 'intake')).toBe('attention')
  })

  it('surfaces a persistence problem on the intake stage', () => {
    expect(stateOf(deckInput({ persistenceNeedsAttention: true }), 'intake')).toBe('attention')
  })

  it('asks for a capture on slides that have none', () => {
    const input = deckInput({
      slides: [withCapture(starterSlide), { ...createSlide(), title: 'Second beat' }],
    })
    expect(stateOf(input, 'frame')).toBe('attention')
    expect(getFlowboardStageSummary(evaluateFlowboardStages(input), 'frame').detail).toContain('1 slide')
  })

  it('flags mixed device, fit, or status bar choices across the deck', () => {
    const input = deckInput({
      slides: [
        withCapture(starterSlide),
        withCapture({ ...createSlide(), title: 'Second beat' }, {
          deviceFrameId: 'android',
          screenshotFit: 'cover',
        }),
      ],
    })
    expect(stateOf(input, 'frame')).toBe('attention')
  })

  it('ignores frameless slides when comparing status bar choices', () => {
    const input = deckInput({
      slides: [
        withCapture(starterSlide),
        withCapture({ ...createSlide(), title: 'Second beat' }, { deviceFrameId: 'none' }),
      ],
    })
    // Two different device frames still count as mixed framing.
    expect(collectFlowboardDeckFacts(input).statusBarModes).toEqual([true])
    expect(stateOf(input, 'frame')).toBe('attention')
  })

  it('reads every slide on the theme fill when no slide has a fill record', () => {
    const facts = collectFlowboardDeckFacts(deckInput())
    expect(facts.backgroundFills).toEqual(['theme'])
    expect(facts.mixedBackgroundFill).toBe(false)
  })

  it('flags mixed background fills across the deck', () => {
    const input = deckInput({
      slides: [
        withCapture(starterSlide),
        withCapture({ ...createSlide(), title: 'Second beat' }, { backgroundFill: { kind: 'gradient' } }),
      ],
    })
    const facts = collectFlowboardDeckFacts(input)
    expect(facts.backgroundFills.sort()).toEqual(['gradient', 'theme'])
    expect(facts.mixedBackgroundFill).toBe(true)
    expect(stateOf(input, 'frame')).toBe('attention')
    expect(getFlowboardStageSummary(evaluateFlowboardStages(input), 'frame').detail)
      .toContain('Background fills differ across the deck')
  })

  it('counts a background fill on a slide that is still waiting for its capture', () => {
    const facts = collectFlowboardDeckFacts(deckInput({
      slides: [withCapture(starterSlide), { ...createSlide(), title: 'Second beat', backgroundFill: { kind: 'gradient' } }],
    }))
    expect(facts.mixedBackgroundFill).toBe(true)
    // The missing capture is the more urgent gap, so it wins the detail line.
    expect(getFlowboardStageSummary(evaluateFlowboardStages(deckInput({
      slides: [withCapture(starterSlide), { ...createSlide(), title: 'Second beat', backgroundFill: { kind: 'gradient' } }],
    })), 'frame').detail).toContain('still needs a capture')
  })

  it('names the background fill on a capture card', () => {
    expect(summarizeCapture(starterSlide).fillLabel).toBe('Theme')
    expect(summarizeCapture(withCapture(starterSlide, { backgroundFill: { kind: 'panoramic', blend: 'screen' } })).fillLabel)
      .toBe('Panoramic')
  })

  it('asks for a headline on any beat that has none', () => {
    const input = deckInput({
      slides: [withCapture(starterSlide), withCapture({ ...createSlide(), title: '  ' })],
    })
    expect(stateOf(input, 'story')).toBe('attention')
  })

  it('treats a single beat deck as a story that has not started', () => {
    expect(stateOf(deckInput({ slides: [withCapture(starterSlide)] }), 'story')).toBe('idle')
  })

  it('keeps refine idle until a layer moves away from its default', () => {
    const input = deckInput()
    expect(isRefinedSlide(input.slides[0])).toBe(false)
    expect(stateOf(input, 'refine')).toBe('idle')

    const moved = deckInput({
      slides: [withCapture(starterSlide, {
        layerTransforms: {
          ...starterSlide.layerTransforms,
          headline: { ...starterSlide.layerTransforms.headline, y: -4 },
        },
      })],
    })
    expect(isRefinedSlide(moved.slides[0])).toBe(true)
    expect(stateOf(moved, 'refine')).toBe('ready')
  })

  it('counts an accent shape change as refinement work', () => {
    const slide = withCapture(starterSlide, {
      accentShapeStyle: { ...DEFAULT_ACCENT_SHAPE_STYLE, color: '#123456' },
    })
    expect(isRefinedSlide(slide)).toBe(true)
  })

  it('prefers an attention rollout over idle for preflight layer issues', () => {
    const issue = {
      code: 'hidden-required-layer' as const,
      severity: 'blocking' as const,
      message: 'Required layer “Headline” is hidden.',
      slideNumbers: [1],
      layerId: 'headline' as const,
    }
    const input = deckInput({
      preflight: cleanPreflight({
        status: 'blocked',
        issues: [issue],
        blockingIssues: [issue],
        checkedSlides: 1,
      }),
    })
    expect(stateOf(input, 'refine')).toBe('attention')
    expect(stateOf(input, 'ship')).toBe('attention')
    expect(isRefineIssue(issue)).toBe(true)
    expect(isRefineIssue({ ...issue, code: 'missing-screenshot' })).toBe(false)
  })

  it('reports warnings as attention at the ship stage', () => {
    const warning = {
      code: 'missing-app-icon' as const,
      severity: 'warning' as const,
      message: 'App icon is optional but missing.',
      slideNumbers: [1],
      layerId: 'app-icon' as const,
    }
    const input = deckInput({
      preflight: cleanPreflight({ status: 'warnings', issues: [warning], warningIssues: [warning] }),
    })
    expect(stateOf(input, 'ship')).toBe('attention')
    // A warning is not something the Refine stage can fix.
    expect(stateOf(input, 'refine')).toBe('idle')
  })

  it('keeps ship idle while there is nothing to export', () => {
    expect(stateOf(deckInput({ slides: [starterSlide] }), 'ship')).toBe('idle')
  })
})

describe('summarizeCapture', () => {
  it('describes a framed capture with the status chrome on', () => {
    expect(summarizeCapture(starterSlide)).toEqual({
      deviceName: 'iPhone',
      fitLabel: 'Contain',
      statusBarLabel: 'Status bar on',
      fillLabel: 'Theme',
      framed: true,
    })
  })

  it('reports a frameless capture as having no chrome', () => {
    expect(summarizeCapture({ deviceFrameId: 'none', showDeviceStatusBar: true, screenshotFit: 'cover' })).toEqual({
      deviceName: 'No frame',
      fitLabel: 'Cover',
      statusBarLabel: 'No frame, no chrome',
      fillLabel: 'Theme',
      framed: false,
    })
  })
})

describe('buildFlowboardChecklist', () => {
  it('marks done items for a complete deck and links each item to a stage', () => {
    const items = buildFlowboardChecklist(deckInput())
    expect(items.map((item) => item.id)).toEqual(['name', 'captures', 'copy', 'preflight'])
    expect(items.every((item) => item.done)).toBe(true)
    expect(items.map((item) => item.stageId)).toEqual(['intake', 'frame', 'story', 'ship'])
  })

  it('leaves captures and preflight open on an untouched deck', () => {
    const blockingIssue = {
      code: 'missing-screenshot' as const,
      severity: 'blocking' as const,
      message: 'Add a screenshot to 1 slide.',
      slideNumbers: [1],
      layerId: 'screenshot' as const,
    }
    const items = buildFlowboardChecklist(deckInput({
      slides: [starterSlide],
      preflight: cleanPreflight({
        status: 'blocked',
        issues: [blockingIssue],
        blockingIssues: [blockingIssue],
      }),
    }))
    expect(items.map((item) => item.done)).toEqual([true, false, true, false])
    expect(items[3].hint).toBe('1 blocking check')
  })
})

describe('flowboardStageKeyTarget', () => {
  it('moves between stages with the arrow keys, from either end', () => {
    expect(flowboardStageKeyTarget('intake', 'ArrowDown')).toBe('frame')
    expect(flowboardStageKeyTarget('intake', 'ArrowRight')).toBe('frame')
    expect(flowboardStageKeyTarget('ship', 'ArrowUp')).toBe('refine')
    expect(flowboardStageKeyTarget('ship', 'ArrowLeft')).toBe('refine')
    // The ends are clamped rather than wrapping or falling off the list, so the
    // first and last stages stay reachable from every direction.
    expect(flowboardStageKeyTarget('intake', 'ArrowUp')).toBe('intake')
    expect(flowboardStageKeyTarget('intake', 'ArrowLeft')).toBe('intake')
    expect(flowboardStageKeyTarget('ship', 'ArrowDown')).toBe('ship')
    expect(flowboardStageKeyTarget('ship', 'ArrowRight')).toBe('ship')
  })

  it('jumps to the first and last stage with Home and End', () => {
    expect(flowboardStageKeyTarget('story', 'Home')).toBe(flowboardStageIds[0])
    expect(flowboardStageKeyTarget('story', 'End')).toBe(flowboardStageIds[flowboardStageIds.length - 1])
  })

  it('leaves every other key to the browser and the author', () => {
    for (const key of ['Tab', 'Enter', ' ', 'a', 'PageDown', 'PageUp', 'Escape', '[']) {
      expect(flowboardStageKeyTarget('frame', key)).toBeNull()
    }
  })

  it('always lands on a real stage', () => {
    for (const id of flowboardStageIds) {
      for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End']) {
        expect(flowboardStageIds).toContain(flowboardStageKeyTarget(id, key))
      }
    }
  })
})
