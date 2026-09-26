import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  evaluateFlowboardStages,
  type FlowboardStageSummary,
} from '../lib/flowboardStages'
import { buildFlowboardChecklist } from '../lib/flowboardStages'
import { makeFlowboardProps } from '../test/flowboardProps'
import { FlowboardRightRail } from './flowboard/FlowboardRightRail'
import { FlowboardSteps } from './flowboard/FlowboardSteps'

/**
 * The Full Editor has one rail, and this file covers the two things that live in
 * it: the stage navigation that used to be a left column of its own, and the
 * rail that wraps the deck context and the common actions around it.
 */

const noop = () => undefined

const deckInput = (overrides: Partial<Parameters<typeof evaluateFlowboardStages>[0]> = {}) => {
  const props = makeFlowboardProps()
  return {
    projectName: props.projectName,
    slides: props.slides,
    activeLocale: props.activeLocale,
    preflight: props.preflight,
    persistenceNeedsAttention: false,
    ...overrides,
  }
}

const renderSteps = (stages: FlowboardStageSummary[], activeId = stages[0].id, variant?: 'rail' | 'bar') =>
  renderToStaticMarkup(createElement(FlowboardSteps, { stages, activeId, onSelect: noop, variant }))

const renderRail = (overrides: Partial<Parameters<typeof FlowboardRightRail>[0]> = {}) => {
  const props = makeFlowboardProps()
  const input = deckInput()
  const stages = evaluateFlowboardStages(input)
  return renderToStaticMarkup(createElement(FlowboardRightRail, {
    activeStage: stages[0],
    stages,
    onSelectStage: noop,
    checklist: buildFlowboardChecklist(input),
    slides: props.slides,
    captureCount: props.slides.filter((slide) => slide.screenshot).length,
    profile: props.profile,
    preflight: props.preflight,
    persistenceStatus: props.persistenceStatus,
    persistenceDetail: props.persistenceDetail,
    projectValidationNotice: null,
    exportStatus: 'idle',
    exportDetail: '',
    onOpenGuide: noop,
    onShowClassicEditor: noop,
    onEditorModeChange: noop,
    ...overrides,
  }))
}

const countOf = (markup: string, needle: string) => markup.split(needle).length - 1

describe('the rail stage navigation', () => {
  const stages = evaluateFlowboardStages(deckInput())

  it('lists all five stages compactly, with the state and no repeated prose', () => {
    const markup = renderSteps(stages)
    expect(countOf(markup, 'class="flowboard-step ')).toBe(5)
    // Compact: the name, the state, and nothing else. The purpose and the detail
    // are one line of context in the rail, not a paragraph on every entry.
    expect(markup).not.toContain('flowboard-step__purpose')
    expect(markup).not.toContain('flowboard-step__detail')
    for (const stage of stages) {
      expect(markup).toContain(`>${stage.name}</span>`)
      // The full sentence is still there for a screen reader.
      expect(markup).toContain(`aria-label="${stage.name} stage, ${stage.stateLabel}. ${stage.purpose}"`)
    }
  })

  it('keeps one tab stop on the active stage', () => {
    const markup = renderSteps(stages, 'story')
    expect(countOf(markup, 'tabindex="0"')).toBe(1)
    expect(countOf(markup, 'tabindex="-1"')).toBe(4)
    expect(markup).toContain('aria-current="step"')
  })

  it('renders the horizontal variant without the rail heading', () => {
    const markup = renderSteps(stages, 'ship', 'bar')
    expect(markup).toContain('flowboard-steps--bar')
    expect(markup).toContain('aria-label="Editor steps"')
    // The bar is a selector, not a second rail, so it does not claim a heading.
    expect(markup).not.toContain('flowboard-steps__heading')
    expect(countOf(markup, 'class="flowboard-step ')).toBe(5)
  })
})

describe('the one rail', () => {
  it('carries the steps, the deck facts, the actions, and the mode switch', () => {
    const markup = renderRail()
    // Stage navigation, in the rail.
    expect(markup).toContain('flowboard-steps--rail')
    expect(countOf(markup, 'class="flowboard-step ')).toBe(5)
    // Deck context, once.
    expect(markup).toContain('Deck at a glance')
    expect(markup).toContain('Captures')
    expect(markup).toContain('Setup')
    // A way to the next stage that is not the step list.
    expect(markup).toContain('Up next')
    // The common actions and both ways out of the Full editor.
    expect(markup).toContain('Editor guide')
    expect(markup).toContain('Classic editor')
    expect(markup).toContain('editor-mode-switch')
    expect(markup).toMatch(/editor-mode-switch__option is-active"[^>]*aria-pressed="true"/)
  })

  it('states each stage state once, on its own entry', () => {
    const stages = evaluateFlowboardStages(deckInput())
    const markup = renderRail()
    const nextStage = stages[1]
    for (const label of ['Ready', 'Needs attention', 'Not started']) {
      const inStages = stages.filter((stage) => stage.stateLabel === label).length
      // The state word appears on the entry that owns it, plus once on the
      // up-next card when that stage is in this state. It is not printed again
      // as a badge above the list.
      const expected = inStages + (nextStage.stateLabel === label ? 1 : 0)
      expect(countOf(markup, `>${label}</span>`)).toBe(expected)
    }
    expect(markup).not.toContain('flowboard-rail__state')

    // The block that explains the active stage carries its reason, not a second
    // copy of the state the entry above it already shows.
    const now = markup.slice(markup.indexOf('flowboard-rail__now'), markup.indexOf('flowboard-rail__section'))
    for (const stage of stages) {
      expect(now).not.toContain(stage.stateLabel)
    }
  })

  it('says why the active stage is in its state, once', () => {
    const stages = evaluateFlowboardStages(deckInput())
    const markup = renderRail({ activeStage: stages[3] })
    expect(markup).toContain('Now in Refine')
    expect(markup).toContain(stages[3].detail)
    // The reminder line belongs to the stage header, so it is not repeated here.
    expect(markup).not.toContain(stages[3].reminder)
  })

  it('has no close button when it is a permanent column', () => {
    const markup = renderRail()
    expect(markup).not.toContain('flowboard-rail-close')
    expect(markup).not.toContain('aria-label="Close steps and deck context"')
  })

  it('owns a close button when it is a sheet', () => {
    const markup = renderRail({ dismissible: true, onDismiss: noop })
    expect(markup).toContain('id="flowboard-rail-close"')
    expect(markup).toContain('aria-label="Close steps and deck context"')
  })
})

describe('the rail stylesheet', () => {
  const css = readFileSync(new URL('./flowboard/flowboard.css', import.meta.url), 'utf8')

  it('keeps the sheet rules inside the two narrow breakpoints', () => {
    // The rail is fixed only where it is a sheet, and the phone gets a side
    // sheet rather than a bottom one.
    expect(css).toMatch(/@media \(max-width: 1199px\) \{[\s\S]*?\.flowboard-rail-wrap \{[\s\S]*?translateY\(101%\);/)
    expect(css).toMatch(/@media \(max-width: 767px\) \{[\s\S]*?\.flowboard-rail-wrap \{[\s\S]*?translateX\(101%\);/)
    // A closed sheet is invisible as well as translated, so it cannot be seen
    // or reached before the author opens it.
    expect(css).toMatch(/\.flowboard-rail-wrap \{[\s\S]*?visibility: hidden;/)
  })

  it('shows the rail toggle wherever the rail is a sheet', () => {
    expect(css).toMatch(/\.flowboard-rail-toggle \{\n  display: none;/)
    expect(css).toMatch(/@media \(max-width: 1199px\) \{[\s\S]*?\.flowboard-rail-toggle \{\n    display: inline-flex;/)
  })

  it('never sets type below the readable floor in the rail', () => {
    const railRules = css.slice(css.indexOf('/* The one rail:'), css.indexOf('/* Main stage area */'))
    for (const match of railRules.matchAll(/font-size:\s*([\d.]+)px/g)) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(12)
    }
  })
})
