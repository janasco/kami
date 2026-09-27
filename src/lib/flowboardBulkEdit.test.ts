import { describe, expect, it } from 'vitest'
import { createSlide, DEFAULT_BACKGROUND_COLOR, getLayout, getTheme, starterSlide } from '../data'
import {
  applyBulkSlideAction,
  bulkActionMergeKey,
  bulkActionValue,
  describeBulkSlideAction,
  describeBulkSlideCaveat,
  describeBulkSlideResult,
  describeFramelessTargets,
  resolveTargetSlides,
  sharedValue,
} from './flowboardBulkEdit'
import { serializeProject, type EditorProject } from './project'
import { exportProfiles } from '../data'
import type { Slide } from '../types'

const deck: Slide[] = [
  { ...starterSlide, id: 'slide-a', deviceFrameId: 'iphone', screenshotFit: 'contain', showDeviceStatusBar: true, theme: 'midnight', layout: 'hero' },
  { ...starterSlide, id: 'slide-b', deviceFrameId: 'android', screenshotFit: 'cover', showDeviceStatusBar: false, theme: 'coral', layout: 'centered' },
  { ...starterSlide, id: 'slide-c', deviceFrameId: 'none', screenshotFit: 'contain', showDeviceStatusBar: true, theme: 'midnight', layout: 'hero' },
]

const allIds = deck.map((slide) => slide.id)

const projectOf = (slides: Slide[]): EditorProject => ({
  name: 'Bulk fill project',
  slides,
  activeLocale: 'en-US',
  canvasMode: 'isolated',
  selectedExportProfileId: exportProfiles[0].id,
})

describe('bulk action payloads', () => {
  it('writes the device frame, fit, and status bar the way the single-slide controls do', () => {
    expect(applyBulkSlideAction(deck[0], { kind: 'device-frame', deviceFrameId: 'android' })?.deviceFrameId).toBe('android')
    expect(applyBulkSlideAction(deck[0], { kind: 'screenshot-fit', screenshotFit: 'cover' })?.screenshotFit).toBe('cover')
    expect(applyBulkSlideAction(deck[0], { kind: 'device-status-bar', visible: false })?.showDeviceStatusBar).toBe(false)
  })

  it('writes layout, theme, and layer settings without touching copy or captures', () => {
    const withCopy = { ...deck[0], title: 'Keep me', screenshot: 'data:image/png;base64,AAA' }

    const themed = applyBulkSlideAction(withCopy, { kind: 'theme', theme: 'forest' })
    expect(themed?.theme).toBe('forest')
    expect(themed?.title).toBe('Keep me')
    expect(themed?.screenshot).toBe('data:image/png;base64,AAA')

    expect(applyBulkSlideAction(deck[0], { kind: 'layout', layout: 'spotlight' })?.layout).toBe('spotlight')

    const hidden = applyBulkSlideAction(deck[0], { kind: 'layer-visibility', layerId: 'accent-shape', visible: false })
    expect(hidden?.layerSettings['accent-shape'].visible).toBe(false)
    // Sibling layers keep their own settings.
    expect(hidden?.layerSettings.headline).toEqual(deck[0].layerSettings.headline)
  })

  it('returns null when a slide already holds the requested value', () => {
    expect(applyBulkSlideAction(deck[0], { kind: 'device-frame', deviceFrameId: 'iphone' })).toBeNull()
    expect(applyBulkSlideAction(deck[0], { kind: 'screenshot-fit', screenshotFit: 'contain' })).toBeNull()
    expect(applyBulkSlideAction(deck[0], { kind: 'theme', theme: 'midnight' })).toBeNull()
    expect(applyBulkSlideAction(deck[0], { kind: 'device-status-bar', visible: true })).toBeNull()
    expect(applyBulkSlideAction(deck[0], { kind: 'layer-visibility', layerId: 'accent-shape', visible: true })).toBeNull()
  })

  it('clamps a bulk opacity into the supported range', () => {
    // The accent shape starts at 0.2, so a clamped 1 is a real change.
    expect(applyBulkSlideAction(deck[0], { kind: 'layer-opacity', layerId: 'accent-shape', opacity: 1.4 })?.layerSettings['accent-shape'].opacity).toBe(1)
    expect(applyBulkSlideAction(deck[0], { kind: 'layer-opacity', layerId: 'accent-shape', opacity: -2 })?.layerSettings['accent-shape'].opacity).toBe(0)
    // A non-finite value falls back to the slide's own opacity, so nothing changes.
    expect(applyBulkSlideAction(deck[0], { kind: 'layer-opacity', layerId: 'accent-shape', opacity: Number.NaN })).toBeNull()
    expect(applyBulkSlideAction(deck[0], { kind: 'layer-opacity', layerId: 'headline', opacity: 0.5 })?.layerSettings.headline.opacity).toBe(0.5)
  })

  it('leaves a slide without the requested layer alone', () => {
    const base = createSlide()
    const withoutLayer = {
      ...base,
      id: 'slide-d',
      layerSettings: { ...base.layerSettings, footer: undefined as unknown as Slide['layerSettings']['footer'] },
    }
    expect(applyBulkSlideAction(withoutLayer, { kind: 'layer-opacity', layerId: 'footer', opacity: 0.5 })).toBeNull()
    expect(applyBulkSlideAction(withoutLayer, { kind: 'layer-visibility', layerId: 'footer', visible: false })).toBeNull()
  })
})

describe('bulk background fill actions', () => {
  const withBackground = (overrides: Partial<Slide> = {}): Slide => ({
    ...deck[0],
    backgroundImage: { name: 'backdrop.png', dataUrl: 'data:image/png;base64,AAA', mimeType: 'image/png' },
    ...overrides,
  })

  it('writes the fill the single-slide control writes, through the same normalizer', () => {
    const applied = applyBulkSlideAction(withBackground(), { kind: 'background-fill', backgroundFill: 'panoramic' })
    expect(applied?.backgroundFill).toEqual({ kind: 'panoramic' })
    // A colour the slide already carried does not survive a switch to a fill
    // that has nowhere to put it.
    const solid = applyBulkSlideAction(withBackground({ backgroundFill: { kind: 'solid', color: '#0b1020' } }), { kind: 'background-fill', backgroundFill: 'image' })
    expect(solid?.backgroundFill).toEqual({ kind: 'image' })
    expect(applyBulkSlideAction(withBackground(), { kind: 'background-fill', backgroundFill: 'solid' })?.backgroundFill)
      .toEqual({ kind: 'solid', color: DEFAULT_BACKGROUND_COLOR })
  })

  it('clears the record entirely for the theme fill, so a save writes no field', () => {
    const applied = applyBulkSlideAction(withBackground({ backgroundFill: { kind: 'gradient' } }), { kind: 'background-fill', backgroundFill: 'theme' })
    expect(applied?.backgroundFill).toBeUndefined()
    expect(serializeProject(projectOf([applied!])).slides[0]).not.toHaveProperty('backgroundFill')
  })

  it('returns null when the whole selection already holds the fill', () => {
    expect(applyBulkSlideAction(withBackground({ backgroundFill: { kind: 'panoramic', blend: 'screen' } }), { kind: 'background-fill', backgroundFill: 'panoramic' })).toBeNull()
    expect(applyBulkSlideAction(deck[0], { kind: 'background-fill', backgroundFill: 'theme' })).toBeNull()
  })

  it('clamps a bulk focal point and drops it again at the centre', () => {
    const applied = applyBulkSlideAction(withBackground(), { kind: 'focal-point', focalPoint: { x: 5, y: -2 } })
    expect(applied?.backgroundFocalPoint).toEqual({ x: 1, y: 0 })

    const recentred = applyBulkSlideAction(
      { ...withBackground(), backgroundFocalPoint: { x: 0.2, y: 0.3 } },
      { kind: 'focal-point', focalPoint: { x: 0.5, y: 0.5 } },
    )
    expect(recentred?.backgroundFocalPoint).toBeUndefined()
    expect(recentred).not.toBeNull()
  })

  it('returns null when the focal point already sits where the action puts it', () => {
    expect(applyBulkSlideAction(withBackground(), { kind: 'focal-point', focalPoint: { x: 0.5, y: 0.5 } })).toBeNull()
    expect(applyBulkSlideAction(
      { ...withBackground(), backgroundFocalPoint: { x: 0.3, y: 0.4 } },
      { kind: 'focal-point', focalPoint: { x: 0.3, y: 0.4 } },
    )).toBeNull()
  })

  it('gives the fill choice its own undo step and coalesces a focal drag', () => {
    const ids = allIds
    expect(bulkActionMergeKey({ kind: 'background-fill', backgroundFill: 'panoramic' }, ids))
      .toBe('bulk:3:background-fill:panoramic')
    expect(bulkActionMergeKey({ kind: 'background-fill', backgroundFill: 'image' }, ids))
      .not.toBe(bulkActionMergeKey({ kind: 'background-fill', backgroundFill: 'panoramic' }, ids))

    const near = bulkActionMergeKey({ kind: 'focal-point', focalPoint: { x: 0.1, y: 0.1 } }, ids)
    const far = bulkActionMergeKey({ kind: 'focal-point', focalPoint: { x: 0.9, y: 0.9 } }, ids)
    expect(near).toBe(far)
    expect(near).toBe('bulk:3:focal-point')
  })

  it('describes both actions in the bulk notice', () => {
    expect(describeBulkSlideAction({ kind: 'background-fill', backgroundFill: 'panoramic' })).toBe('Background fill set to Panoramic')
    expect(describeBulkSlideAction({ kind: 'focal-point', focalPoint: { x: 0.5, y: 0.42 } }))
      .toBe('Background focal point set to 50% across, 42% down')
    expect(bulkActionValue({ kind: 'background-fill', backgroundFill: 'image' })).toBe('image')
  })

  it('warns when an image fill is applied to slides that have no image', () => {
    const targets = [withBackground(), deck[1], deck[2]]
    expect(describeBulkSlideCaveat({ kind: 'background-fill', backgroundFill: 'image' }, targets))
      .toBe('2 selected slides have no background image, so the theme paint shows until one is added.')
    expect(describeBulkSlideCaveat({ kind: 'background-fill', backgroundFill: 'image' }, [withBackground()])).toBeNull()
    expect(describeBulkSlideCaveat({ kind: 'background-fill', backgroundFill: 'gradient' }, targets)).toBeNull()
    expect(describeBulkSlideCaveat({ kind: 'focal-point', focalPoint: { x: 0.5, y: 0.5 } }, targets)).toBeNull()
  })
})

describe('bulk action copy and history keys', () => {
  it('describes each action with the existing catalog names', () => {
    expect(describeBulkSlideAction({ kind: 'device-frame', deviceFrameId: 'android' })).toBe('Device frame set to Android')
    expect(describeBulkSlideAction({ kind: 'screenshot-fit', screenshotFit: 'cover' })).toBe('Screenshot fit set to Cover')
    expect(describeBulkSlideAction({ kind: 'device-status-bar', visible: false })).toBe('Device status bar turned off')
    expect(describeBulkSlideAction({ kind: 'layout', layout: 'spotlight' })).toBe('Layout set to Spotlight')
    expect(describeBulkSlideAction({ kind: 'theme', theme: 'forest' })).toBe('Theme set to Forest')
    expect(describeBulkSlideAction({ kind: 'layer-visibility', layerId: 'screenshot', visible: false })).toBe('Hide the screenshot / device layer')
    expect(describeBulkSlideAction({ kind: 'layer-opacity', layerId: 'headline', opacity: 0.45 })).toBe('Headline opacity set to 45%')
    expect(getLayout('spotlight').name).toBe('Spotlight')
    expect(getTheme('forest').name).toBe('Forest')
  })

  it('reports how many slides a bulk action changed', () => {
    expect(describeBulkSlideResult({ kind: 'theme', theme: 'ocean' }, 2)).toBe('Theme set to Ocean on 2 slides. Undo is available.')
    expect(describeBulkSlideResult({ kind: 'theme', theme: 'ocean' }, 1)).toBe('Theme set to Ocean on 1 slide. Undo is available.')
  })

  it('gives discrete actions a value-scoped merge key so each is its own undo step', () => {
    expect(bulkActionMergeKey({ kind: 'theme', theme: 'ocean' }, ['slide-a', 'slide-b'])).toBe('bulk:2:theme:ocean')
    expect(bulkActionMergeKey({ kind: 'theme', theme: 'ocean' }, ['slide-a']))
      .not.toBe(bulkActionMergeKey({ kind: 'theme', theme: 'ocean' }, ['slide-a', 'slide-b']))
  })

  it('keeps the opacity merge key value-free so a slider drag coalesces', () => {
    const low = bulkActionMergeKey({ kind: 'layer-opacity', layerId: 'headline', opacity: 0.2 }, allIds)
    const high = bulkActionMergeKey({ kind: 'layer-opacity', layerId: 'headline', opacity: 0.9 }, allIds)
    expect(low).toBe(high)
    expect(bulkActionMergeKey({ kind: 'layer-opacity', layerId: 'footer', opacity: 0.2 }, allIds)).not.toBe(low)
  })

  it('exposes the scalar a bulk action writes', () => {
    expect(bulkActionValue({ kind: 'device-status-bar', visible: true })).toBe('on')
    expect(bulkActionValue({ kind: 'layer-visibility', layerId: 'kicker', visible: false })).toBe('kicker:hidden')
  })
})

describe('bulk bar state helpers', () => {
  it('reports the shared value of a selection and null when it is mixed', () => {
    const noSlides: Slide[] = []
    expect(sharedValue(deck, (slide) => slide.theme)).toBeNull()
    expect(sharedValue([deck[0], deck[2]], (slide) => slide.theme)).toBe('midnight')
    expect(sharedValue(noSlides, (slide) => slide.theme)).toBeNull()
  })

  it('resolves the target slides in deck order regardless of click order', () => {
    const targets = resolveTargetSlides(deck, ['slide-c', 'slide-a'])
    expect(targets.map((slide) => slide.id)).toEqual(['slide-a', 'slide-c'])
    expect(resolveTargetSlides(deck, ['slide-gone'])).toEqual([])
  })

  it('warns when the selection mixes frameless presets with the status bar', () => {
    expect(describeFramelessTargets(resolveTargetSlides(deck, ['slide-a', 'slide-b']))).toBeNull()
    expect(describeFramelessTargets(resolveTargetSlides(deck, ['slide-a', 'slide-c']))).toBe(
      '1 selected slide uses a frameless preset, so no status chrome is drawn there.',
    )
    expect(describeFramelessTargets(resolveTargetSlides(deck, allIds))).toBe(
      '1 selected slide uses a frameless preset, so no status chrome is drawn there.',
    )
  })
})
