import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { exportProfiles, slideLayerIds, slideLayerLabels } from '../data'
import { runExportPreflight } from '../lib/exportPreflight'
import { layerTransformFieldId, layerTransformPrimaryFields, layerTransformSizeFields, layerTransformUpdate, sanitizeLayerTransformValue } from './LayerTransformControls'
import { RefineStage } from './flowboard/RefineStage'
import { Inspector, type InspectorProps } from './Inspector'
import type { SlideCanvasProps } from './SlideCanvas'
import { createTestSlide } from '../test/projectFixtures'
import type { Slide } from '../types'

/**
 * Tests for the shared layer transform controls.
 *
 * The Refine tray and the full Inspector used to carry their own copy of the same
 * fields, and they had drifted. What matters now is that both surfaces still
 * offer every control, that the two id prefixes keep them from colliding, and
 * that one set of value rules decides what may be stored.
 */

const profile = exportProfiles[0]

const slide = (): Slide => createTestSlide({ id: 'slide-shared', title: 'Ship it' })

const inspectorProps = (overrides: Partial<InspectorProps> = {}): InspectorProps => ({
  slide: slide(),
  activeLocale: 'en-US',
  onLocaleChange: () => undefined,
  onUpdate: () => undefined,
  onTextUpdate: () => undefined,
  onImport: () => undefined,
  onImportIcon: () => undefined,
  onRemoveIcon: () => undefined,
  onImportBackground: () => undefined,
  onRemoveBackground: () => undefined,
  selectedLayerId: 'headline',
  onLayerSelect: () => undefined,
  profile,
  preflight: runExportPreflight({ profile, slides: [slide()], activeLocale: 'en-US' }),
  layerBounds: {},
  onArrange: () => undefined,
  onProfileChange: () => undefined,
  exportDisabled: false,
  ...overrides,
})

const canvasProps = (overrides: Partial<SlideCanvasProps> = {}): SlideCanvasProps => ({
  slides: [slide()],
  selectedSlide: slide(),
  selectedIndex: 0,
  selectedId: 'slide-shared',
  mode: 'isolated',
  onModeChange: () => undefined,
  onSelect: () => undefined,
  onImport: () => undefined,
  onTransformChange: () => undefined,
  selectedLayerId: 'headline',
  onLayerSelect: () => undefined,
  onLayerTransformChange: () => undefined,
  persistenceStatus: 'saved',
  persistenceDetail: '',
  projectValidationNotice: null,
  exportStatus: 'idle',
  exportDetail: '',
  exportCompleted: 0,
  exportTotal: 1,
  profile,
  locale: 'en-US',
  ...overrides,
})

const refineMarkup = () => renderToStaticMarkup(createElement(RefineStage, {
  canvas: canvasProps(),
  inspector: inspectorProps(),
  preflight: runExportPreflight({ profile, slides: [slide()], activeLocale: 'en-US' }),
  onGoToSlide: () => undefined,
}))

const inspectorMarkup = () => renderToStaticMarkup(createElement(Inspector, inspectorProps()))

/** The id of every transform input the shared control rendered. */
const transformFieldIds = (markup: string, prefix: string) => {
  const ids = [...markup.matchAll(/\sid="([^"]*transform-[^"]*)"/g)].map((match) => match[1])
  return ids.filter((id) => id.startsWith(prefix)).sort()
}

describe('the shared transform fields', () => {
  const expected = (prefix: string) => [
    ...layerTransformPrimaryFields.map((field) => layerTransformFieldId(prefix, field)),
    ...layerTransformSizeFields.map((field) => layerTransformFieldId(prefix, field)),
    `${prefix}-flip-x`,
    `${prefix}-flip-y`,
  ].sort()

  it('offers the same complete set in the full Inspector', () => {
    expect(transformFieldIds(inspectorMarkup(), 'layer-transform')).toEqual(expected('layer-transform'))
  })

  it('offers the same complete set in the Refine tray', () => {
    // The tray keeps its own id prefix, so the two surfaces can never collide on
    // one page, and it gained the size scales and flips it was missing.
    expect(transformFieldIds(refineMarkup(), 'flowboard-transform')).toEqual(expected('flowboard-transform'))
  })

  it('keeps a reset control on both surfaces', () => {
    expect(inspectorMarkup()).toContain('Reset Headline transform')
    expect(refineMarkup()).toContain('Reset Headline transform')
  })

  it('keeps the whole layer picker on both surfaces', () => {
    for (const layerId of slideLayerIds) {
      expect(inspectorMarkup()).toContain(`aria-label="${slideLayerLabels[layerId]}"`)
      expect(refineMarkup()).toContain(`aria-label="${slideLayerLabels[layerId]}"`)
    }
  })
})

describe('the arrange bar', () => {
  it('appears on both surfaces with the same actions', () => {
    for (const markup of [inspectorMarkup(), refineMarkup()]) {
      expect(markup).toContain('class="layer-arrange"')
      expect(markup).toContain('aria-label="Align left"')
      expect(markup).toContain('aria-label="Distribute horizontally"')
      expect(markup).toContain('aria-label="Distribute vertically"')
      expect(markup).toContain('aria-label="Bring forward"')
      expect(markup).toContain('aria-label="Send backward"')
      expect(markup).toContain('Whole composition')
    }
  })

  it('disables the geometry actions until the canvas has been measured', () => {
    const markup = inspectorMarkup()
    // Two measured layers would be needed for a distribution, and there are none.
    expect(markup).toMatch(/aria-label="Distribute horizontally"[^>]*/)
    expect(markup).toContain('The canvas has not been measured yet')
  })
})

describe('the guides toggle', () => {
  it('sits on the Refine canvas and defaults to on', () => {
    const markup = refineMarkup()
    expect(markup).toContain('id="flowboard-canvas-guides"')
    expect(markup).toContain('aria-label="Show canvas guides"')
    expect(markup).toMatch(/id="flowboard-canvas-guides"[^>]*checked=""/)
  })
})

describe('transform value rules', () => {
  it('rejects a value that cannot be stored', () => {
    expect(sanitizeLayerTransformValue('x', Number.NaN)).toBeNull()
    expect(sanitizeLayerTransformValue('scale', 0)).toBeNull()
    expect(sanitizeLayerTransformValue('scale', -1)).toBeNull()
  })

  it('holds a size scale inside the range the project format allows', () => {
    expect(sanitizeLayerTransformValue('widthScale', 99)).toBe(4)
    expect(sanitizeLayerTransformValue('heightScale', 0)).toBe(0.25)
    expect(sanitizeLayerTransformValue('heightScale', 1.5)).toBe(1.5)
  })

  it('keeps a position and a rotation as typed', () => {
    expect(sanitizeLayerTransformValue('x', -12.5)).toBe(-12.5)
    expect(sanitizeLayerTransformValue('rotation', 8)).toBe(8)
  })

  it('writes the whole layer transform map and the field merge key', () => {
    const current = slide()
    const update = layerTransformUpdate(current, 'headline', 'x', 5)

    expect(update?.mergeKey).toBe('layer-transform:slide-shared:headline:x')
    const transforms = update?.updates.layerTransforms
    expect(Object.keys(transforms ?? {})).toEqual(slideLayerIds)
    expect(transforms?.headline.x).toBe(5)
    // Nothing else on the layer moved.
    expect(transforms?.headline.y).toBe(current.layerTransforms.headline.y)
  })

  it('writes nothing when the value is already stored', () => {
    expect(layerTransformUpdate(slide(), 'headline', 'x', 0)).toBeNull()
    expect(layerTransformUpdate(slide(), 'headline', 'scale', Number.NaN)).toBeNull()
  })
})
