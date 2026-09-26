import { describe, expect, it } from 'vitest'
import { createSlide, starterSlide } from '../data'
import type { ExportPreflightIssue, ExportPreflightResult } from './exportPreflight'
import {
  deriveGuidedStep,
  getGuidedStepDefinition,
  guidedPrimaryAction,
  guidedStageStep,
  guidedStepStatus,
  guidedStepIds,
  guidedStepStage,
  nextGuidedStep,
  previousGuidedStep,
  type GuidedDeckInput,
  type GuidedStepId,
} from './guidedSteps'
import type { Slide } from '../types'

/**
 * Guided step derivation tests.
 *
 * The guided copy and the stage copy both read the deck, so these assert that
 * the two agree: a step is only done when the matching stage has nothing
 * outstanding, and the step shown is the first one that still needs work.
 */

const issue = (severity: 'blocking' | 'warning', message: string, slideNumbers: number[]): ExportPreflightIssue => ({
  code: severity === 'blocking' ? 'missing-screenshot' : 'dimension-warning',
  severity,
  message,
  slideNumbers,
})

const preflight = (overrides: Partial<ExportPreflightResult> = {}): ExportPreflightResult => {
  const issues = overrides.issues ?? []
  return {
    status: issues.some((entry) => entry.severity === 'blocking')
      ? 'blocked'
      : issues.length > 0 ? 'warnings' : 'ready',
    issues,
    blockingIssues: issues.filter((entry) => entry.severity === 'blocking'),
    warningIssues: issues.filter((entry) => entry.severity === 'warning'),
    checkedSlides: 1,
    profileId: 'app-store',
    ...overrides,
  }
}

const withCapture = (slide: Slide, overrides: Partial<Slide> = {}): Slide => ({
  ...slide,
  screenshot: 'data:image/png;base64,iVBORw0KGgo=',
  screenshotName: 'capture.png',
  ...overrides,
})

const withHeadline = (slide: Slide, overrides: Partial<Slide> = {}): Slide =>
  withCapture(slide, { title: 'Ship it', subtitle: 'One more tap', ...overrides })

const deckInput = (overrides: Partial<GuidedDeckInput> = {}): GuidedDeckInput => ({
  slides: [withHeadline(starterSlide)],
  activeLocale: 'en-US',
  preflight: preflight(),
  ...overrides,
})

const stepTitles = () => guidedStepIds.map((id) => getGuidedStepDefinition(id).title)

const doneSteps = (deck: GuidedDeckInput) =>
  Object.fromEntries(deriveGuidedStep(deck).steps.map((entry) => [entry.id, entry.done]))

describe('guided step definitions', () => {
  it('has the four beginner steps in order', () => {
    expect(guidedStepIds).toEqual(['screenshots', 'look', 'words', 'download'])
    expect(stepTitles()).toEqual([
      'Add your screenshots',
      'Choose a look',
      'Write your words',
      'Download',
    ])
  })

  it('walks forwards and backwards without falling off either end', () => {
    expect(nextGuidedStep('screenshots')).toBe('look')
    expect(nextGuidedStep('download')).toBe('download')
    expect(previousGuidedStep('look')).toBe('screenshots')
    expect(previousGuidedStep('screenshots')).toBe('screenshots')
  })

  it('falls back to the first step for an unknown id', () => {
    expect(getGuidedStepDefinition('nope' as GuidedStepId).id).toBe('screenshots')
  })

  it('points every step at an existing Flowboard stage and back again', () => {
    // The More options panel is the existing stage, so the mapping has to
    // cover all four steps, and every stage has to lead somewhere.
    expect(guidedStepStage).toEqual({
      screenshots: 'intake',
      look: 'frame',
      words: 'story',
      download: 'ship',
    })
    for (const stage of Object.values(guidedStepStage)) {
      expect(guidedStepIds).toContain(guidedStageStep[stage])
    }
    expect(Object.keys(guidedStageStep).sort()).toEqual(['frame', 'intake', 'refine', 'ship', 'story'])
  })
})

describe('deriveGuidedStep', () => {
  it('starts on the first step for a deck with nothing in it', () => {
    const state = deriveGuidedStep(deckInput({ slides: [createSlide()] }))
    expect(state.step).toBe('screenshots')
    expect(state.stepNumber).toBe(1)
    expect(state.stepCount).toBe(4)
    expect(state.complete).toBe(false)
    expect(state.status).toContain('No screenshots yet')
  })

  it('moves on once every slide has a screenshot', () => {
    // Both slides are captured but styled differently, and neither has a
    // headline yet, so the look step is the first one still outstanding.
    const deck = deckInput({
      slides: [
        withCapture(createSlide(), { title: '', deviceFrameId: 'iphone' }),
        withCapture(createSlide(), { id: 'slide-2', title: '', deviceFrameId: 'android' }),
      ],
    })
    expect(doneSteps(deck).screenshots).toBe(true)
    expect(doneSteps(deck).look).toBe(false)
    expect(deriveGuidedStep(deck).step).toBe('look')
  })

  it('waits on the look step while the phone styles differ across the deck', () => {
    const deck = deckInput({
      slides: [
        withHeadline(createSlide(), { deviceFrameId: 'iphone' }),
        withHeadline(createSlide(), { id: 'slide-2', deviceFrameId: 'android' }),
      ],
    })
    const state = deriveGuidedStep(deck)
    expect(state.steps.find((entry) => entry.id === 'look')?.done).toBe(false)
    expect(state.step).toBe('look')
    expect(state.mixedFraming).toBe(true)
    expect(state.status).toContain('different phone styles')
  })

  it('finishes the look step once the deck shares one phone style', () => {
    const deck = deckInput({
      slides: [
        withHeadline(createSlide(), { deviceFrameId: 'none' }),
        withHeadline(createSlide(), { id: 'slide-2', deviceFrameId: 'none' }),
      ],
    })
    expect(deriveGuidedStep(deck).steps.find((entry) => entry.id === 'look')?.done).toBe(true)
    expect(deriveGuidedStep(deck).deviceNames).toEqual(['No frame'])
  })

  it('waits on the words step while a slide has no headline', () => {
    const deck = deckInput({
      slides: [
        withHeadline(createSlide()),
        withCapture(createSlide(), { id: 'slide-2', title: '   ' }),
      ],
    })
    const state = deriveGuidedStep(deck)
    expect(state.steps.find((entry) => entry.id === 'words')?.done).toBe(false)
    expect(state.step).toBe('words')
    expect(state.slidesWithoutHeadline).toEqual([2])
    expect(state.status).toContain('No headline on slide 2')
  })

  it('reads the headline in the active locale, not the default one', () => {
    // Copy that exists only in Spanish: the words step is done when Spanish is
    // the preview locale and outstanding when the source locale is shown.
    const spanishOnly = withCapture(createSlide(), {
      title: '',
      translations: { 'es-ES': { title: 'Dia de lanzamiento', subtitle: '' } },
    })
    expect(deriveGuidedStep(deckInput({ slides: [spanishOnly], activeLocale: 'es-ES' })).slidesWithoutHeadline).toEqual([])
    expect(deriveGuidedStep(deckInput({ slides: [spanishOnly] })).slidesWithoutHeadline).toEqual([1])
  })

  it('keeps the download step open while preflight blocks the export', () => {
    const blocked = preflight({ issues: [issue('blocking', 'Slide 1 has no capture.', [1])] })
    const state = deriveGuidedStep(deckInput({ preflight: blocked }))
    expect(state.blocked).toBe(true)
    expect(state.steps.find((entry) => entry.id === 'download')?.done).toBe(false)
    expect(state.step).toBe('download')
    expect(state.complete).toBe(false)
    expect(state.status).toContain('Open More options to see them')
  })

  it('reports a finished deck on the download step', () => {
    const state = deriveGuidedStep(deckInput())
    expect(state.complete).toBe(true)
    expect(state.step).toBe('download')
    expect(state.steps.every((entry) => entry.done)).toBe(true)
    expect(state.status).toContain('Ready to download 1 image')
  })

  it('counts warnings without blocking the download step', () => {
    const warned = preflight({ issues: [issue('warning', 'Long line on slide 1.', [1])] })
    const state = deriveGuidedStep(deckInput({ preflight: warned }))
    expect(state.warningCount).toBe(1)
    expect(state.blocked).toBe(false)
    expect(state.complete).toBe(true)
    expect(state.status).toContain('1 check to review')
  })

  it('never derives a step outside the four defined steps', () => {
    const decks = [
      deckInput(),
      deckInput({ slides: [createSlide()] }),
      deckInput({ slides: [] }),
      deckInput({ preflight: preflight({ status: 'blocked', issues: [] }) }),
    ]
    for (const deck of decks) {
      const state = deriveGuidedStep(deck)
      expect(guidedStepIds).toContain(state.step)
      expect(state.steps).toHaveLength(4)
      expect(state.stepNumber).toBe(guidedStepIds.indexOf(state.step) + 1)
    }
  })
})

describe('guidedStepStatus', () => {
  it('describes the step on screen, not only the one the deck needs', () => {
    const state = deriveGuidedStep(deckInput({ slides: [createSlide()] }))
    expect(state.step).toBe('screenshots')
    expect(guidedStepStatus(state)).toBe(state.status)
    expect(guidedStepStatus(state, 'screenshots')).toContain('No screenshots yet')
    expect(guidedStepStatus(state, 'download')).toContain('Ready to download')
  })
})

describe('guidedPrimaryAction', () => {
  it('asks for screenshots while a slide is still missing one', () => {
    expect(guidedPrimaryAction(deriveGuidedStep(deckInput({ slides: [createSlide()] }))))
      .toEqual({ label: 'Add my screenshots', kind: 'add-screenshots' })
  })

  it('moves on once the first step is finished', () => {
    const finished = deriveGuidedStep(deckInput())
    // A finished deck sits on the download step, so the first step's move-on
    // action is asserted against that state directly.
    expect(guidedPrimaryAction({ ...finished, step: 'screenshots' }))
      .toEqual({ label: 'Next: choose a look', kind: 'next' })
  })

  it('has one move-on action for each middle step', () => {
    const look = deriveGuidedStep(deckInput({ slides: [withCapture(createSlide())] }))
    expect(guidedPrimaryAction({ ...look, step: 'look' })).toEqual({ label: 'Next: write your words', kind: 'next' })
    expect(guidedPrimaryAction({ ...look, step: 'words' })).toEqual({ label: 'Next: download', kind: 'next' })
  })

  it('is the download on the last step, and says so when the deck is blocked', () => {
    expect(guidedPrimaryAction(deriveGuidedStep(deckInput())))
      .toEqual({ label: 'Download my slides', kind: 'download' })

    const blocked = deriveGuidedStep(deckInput({
      preflight: preflight({ issues: [issue('blocking', 'Slide 1 has no capture.', [1])] }),
    }))
    expect(guidedPrimaryAction(blocked)).toEqual({ label: 'Download is not ready yet', kind: 'download' })
  })
})
