import { describe, expect, it } from 'vitest'
import { createTestSlide, VALID_PNG_DATA_URL } from '../test/projectFixtures'
import { AUTHORING_CANVAS_ID } from './deviceVariants'
import { formatPreflightIssueLocation, runExportPreflight, type ExportPreflightIssue } from './exportPreflight'
import type { ExportProfile } from '../types'
import { exportProfiles } from '../data'

const profile = (id: ExportProfile['id'] = 'app-store'): ExportProfile =>
  exportProfiles.find((entry) => entry.id === id) ?? exportProfiles[0]

const variant = (overrides: Record<string, unknown> = {}) => ({
  id: 'variant-iphone',
  name: 'iPhone',
  canvasId: AUTHORING_CANVAS_ID,
  locale: 'en-US' as const,
  themeId: 'midnight' as const,
  slideIds: ['slide-1', 'slide-2'],
  enabled: true,
  exportProfileId: profile().id,
  ...overrides,
})

const capture = { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' }

const deck = (overrides: Array<Record<string, unknown>> = [{}, {}]) =>
  overrides.map((fields, index) => createTestSlide({ id: `slide-${index + 1}`, ...fields } as never))

const run = (slides: ReturnType<typeof deck>, variants: ReturnType<typeof variant>[]) =>
  runExportPreflight({
    profile: profile(),
    slides,
    activeLocale: 'en-US',
    variants,
  })

describe('preflight variant dimension', () => {
  it('reports nothing extra for a deck whose default variant has no overrides', () => {
    const result = run(deck(), [variant()])
    expect(result.issues.map((issue) => issue.code)).not.toContain('missing-variant-capture')
    expect(result.issues.map((issue) => issue.code)).not.toContain('unsupported-device-variant')
  })

  it('blocks a variant that renders a slide the base deck has no capture for', () => {
    const slides = deck([{}, { screenshot: null, screenshotName: null }])
    const result = run(slides, [variant({ id: 'variant-pixel', name: 'Pixel' })])

    const issue = result.issues.find((entry) => entry.code === 'missing-variant-capture')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('blocking')
    // Still 1-based positions into the authoring deck, never variant positions.
    expect(issue?.slideNumbers).toEqual([2])
    expect(issue?.variantId).toBe('variant-pixel')
    expect(issue?.variantName).toBe('Pixel')
    expect(result.status).toBe('blocked')
  })

  it('does not report a missing capture a variant supplies itself', () => {
    const slides = deck([{}, { screenshot: null, screenshotName: null }])
    const result = run(slides, [variant({ deviceOverrides: [{ slideId: 'slide-2', screenshot: capture }] })])
    expect(result.issues.map((issue) => issue.code)).not.toContain('missing-variant-capture')
  })

  it('ignores a disabled variant', () => {
    const slides = deck([{}, { screenshot: null, screenshotName: null }])
    const result = run(slides, [variant({ enabled: false })])
    // The base deck check still reports the missing capture; the variant does not.
    expect(result.issues.map((issue) => issue.code)).not.toContain('missing-variant-capture')
  })

  it('ignores a variant aimed at a different profile', () => {
    const slides = deck([{}, { screenshot: null, screenshotName: null }])
    const result = run(slides, [variant({ exportProfileId: 'google-play' })])
    expect(result.issues.map((issue) => issue.code)).not.toContain('missing-variant-capture')
  })

  it('names the first blocking variant, so the list is deterministic', () => {
    const slides = deck([{}, { screenshot: null, screenshotName: null }])
    const result = run(slides, [
      variant({ id: 'variant-ok', name: 'OK', deviceOverrides: [{ slideId: 'slide-2', screenshot: capture }] }),
      variant({ id: 'variant-pixel', name: 'Pixel' }),
      variant({ id: 'variant-ipad', name: 'iPad' }),
    ])
    const issues = result.issues.filter((entry) => entry.code === 'missing-variant-capture')
    expect(issues).toHaveLength(2)
    expect(issues.map((issue) => issue.variantName)).toEqual(['Pixel', 'iPad'])
  })

  it('blocks a variant naming a device frame the catalog does not have', () => {
    const result = run(deck(), [variant({ deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'pixel-99' }] })])

    const issue = result.issues.find((entry) => entry.code === 'unsupported-device-variant')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('blocking')
    expect(issue?.slideNumbers).toEqual([1])
    expect(issue?.variantName).toBe('iPhone')
    expect(issue?.message).toContain('pixel-99')
    expect(result.status).toBe('blocked')
  })

  it('accepts an older device frame spelling a variant carries', () => {
    const result = run(deck(), [variant({ deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'iphone-x' }] })])
    expect(result.issues.map((issue) => issue.code)).not.toContain('unsupported-device-variant')
  })
})

describe('formatPreflightIssueLocation', () => {
  const issue = (fields: Partial<ExportPreflightIssue>): ExportPreflightIssue => ({
    code: 'missing-variant-capture',
    severity: 'blocking',
    message: 'x',
    slideNumbers: [],
    ...fields,
  })

  /**
   * The ambiguity, decided once: `slideNumbers` stays a 1-based index into the
   * authoring deck, so `slides[slideNumber - 1]` and the "Open slide" button
   * keep working, and the variant is appended as a label rather than threaded
   * through as a second coordinate system.
   */
  it('appends the variant name after the slide position', () => {
    expect(formatPreflightIssueLocation(issue({ slideNumbers: [2], variantName: 'iPhone' }))).toBe('Slide 2 · iPhone')
  })

  it('says Project when the issue is about the project, not a slide', () => {
    expect(formatPreflightIssueLocation(issue({ slideNumbers: [] }))).toBe('Project')
    // A variant-scoped issue still names the variant: that is the only thing
    // distinguishing it from the same problem in the deck.
    expect(formatPreflightIssueLocation(issue({ slideNumbers: [], variantName: 'iPhone' }))).toBe('Project · iPhone')
  })

  it('lists every slide for a multi-slide issue', () => {
    expect(formatPreflightIssueLocation(issue({ slideNumbers: [2, 5], variantName: 'iPhone' }))).toBe('Slides 2, 5 · iPhone')
  })

  it('omits the separator when the issue is not variant-scoped', () => {
    expect(formatPreflightIssueLocation(issue({ code: 'missing-screenshot', slideNumbers: [1] }))).toBe('Slide 1')
  })
})
