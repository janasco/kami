import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { backgroundBlendOptions, backgroundFillOptions, exportProfiles } from '../data'
import { runExportPreflight } from '../lib/exportPreflight'
import { describeFlowboardSelection } from '../lib/flowboardSelection'
import { BackgroundFillControls } from './BackgroundFillControls'
import { FrameStage } from './flowboard/FrameStage'
import { Inspector, type InspectorProps } from './Inspector'
import { RefineStage } from './flowboard/RefineStage'
import { collectIds, makeFlowboardProps } from '../test/flowboardProps'
import type { SlideCanvasProps } from './SlideCanvas'
import type { BackgroundFill, Slide } from '../types'

/**
 * Server-render tests for the shared background fill control.
 *
 * The Inspector, the Refine tray, and the Frame stage all mount the same
 * component, so the thing worth testing is that they keep offering the same
 * controls under their own id prefixes, that only the fields a fill can use are
 * shown, and that the focal point is reachable from the keyboard with a name.
 * There is no DOM here, so this is static markup only.
 */

const profile = exportProfiles[0]

const noop = () => undefined

const slide = (overrides: Partial<Slide> = {}): Slide => ({
  ...makeFlowboardProps().selectedSlide,
  id: 'slide-fill',
  ...overrides,
})

const controlMarkup = (overrides: Partial<Slide> = {}, idPrefix = 'fill') =>
  renderToStaticMarkup(createElement(BackgroundFillControls, {
    slide: slide(overrides),
    idPrefix,
    onUpdate: noop,
  }))

const inspectorProps = (overrides: Partial<InspectorProps> = {}): InspectorProps => {
  const target = slide(overrides.slide)
  return {
    slide: target,
    activeLocale: 'en-US',
    onLocaleChange: noop,
    onUpdate: noop,
    onTextUpdate: noop,
    onImport: noop,
    onImportIcon: noop,
    onRemoveIcon: noop,
    onImportBackground: noop,
    onRemoveBackground: noop,
    selectedLayerId: 'headline',
    onLayerSelect: noop,
    profile,
    preflight: runExportPreflight({ profile, slides: [target], activeLocale: 'en-US' }),
    layerBounds: {},
    onArrange: noop,
    onProfileChange: noop,
    exportDisabled: false,
    ...overrides,
    ...(overrides.slide ? { slide: { ...target, ...overrides.slide } } : {}),
  }
}

const canvasProps = (overrides: Partial<Slide> = {}): SlideCanvasProps => ({
  slides: [slide(overrides)],
  selectedSlide: slide(overrides),
  selectedIndex: 0,
  selectedId: 'slide-fill',
  mode: 'isolated',
  onModeChange: noop,
  onSelect: noop,
  onImport: noop,
  onTransformChange: noop,
  selectedLayerId: 'headline',
  onLayerSelect: noop,
  onLayerTransformChange: noop,
  persistenceStatus: 'saved',
  persistenceDetail: '',
  projectValidationNotice: null,
  exportStatus: 'idle',
  exportDetail: '',
  exportCompleted: 0,
  exportTotal: 1,
  profile,
  locale: 'en-US',
})

const refineMarkup = (overrides: Partial<Slide> = {}) => renderToStaticMarkup(createElement(RefineStage, {
  canvas: canvasProps(overrides),
  inspector: inspectorProps({ slide: slide(overrides) }),
  preflight: runExportPreflight({ profile, slides: [slide(overrides)], activeLocale: 'en-US' }),
  onGoToSlide: noop,
}))

const frameMarkup = (overrides: Partial<Slide> = {}) => {
  const props = makeFlowboardProps()
  const target = slide(overrides)
  return renderToStaticMarkup(createElement(FrameStage, {
    slides: [target],
    selectedSlide: target,
    selectedIndex: 0,
    selection: describeFlowboardSelection([target.id], target.id, []),
    onSelect: noop,
    onToggleSelect: noop,
    onSelectAll: noop,
    onClearSelection: noop,
    onUpdate: noop,
    onApplyBulkAction: noop,
    bulkNotice: null,
    onImport: noop,
    profile: props.profile,
    onDropFiles: async () => 'Nothing was placed.',
    onDropCapture: () => 'Nothing was placed.',
  }))
}

const inspectorMarkup = (overrides: Partial<Slide> = {}) =>
  renderToStaticMarkup(createElement(Inspector, inspectorProps({ slide: slide(overrides) })))

/** The ids of the background control's own fields, under one surface's prefix. */
const controlIds = (markup: string, prefix: string) => {
  const ids = [...markup.matchAll(/\sid="([^"]*)"/g)].map((match) => match[1])
  return ids.filter((id) => id.startsWith(`${prefix}-`)).sort()
}

const expectedIds = (prefix: string) => [
  `${prefix}-background-fill`,
  `${prefix}-background-blend`,
  `${prefix}-focal-label`,
  `${prefix}-focal-focal-x`,
  `${prefix}-focal-focal-y`,
].sort()

/** The opening tag that carries an attribute, so assertions do not depend on order. */
const tagWith = (markup: string, attribute: string) =>
  markup.match(new RegExp(`<[a-z]+[^>]*${attribute}[^>]*>`))?.[0] ?? ''

/** The labels of a select's options, in order. */
const optionLabels = (markup: string) =>
  [...markup.matchAll(/<option value="[a-z]+"(?: selected="")?>([^<]+)<\/option>/g)].map((match) => match[1])

describe('the shared background fill control', () => {
  it('appears on all three surfaces, each under its own id prefix', () => {
    const panoramic = { backgroundFill: { kind: 'panoramic' as const } }
    expect(controlIds(inspectorMarkup(panoramic), 'background-fill')).toEqual(expectedIds('background-fill'))
    expect(controlIds(refineMarkup(panoramic), 'flowboard-background')).toEqual(expectedIds('flowboard-background'))
    expect(controlIds(frameMarkup(panoramic), 'flowboard-frame-background')).toEqual(expectedIds('flowboard-frame-background'))
  })

  it('keeps the three surfaces free of colliding form ids', () => {
    const panoramic = { backgroundFill: { kind: 'panoramic' as const } }
    const surfaces = [inspectorMarkup(panoramic), refineMarkup(panoramic), frameMarkup(panoramic)]
    for (const ids of surfaces.map(collectIds)) {
      expect(new Set(ids).size).toBe(ids.length)
    }
    // The Refine tray and the Inspector are on the page at the same time when the
    // drawer is open, so their ids must not meet.
    const tray = collectIds(refineMarkup(panoramic))
    const panel = collectIds(inspectorMarkup(panoramic))
    expect(tray.filter((id) => panel.includes(id))).toEqual([])
  })

  it('offers every fill kind in one dropdown, and only that dropdown', () => {
    const markup = controlMarkup()
    expect(optionLabels(markup)).toEqual(backgroundFillOptions.map((option) => option.label))
    expect([...markup.matchAll(/<select/g)]).toHaveLength(1)
    expect(markup).toContain('The slide theme paint')
  })

  it('shows only the fields the chosen fill can use', () => {
    expect(controlMarkup()).not.toContain('background-color')
    expect(controlMarkup({ backgroundFill: { kind: 'solid', color: '#0b1020' } })).toContain('background-color')
    expect(controlMarkup({ backgroundFill: { kind: 'solid', color: '#0b1020' } })).not.toContain('background-angle')

    const gradient = controlMarkup({ backgroundFill: { kind: 'gradient' } })
    expect(gradient).toContain('background-angle')
    expect(gradient).toContain('background-stop-0')
    expect(gradient).toContain('background-stop-1')
    expect(gradient).not.toContain('background-color')

    // Blend and focal point belong to the two image fills only.
    expect(controlMarkup({ backgroundFill: { kind: 'image' } })).toContain('background-blend')
    expect(controlMarkup({ backgroundFill: { kind: 'image' } })).toContain('focal-focal-x')
    expect(controlMarkup({ backgroundFill: { kind: 'gradient' } })).not.toContain('background-blend')
    expect(controlMarkup({ backgroundFill: { kind: 'gradient' } })).not.toContain('focal-focal-x')
  })

  it('names every fill and blend option, so nothing is chosen blind', () => {
    const markup = controlMarkup({ backgroundFill: { kind: 'image' } })
    // Two dropdowns: the fill, then the blend that only an image fill can use.
    expect(optionLabels(markup)).toEqual([
      ...backgroundFillOptions.map((option) => option.label),
      ...backgroundBlendOptions.map((option) => option.label),
    ])
  })

  it('gives the focal point a keyboard-reachable control with an accessible name', () => {
    const markup = controlMarkup({ backgroundFill: { kind: 'panoramic' }, backgroundFocalPoint: { x: 0.25, y: 0.75 } })
    // Two native range inputs: focusable and arrow-key operable on their own.
    expect([...markup.matchAll(/type="range"/g)]).toHaveLength(2)
    expect(markup).toContain('aria-label="Background image horizontal focal point"')
    expect(markup).toContain('aria-label="Background image vertical focal point"')
    expect(markup).toContain('aria-valuetext="25 percent across"')
    expect(markup).toContain('aria-valuetext="75 percent down"')
    // The visible labels are connected to the inputs they name.
    expect(markup).toMatch(/<label class="field-label" for="fill-focal-focal-x">Horizontal<\/label>/)
    expect(markup).toMatch(/<label class="field-label" for="fill-focal-focal-y">Vertical<\/label>/)
    // The group carries the visible "Focal point" heading.
    expect(markup).toContain('aria-labelledby="fill-focal-label"')
    expect(markup).toContain('id="fill-focal-label"')
    // And a readout plus a way back to the centre.
    expect(markup).toContain('25% 75%')
    expect(markup).toContain('aria-label="Recentre the background image"')
  })

  it('disables recentring only when the focal point is already centred', () => {
    const recentre = 'aria-label="Recentre the background image"'
    expect(tagWith(controlMarkup({ backgroundFill: { kind: 'image' } }), recentre)).toContain('disabled=""')

    const moved = controlMarkup({ backgroundFill: { kind: 'image' }, backgroundFocalPoint: { x: 0.5, y: 0.2 } })
    expect(tagWith(moved, recentre)).not.toContain('disabled=""')
  })

  it('states the degradation when an image fill has no image to fill with', () => {
    const withImage = controlMarkup({
      backgroundFill: { kind: 'panoramic' },
      backgroundImage: { name: 'backdrop.png', dataUrl: 'data:image/png;base64,AAA', mimeType: 'image/png' },
    })
    expect(withImage).toContain('The background image, bled past the frame')
    expect(withImage).not.toContain('falls back to the theme paint')

    // The controls stay, because a framing set up before the image arrives is
    // not lost; only the sentence changes.
    const withoutImage = controlMarkup({ backgroundFill: { kind: 'panoramic' }, backgroundImage: null })
    expect(withoutImage).toContain('No background image on this slide yet, so the fill falls back to the theme paint.')
    expect(withoutImage).toContain('fill-focal-focal-x')
  })

  it('resolves an unusable stored fill to the theme rather than rendering nothing', () => {
    const markup = controlMarkup({ backgroundFill: { kind: 'mesh' } as unknown as BackgroundFill })
    expect(markup).toMatch(/<option value="theme" selected=""/)
    expect(markup).toContain('The slide theme paint')
  })

  it('shows a hand-edited out-of-turn angle as the same paint on a slider', () => {
    // 720° is the same paint as 0°, and a range input cannot show more than a
    // turn, so the readout is normalised rather than left off the end of the
    // control.
    const markup = controlMarkup({
      backgroundFill: { kind: 'gradient', gradient: { angle: 720, stops: ['#151525', '#5b4cf0'] } },
    })
    expect(markup).toContain('aria-valuetext="0 degrees"')
    expect(markup).toMatch(/id="fill-background-angle"[^>]*value="0"/)
  })
})
