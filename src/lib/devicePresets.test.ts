import { describe, expect, it } from 'vitest'
import {
  canShowDeviceStatusBar,
  defaultShowDeviceStatusBar,
  DEVICE_FRAME_IDS,
  deviceFamilyLabels,
  deviceFramePresets,
  formatDeviceAspectRatio,
  formatDeviceResolution,
  FRAMELESS_DEVICE_FRAME_ID,
  getDeviceCutoutPath,
  getDeviceCutoutViewBox,
  getDeviceFamilyGroups,
  getDeviceFramePreset,
  getDeviceFrameStyle,
  getDeviceGeometry,
  getFeaturedDeviceFamilyGroups,
  isDeviceFrameId,
  isFramelessDeviceId,
  isKnownDeviceFrameId,
  legacyDeviceFrameAliases,
  resolveDeviceFrameId,
  type DeviceFrameId,
} from './devicePresets'

/**
 * The catalog is the one place a device is defined, so these tests hold it to
 * the properties the renderer and the pickers rely on: enough presets, stable
 * IDs that never collide, legacy names that still resolve, geometry derived from
 * the numbers rather than hard-coded elsewhere, and a safe area that actually
 * covers whatever the frame cuts out of the display.
 */

const ids = deviceFramePresets.map((preset) => preset.id)
const framed = deviceFramePresets.filter((preset) => !isFramelessDeviceId(preset.id))

describe('device catalog shape', () => {
  it('offers at least ten presets across the families the editor supports', () => {
    expect(deviceFramePresets.length).toBeGreaterThanOrEqual(10)
    expect(new Set(ids).size).toBe(ids.length)
    // The ID list and the catalog describe the same vocabulary, so neither can
    // drift without a type error or a failing test.
    expect([...DEVICE_FRAME_IDS].sort()).toEqual([...ids].sort())
  })

  it('covers handsets, tablets, and frameless output, including the catalog shortlist', () => {
    const families = new Set(deviceFramePresets.map((preset) => preset.family))
    expect([...families].sort()).toEqual(['android-phone', 'android-tablet', 'frameless', 'ios-phone', 'ios-tablet'])

    for (const family of families) expect(deviceFamilyLabels[family]).toBeTruthy()
    // Grouping is for the pickers, so the order changes but nothing is lost.
    const grouped = getDeviceFamilyGroups().flatMap((group) => group.presets.map((preset) => preset.id))
    expect([...grouped].sort()).toEqual([...ids].sort())
    // The shortlist is a subset, and it still covers more than one family.
    const featured = getFeaturedDeviceFamilyGroups().flatMap((group) => group.presets.map((preset) => preset.id))
    expect(featured.length).toBeGreaterThan(1)
    expect(featured.length).toBeLessThan(ids.length)
    expect(featured.every((id) => ids.includes(id))).toBe(true)
  })

  it('describes every preset with a name, a ratio, and a resolution', () => {
    for (const preset of deviceFramePresets) {
      expect(preset.name.trim().length).toBeGreaterThan(0)
      expect(preset.description.trim().length).toBeGreaterThan(0)
      expect(preset.screen.width).toBeGreaterThan(0)
      expect(preset.screen.height).toBeGreaterThan(0)
      const geometry = getDeviceGeometry(preset.id)
      expect(geometry.aspectRatioLabel).toMatch(/^\d+(\.\d+)?:(9|1)$/)
      expect(geometry.resolutionLabel).toBe(formatDeviceResolution(preset.screen))
    }
    // Handsets are quoted the way a display spec is written.
    expect(formatDeviceAspectRatio(deviceFramePresets[0])).toBe('19.5:9')
  })
})

describe('legacy device frame IDs', () => {
  it('keeps the three pre-catalog IDs working exactly as they did', () => {
    for (const id of ['iphone', 'android', 'none'] as const) {
      expect(isDeviceFrameId(id)).toBe(true)
      expect(resolveDeviceFrameId(id)).toBe(id)
      expect(getDeviceFramePreset(id).id).toBe(id)
    }
    // The frameless ID older projects store is still the default frameless one.
    expect(FRAMELESS_DEVICE_FRAME_ID).toBe('none')
    expect(isFramelessDeviceId('none')).toBe(true)
  })

  it('maps an older or alternate spelling onto the preset it meant', () => {
    expect(resolveDeviceFrameId('iphone-x')).toBe('iphone')
    expect(resolveDeviceFrameId('iPhone X')).toBe('iphone')
    expect(resolveDeviceFrameId('iphone_island')).toBe('iphone-island')
    expect(resolveDeviceFrameId(' Pixel ')).toBe('android-pixel')
    expect(resolveDeviceFrameId('android-generic')).toBe('android')
    expect(resolveDeviceFrameId('feature-graphic')).toBe('canvas')
    expect(resolveDeviceFrameId('No_Frame')).toBe('none')
  })

  it('falls back to the default for anything it does not recognise', () => {
    expect(resolveDeviceFrameId(undefined)).toBe('iphone')
    expect(resolveDeviceFrameId(null)).toBe('iphone')
    expect(resolveDeviceFrameId(7)).toBe('iphone')
    expect(resolveDeviceFrameId('')).toBe('iphone')
    expect(resolveDeviceFrameId('nokia-3310')).toBe('iphone')
    expect(getDeviceFramePreset('nokia-3310').id).toBe('iphone')
  })

  it('never lets an alias shadow a real preset ID', () => {
    for (const preset of deviceFramePresets) {
      for (const legacyId of preset.legacyIds) {
        expect(legacyDeviceFrameAliases[legacyId]).toBe(preset.id)
        expect(isDeviceFrameId(legacyId)).toBe(false)
      }
    }
    for (const id of DEVICE_FRAME_IDS) expect(isKnownDeviceFrameId(id)).toBe(true)
    expect(isKnownDeviceFrameId('not-a-device')).toBe(false)
    expect(isKnownDeviceFrameId(12)).toBe(false)
  })
})

describe('device geometry derivation', () => {
  it('derives the body from the display and the bezel', () => {
    for (const preset of deviceFramePresets) {
      const geometry = getDeviceGeometry(preset.id)
      expect(geometry.body.width).toBe(preset.screen.width + preset.body.bezelInline * 2)
      expect(geometry.body.height).toBe(preset.screen.height + preset.body.bezelTop + preset.body.bezelBottom)
      expect(geometry.screen.aspectRatio).toBeCloseTo(preset.screen.width / preset.screen.height, 3)
      expect(geometry.body.aspectRatio).toBeCloseTo(geometry.body.width / geometry.body.height, 3)
    }
  })

  it('expresses the bezel and the radii as the percentage of the body width CSS reads', () => {
    for (const preset of deviceFramePresets) {
      const geometry = getDeviceGeometry(preset.id)
      expect(geometry.bezel.inlinePercent).toBeCloseTo((preset.body.bezelInline / geometry.body.width) * 100, 1)
      expect(geometry.bezel.topPercent).toBeCloseTo((preset.body.bezelTop / geometry.body.width) * 100, 1)
      expect(geometry.cornerRadiusPercent).toBeCloseTo((preset.body.cornerRadius / geometry.body.width) * 100, 1)
      expect(geometry.screenCornerRadiusPercent).toBeCloseTo((preset.body.screenCornerRadius / geometry.body.width) * 100, 1)
      // A radius can never be wider than the body it is drawn on.
      expect(geometry.cornerRadiusPercent).toBeLessThanOrEqual(50)
      expect(geometry.screenCornerRadiusPercent).toBeLessThanOrEqual(geometry.cornerRadiusPercent)
    }
  })

  it('keeps a framed body upright and a landscape canvas wide', () => {
    expect(getDeviceGeometry('iphone').body.aspectRatio).toBeLessThan(0.6)
    expect(getDeviceGeometry('ipad-air').body.aspectRatio).toBeGreaterThan(0.6)
    expect(getDeviceGeometry('canvas').orientation).toBe('landscape')
    expect(getDeviceGeometry('canvas').body.aspectRatio).toBeGreaterThan(1)
  })

  it('hands out the same derived object for the same preset', () => {
    expect(getDeviceGeometry('iphone')).toBe(getDeviceGeometry('iphone'))
    // A legacy spelling resolves to the preset it means, not to a copy.
    expect(getDeviceGeometry('iphone-x')).toBe(getDeviceGeometry('iphone'))
  })

  it('derives style variables the frame stylesheet consumes', () => {
    const style = getDeviceFrameStyle('iphone-island') as unknown as Record<string, string>

    expect(style['--device-body-ratio']).toBe(getDeviceGeometry('iphone-island').body.aspectRatio)
    expect(style['--device-bezel-inline']).toMatch(/%$/)
    expect(style['--device-body-radius']).toMatch(/%$/)
    expect(style['--device-screen-radius']).toMatch(/%$/)
    expect(style['--device-body-shadow']).toContain('inset')
  })

  it('drops the body decoration for frameless output', () => {
    const style = getDeviceFrameStyle('canvas') as unknown as Record<string, string>

    expect(style['--device-body-shadow']).toBe('none')
    expect(style['--device-body-background']).toBe('transparent')
    expect(style['--device-body-border']).toBe('transparent')
    expect(style['--device-body-radius']).toBe('0%')
    expect(style['--device-bezel-inline']).toBe('0%')
  })
})

describe('device safe area derivation', () => {
  it('reserves nothing for frameless output', () => {
    for (const id of ['none', 'canvas'] as const) {
      expect(getDeviceGeometry(id).safeArea).toEqual({ topPercent: 0, bottomPercent: 0, inlinePercent: 0 })
      expect(defaultShowDeviceStatusBar(id)).toBe(false)
      expect(canShowDeviceStatusBar(id)).toBe(false)
    }
  })

  it('covers the cutout, so a capture never starts under a notch or a camera', () => {
    for (const preset of framed) {
      const geometry = getDeviceGeometry(preset.id)
      const cutoutBottom = geometry.cutout.bottomPercent
      const chromeBand = geometry.statusBar.topPercent + geometry.statusBar.heightPercent
      expect(geometry.safeArea.topPercent, `${preset.id} safe area`).toBeGreaterThanOrEqual(cutoutBottom)
      // The decorative chrome is placed inside the band the capture respects.
      expect(chromeBand, `${preset.id} chrome band`).toBeGreaterThanOrEqual(cutoutBottom)
      expect(geometry.safeArea.topPercent, `${preset.id} safe area`).toBeLessThan(20)
      expect(geometry.safeArea.bottomPercent).toBeGreaterThanOrEqual(0)
    }
  })

  it('reports the cutout as a share of the display', () => {
    const notch = getDeviceGeometry('iphone').cutout
    expect(notch.kind).toBe('notch')
    expect(notch.centerX).toBe(562.5)
    expect(notch.offsetTopPercent).toBe(0)
    expect(notch.widthPercent).toBeCloseTo((372 / 1125) * 100, 1)
    expect(notch.bottomPercent).toBeCloseTo((66 / 2436) * 100, 1)

    const island = getDeviceGeometry('iphone-island').cutout
    expect(island.kind).toBe('island')
    expect(island.offsetTopPercent).toBeGreaterThan(0)

    const hole = getDeviceGeometry('android').cutout
    expect(hole.kind).toBe('punch-hole')
    expect(hole.width).toBe(hole.height)

    for (const preset of deviceFramePresets.filter((item) => item.cutout.kind === 'none')) {
      expect(getDeviceGeometry(preset.id).cutout.bottomPercent).toBe(0)
    }
  })
})

describe('device cutout paths', () => {
  it('draws nothing for a frame with no cutout', () => {
    for (const id of ['none', 'canvas', 'iphone-se', 'ipad-air', 'android-tablet'] as const) {
      expect(getDeviceCutoutPath(id)).toBeNull()
    }
  })

  it('builds one path per cutout kind, centred on the display', () => {
    const notch = getDeviceCutoutPath('iphone')
    expect(notch).toBeTruthy()
    // A notch is closed by the top edge of the display, so the path starts there.
    expect(notch?.startsWith('M 376.5 0')).toBe(true)
    expect(notch).toContain('A 33 33 0 0 1')

    const island = getDeviceCutoutPath('iphone-island')
    expect(island).toContain('A 36 36 0 0 1')
    expect(island?.startsWith('M 498.5 10')).toBe(true)

    const hole = getDeviceCutoutPath('android')
    // A camera hole is a circle, not a rounded rectangle.
    expect(hole).toMatch(/^M 480 66 a 60 60 0 1 0 120 0 a 60 60 0 1 0 -120 0 Z$/)
  })

  it('uses the display as the view box, so the same path scales to any export', () => {
    expect(getDeviceCutoutViewBox('iphone')).toBe('0 0 1125 2436')
    expect(getDeviceCutoutViewBox('android-tablet')).toBe('0 0 1600 2560')
    // A frameless frame has no cutout and therefore needs no view box.
    expect(getDeviceCutoutPath('none')).toBeNull()
  })

  it('is stable for the same preset, so a preview and an export agree', () => {
    expect(getDeviceCutoutPath('iphone-island-max')).toBe(getDeviceCutoutPath('iphone-island-max'))
  })
})

describe('status bar capability', () => {
  it('offers the chrome on framed presets and refuses it on frameless ones', () => {
    for (const preset of deviceFramePresets) {
      const geometry = getDeviceGeometry(preset.id)
      const framedPreset = !isFramelessDeviceId(preset.id)
      expect(canShowDeviceStatusBar(preset.id)).toBe(framedPreset)
      expect(geometry.supportsStatusBar).toBe(framedPreset)
      expect(defaultShowDeviceStatusBar(preset.id)).toBe(framedPreset)
    }
  })

  it('resolves an unknown value to the default preset instead of throwing', () => {
    const fallback: DeviceFrameId = 'iphone'
    expect(getDeviceGeometry(undefined).id).toBe(fallback)
    expect(canShowDeviceStatusBar(undefined)).toBe(true)
    expect(defaultShowDeviceStatusBar({} as unknown)).toBe(true)
  })
})
