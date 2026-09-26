import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createSlide, exportProfiles } from '../data'
import { runExportPreflight } from '../lib/exportPreflight'
import { resolveFlowboardExportGate } from '../lib/flowboardExportState'
import type { FlowboardProps } from './Flowboard'
import { GuidedShell } from './GuidedShell'
import { collectIds, makeFlowboardProps } from '../test/flowboardProps'
import type { Slide } from '../types'

/**
 * Server-render tests for the guided shell.
 *
 * The repository has no DOM test environment, so each step is reached by
 * rendering a deck the step derivation lands on, and the markup is inspected.
 * These are the guarantees guided mode makes to a first-time author: the four
 * steps, one primary action per step, plain wording, an honest export reason,
 * and a Full Editor that is still one click away.
 */

const withCapture = (slide: Slide, overrides: Partial<Slide> = {}): Slide => ({
  ...slide,
  screenshot: 'data:image/png;base64,iVBORw0KGgo=',
  screenshotName: 'capture.png',
  ...overrides,
})

const render = (props: FlowboardProps) => renderToStaticMarkup(createElement(GuidedShell, props))

/** Deck plus the preflight result the editor would hold for it. */
const deckProps = (slides: Slide[], overrides: Partial<FlowboardProps> = {}): FlowboardProps => {
  const preflight = runExportPreflight({ profile: exportProfiles[0], slides, activeLocale: 'en-US' })
  return makeFlowboardProps({
    projectName: 'Launch deck',
    slides,
    selectedSlide: slides[0],
    exportTotal: slides.length,
    preflight,
    ...overrides,
  })
}

/** One slide with no screenshot, so the flow opens on step 1. */
const screenshotsProps = () => deckProps([createSlide()])

/** Two captured slides with different phone styles, so the flow lands on step 2. */
const lookProps = () => deckProps([
  withCapture(createSlide(), { title: 'Ship it', deviceFrameId: 'iphone' }),
  withCapture(createSlide(), { id: 'slide-2', title: 'Grow it', deviceFrameId: 'android' }),
])

/** One captured slide with no headline, so the flow lands on step 3. */
const wordsProps = () => deckProps([withCapture(createSlide(), { title: '', subtitle: '' })])

/** A finished deck, so the flow lands on step 4. */
const downloadProps = () => deckProps([
  withCapture(createSlide(), { title: 'Ship it', deviceFrameId: 'iphone' }),
  withCapture(createSlide(), { id: 'slide-2', title: 'Grow it', deviceFrameId: 'iphone' }),
])

describe('GuidedShell', () => {
  it('opens on Add your screenshots with a progress indicator and four steps', () => {
    const markup = render(screenshotsProps())
    expect(markup).toContain('data-guided-step="screenshots"')
    expect(markup).toContain('Step 1 of 4')
    expect(markup).toContain('Add your screenshots')
    for (const title of ['Choose a look', 'Write your words', 'Download']) {
      expect(markup).toContain(title)
    }
    // Exactly one step is current, and it is the one on screen.
    expect([...markup.matchAll(/aria-current="step"/g)]).toHaveLength(1)
    expect(markup).toContain('No screenshots yet')
  })

  it('reaches the look, words, and download steps on the decks that need them', () => {
    expect(render(lookProps())).toContain('data-guided-step="look"')
    expect(render(wordsProps())).toContain('data-guided-step="words"')
    expect(render(downloadProps())).toContain('data-guided-step="download"')
    expect(render(downloadProps())).toContain('Step 4 of 4')
  })

  it('names the things a beginner needs to recognise, not the internals', () => {
    const screenshots = render(screenshotsProps())
    expect(screenshots).toContain('Your slides')
    expect(screenshots).toContain('No screenshot yet')
    expect(screenshots).toContain('Slide 1 still needs a screenshot.')
    // None of the Flowboard stage surfaces are on a guided step.
    for (const stageCopy of ['Drop app captures here', 'Contact sheet', 'Every capture, side by side', 'Four things worth doing']) {
      expect(screenshots).not.toContain(stageCopy)
    }

    const look = render(lookProps())
    // Phone style, and the fit in the words a beginner would use.
    expect(look).toContain('Phone style')
    expect(look).toContain('iPhone frame')
    expect(look).toContain('No phone frame')
    expect(look).toContain('Show the whole screenshot')
    expect(look).toContain('Fill the frame')
    // The deck in this fixture mixes phone styles, and the copy says so rather
    // than claiming the deck already agrees.
    expect(look).toContain('do not all use the same style yet')
    // A deck that agrees on the phone style but not on the status bar says the
    // same kind of thing about the status bar.
    const mixedStatusBar = deckProps([
      withCapture(createSlide(), { title: 'Ship it', deviceFrameId: 'iphone', showDeviceStatusBar: true }),
      withCapture(createSlide(), { id: 'slide-2', title: 'Grow it', deviceFrameId: 'iphone', showDeviceStatusBar: false }),
    ])
    expect(render(mixedStatusBar)).toContain('Some of your slides show the status bar and some do not')

    const words = render(wordsProps())
    expect(words).toContain('Headline')
    expect(words).toContain('Supporting text (optional)')
    expect(words).toContain('Add another slide')
  })

  it('gives every step exactly one primary action, in the sticky footer', () => {
    for (const props of [screenshotsProps(), lookProps(), wordsProps(), downloadProps()]) {
      const markup = render(props)
      // One primary control per step: the footer's own action.
      expect([...markup.matchAll(/button--primary/g)]).toHaveLength(1)
      expect(markup).toContain('guided-footer__primary')
      // The footer always offers Back, the primary action, and Skip.
      expect(markup).toContain('Skip this step')
      expect(markup).toContain('guided-footer')
    }
  })

  it('keeps Back and Skip honest about where they can go', () => {
    const first = render(screenshotsProps())
    // There is nothing before step 1, so Back is disabled and simply reads Back.
    expect(first).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]{0,80}?<\/span> Back<\/button>/)
    // Skip is still offered, because the author is allowed to move on.
    expect(first).toMatch(/<button[^>]*>Skip this step<\/button>/)

    const last = render(downloadProps())
    // And nothing after the download step.
    expect([...last.matchAll(/<button[^>]*disabled=""[^>]*>[\s\S]{0,80}?Skip this step<\/button>/g)]).toHaveLength(1)
    expect(last).toContain('Back to your words')
  })

  it('hides the complex controls behind a closed More options disclosure', () => {
    for (const props of [screenshotsProps(), lookProps(), wordsProps(), downloadProps()]) {
      const markup = render(props)
      expect(markup).toContain('More options')
      expect(markup).toContain('aria-expanded="false"')
      expect(markup).toContain('aria-controls="guided-more-options"')
      // The existing stage is rendered in place only once the panel is opened,
      // so a closed step really is free of the full control set.
      expect(markup).not.toContain('id="guided-more-options"')
      expect(markup).not.toContain('flowboard-panel')
      expect(markup).not.toContain('flowboard-rail')
      expect(markup).not.toContain('preflight-panel')
    }
  })

  it('offers Refine as an advanced link on the look and write steps only', () => {
    expect(render(lookProps())).toContain('Adjust layers and positions (advanced)')
    expect(render(wordsProps())).toContain('Adjust layers and positions (advanced)')
    // Never a step of its own, and not offered where it would only confuse.
    expect(render(screenshotsProps())).not.toContain('Adjust layers and positions (advanced)')
    expect(render(downloadProps())).not.toContain('Adjust layers and positions (advanced)')
  })

  it('offers a clear Guided / Full editor switch', () => {
    const markup = render(screenshotsProps())
    expect(markup).toContain('editor-mode-switch')
    expect(markup).toContain('>Guided<')
    expect(markup).toContain('Full editor')
    // Guided is the pressed side of the switch while guided mode is on screen,
    // and the switch hands the mode back to the App rather than owning it.
    expect(markup).toMatch(/editor-mode-switch__option is-active"[^>]*aria-pressed="true"/)
  })

  it('does not repeat form ids between the guided shell and the shared canvas', () => {
    const ids = collectIds(render(wordsProps()))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('guided-headline')
    expect(ids).toContain('guided-project-name')
  })
})

describe('GuidedShell export gate', () => {
  it('offers the download on a finished deck, with a plain-language label', () => {
    const props = downloadProps()
    expect(resolveFlowboardExportGate({
      exportStatus: props.exportStatus,
      preflight: props.preflight,
      slideCount: props.slides.length,
      completed: props.exportCompleted,
      total: props.exportTotal,
    }).enabled).toBe(true)

    const markup = render(props)
    expect(markup).toContain('Download my slides')
    expect(markup).toContain('Save the project file')
    expect(markup).toContain('Image size')
  })

  it('disables the download and states the reason as visible text when blocked', () => {
    // A deck that reaches the download step but cannot be exported: preflight
    // blocks on a hidden required layer.
    const slide = withCapture(createSlide(), { title: 'Ship it' })
    slide.layerSettings['headline'].visible = false
    const props = deckProps([slide])
    expect(props.preflight.status).toBe('blocked')

    const markup = render(props)
    expect(markup).toContain('data-guided-step="download"')
    // The reason is readable on the page, as text in a status region.
    expect(markup).toContain(props.preflight.blockingIssues[0].message)
    expect(markup).toContain('Download is not ready yet')
    expect(markup).toContain('Show me the checks')
    expect(markup).toContain('guided-gate__message')
    // The control explains itself too, rather than being a dead button.
    expect(markup).toContain('aria-describedby="guided-primary-hint"')
    expect(markup).toContain('Export blocked on slide 1')
  })
})
