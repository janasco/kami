import { describe, expect, it } from 'vitest'
import {
  BULK_SELECTION_MIN,
  clearSlideSelection,
  describeFlowboardSelection,
  describeFlowboardSelectionText,
  describeSelectModifier,
  describeSlideCardLabel,
  describeSlideCardState,
  formatSlideNumbers,
  isMultiSelectGesture,
  normalizeFlowboardSelection,
  selectAllSlides,
  toggleSlideSelection,
} from './flowboardSelection'

const deck = ['slide-a', 'slide-b', 'slide-c', 'slide-d']

describe('flowboard selection state', () => {
  it('reads a normal click as a single selection and a modifier as a toggle', () => {
    expect(isMultiSelectGesture({ metaKey: true })).toBe(true)
    expect(isMultiSelectGesture({ ctrlKey: true })).toBe(true)
    expect(isMultiSelectGesture({ shiftKey: true })).toBe(true)
    expect(isMultiSelectGesture({})).toBe(false)
    expect(isMultiSelectGesture({ metaKey: false, ctrlKey: false, shiftKey: false })).toBe(false)
  })

  it('adds and removes slides while keeping deck order', () => {
    const first = toggleSlideSelection([], 'slide-c', deck)
    expect(first).toEqual(['slide-c'])

    const second = toggleSlideSelection(first, 'slide-a', deck)
    expect(second).toEqual(['slide-a', 'slide-c'])

    const removed = toggleSlideSelection(second, 'slide-a', deck)
    expect(removed).toEqual(['slide-c'])
  })

  it('normalizes to unique ids in deck order and drops ids that left the deck', () => {
    expect(normalizeFlowboardSelection(['slide-d', 'slide-b', 'slide-b'], deck)).toEqual(['slide-b', 'slide-d'])
    expect(normalizeFlowboardSelection(['slide-b', 'slide-gone'], deck)).toEqual(['slide-b'])
    expect(normalizeFlowboardSelection([], deck)).toEqual([])
  })

  it('selects all slides and clears back to nothing', () => {
    expect(selectAllSlides(deck)).toEqual(deck)
    expect(clearSlideSelection()).toEqual([])
  })

  it('keeps the target on the active slide until the selection is bulk', () => {
    const none = describeFlowboardSelection(deck, 'slide-b', [])
    expect(none.bulk).toBe(false)
    expect(none.selectedIds).toEqual([])
    expect(none.targetIds).toEqual(['slide-b'])
    expect(none.activeSlideNumber).toBe(2)

    const one = describeFlowboardSelection(deck, 'slide-c', ['slide-a'])
    expect(one.bulk).toBe(false)
    expect(one.selectedIds).toEqual(['slide-a'])
    expect(one.slideNumbers).toEqual([1])
    // A single card stays the active slide, which is what Refine keeps editing.
    expect(one.targetIds).toEqual(['slide-c'])
    expect(one.targetSlideNumbers).toEqual([3])

    const bulk = describeFlowboardSelection(deck, 'slide-c', ['slide-d', 'slide-b'])
    expect(BULK_SELECTION_MIN).toBe(2)
    expect(bulk.bulk).toBe(true)
    expect(bulk.selectedIds).toEqual(['slide-b', 'slide-d'])
    expect(bulk.slideNumbers).toEqual([2, 4])
    expect(bulk.targetIds).toEqual(['slide-b', 'slide-d'])
    expect(bulk.targetSlideNumbers).toEqual([2, 4])
  })

  it('falls back to a known active slide when the stored id is gone', () => {
    const stale = describeFlowboardSelection(deck, 'slide-gone', [])
    expect(stale.targetIds).toEqual([])
    expect(stale.activeSlideNumber).toBe(1)
  })

  it('ignores selection ids that disappeared with a delete or an undo', () => {
    const afterDelete = describeFlowboardSelection(['slide-a', 'slide-b'], 'slide-a', ['slide-a', 'slide-z'])
    expect(afterDelete.selectedIds).toEqual(['slide-a'])
    expect(afterDelete.bulk).toBe(false)
  })
})

describe('flowboard selection copy', () => {
  it('formats slide numbers as readable lists', () => {
    expect(formatSlideNumbers([])).toBe('')
    expect(formatSlideNumbers([2])).toBe('2')
    expect(formatSlideNumbers([1, 2, 5])).toBe('1, 2 and 5')
  })

  it('announces a bulk selection with the slides it covers', () => {
    const bulk = describeFlowboardSelection(deck, 'slide-d', ['slide-b', 'slide-d'])
    const text = describeFlowboardSelectionText(bulk, deck.length)
    expect(text).toContain('2 of 4 slides selected')
    expect(text).toContain('slides 2 and 4')
    expect(text).toContain('undo in one step')
  })

  it('announces a single selection as one step away from bulk', () => {
    const one = describeFlowboardSelection(deck, 'slide-b', ['slide-b'])
    expect(describeFlowboardSelectionText(one, deck.length)).toBe(
      '1 of 4 slides selected: slide 2. Select one more to enable bulk actions.',
    )
  })

  it('announces the active slide and the modifier when nothing is selected', () => {
    const none = describeFlowboardSelection(deck, 'slide-b', [])
    const text = describeFlowboardSelectionText(none, deck.length)
    expect(text).toContain('No bulk selection. Slide 2 is the active slide.')
    expect(text).toContain(describeSelectModifier())
    expect(describeSelectModifier()).toContain('right-click')
  })
})

describe('slide card states', () => {
  it('keeps the edited slide distinct from the bulk selection', () => {
    const idle = describeSlideCardState(3, false, false)
    expect(idle.state).toBe('idle')
    expect(idle.editing).toBe(false)
    expect(idle.selected).toBe(false)
    expect(idle.className).toBe('')
    expect(idle.mark).toBe('')
    expect(idle.badge).toBe('')
    expect(idle.stateLabel).toBe('')
    expect(idle.dataSelected).toBe('off')

    const selected = describeSlideCardState(3, false, true)
    expect(selected.state).toBe('selected')
    expect(selected.editing).toBe(false)
    expect(selected.selected).toBe(true)
    expect(selected.className).toBe('is-selected')
    expect(selected.mark).toBe('✓')
    expect(selected.badge).toBe('Selected')
    expect(selected.stateLabel).toBe('Slide 3 is selected for bulk editing.')
    expect(selected.dataSelected).toBe('multi')

    const editing = describeSlideCardState(3, true, false)
    expect(editing.state).toBe('editing')
    expect(editing.editing).toBe(true)
    expect(editing.className).toBe('is-editing')
    expect(editing.mark).toBe('✎')
    expect(editing.badge).toBe('Editing')
    expect(editing.stateLabel).toBe('Editing slide 3 in the canvas and Inspector.')
    expect(editing.dataSelected).toBe('active')
  })

  it('carries both states when the edited slide is also in the range', () => {
    const both = describeSlideCardState(1, true, true)
    expect(both.state).toBe('editing')
    expect(both.editing).toBe(true)
    expect(both.selected).toBe(true)
    expect(both.className).toBe('is-editing is-selected')
    // The editing marker wins in the corner, so the two never read as one.
    expect(both.mark).toBe('✎')
  })

  it('builds a card label from the content and the state', () => {
    const editing = describeSlideCardState(2, true, false)
    expect(describeSlideCardLabel(2, 'Home screen.', editing)).toBe(
      'Slide 2. Home screen. Editing slide 2 in the canvas and Inspector.',
    )

    const idle = describeSlideCardState(4, false, false)
    expect(describeSlideCardLabel(4, 'No capture.', idle)).toBe('Slide 4. No capture.')
  })
})
