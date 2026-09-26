/**
 * Where the Full Editor's single rail lives at each size.
 *
 * The Flowboard used to be a three-zone desktop grid: a persistent left stage
 * rail, the stage canvas, and a right stage-info column. That left a narrow
 * column of navigation beside a wide canvas, and it split one rail's job across
 * two surfaces: the left column listed the stages and the right column explained
 * the stage, the deck, and the escape hatches.
 *
 * There is now one rail and it is on the right. The stage navigation moved into
 * it as a compact "Steps" list, so a stage, its state, the deck facts, and the
 * common actions all live in one scrollable column, and the main area keeps the
 * full width for the stage content and the canvas.
 *
 * This module is UI-only. It decides where a region is drawn, nothing else: it
 * holds no project state, is never serialized with a deck, and never changes
 * what the guided shell or the classic editor render. The numbers come from the
 * shell's own breakpoint hook, and the media queries in `flowboard.css` use the
 * same limits.
 */

import type { FlowboardBreakpoint } from '../components/flowboard/useFlowboardBreakpoint'

export type { FlowboardBreakpoint }

/**
 * How the rail is placed.
 *
 * - `column` is a permanent right column beside the main area.
 * - `bottom-sheet` is a dismissible sheet over the bottom of a tablet viewport.
 * - `side-sheet` is a dismissible sheet in from the right on a phone.
 */
export type FlowboardRailRegion = 'column' | 'bottom-sheet' | 'side-sheet'

/** The rail region for a breakpoint. Desktop keeps the permanent column. */
export const flowboardRailRegion = (breakpoint: FlowboardBreakpoint): FlowboardRailRegion => {
  if (breakpoint === 'mobile') return 'side-sheet'
  if (breakpoint === 'tablet') return 'bottom-sheet'
  return 'column'
}

/**
 * True when the rail is a permanent column. Only then is it always on screen,
 * never inert, and never behind a toggle.
 */
export const hasPersistentFlowboardRail = (breakpoint: FlowboardBreakpoint): boolean =>
  flowboardRailRegion(breakpoint) === 'column'

/**
 * True when the rail is a sheet that the author opens and dismisses, so the
 * shell needs a visible toggle, a scrim, Escape handling, and an inert panel
 * while it is closed.
 */
export const isFlowboardRailSheet = (breakpoint: FlowboardBreakpoint): boolean =>
  !hasPersistentFlowboardRail(breakpoint)

/**
 * True when the sheet should be open in the DOM sense: only ever true for a
 * sheet the author opened, never for a permanent column.
 */
export const isFlowboardRailOpen = (breakpoint: FlowboardBreakpoint, opened: boolean): boolean =>
  opened && isFlowboardRailSheet(breakpoint)

/**
 * A closed sheet must not be reachable by keyboard. A permanent column is
 * always reachable, so it is never inert.
 */
export const flowboardRailInert = (breakpoint: FlowboardBreakpoint, opened: boolean): boolean | undefined =>
  isFlowboardRailSheet(breakpoint) ? !isFlowboardRailOpen(breakpoint, opened) : undefined

/**
 * True when the main area needs its own visible toggle for the rail, because
 * the rail is not already on screen beside it.
 */
export const showsFlowboardRailToggle = (breakpoint: FlowboardBreakpoint): boolean =>
  isFlowboardRailSheet(breakpoint)

/**
 * True when the shell renders the compact horizontal stage selector above the
 * stage content. Without a permanent rail a phone would otherwise have to open
 * a sheet just to see which stage it is on.
 */
export const showsFlowboardStageSelector = (breakpoint: FlowboardBreakpoint): boolean =>
  breakpoint === 'mobile'

/**
 * The explicit grid template for the shell body. Both tracks are written out so
 * the layout never depends on a content count: the main area takes every pixel
 * the rail does not need, and the rail is a fixed, scrollable column.
 */
export const FLOWBOARD_MAIN_MIN_WIDTH = '0'

/** The rail width token the grid template reads. */
export const FLOWBOARD_RAIL_WIDTH_VAR = '--flow-rail-width'

/** Desktop body: main area, then the single right rail. */
export const flowboardBodyColumns = (breakpoint: FlowboardBreakpoint): string =>
  hasPersistentFlowboardRail(breakpoint)
    ? `minmax(${FLOWBOARD_MAIN_MIN_WIDTH}, 1fr) var(${FLOWBOARD_RAIL_WIDTH_VAR})`
    : 'minmax(0, 1fr)'

/** Every region the shell can place the rail in, for validation and tests. */
export const flowboardRailRegions: readonly FlowboardRailRegion[] = ['column', 'bottom-sheet', 'side-sheet']
