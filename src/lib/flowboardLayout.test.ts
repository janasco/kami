import { describe, expect, it } from 'vitest'
import { flowboardStageIds } from './flowboardStages'
import {
  FLOWBOARD_STAGE_COLUMNS_VAR,
  flowboardStageLayout,
  flowboardStageLayouts,
  flowboardStageLayoutStyle,
  isFullWidthSidePanelStage,
} from './flowboardLayout'

describe('flowboard stage layouts', () => {
  it('declares an explicit template for every stage', () => {
    expect(Object.keys(flowboardStageLayouts).sort()).toEqual([...flowboardStageIds].sort())
    for (const stageId of flowboardStageIds) {
      const layout = flowboardStageLayout(stageId)
      expect(layout.columns.trim().length).toBeGreaterThan(0)
      expect([1, 2]).toContain(layout.columnCount)
      expect(layout.note.length).toBeGreaterThan(10)
      // No stage may fall back to a content-count auto-fit again.
      expect(layout.columns).not.toContain('auto-fit')
      expect(layout.columns).not.toContain('auto-fill')
    }
  })

  it('gives the two real panel columns to intake and refine only', () => {
    const twoColumn = flowboardStageIds.filter((id) => flowboardStageLayout(id).columnCount === 2)
    expect(twoColumn).toEqual(['intake', 'refine'])
    expect(flowboardStageLayout('refine').columns).toBe('minmax(0, 1.35fr) minmax(300px, 1fr)')
  })

  it('keeps a lone side panel from reserving a second track', () => {
    for (const stageId of ['frame', 'story', 'ship'] as const) {
      const layout = flowboardStageLayout(stageId)
      expect(layout.columnCount).toBe(1)
      expect(layout.columns).toBe('minmax(0, 1fr)')
      // Those stages mark their trailing panel full width instead.
      expect(isFullWidthSidePanelStage(stageId)).toBe(true)
    }
    expect(isFullWidthSidePanelStage('intake')).toBe(false)
    expect(isFullWidthSidePanelStage('refine')).toBe(false)
  })

  it('writes the template as the shell custom property', () => {
    expect(flowboardStageLayoutStyle('frame')).toEqual({
      [FLOWBOARD_STAGE_COLUMNS_VAR]: 'minmax(0, 1fr)',
    })
    expect(flowboardStageLayoutStyle('intake')).toEqual({
      [FLOWBOARD_STAGE_COLUMNS_VAR]: 'repeat(2, minmax(0, 1fr))',
    })
  })
})
