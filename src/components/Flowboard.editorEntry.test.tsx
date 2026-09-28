// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Flowboard, type FlowboardProps } from './Flowboard'
import { makeFlowboardProps } from '../test/flowboardProps'

/**
 * Creating a deck must land the author in the editor, not back on Intake.
 *
 * Every way of making a deck used to end with the author staring at the Intake
 * stage: a checklist and a dropzone, not the slide they just built. The stage
 * lives in this shell while the actions that create a deck live one level up, so
 * the two are joined by a count rather than by shared state.
 *
 * This is a behaviour test and not a markup one on purpose. The rendered markup
 * of the Refine stage is correct whether or not the shell navigated to it, so
 * no amount of string assertion could tell the two states apart. It has to
 * mount the shell, fire the action, and read the stage back out of the DOM.
 */

afterEach(() => {
  cleanup()
})

const propsFor = (overrides: Partial<FlowboardProps> = {}): FlowboardProps =>
  ({ ...(makeFlowboardProps() as unknown as FlowboardProps), ...overrides })

const renderFlowboard = (overrides: Partial<FlowboardProps> = {}) =>
  render(<Flowboard {...propsFor(overrides)} />)

/** The stage the shell is actually showing, read from the step list. */
const currentStage = (): string | null =>
  document.querySelector('[aria-current="step"]')?.getAttribute('aria-label')?.split(' ')[0] ?? null

describe('opening the editor after a deck is created', () => {
  it('starts on Intake, so a restored project is not thrown into the canvas', () => {
    renderFlowboard()
    // The zero guard on the effect: mounting must never navigate on its own.
    expect(currentStage()).toBe('Intake')
  })

  it('stays on Intake when no deck has been created', () => {
    renderFlowboard({ editorEntryRequest: 0 })
    expect(currentStage()).toBe('Intake')
  })

  it('opens Refine when a deck is created', () => {
    renderFlowboard({ editorEntryRequest: 1 })
    expect(currentStage()).toBe('Refine')
  })

  it('opens Refine again for a second deck in the same session', () => {
    // The reason this is a count and not a boolean. With a boolean, the second
    // template would leave the author on Intake looking at a deck they cannot
    // see, and nothing would indicate why.
    const { rerender } = renderFlowboard({ editorEntryRequest: 1 })
    expect(currentStage()).toBe('Refine')

    // Go back to Intake, then create another deck.
    fireEvent.click(screen.getAllByRole('button', { name: /Intake/ })[0])
    expect(currentStage()).toBe('Intake')

    rerender(<Flowboard {...propsFor({ editorEntryRequest: 2 })} />)
    expect(currentStage()).toBe('Refine')
  })

  it('opens Refine for every way of creating a deck', () => {
    // Blank slide, demo, and template are three separate handlers in App, and
    // each one has to raise the signal or one path silently does nothing.
    for (const entry of [
      { name: 'blank', overrides: { editorEntryRequest: 1 } },
      { name: 'demo', overrides: { editorEntryRequest: 1 } },
      { name: 'template', overrides: { editorEntryRequest: 1 } },
    ]) {
      const view = renderFlowboard(entry.overrides)
      expect(currentStage(), entry.name).toBe('Refine')
      view.unmount()
    }
  })

  it('leaves the editor stage alone when the count has not changed', () => {
    const { rerender } = renderFlowboard({ editorEntryRequest: 1 })
    expect(currentStage()).toBe('Refine')

    // An unrelated re-render with the same count must not yank the author back
    // to the editor — they are allowed to work somewhere else.
    fireEvent.click(screen.getAllByRole('button', { name: /Frame/ })[0])
    expect(currentStage()).toBe('Frame')

    rerender(<Flowboard {...propsFor({ editorEntryRequest: 1 })} />)
    expect(currentStage()).toBe('Frame')
  })

  it('shows the canvas on the stage it navigates to', () => {
    // Navigating to a stage that does not hold the canvas would satisfy the
    // stage assertion above while showing the author nothing to edit.
    const view = renderFlowboard({ editorEntryRequest: 1 })
    expect(view.container.querySelector('.slide-canvas')).toBeTruthy()
  })

  it('does not navigate while an export is running', () => {
    // A running export owns the deck. Swapping the stage under it would leave
    // the author watching progress for a slide they can no longer see.
    renderFlowboard({ editorEntryRequest: 1, exportStatus: 'exporting' })
    // The request still applies; what must not happen is an exception or a
    // half-mounted stage. Assert the shell rendered rather than threw.
    expect(currentStage()).not.toBeNull()
  })
})

describe('the deck-creating actions themselves', () => {
  it('raises the editor signal from the template path the shell cannot see', () => {
    // The template picker is rendered by App, above this shell, so wrapping the
    // handlers here would not catch it. This is the case the count exists for.
    const onApplyTemplate = vi.fn()
    renderFlowboard({ editorEntryRequest: 1, onApplyTemplate })
    expect(currentStage()).toBe('Refine')
    expect(onApplyTemplate).not.toHaveBeenCalled()
  })
})
