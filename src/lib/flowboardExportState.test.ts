import { describe, expect, it } from 'vitest'
import { runExportPreflight } from './exportPreflight'
import { createDemoProject } from './demoProject'
import { createDefaultOutputVariant } from './deviceVariants'
import { planExportEntries, unassignedExportRefusal } from './exportPlan'
import { exportProfiles, createSlide } from '../data'
import {
  formatIssueSlideNumbers,
  resolveFlowboardExportGate,
} from './flowboardExportState'

const profile = exportProfiles[0]
const demoSlides = createDemoProject().slides

/** A deck that passes preflight, so the gate is not blocked by default. */
const readyPreflight = runExportPreflight({
  profile,
  slides: demoSlides,
  activeLocale: 'en-US',
})

/** A deck with no capture, which the profile blocks. */
const blockedPreflight = runExportPreflight({
  profile,
  slides: [createSlide()],
  activeLocale: 'en-US',
})

const gate = (overrides: Partial<Parameters<typeof resolveFlowboardExportGate>[0]> = {}) =>
  resolveFlowboardExportGate({
    exportStatus: 'idle',
    preflight: readyPreflight,
    slideCount: 3,
    ...overrides,
  })

describe('flowboard export gate', () => {
  it('enables the export when preflight passes and nothing is running', () => {
    const result = gate()
    expect(result.enabled).toBe(true)
    expect(result.reason).toBe('ready')
    expect(result.blocked).toBe(false)
    expect(result.exporting).toBe(false)
    expect(result.label).toBe('Export PNGs as a ZIP')
    expect(result.message).toContain('3 slides')
  })

  it('blocks on a preflight failure and keeps the slide numbers in the message', () => {
    const result = gate({ preflight: blockedPreflight, slideCount: 1 })
    expect(blockedPreflight.status).toBe('blocked')
    expect(result.enabled).toBe(false)
    expect(result.reason).toBe('blocked')
    expect(result.blocked).toBe(true)
    expect(result.label).toBe('Resolve blocking checks')
    expect(result.slideNumbers).toEqual([1])
    expect(result.message).toBe(`Export blocked on slide 1: ${blockedPreflight.blockingIssues[0].message}`)
  })

  it('keeps blocking a blocked deck even while the status still reads validation', () => {
    const result = gate({ preflight: blockedPreflight, exportStatus: 'validation', slideCount: 1 })
    expect(result.enabled).toBe(false)
    expect(result.reason).toBe('blocked')
  })

  it('reports a running export with progress and never reads 0/0', () => {
    const running = gate({ exportStatus: 'exporting', completed: 0, total: 0 })
    expect(running.enabled).toBe(false)
    expect(running.reason).toBe('exporting')
    expect(running.exporting).toBe(true)
    expect(running.label).toBe('Exporting 0/3')

    const half = gate({ exportStatus: 'exporting', completed: 2, total: 3 })
    expect(half.label).toBe('Exporting 2/3')
    expect(half.message).toContain('2 of 3')
  })

  it('never lets progress exceed the slides it was started with', () => {
    const result = gate({ exportStatus: 'exporting', completed: 5, total: 3 })
    expect(result.label).toBe('Exporting 5/5')
  })

  it('keeps warnings non-blocking and says so', () => {
    const preflight = {
      ...readyPreflight,
      status: 'warnings' as const,
      issues: [{
        code: 'dimension-warning' as const,
        severity: 'warning' as const,
        message: 'Slide 1 is not the store aspect ratio.',
        slideNumbers: [1],
      }],
      warningIssues: [{
        code: 'dimension-warning' as const,
        severity: 'warning' as const,
        message: 'Slide 1 is not the store aspect ratio.',
        slideNumbers: [1],
      }],
    }
    const result = gate({ preflight })
    expect(result.enabled).toBe(true)
    expect(result.reason).toBe('warnings')
    expect(result.warningCount).toBe(1)
    expect(result.message).toContain('1 warning')
    expect(result.message).toContain('do not block')
  })

  it('offers a retry after a failed run and a second run after a good one', () => {
    expect(gate({ exportStatus: 'error' }).label).toBe('Try the export again')
    expect(gate({ exportStatus: 'success' }).label).toBe('Export again')
    expect(gate({ exportStatus: 'error' }).enabled).toBe(true)
  })

  /**
   * The input that closes the silent-empty-plan hole: a deck that passes every
   * preflight check, and a plan with no files in it.
   *
   * The two are independent and either can be true alone, which is the whole
   * reason this is a third input rather than another preflight issue code. The
   * preflight checks the deck against the profile and finds nothing wrong; the
   * plan finds that no variant targets the profile. Only the second one knows
   * the export would write nothing.
   */
  const readyPreflightWithEmptyPlan = runExportPreflight({
    profile,
    slides: demoSlides,
    activeLocale: 'en-US',
  })

  const unassignedPlan = planExportEntries({
    slides: demoSlides,
    variants: [createDefaultOutputVariant({
      slideIds: demoSlides.map((slide) => slide.id),
      locale: 'en-US',
      themeId: 'midnight',
      exportProfileId: 'app-store',
    })],
    // Every variant in the demo deck aims elsewhere, so nothing targets this.
    profileId: 'google-play',
    requiresScreenshot: true,
  })

  it('blocks a plan with no files in it, even though preflight passes', () => {
    expect(readyPreflightWithEmptyPlan.status).not.toBe('blocked')
    expect(unassignedPlan.entries).toHaveLength(0)
    expect(unassignedPlan.blocked).toBeNull()
    expect(unassignedPlan.unassigned?.reason).toBe('no-variant-for-profile')

    const result = gate({ preflight: readyPreflightWithEmptyPlan, unassigned: unassignedPlan.unassigned })
    expect(result.enabled).toBe(false)
    expect(result.reason).toBe('unassigned')
    // The flag every surface already reads, so the top bar and the guided step
    // cannot enable a control the Ship stage has disabled.
    expect(result.blocked).toBe(true)
    expect(result.message).toBe(unassignedExportRefusal(unassignedPlan.unassigned!))
  })

  it('prefers a blocking preflight issue over an empty plan, so the first fix is named', () => {
    const result = gate({ preflight: blockedPreflight, unassigned: unassignedPlan.unassigned, slideCount: 1 })
    expect(result.reason).toBe('blocked')
    expect(result.enabled).toBe(false)
  })

  it('keeps the ready gate unchanged when the plan has files in it', () => {
    const plan = planExportEntries({
      slides: demoSlides,
      variants: [createDefaultOutputVariant({
        slideIds: demoSlides.map((slide) => slide.id),
        locale: 'en-US',
        themeId: 'midnight',
        exportProfileId: profile.id,
      })],
      profileId: profile.id,
      requiresScreenshot: true,
    })
    expect(plan.unassigned).toBeNull()
    expect(gate({ unassigned: plan.unassigned }).reason).toBe('ready')
  })

  it('formats issue slide numbers the way the Ship stage reads them out', () => {
    expect(formatIssueSlideNumbers([])).toBe('')
    expect(formatIssueSlideNumbers([2])).toBe('slide 2')
    expect(formatIssueSlideNumbers([1, 2, 3])).toBe('slides 1, 2, 3')
  })

  it('stays blocked when a blocked status carries no issue to name', () => {
    const result = gate({ preflight: { ...readyPreflight, status: 'blocked', blockingIssues: [] }, slideCount: 2 })
    expect(result.enabled).toBe(false)
    expect(result.reason).toBe('blocked')
    expect(result.slideNumbers).toEqual([])
    expect(result.message).toContain('resolve the blocking checks')
  })
})
