/**
 * UI-only slide selection model shared by the Flowboard Frame and Story stages.
 *
 * The editor already owns one active slide; this module adds the second,
 * purely visual concept needed for bulk work: a set of slide ids held in React
 * state. Nothing here is serialized, so the project format, migrations,
 * validation, and templates stay exactly as they are. Only fields the project
 * document already carries are ever written back, through the same
 * `commitEditorUpdate` path every other edit uses.
 *
 * Deck order always comes from the `slides` array, so a selection reads as
 * "slides 2, 3 and 5" no matter which card was clicked last.
 */

/** Two or more selected slides is the point where bulk actions are worth showing. */
export const BULK_SELECTION_MIN = 2

export interface FlowboardSelection {
  /** Deck ids chosen for bulk work, in deck order. Unknown ids are dropped. */
  selectedIds: string[]
  /** 1-based deck numbers matching {@link FlowboardSelection.selectedIds}. */
  slideNumbers: number[]
  /** Deck ids a bulk action would update: the selection, or the active slide. */
  targetIds: string[]
  /** 1-based deck numbers matching `targetIds`, in deck order. */
  targetSlideNumbers: number[]
  /** True when at least {@link BULK_SELECTION_MIN} slides are selected. */
  bulk: boolean
  /** 1-based position of the active single slide, which Refine keeps editing. */
  activeSlideNumber: number
}

/**
 * Drops ids that are no longer in the deck and duplicates, then returns the
 * rest in deck order. Slides can disappear between renders, for example after a
 * delete or an undo, so every read of the selection goes through this.
 */
export const normalizeFlowboardSelection = (
  selectedIds: readonly string[],
  slideIds: readonly string[],
): string[] => {
  const selected = new Set(selectedIds)
  return slideIds.filter((slideId) => selected.has(slideId))
}

/** Adds a slide to the selection, or removes it when it is already selected. */
export const toggleSlideSelection = (
  selectedIds: readonly string[],
  slideId: string,
  slideIds: readonly string[],
): string[] => normalizeFlowboardSelection(
  selectedIds.includes(slideId)
    ? selectedIds.filter((selectedId) => selectedId !== slideId)
    : [...selectedIds, slideId],
  slideIds,
)

/** Selects every slide in the deck, in deck order. */
export const selectAllSlides = (slideIds: readonly string[]): string[] => [...slideIds]

/** Empties the multi-selection without touching the active single slide. */
export const clearSlideSelection = (): string[] => []

/**
 * True when a pointer gesture should extend the multi-selection instead of
 * replacing it. Meta covers macOS Command, Ctrl and Shift work everywhere, and
 * a secondary click without a modifier is handled as a toggle too.
 */
export const isMultiSelectGesture = (
  event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
): boolean => Boolean(event.metaKey || event.ctrlKey || event.shiftKey)

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`

/** `1, 2 and 3` style list used in the selection and bulk announcements. */
export const formatSlideNumbers = (slideNumbers: readonly number[]): string => {
  if (slideNumbers.length === 0) return ''
  if (slideNumbers.length === 1) return String(slideNumbers[0])
  return `${slideNumbers.slice(0, -1).join(', ')} and ${slideNumbers[slideNumbers.length - 1]}`
}

/** Short, always-visible explanation of how a card is added to the selection. */
export const describeSelectModifier = (): string =>
  'Click a card to select one slide. Cmd, Ctrl, or Shift-click, or right-click, to add or remove it from the selection.'

/**
 * Derives the whole selection view for a stage: the chosen ids, the ids a bulk
 * action would touch, and the 1-based deck numbers used in the copy.
 *
 * A bulk selection of two or more slides always wins, and the active slide is
 * the last card toggled, so the Refine stage keeps editing a slide the author
 * can see highlighted.
 */
export const describeFlowboardSelection = (
  slideIds: readonly string[],
  selectedId: string,
  multiSelectedIds: readonly string[],
): FlowboardSelection => {
  const selectedIds = normalizeFlowboardSelection(multiSelectedIds, slideIds)
  const activeSlideNumber = slideIds.indexOf(selectedId) + 1
  const bulk = selectedIds.length >= BULK_SELECTION_MIN
  const targetIds = bulk
    ? selectedIds
    : slideIds.includes(selectedId)
      ? [selectedId]
      : []

  return {
    selectedIds,
    slideNumbers: selectedIds.map((id) => slideIds.indexOf(id) + 1),
    targetIds,
    targetSlideNumbers: targetIds.map((id) => slideIds.indexOf(id) + 1),
    bulk,
    activeSlideNumber: activeSlideNumber > 0 ? activeSlideNumber : 1,
  }
}

/**
 * Screen-reader friendly summary of the current selection. Rendered in a polite
 * live region so a keyboard or modifier selection is announced without moving
 * focus.
 */
export const describeFlowboardSelectionText = (
  selection: FlowboardSelection,
  slideCount: number,
): string => {
  const deck = plural(slideCount, 'slide')

  if (selection.bulk) {
    return `${selection.selectedIds.length} of ${deck} selected: slides ${formatSlideNumbers(selection.slideNumbers)}. Bulk actions apply to all ${selection.selectedIds.length} and undo in one step.`
  }

  if (selection.selectedIds.length === 1) {
    return `1 of ${deck} selected: slide ${selection.slideNumbers[0]}. Select one more to enable bulk actions.`
  }

  return `No bulk selection. Slide ${selection.activeSlideNumber} is the active slide. ${describeSelectModifier()}`
}

/**
 * The three structural states a slide card can be in.
 *
 * `editing` is the one slide the canvas and the Inspector are pointed at, and it
 * can be true at the same time as `selected`. Before this existed both states
 * collapsed into one `is-selected` class and a single check mark, so a range
 * selection could not be told apart from a deck with one active slide.
 */
export type SlideCardState = 'editing' | 'selected' | 'idle'

export interface SlideCardStateDescription {
  state: SlideCardState
  /** The slide the canvas and Inspector are editing. */
  editing: boolean
  /** The slide is in the multi-selection for bulk actions. */
  selected: boolean
  /** Corner glyph: a pencil while editing, a tick while selected, empty if idle. */
  mark: string
  /** The visible badge text, empty unless the card carries a state. */
  badge: string
  /** Short phrase read out with the card, empty for an idle card. */
  stateLabel: string
  /** Class list the card renders, so the states are structural, not a tint. */
  className: string
  /** Value for `data-selected`, kept for existing selectors and tests. */
  dataSelected: 'active' | 'multi' | 'off'
}

/**
 * Describes one slide card from the two independent questions: is this the
 * slide being edited, and is it part of the bulk selection?
 *
 * The editing state is deliberately separate from the selection state, so a
 * range reads as a range while the edited slide keeps its own marker and label.
 */
export const describeSlideCardState = (
  slideNumber: number,
  isActive: boolean,
  isSelected: boolean,
): SlideCardStateDescription => {
  if (isActive) {
    return {
      state: 'editing',
      editing: true,
      selected: isSelected,
      mark: '✎',
      badge: 'Editing',
      stateLabel: `Editing slide ${slideNumber} in the canvas and Inspector.`,
      className: isSelected ? 'is-editing is-selected' : 'is-editing',
      dataSelected: 'active',
    }
  }

  if (isSelected) {
    return {
      state: 'selected',
      editing: false,
      selected: true,
      mark: '✓',
      badge: 'Selected',
      stateLabel: `Slide ${slideNumber} is selected for bulk editing.`,
      className: 'is-selected',
      dataSelected: 'multi',
    }
  }

  return {
    state: 'idle',
    editing: false,
    selected: false,
    mark: '',
    badge: '',
    stateLabel: '',
    className: '',
    dataSelected: 'off',
  }
}

/** Accessible label for a card, built from its own content plus its state. */
export const describeSlideCardLabel = (
  slideNumber: number,
  content: string,
  card: SlideCardStateDescription,
): string => {
  const sentences = [`Slide ${slideNumber}. ${content}`.trim()]
  if (card.stateLabel) sentences.push(card.stateLabel)
  return sentences.join(' ')
}
