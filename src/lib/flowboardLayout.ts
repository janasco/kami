/**
 * Explicit, stage-aware grid templates for the Flowboard stage bodies.
 *
 * Every stage used to share one `repeat(auto-fit, minmax(320px, 1fr))` rule, so
 * the number of columns was decided by how many panels a stage happened to
 * render. A stage with one trailing side panel therefore reserved a second
 * column it never filled, and the panel squeezed into a narrow track next to a
 * wide empty gap, while a stage with four panels quietly became two columns.
 *
 * Each stage now declares its own template. The value is written to a CSS
 * custom property on the shell, so the stage body keeps a single rule and the
 * narrow breakpoints still collapse to one column. Nothing here is serialized
 * with the project; it is a UI-only layout decision.
 */

import { flowboardStageIds, type FlowboardStageId } from './flowboardStages'

/** The custom property the shell writes and the stage body reads. */
export const FLOWBOARD_STAGE_COLUMNS_VAR = '--flow-stage-columns'

/** Below this width a stage's columns collapse into one. */
export const FLOWBOARD_STAGE_SINGLE_COLUMN_MAX_WIDTH = 1023

export interface FlowboardStageLayout {
  /** CSS `grid-template-columns` value for the stage body. */
  columns: string
  /** How many explicit columns the template declares. */
  columnCount: 1 | 2
  /** True when the stage's only side panel should span the full row. */
  fullWidthSidePanel: boolean
  /** One line on why the stage has this shape, for the docs and the tests. */
  note: string
}

/** Two balanced columns for stages that really do have two panel columns. */
const TWO_COLUMNS = 'repeat(2, minmax(0, 1fr))'
/** One column, so a lone side panel fills the row instead of leaving a gap. */
const ONE_COLUMN = 'minmax(0, 1fr)'

export const flowboardStageLayouts: Record<FlowboardStageId, FlowboardStageLayout> = {
  intake: {
    columns: TWO_COLUMNS,
    columnCount: 2,
    fullWidthSidePanel: false,
    note: 'Drop zone, deck record, starters, and checklist pair up into two columns; the deck strip spans both.',
  },
  frame: {
    columns: ONE_COLUMN,
    columnCount: 1,
    fullWidthSidePanel: true,
    note: 'The contact sheet and the single selected-capture panel each own a full row.',
  },
  story: {
    columns: ONE_COLUMN,
    columnCount: 1,
    fullWidthSidePanel: true,
    note: 'Beat strip, translation matrix, and deck style each own a full row.',
  },
  refine: {
    columns: 'minmax(0, 1.35fr) minmax(300px, 1fr)',
    columnCount: 2,
    fullWidthSidePanel: false,
    note: 'The canvas keeps the wider track so the tray never squeezes it.',
  },
  ship: {
    columns: ONE_COLUMN,
    columnCount: 1,
    fullWidthSidePanel: true,
    note: 'The review list and the export panel each own a full row.',
  },
}

/** The layout for one stage. Unknown ids fall back to the single column. */
export const flowboardStageLayout = (stageId: FlowboardStageId): FlowboardStageLayout =>
  flowboardStageLayouts[stageId] ?? flowboardStageLayouts.ship

/** The custom property map the shell puts on its root element. */
export const flowboardStageLayoutStyle = (stageId: FlowboardStageId): Record<string, string> => ({
  [FLOWBOARD_STAGE_COLUMNS_VAR]: flowboardStageLayout(stageId).columns,
})

/**
 * True when the stage is a single-column stage, so a trailing panel has to
 * span the full row instead of sitting in a phantom second column.
 */
export const isFullWidthSidePanelStage = (stageId: FlowboardStageId): boolean =>
  flowboardStageLayout(stageId).fullWidthSidePanel

/** Every stage id the layouts cover, for validation and tests. */
export const flowboardStageLayoutIds: readonly FlowboardStageId[] = flowboardStageIds
