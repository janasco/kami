import { describe, expect, it } from 'vitest'
import {
  flowboardBodyColumns,
  flowboardRailInert,
  flowboardRailRegion,
  flowboardRailRegions,
  hasPersistentFlowboardRail,
  isFlowboardRailOpen,
  isFlowboardRailSheet,
  showsFlowboardRailToggle,
  showsFlowboardStageSelector,
  type FlowboardBreakpoint,
} from './flowboardRail'

/**
 * The rail region model decides where the Full Editor's one rail is drawn and
 * what the shell has to provide around it. It is a pure function of the
 * breakpoint, so it is checked here rather than through a rendered shell.
 */

const breakpoints: FlowboardBreakpoint[] = ['desktop', 'tablet', 'mobile']

describe('the rail region', () => {
  it('is a permanent column on a desktop and a sheet below it', () => {
    expect(flowboardRailRegion('desktop')).toBe('column')
    expect(flowboardRailRegion('tablet')).toBe('bottom-sheet')
    expect(flowboardRailRegion('mobile')).toBe('side-sheet')
    for (const region of flowboardRailRegions) {
      expect(breakpoints.map(flowboardRailRegion)).toContain(region)
    }
  })

  it('only ever leaves the grid when it becomes a sheet', () => {
    for (const breakpoint of breakpoints) {
      expect(hasPersistentFlowboardRail(breakpoint)).toBe(breakpoint === 'desktop')
      expect(isFlowboardRailSheet(breakpoint)).toBe(breakpoint !== 'desktop')
      // A sheet is the only thing the author opens, so it is the only thing that
      // can be open, toggled, or inert while closed.
      expect(isFlowboardRailOpen(breakpoint, true)).toBe(breakpoint !== 'desktop')
      expect(isFlowboardRailOpen(breakpoint, false)).toBe(false)
      expect(showsFlowboardRailToggle(breakpoint)).toBe(breakpoint !== 'desktop')
    }
  })

  it('never makes a permanent column inert', () => {
    for (const breakpoint of breakpoints) {
      const column = !isFlowboardRailSheet(breakpoint)
      for (const opened of [true, false]) {
        const inert = flowboardRailInert(breakpoint, opened)
        if (column) expect(inert).toBeUndefined()
        else expect(inert).toBe(!opened)
      }
    }
  })

  it('adds the compact stage selector only where the rail is out of the way', () => {
    expect(showsFlowboardStageSelector('mobile')).toBe(true)
    // A tablet keeps a visible toggle in the stage header, and a desktop has
    // the rail itself, so neither needs a second stage list.
    expect(showsFlowboardStageSelector('tablet')).toBe(false)
    expect(showsFlowboardStageSelector('desktop')).toBe(false)
  })
})

describe('the shell body tracks', () => {
  it('writes out the main track and the rail track', () => {
    expect(flowboardBodyColumns('desktop')).toBe('minmax(0, 1fr) var(--flow-rail-width)')
  })

  it('gives the whole width to the main area when the rail is a sheet', () => {
    // One written-out track, so the main area is never asked to share its width
    // with a column that is not in the grid.
    expect(flowboardBodyColumns('tablet')).toBe('minmax(0, 1fr)')
    expect(flowboardBodyColumns('mobile')).toBe('minmax(0, 1fr)')
    for (const breakpoint of breakpoints) {
      expect(flowboardBodyColumns(breakpoint)).not.toContain('auto-fit')
      expect(flowboardBodyColumns(breakpoint)).toContain('minmax(0, 1fr)')
    }
  })
})
