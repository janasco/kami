import { describe, expect, it } from 'vitest'
import { applySlideStyleToDeck, isSameSlideStyle, slideStyleOf } from './slideStyle'
import { serializeProject, type EditorProject } from './project'
import { exportProfiles } from '../data'
import { createTestSlide } from '../test/projectFixtures'
import type { Slide } from '../types'

const projectOf = (slides: Slide[]): EditorProject => ({
  name: 'Style copy',
  slides,
  activeLocale: 'en-US',
  canvasMode: 'isolated',
  selectedExportProfileId: exportProfiles[0].id,
})

const slideWith = (id: string, overrides: Partial<Slide> = {}): Slide => createTestSlide({ id, ...overrides })

describe('applying one slide style to a whole deck', () => {
  it('copies the background fill and the focal point, not just the older fields', () => {
    const source = slideWith('source', {
      theme: 'ocean',
      backgroundFill: { kind: 'panoramic', blend: 'multiply' },
      backgroundFocalPoint: { x: 0.3, y: 0.7 },
    })
    const target = slideWith('target', { theme: 'midnight' })

    const { slides, changedCount } = applySlideStyleToDeck([source, target], source)

    expect(changedCount).toBe(1)
    expect(slides[1].backgroundFill).toEqual({ kind: 'panoramic', blend: 'multiply' })
    expect(slides[1].backgroundFocalPoint).toEqual({ x: 0.3, y: 0.7 })
    expect(slides[1].theme).toBe('ocean')
    // Copy, capture, and copy text are never style.
    expect(slides[1].screenshot).toBe(target.screenshot)
    expect(slides[1].title).toBe(target.title)
  })

  it('copies the record rather than sharing it, so a later edit cannot reach back', () => {
    const source = slideWith('source', { backgroundFill: { kind: 'gradient' }, backgroundFocalPoint: { x: 0.2, y: 0.2 } })
    const { slides } = applySlideStyleToDeck([source, slideWith('target')], source)

    // The copy is normalized, so a bare `{ kind: 'gradient' }` arrives complete.
    expect(slides[1].backgroundFill).toEqual({
      kind: 'gradient',
      gradient: { angle: 145, stops: ['#151525', '#5b4cf0'] },
    })
    expect(slides[1].backgroundFill).not.toBe(source.backgroundFill)
    expect(slides[1].backgroundFill?.gradient).not.toBe(source.backgroundFill?.gradient)
    expect(slides[1].accentShapeStyle).not.toBe(source.accentShapeStyle)
  })

  it('writes the theme fill and the centre focal point as absent, not as a record', () => {
    // A source that was never restyled must not push a theme record onto the
    // rest of the deck: a save has to stay byte-identical for a deck that has
    // not been touched.
    const source = slideWith('source')
    const style = slideStyleOf(source)
    expect(style.backgroundFill).toBeUndefined()
    expect(style.backgroundFocalPoint).toBeUndefined()
    expect(JSON.stringify(style)).not.toContain('backgroundFill')

    const untouched = projectOf([source, slideWith('target')])
    applySlideStyleToDeck(untouched.slides, source)
    expect(JSON.stringify(serializeProject(untouched))).not.toContain('backgroundFill')
  })

  it('does nothing when the whole deck already reads the same', () => {
    const source = slideWith('source', { theme: 'coral', backgroundFill: { kind: 'image' }, backgroundFocalPoint: { x: 0.5, y: 0.42 } })
    const deck = [source, slideWith('a', { theme: 'coral', backgroundFill: { kind: 'image' }, backgroundFocalPoint: { x: 0.5, y: 0.42 } })]

    const { slides, changedCount } = applySlideStyleToDeck(deck, source)
    expect(changedCount).toBe(0)
    // The same array, so the caller can skip the history entry entirely.
    expect(slides[1]).toBe(deck[1])
  })

  it('keeps the object identity of every slide it does not change', () => {
    const source = slideWith('source', { theme: 'ocean' })
    const same = slideWith('same', { theme: 'ocean' })
    const different = slideWith('different', { theme: 'coral' })

    const { slides } = applySlideStyleToDeck([source, same, different], source)
    expect(slides[0]).toBe(source)
    expect(slides[1]).toBe(same)
    expect(slides[2]).not.toBe(different)
  })

  it('never touches the source slide itself', () => {
    const source = slideWith('source', { theme: 'ocean' })
    const { slides } = applySlideStyleToDeck([source, slideWith('target')], source)
    expect(slides[0]).toBe(source)
  })
})

describe('what counts as the same style', () => {
  const base = slideWith('base', { theme: 'ocean', backgroundFill: { kind: 'gradient' }, backgroundFocalPoint: { x: 0.4, y: 0.6 } })

  it('is true for a slide that reads the same', () => {
    expect(isSameSlideStyle(slideWith('other', {
      theme: 'ocean',
      backgroundFill: { kind: 'gradient' },
      backgroundFocalPoint: { x: 0.4, y: 0.6 },
    }), base)).toBe(true)
  })

  it('sees through spelling and case that mean nothing', () => {
    // A slide that matches the base everywhere, so the only variable is spelling.
    const matching = (overrides: Partial<Slide> = {}) => slideWith('other', {
      theme: 'ocean',
      backgroundFill: { kind: 'gradient' },
      backgroundFocalPoint: { x: 0.4, y: 0.6 },
      ...overrides,
    })

    expect(isSameSlideStyle(matching({ accentShapeStyle: { type: 'circle', color: '#6F62E8' } }), base)).toBe(true)
    // A gradient stored with its stops spelled out reads the same as a bare kind,
    // because the bare kind resolves to exactly those stops.
    expect(isSameSlideStyle(matching({
      backgroundFill: { kind: 'gradient', gradient: { angle: 145, stops: ['#151525', '#5b4cf0'] } },
    }), base)).toBe(true)
    // A stored centre focal point means the same as none at all, so it never
    // makes a deck look like it needs restyling.
    const centred = matching({ backgroundFocalPoint: undefined })
    const explicitCentre = slideWith('other', {
      theme: 'ocean',
      backgroundFill: { kind: 'gradient' },
      backgroundFocalPoint: { x: 0.5, y: 0.5 },
    })
    expect(isSameSlideStyle(centred, explicitCentre)).toBe(true)
  })

  it('is false for every field that changes what a slide looks like', () => {
    const variants: Array<[string, Partial<Slide>]> = [
      ['layout', { layout: 'spotlight' }],
      ['theme', { theme: 'coral' }],
      ['device frame', { deviceFrameId: 'android' }],
      ['status bar', { showDeviceStatusBar: false }],
      ['screenshot fit', { screenshotFit: 'cover' }],
      ['accent shape', { accentShapeStyle: { type: 'pill', color: '#0b1020' } }],
      ['fill kind', { backgroundFill: { kind: 'image' } }],
      ['gradient angle', { backgroundFill: { kind: 'gradient', gradient: { angle: 200, stops: ['#151525', '#5b4cf0'] } } }],
      ['gradient stop', { backgroundFill: { kind: 'gradient', gradient: { angle: 145, stops: ['#151525', '#0b1020'] } } }],
      ['blend', { backgroundFill: { kind: 'gradient', blend: 'screen' } }],
      ['focal point', { backgroundFocalPoint: { x: 0.4, y: 0.61 } }],
    ]

    for (const [label, overrides] of variants) {
      expect(isSameSlideStyle(slideWith('other', overrides), base), label).toBe(false)
    }
  })

  /**
   * A device variant is not a slide field, and that is the point.
   *
   * The style list covers every field a variant is allowed to override —
   * `deviceFrameId`, `showDeviceStatusBar`, and `screenshotFit` are all in it —
   * because those three are the deck's own values and the variant restates them.
   * The override record itself is a per-device decision, so copying the deck
   * style must leave it alone: an author who set a Pixel frame for the tablet
   * variant did not ask for "apply this style to all slides" to reach across and
   * change it.
   */
  it('leaves a device variant override alone when the deck style is applied', () => {
    const source = slideWith('source', { deviceFrameId: 'android-pixel', screenshotFit: 'cover' })
    const target = slideWith('target', { deviceFrameId: 'iphone' })
    const variant = {
      id: 'variant-tablet',
      name: 'Tablet',
      canvasId: 'main-story',
      locale: 'en-US' as const,
      themeId: 'midnight' as const,
      slideIds: ['source', 'target'],
      enabled: true,
      exportProfileId: 'app-store' as const,
      deviceOverrides: [{ slideId: 'target', deviceFrameId: 'ipad-air' as const }],
    }

    const { slides } = applySlideStyleToDeck([source, target], source)
    const document = serializeProject({ ...projectOf(slides), outputVariants: [variant] })
    const overrides = (document as { outputVariants: Array<{ deviceOverrides?: Array<Record<string, unknown>> }> })
      .outputVariants[0].deviceOverrides

    // The deck followed the source slide...
    expect(slides[1].deviceFrameId).toBe('android-pixel')
    // ...and the variant's own device did not move.
    expect(overrides).toEqual([{ slideId: 'target', deviceFrameId: 'ipad-air' }])
  })

  it('treats a blend as inert unless both slides use an image fill', () => {
    // The record is normalized before it is read, so a stray blend left on a
    // gradient cannot make every slide look different from every other.
    const gradient = slideWith('g', { backgroundFill: { kind: 'gradient', blend: 'screen' } })
    const plain = slideWith('p', { backgroundFill: { kind: 'gradient' } })
    expect(isSameSlideStyle(plain, gradient)).toBe(true)
    expect(isSameSlideStyle(plain, slideWith('i', { backgroundFill: { kind: 'image', blend: 'screen' } }))).toBe(false)
  })
})
