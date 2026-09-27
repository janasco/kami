import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import {
  backgroundBlendOptions,
  backgroundFillOptions,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BACKGROUND_FILL,
  DEFAULT_BACKGROUND_GRADIENT,
} from '../data'
import {
  clampFocalPoint,
  describeBackgroundFill,
  formatFocalPoint,
  getBackgroundFillStyle,
  getThemePaint,
  isBackgroundFillKind,
  isDefaultFocalPoint,
  resolveBackgroundBlend,
  resolveBackgroundFill,
  resolveBackgroundScale,
  resolveIntrinsicSize,
  usesBackgroundImageLayer,
  PANORAMIC_MAX_BLEED,
} from './backgroundFill'
import type { BackgroundFill, FocalPoint } from '../types'

const styleFor = (options: Parameters<typeof getBackgroundFillStyle>[0]) =>
  getBackgroundFillStyle(options) as unknown as Record<string, string>

const APP_STORE_ASPECT = exportProfiles[0].width / exportProfiles[0].height

describe('background fill kind resolution', () => {
  it('defaults to the theme fill so an absent field renders as it always did', () => {
    expect(DEFAULT_BACKGROUND_FILL).toBe('theme')
    expect(resolveBackgroundFill(undefined).kind).toBe('theme')
    expect(resolveBackgroundFill(null).kind).toBe('theme')
    expect(resolveBackgroundFill('mesh').kind).toBe('theme')
    expect(resolveBackgroundFill({}).kind).toBe('theme')
    expect(resolveBackgroundFill({ kind: 'mesh' }).kind).toBe('theme')
    expect(resolveBackgroundFill({ kind: 7 }).kind).toBe('theme')
  })

  it('accepts every catalogued kind and tolerates loose spellings', () => {
    expect(resolveBackgroundFill({ kind: 'panoramic' }).kind).toBe('panoramic')
    expect(resolveBackgroundFill({ kind: ' Gradient ' }).kind).toBe('gradient')
    expect(resolveBackgroundFill({ kind: 'IMAGE' }).kind).toBe('image')
    // A bare kind is accepted too, so every reader asks the same question.
    expect(resolveBackgroundFill('solid').kind).toBe('solid')
    expect(backgroundFillOptions.map((option) => option.id))
      .toEqual(['theme', 'solid', 'gradient', 'image', 'panoramic'])
    for (const option of backgroundFillOptions) {
      expect(isBackgroundFillKind(option.id)).toBe(true)
      expect(describeBackgroundFill(option.id)).toBe(option.description)
      expect(describeBackgroundFill({ kind: option.id })).toBe(option.description)
    }
  })

  it('knows which kinds draw the background image layer as the fill', () => {
    expect(usesBackgroundImageLayer('image')).toBe(true)
    expect(usesBackgroundImageLayer('panoramic')).toBe(true)
    expect(usesBackgroundImageLayer('theme')).toBe(false)
    expect(usesBackgroundImageLayer('solid')).toBe(false)
    expect(usesBackgroundImageLayer('gradient')).toBe(false)
    expect(usesBackgroundImageLayer('nonsense')).toBe(false)
  })
})

describe('background fill normalization', () => {
  it('fills in the colour and gradient a stored record left out', () => {
    expect(resolveBackgroundFill({ kind: 'solid' })).toEqual({
      kind: 'solid',
      color: DEFAULT_BACKGROUND_COLOR,
    })
    expect(resolveBackgroundFill({ kind: 'gradient' }).gradient).toEqual(DEFAULT_BACKGROUND_GRADIENT)
  })

  it('drops values that do not apply to the kind, so a saved fill stays minimal', () => {
    const noisy = { kind: 'theme', color: '#ff0000', blend: 'multiply' } as unknown
    expect(resolveBackgroundFill(noisy)).toEqual({ kind: 'theme' })

    const solid = resolveBackgroundFill({ kind: 'solid', color: '#ff0000', gradient: DEFAULT_BACKGROUND_GRADIENT })
    expect(solid).toEqual({ kind: 'solid', color: '#ff0000' })
  })

  it('replaces a malformed colour, angle, and stop instead of rejecting the fill', () => {
    expect(resolveBackgroundFill({ kind: 'solid', color: 'rebeccapurple' }))
      .toEqual({ kind: 'solid', color: DEFAULT_BACKGROUND_COLOR })
    expect(resolveBackgroundFill({ kind: 'gradient', gradient: { angle: 'sideways', stops: ['#000000'] } }).gradient)
      .toEqual({ angle: DEFAULT_BACKGROUND_GRADIENT.angle, stops: ['#000000'] })
    expect(resolveBackgroundFill({ kind: 'gradient', gradient: { angle: 200, stops: ['nope', '#5b4cf0'] } }).gradient)
      .toEqual({ angle: 200, stops: [DEFAULT_BACKGROUND_GRADIENT.stops[0], '#5b4cf0'] })
  })

  it('keeps only a blend that is in the catalog, and drops the default one', () => {
    expect(resolveBackgroundFill({ kind: 'panoramic', blend: 'screen' }))
      .toEqual({ kind: 'panoramic', blend: 'screen' })
    expect(resolveBackgroundFill({ kind: 'panoramic', blend: 'normal' }))
      .toEqual({ kind: 'panoramic' })
    expect(resolveBackgroundFill({ kind: 'image', blend: 'luminosity' }))
      .toEqual({ kind: 'image' })
    expect(resolveBackgroundBlend(undefined)).toBe('normal')
    expect(backgroundBlendOptions.map((option) => option.id))
      .toEqual(['normal', 'multiply', 'screen', 'overlay'])
  })

  it('hands back a fresh record so a caller cannot mutate the defaults', () => {
    const first = resolveBackgroundFill({ kind: 'gradient' })
    ;(first.gradient as { angle: number }).angle = 12
    expect(resolveBackgroundFill({ kind: 'gradient' }).gradient?.angle)
      .toBe(DEFAULT_BACKGROUND_GRADIENT.angle)
  })
})

describe('focal point clamping', () => {
  it('holds both axes inside the unit square', () => {
    expect(clampFocalPoint({ x: 0.25, y: 0.75 })).toEqual({ x: 0.25, y: 0.75 })
    expect(clampFocalPoint({ x: -3, y: 4 })).toEqual({ x: 0, y: 1 })
  })

  it('falls back to the centre for a missing or unusable value', () => {
    expect(clampFocalPoint(undefined)).toEqual({ x: 0.5, y: 0.5 })
    expect(clampFocalPoint(null)).toEqual({ x: 0.5, y: 0.5 })
    expect(clampFocalPoint('middle')).toEqual({ x: 0.5, y: 0.5 })
    expect(clampFocalPoint({ x: Number.NaN, y: 1 / 3 })).toEqual({ x: 0.5, y: 1 / 3 })
    expect(clampFocalPoint({ x: 0.2, y: Number.POSITIVE_INFINITY })).toEqual({ x: 0.2, y: 0.5 })
  })

  it('recognises the centre, which is the value a document leaves out', () => {
    expect(isDefaultFocalPoint({ x: 0.5, y: 0.5 })).toBe(true)
    expect(isDefaultFocalPoint({ x: 0.5, y: 0.42 })).toBe(false)
    expect(isDefaultFocalPoint({ x: 0, y: 1 })).toBe(false)
  })

  it('formats as the CSS object-position the stylesheet consumes', () => {
    expect(formatFocalPoint({ x: 0.5, y: 0.42 })).toBe('50% 42%')
    expect(formatFocalPoint({ x: 0, y: 1 })).toBe('0% 100%')
    expect(formatFocalPoint({ x: 1 / 3, y: 2 / 3 })).toBe('33.33% 66.67%')
    expect(formatFocalPoint(undefined)).toBe('50% 50%')
  })
})

describe('theme paint', () => {
  it('is the same gradient the canvas stylesheet already draws', () => {
    expect(getThemePaint('midnight')).toBe('linear-gradient(145deg, #151525, #5b4cf0)')
    expect(getThemePaint('ocean')).toBe('linear-gradient(145deg, #e5f4ff, #4b9ee8)')
  })

  it('falls back to the first catalogued theme for an unknown id', () => {
    expect(getThemePaint('neon')).toBe(getThemePaint('midnight'))
  })
})

describe('panoramic overscan', () => {
  it('leaves every other kind at plain cover', () => {
    expect(resolveBackgroundScale('image', 3, 0.5)).toBe(1)
    expect(resolveBackgroundScale('theme', 3, 0.5)).toBe(1)
    expect(resolveBackgroundScale(undefined, 3, 0.5)).toBe(1)
  })

  it('bleeds fully once the image is twice as wide as the frame', () => {
    expect(resolveBackgroundScale('panoramic', 1, 0.5)).toBeCloseTo(1 + PANORAMIC_MAX_BLEED, 4)
    expect(resolveBackgroundScale('panoramic', 40, 0.5)).toBeCloseTo(1 + PANORAMIC_MAX_BLEED, 4)
  })

  it('tapers the bleed as the image approaches the frame width', () => {
    const half = resolveBackgroundScale('panoramic', 0.75, 0.5)
    const full = resolveBackgroundScale('panoramic', 1, 0.5)
    expect(half).toBeCloseTo(1 + PANORAMIC_MAX_BLEED / 2, 4)
    expect(half).toBeLessThan(full)
  })

  it('adds no bleed when the image is not wider than the frame', () => {
    expect(resolveBackgroundScale('panoramic', 0.5, 0.5)).toBe(1)
    expect(resolveBackgroundScale('panoramic', 0.25, 0.5)).toBe(1)
  })

  it('degrades to plain cover when either ratio is missing or unusable', () => {
    expect(resolveBackgroundScale('panoramic', null, 0.5)).toBe(1)
    expect(resolveBackgroundScale('panoramic', 3, null)).toBe(1)
    expect(resolveBackgroundScale('panoramic', 0, 0.5)).toBe(1)
    expect(resolveBackgroundScale('panoramic', 3, 0)).toBe(1)
    expect(resolveBackgroundScale('panoramic', Number.NaN, Number.NaN)).toBe(1)
  })

  it('never leaves a scale that could expose an image edge', () => {
    const appStore = exportProfiles[0].width / exportProfiles[0].height
    for (const profile of exportProfiles) {
      const aspect = profile.width / profile.height
      expect(resolveBackgroundScale('panoramic', aspect, aspect)).toBe(1)
      expect(resolveBackgroundScale('panoramic', 21 / 9, aspect)).toBeGreaterThanOrEqual(1)
      expect(resolveBackgroundScale('panoramic', 21 / 9, aspect)).toBeLessThanOrEqual(1 + PANORAMIC_MAX_BLEED)
    }
    expect(resolveBackgroundScale('panoramic', 21 / 9, appStore)).toBeCloseTo(1.06, 4)
  })
})

describe('intrinsic size hints', () => {
  it('accepts a positive pair and rejects everything else', () => {
    expect(resolveIntrinsicSize({ width: 3000, height: 1000 })).toEqual({ width: 3000, height: 1000 })
    expect(resolveIntrinsicSize({ width: 3000 })).toBeNull()
    expect(resolveIntrinsicSize({ width: 0, height: 1000 })).toBeNull()
    expect(resolveIntrinsicSize({ width: '3000', height: '1000' })).toBeNull()
    expect(resolveIntrinsicSize(null)).toBeNull()
    expect(resolveIntrinsicSize(undefined)).toBeNull()
  })
})

describe('background fill style', () => {
  const themePaint = getThemePaint('midnight')
  const base = { themeId: 'midnight' as const, profileAspectRatio: APP_STORE_ASPECT }

  it('resolves the theme paint for a slide with no fill', () => {
    const style = styleFor({ ...base, fill: undefined })
    expect(style['--background-fill']).toBe('theme')
    expect(style['--background-paint']).toBe(themePaint)
    expect(style['--background-position']).toBe('50% 50%')
    expect(style['--background-scale']).toBe('1')
    expect(style['--background-blend']).toBe('normal')
  })

  it('paints a solid fill with the stored colour', () => {
    const style = styleFor({ ...base, fill: { kind: 'solid', color: '#0b1020' } })
    expect(style['--background-fill']).toBe('solid')
    expect(style['--background-solid']).toBe('#0b1020')
    expect(style['--background-paint']).toBe('#0b1020')
  })

  it('paints a gradient from the stored angle and stops', () => {
    const style = styleFor({ ...base, fill: { kind: 'gradient', gradient: { angle: 145, stops: ['#151525', '#5b4cf0'] } } })
    expect(style['--background-gradient']).toBe('linear-gradient(145deg, #151525, #5b4cf0)')
    expect(style['--background-paint']).toBe('linear-gradient(145deg, #151525, #5b4cf0)')
  })

  it('keeps the theme paint under an image fill so a failure never shows a hole', () => {
    const image = styleFor({ ...base, fill: { kind: 'image' } })
    const panoramic = styleFor({
      ...base,
      fill: { kind: 'panoramic', blend: 'multiply' },
      intrinsicSize: { width: 3000, height: 1000 },
    })
    expect(image['--background-paint']).toBe(themePaint)
    expect(image['--background-blend']).toBe('normal')
    expect(panoramic['--background-paint']).toBe(themePaint)
    expect(panoramic['--background-blend']).toBe('multiply')
  })

  it('scales a panoramic fill from the measured size, and nothing else', () => {
    const size = { width: 3000, height: 1000 }
    expect(styleFor({ ...base, fill: { kind: 'panoramic' }, intrinsicSize: size })['--background-scale'])
      .toBe(String(resolveBackgroundScale('panoramic', 3, APP_STORE_ASPECT)))
    expect(styleFor({ ...base, fill: { kind: 'image' }, intrinsicSize: size })['--background-scale']).toBe('1')
    expect(styleFor({ ...base, fill: { kind: 'panoramic' } })['--background-scale']).toBe('1')
  })

  it('carries the focal point through as a direction-agnostic percentage', () => {
    const style = styleFor({ ...base, fill: { kind: 'panoramic' }, focalPoint: { x: 0.5, y: 0.42 } })
    expect(style['--background-position']).toBe('50% 42%')
  })

  it('always publishes the full variable set, so a stylesheet never guesses', () => {
    const expected = [
      '--background-fill',
      '--background-solid',
      '--background-gradient',
      '--background-paint',
      '--background-position',
      '--background-scale',
      '--background-blend',
    ]
    for (const fill of [undefined, { kind: 'solid' } as BackgroundFill, { kind: 'gradient' } as BackgroundFill, { kind: 'image' } as BackgroundFill, { kind: 'panoramic' } as BackgroundFill]) {
      const style = styleFor({ ...base, fill })
      expect(Object.keys(style).sort()).toEqual([...expected].sort())
      for (const key of expected) expect(typeof style[key]).toBe('string')
    }
  })

  it('is stable for the same slide, so preview and export cannot disagree', () => {
    const focalPoint: FocalPoint = { x: 0.2, y: 0.8 }
    const options = { ...base, fill: { kind: 'panoramic' as const, blend: 'screen' as const }, focalPoint, intrinsicSize: { width: 2400, height: 600 } }
    expect(styleFor(options)).toEqual(styleFor(options))
  })
})
