import type { CSSProperties } from 'react'

/**
 * Parametric device catalog.
 *
 * Every frame in the editor is described by numbers in this file: the display
 * resolution it was designed for, the bezel thickness, the corner radii, the
 * shape interrupted at the top of the body, and the bands the operating system
 * reserves. The renderer turns those numbers into CSS variables plus one
 * computed SVG path, so a device is never a bundled picture, and a preview and
 * an export read exactly the same geometry.
 *
 * No manufacturer artwork, logo, or traced silhouette is used anywhere: a frame
 * is a rounded rectangle, a circle, or a path built from the values below.
 */

/** Families the catalog is grouped by in the editor. */
export type DeviceFamilyId = 'ios-phone' | 'ios-tablet' | 'android-phone' | 'android-tablet' | 'frameless'

/** Coarse screen class, used for previews and picker copy. */
export type DeviceScreenClass = 'phone' | 'tablet' | 'canvas'

/** How the display is interrupted at the top edge of the body. */
export type DeviceCutoutKind = 'none' | 'notch' | 'island' | 'bar' | 'punch-hole'

export type DeviceOrientation = 'portrait' | 'landscape'

/** Stable preset IDs. Persisted values outside this list are mapped by alias. */
export const DEVICE_FRAME_IDS = [
  'iphone',
  'iphone-se',
  'iphone-island',
  'iphone-island-max',
  'ipad-mini',
  'ipad-air',
  'android',
  'android-pixel',
  'android-galaxy',
  'android-tablet',
  'none',
  'canvas',
] as const

export type DeviceFrameId = (typeof DEVICE_FRAME_IDS)[number]

/** Native display resolution a capture is designed for, in pixels. */
export interface DeviceScreenSpec {
  width: number
  height: number
}

/** Outer body geometry, measured in display pixels so the numbers stay comparable. */
export interface DeviceBodySpec {
  bezelTop: number
  bezelInline: number
  bezelBottom: number
  /** Outer corner radius. */
  cornerRadius: number
  /** Display corner radius. */
  screenCornerRadius: number
}

/** The shape cut into the top of the body, in display pixels. */
export interface DeviceCutoutSpec {
  kind: DeviceCutoutKind
  width: number
  height: number
  /** Distance from the top edge of the display. */
  offsetTop: number
  /** Corner radius of the cutout shape. */
  radius: number
}

/**
 * Decorative status chrome placement, as a percentage of the display. Percent
 * rather than pixels so the chrome keeps its proportion on every export size.
 */
export interface DeviceStatusBarSpec {
  topPercent: number
  heightPercent: number
  inlinePaddingPercent: number
  fontScale: number
}

/** Bands the operating system reserves on the display, as a percentage of it. */
export interface DeviceSafeAreaSpec {
  topPercent: number
  bottomPercent: number
  inlinePercent: number
}

/** Local colors for the body, so a frame needs no image and no external asset. */
export interface DevicePaletteSpec {
  bodyBackground: string
  bodyBorderColor: string
  /** Hairline drawn inside the body edge. `null` means frameless output. */
  bodyRingColor: string | null
  /** Revealed by a contained capture inside the aperture. */
  screenBackdrop: string
}

export interface DeviceFramePreset {
  id: DeviceFrameId
  name: string
  description: string
  family: DeviceFamilyId
  screenClass: DeviceScreenClass
  orientation: DeviceOrientation
  screen: DeviceScreenSpec
  body: DeviceBodySpec
  cutout: DeviceCutoutSpec
  statusBar: DeviceStatusBarSpec
  safeArea: DeviceSafeAreaSpec
  palette: DevicePaletteSpec
  /** Older or alternate spellings that resolve to this preset. */
  legacyIds: readonly string[]
  /** Offered first in the compact pickers. */
  featured: boolean
}

export const deviceFamilyLabels: Record<DeviceFamilyId, string> = {
  'ios-phone': 'iPhone',
  'ios-tablet': 'iPad',
  'android-phone': 'Android',
  'android-tablet': 'Android tablets',
  frameless: 'No frame',
}

const IOS_PALETTE: DevicePaletteSpec = {
  bodyBackground: '#101017',
  bodyBorderColor: 'rgba(255, 255, 255, 0.5)',
  bodyRingColor: '#30303a',
  screenBackdrop: '#0c0c13',
}

const ANDROID_PALETTE: DevicePaletteSpec = {
  bodyBackground: '#202028',
  bodyBorderColor: 'rgba(255, 255, 255, 0.16)',
  bodyRingColor: '#4a4a52',
  screenBackdrop: '#0c0c13',
}

const FRAMELESS_PALETTE: DevicePaletteSpec = {
  bodyBackground: 'transparent',
  bodyBorderColor: 'transparent',
  bodyRingColor: null,
  screenBackdrop: '#e7e5f2',
}

const noCutout = (): DeviceCutoutSpec => ({ kind: 'none', width: 0, height: 0, offsetTop: 0, radius: 0 })

/**
 * The catalog. Order is the picker order: handsets, tablets, then frameless
 * output. Values are display pixels and percentages only, so a preset can be
 * scaled to any export size without a new asset.
 */
export const deviceFramePresets: readonly DeviceFramePreset[] = [
  {
    id: 'iphone',
    name: 'iPhone',
    description: 'Notch phone, 19.5:9 display',
    family: 'ios-phone',
    screenClass: 'phone',
    orientation: 'portrait',
    screen: { width: 1125, height: 2436 },
    body: { bezelTop: 40, bezelInline: 40, bezelBottom: 44, cornerRadius: 150, screenCornerRadius: 116 },
    cutout: { kind: 'notch', width: 372, height: 66, offsetTop: 0, radius: 33 },
    statusBar: { topPercent: 3.2, heightPercent: 3.4, inlinePaddingPercent: 8, fontScale: 1 },
    safeArea: { topPercent: 5.4, bottomPercent: 3.4, inlinePercent: 0 },
    palette: IOS_PALETTE,
    legacyIds: ['iphone-x', 'iphone-notch', 'iphone-11', 'ios-phone'],
    featured: true,
  },
  {
    id: 'iphone-se',
    name: 'iPhone SE',
    description: 'Home-button phone, 16:9 display',
    family: 'ios-phone',
    screenClass: 'phone',
    orientation: 'portrait',
    screen: { width: 750, height: 1334 },
    body: { bezelTop: 132, bezelInline: 52, bezelBottom: 132, cornerRadius: 40, screenCornerRadius: 0 },
    cutout: noCutout(),
    statusBar: { topPercent: 1.8, heightPercent: 2.6, inlinePaddingPercent: 9, fontScale: 0.86 },
    safeArea: { topPercent: 2.6, bottomPercent: 2.2, inlinePercent: 0 },
    palette: IOS_PALETTE,
    legacyIds: ['iphone-se-2', 'iphone-se-3', 'se'],
    featured: false,
  },
  {
    id: 'iphone-island',
    name: 'iPhone (island)',
    description: 'Pill cutout, 19.5:9 display',
    family: 'ios-phone',
    screenClass: 'phone',
    orientation: 'portrait',
    screen: { width: 1179, height: 2556 },
    body: { bezelTop: 30, bezelInline: 30, bezelBottom: 30, cornerRadius: 148, screenCornerRadius: 118 },
    cutout: { kind: 'island', width: 254, height: 72, offsetTop: 10, radius: 36 },
    statusBar: { topPercent: 3.4, heightPercent: 3.2, inlinePaddingPercent: 9, fontScale: 1 },
    safeArea: { topPercent: 6.9, bottomPercent: 3.4, inlinePercent: 0 },
    palette: IOS_PALETTE,
    legacyIds: ['iphone-14-pro', 'iphone-15-pro', 'dynamic-island'],
    featured: true,
  },
  {
    id: 'iphone-island-max',
    name: 'iPhone (island max)',
    description: 'Large pill cutout, 19.5:9 display',
    family: 'ios-phone',
    screenClass: 'phone',
    orientation: 'portrait',
    screen: { width: 1290, height: 2796 },
    body: { bezelTop: 32, bezelInline: 32, bezelBottom: 34, cornerRadius: 156, screenCornerRadius: 124 },
    cutout: { kind: 'island', width: 274, height: 84, offsetTop: 12, radius: 42 },
    statusBar: { topPercent: 3.6, heightPercent: 2.7, inlinePaddingPercent: 9, fontScale: 1.02 },
    safeArea: { topPercent: 6.3, bottomPercent: 3.4, inlinePercent: 0 },
    palette: IOS_PALETTE,
    legacyIds: ['iphone-14-pro-max', 'iphone-15-pro-max', 'dynamic-island-max'],
    featured: false,
  },
  {
    id: 'ipad-mini',
    name: 'iPad mini',
    description: 'Compact tablet, square-ish display',
    family: 'ios-tablet',
    screenClass: 'tablet',
    orientation: 'portrait',
    screen: { width: 1488, height: 2266 },
    body: { bezelTop: 46, bezelInline: 46, bezelBottom: 46, cornerRadius: 76, screenCornerRadius: 42 },
    cutout: noCutout(),
    statusBar: { topPercent: 1.5, heightPercent: 2.2, inlinePaddingPercent: 4.5, fontScale: 1.05 },
    safeArea: { topPercent: 2.4, bottomPercent: 1.4, inlinePercent: 0 },
    palette: IOS_PALETTE,
    legacyIds: ['ipad', 'ipad-mini-6'],
    featured: false,
  },
  {
    id: 'ipad-air',
    name: 'iPad Air',
    description: 'Large tablet, square-ish display',
    family: 'ios-tablet',
    screenClass: 'tablet',
    orientation: 'portrait',
    screen: { width: 1640, height: 2360 },
    body: { bezelTop: 48, bezelInline: 48, bezelBottom: 50, cornerRadius: 84, screenCornerRadius: 48 },
    cutout: noCutout(),
    statusBar: { topPercent: 1.5, heightPercent: 2.2, inlinePaddingPercent: 4.5, fontScale: 1.15 },
    safeArea: { topPercent: 2.4, bottomPercent: 1.6, inlinePercent: 0 },
    palette: IOS_PALETTE,
    legacyIds: ['ipad-pro', 'ipad-air-11'],
    featured: true,
  },
  {
    id: 'android',
    name: 'Android',
    description: 'Centered hole-punch phone, 20:9 display',
    family: 'android-phone',
    screenClass: 'phone',
    orientation: 'portrait',
    screen: { width: 1080, height: 2400 },
    body: { bezelTop: 26, bezelInline: 26, bezelBottom: 28, cornerRadius: 84, screenCornerRadius: 62 },
    cutout: { kind: 'punch-hole', width: 120, height: 120, offsetTop: 6, radius: 60 },
    statusBar: { topPercent: 2.4, heightPercent: 3, inlinePaddingPercent: 8.5, fontScale: 0.94 },
    safeArea: { topPercent: 5.6, bottomPercent: 2.4, inlinePercent: 0 },
    palette: ANDROID_PALETTE,
    legacyIds: ['android-generic', 'android-phone', 'google-android'],
    featured: true,
  },
  {
    id: 'android-pixel',
    name: 'Pixel',
    description: 'Square-cornered phone, 20:9 display',
    family: 'android-phone',
    screenClass: 'phone',
    orientation: 'portrait',
    screen: { width: 1080, height: 2400 },
    body: { bezelTop: 22, bezelInline: 22, bezelBottom: 24, cornerRadius: 52, screenCornerRadius: 30 },
    cutout: { kind: 'punch-hole', width: 132, height: 132, offsetTop: 8, radius: 66 },
    statusBar: { topPercent: 2.6, heightPercent: 3.4, inlinePaddingPercent: 8.5, fontScale: 0.96 },
    safeArea: { topPercent: 6.2, bottomPercent: 2.4, inlinePercent: 0 },
    palette: ANDROID_PALETTE,
    legacyIds: ['pixel', 'pixel-8'],
    featured: false,
  },
  {
    id: 'android-galaxy',
    name: 'Galaxy',
    description: 'Curved-edge phone, 19.5:9 display',
    family: 'android-phone',
    screenClass: 'phone',
    orientation: 'portrait',
    screen: { width: 1440, height: 3120 },
    body: { bezelTop: 24, bezelInline: 24, bezelBottom: 26, cornerRadius: 96, screenCornerRadius: 72 },
    cutout: { kind: 'punch-hole', width: 100, height: 100, offsetTop: 10, radius: 50 },
    statusBar: { topPercent: 2.1, heightPercent: 2.7, inlinePaddingPercent: 8.5, fontScale: 1.02 },
    safeArea: { topPercent: 4, bottomPercent: 2.2, inlinePercent: 0 },
    palette: ANDROID_PALETTE,
    legacyIds: ['galaxy', 'samsung', 'android-samsung'],
    featured: false,
  },
  {
    id: 'android-tablet',
    name: 'Android tablet',
    description: '10-inch tablet, 16:10 display',
    family: 'android-tablet',
    screenClass: 'tablet',
    orientation: 'portrait',
    screen: { width: 1600, height: 2560 },
    body: { bezelTop: 40, bezelInline: 40, bezelBottom: 42, cornerRadius: 58, screenCornerRadius: 30 },
    cutout: noCutout(),
    statusBar: { topPercent: 1.6, heightPercent: 2.3, inlinePaddingPercent: 4.5, fontScale: 1.2 },
    safeArea: { topPercent: 2.2, bottomPercent: 1.2, inlinePercent: 0 },
    palette: ANDROID_PALETTE,
    legacyIds: ['android-tablet-10', 'tablet'],
    featured: true,
  },
  {
    id: 'none',
    name: 'No frame',
    description: 'Capture on its own, portrait',
    family: 'frameless',
    screenClass: 'phone',
    orientation: 'portrait',
    screen: { width: 1080, height: 1920 },
    body: { bezelTop: 0, bezelInline: 0, bezelBottom: 0, cornerRadius: 0, screenCornerRadius: 0 },
    cutout: noCutout(),
    // Never drawn; the values only keep the metrics record total.
    statusBar: { topPercent: 3.2, heightPercent: 3.4, inlinePaddingPercent: 8, fontScale: 1 },
    safeArea: { topPercent: 0, bottomPercent: 0, inlinePercent: 0 },
    palette: FRAMELESS_PALETTE,
    legacyIds: ['frameless', 'no-frame', 'plain'],
    featured: true,
  },
  {
    id: 'canvas',
    name: 'Canvas',
    description: 'Landscape capture with no bezel, for feature graphics',
    family: 'frameless',
    screenClass: 'canvas',
    orientation: 'landscape',
    screen: { width: 1024, height: 500 },
    body: { bezelTop: 0, bezelInline: 0, bezelBottom: 0, cornerRadius: 0, screenCornerRadius: 0 },
    cutout: noCutout(),
    statusBar: { topPercent: 3.2, heightPercent: 3.4, inlinePaddingPercent: 8, fontScale: 1 },
    safeArea: { topPercent: 0, bottomPercent: 0, inlinePercent: 0 },
    palette: FRAMELESS_PALETTE,
    legacyIds: ['feature-graphic', 'feature-graphic-canvas'],
    featured: false,
  },
]

/** Preset used by new slides and as the fallback for an unknown stored value. */
export const DEFAULT_DEVICE_FRAME_ID: DeviceFrameId = 'iphone'

/**
 * Frameless presets render the capture alone. This ID is kept because older
 * projects and the tracked template use it; {@link isFramelessDeviceId} is the
 * question to ask, not equality with this constant.
 */
export const FRAMELESS_DEVICE_FRAME_ID: DeviceFrameId = 'none'

const presetById = new Map<DeviceFrameId, DeviceFramePreset>(
  deviceFramePresets.map((preset) => [preset.id, preset]),
)

/**
 * Older spellings that must keep restoring. Each entry points at the preset the
 * value means today, so a project written before the catalog was parametric
 * opens on the frame it was authored with.
 */
export const legacyDeviceFrameAliases: Readonly<Record<string, DeviceFrameId>> = Object.freeze(
  deviceFramePresets.reduce<Record<string, DeviceFrameId>>((aliases, preset) => {
    preset.legacyIds.forEach((legacyId) => {
      aliases[legacyId] = preset.id
    })
    return aliases
  }, { iphone: 'iphone', android: 'android', none: 'none' }),
)

/** Case, spacing, and underscores never change which frame is meant. */
const normalizeDeviceFrameKey = (value: string) =>
  value.trim().toLowerCase().replace(/[\s_]+/g, '-')

/** Type guard for a value that names a preset today. */
export const isDeviceFrameId = (value: unknown): value is DeviceFrameId =>
  typeof value === 'string' && presetById.has(value as DeviceFrameId)

/** Type guard for a current preset ID or a legacy spelling of one. */
export const isKnownDeviceFrameId = (value: unknown): boolean => {
  if (typeof value !== 'string') return false
  const key = normalizeDeviceFrameKey(value)
  return isDeviceFrameId(key) || Object.prototype.hasOwnProperty.call(legacyDeviceFrameAliases, key)
}

/**
 * Normalizes an untrusted or older device value to a current preset, mapping
 * legacy spellings and falling back to the default for anything unknown.
 */
export const resolveDeviceFrameId = (value: unknown): DeviceFrameId => {
  if (typeof value !== 'string') return DEFAULT_DEVICE_FRAME_ID
  const key = normalizeDeviceFrameKey(value)
  if (isDeviceFrameId(key)) return key
  return legacyDeviceFrameAliases[key] ?? DEFAULT_DEVICE_FRAME_ID
}

/** The preset a value means today, never undefined. */
export const getDeviceFramePreset = (value: unknown): DeviceFramePreset =>
  presetById.get(resolveDeviceFrameId(value)) ?? presetById.get(DEFAULT_DEVICE_FRAME_ID)!

/** Frameless output draws the capture alone, with no body and no status chrome. */
export const isFramelessDeviceId = (value: unknown): boolean =>
  getDeviceFramePreset(value).family === 'frameless'

/** Whether the status chrome can be drawn for this frame. */
export const canShowDeviceStatusBar = (value: unknown): boolean => !isFramelessDeviceId(value)

/** Framed presets opt in to the status chrome; frameless output never draws it. */
export const defaultShowDeviceStatusBar = (value: unknown): boolean => canShowDeviceStatusBar(value)

export interface DeviceCutoutGeometry {
  kind: DeviceCutoutKind
  /** Cutout size and offset in display pixels, for the SVG path. */
  width: number
  height: number
  offsetTop: number
  radius: number
  /** The same measures as a percentage of the display, for CSS and layout. */
  widthPercent: number
  heightPercent: number
  offsetTopPercent: number
  /** Where the cutout ends, as a percentage of the display height. */
  bottomPercent: number
  centerX: number
}

export interface DeviceGeometry {
  id: DeviceFrameId
  name: string
  description: string
  family: DeviceFamilyId
  screenClass: DeviceScreenClass
  orientation: DeviceOrientation
  isFrameless: boolean
  supportsStatusBar: boolean
  screen: { width: number; height: number; aspectRatio: number }
  body: { width: number; height: number; aspectRatio: number }
  /** Bezel thickness as a percentage of the body width, which is how CSS reads it. */
  bezel: { topPercent: number; inlinePercent: number; bottomPercent: number }
  /** Corner radii as a percentage of the body width. */
  cornerRadiusPercent: number
  screenCornerRadiusPercent: number
  cutout: DeviceCutoutGeometry
  safeArea: DeviceSafeAreaSpec
  statusBar: DeviceStatusBarSpec
  palette: DevicePaletteSpec
  /** `19.5:9` for a handset, `1.52:1` for a tablet or canvas. */
  aspectRatioLabel: string
  /** `1125 × 2436`, the resolution the preset was designed for. */
  resolutionLabel: string
}

export interface DeviceFamilyGroup {
  id: DeviceFamilyId
  label: string
  presets: readonly DeviceFramePreset[]
}

const round = (value: number, places = 2) => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

const percent = (value: number) => `${round(value)}%`

/**
 * Ratio label a person recognises. A handset is quoted against nine units, the
 * way a display spec is normally written; a tablet or a canvas falls back to a
 * plain long-over-short ratio.
 */
export const formatDeviceAspectRatio = (device: {
  screen: DeviceScreenSpec
  screenClass: DeviceScreenClass
}): string => {
  const { width, height } = device.screen
  if (!(width > 0) || !(height > 0)) return '0:0'
  const ratio = height / width
  if (device.screenClass === 'phone' && height > width) {
    const inNinths = round(ratio * 9, 1)
    if (inNinths >= 13 && inNinths <= 21) return `${inNinths}:9`
  }
  return `${round(ratio, 2)}:1`
}

/** Native resolution, written the way a capture is described in a bug report. */
export const formatDeviceResolution = (screen: DeviceScreenSpec): string =>
  `${screen.width} × ${screen.height}`

const deriveCutout = (preset: DeviceFramePreset): DeviceCutoutGeometry => {
  const { width: screenWidth, height: screenHeight } = preset.screen
  return {
    kind: preset.cutout.kind,
    width: preset.cutout.width,
    height: preset.cutout.height,
    offsetTop: preset.cutout.offsetTop,
    radius: preset.cutout.radius,
    widthPercent: round((preset.cutout.width / screenWidth) * 100),
    heightPercent: round((preset.cutout.height / screenHeight) * 100),
    offsetTopPercent: round((preset.cutout.offsetTop / screenHeight) * 100),
    bottomPercent: round(((preset.cutout.offsetTop + preset.cutout.height) / screenHeight) * 100),
    centerX: round(screenWidth / 2),
  }
}

const deriveGeometry = (preset: DeviceFramePreset): DeviceGeometry => {
  const bodyWidth = preset.screen.width + preset.body.bezelInline * 2
  const bodyHeight = preset.screen.height + preset.body.bezelTop + preset.body.bezelBottom
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    family: preset.family,
    screenClass: preset.screenClass,
    orientation: preset.orientation,
    isFrameless: preset.family === 'frameless',
    supportsStatusBar: preset.family !== 'frameless',
    screen: {
      ...preset.screen,
      aspectRatio: round(preset.screen.width / preset.screen.height, 4),
    },
    body: {
      width: bodyWidth,
      height: bodyHeight,
      aspectRatio: round(bodyWidth / bodyHeight, 4),
    },
    bezel: {
      topPercent: round((preset.body.bezelTop / bodyWidth) * 100),
      inlinePercent: round((preset.body.bezelInline / bodyWidth) * 100),
      bottomPercent: round((preset.body.bezelBottom / bodyWidth) * 100),
    },
    cornerRadiusPercent: round((preset.body.cornerRadius / bodyWidth) * 100),
    screenCornerRadiusPercent: round((preset.body.screenCornerRadius / bodyWidth) * 100),
    cutout: deriveCutout(preset),
    safeArea: { ...preset.safeArea },
    statusBar: { ...preset.statusBar },
    palette: { ...preset.palette },
    aspectRatioLabel: formatDeviceAspectRatio(preset),
    resolutionLabel: formatDeviceResolution(preset.screen),
  }
}

const geometryCache = new Map<DeviceFrameId, DeviceGeometry>()

/**
 * Full geometry for a frame, derived once per preset. Unknown values resolve to
 * the default preset rather than throwing, so a hand-edited project still
 * renders something sensible. An already derived geometry is accepted too, so a
 * caller holding one cannot accidentally read the default preset.
 */
export const getDeviceGeometry = (value: unknown): DeviceGeometry => {
  const id = resolveDeviceFrameId(
    typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string'
      ? (value as { id: string }).id
      : value,
  )
  const cached = geometryCache.get(id)
  if (cached) return cached
  const geometry = deriveGeometry(getDeviceFramePreset(id))
  geometryCache.set(id, geometry)
  return geometry
}

/**
 * The style contract between the catalog and the frame stylesheet. The same
 * variables drive the editor preview and the export stage, because both render
 * the shared aperture.
 */
export const getDeviceFrameStyle = (value: unknown): CSSProperties => {
  const geometry = getDeviceGeometry(value)
  const { palette } = geometry
  return {
    '--device-body-ratio': geometry.body.aspectRatio,
    '--device-bezel-top': percent(geometry.bezel.topPercent),
    '--device-bezel-inline': percent(geometry.bezel.inlinePercent),
    '--device-bezel-bottom': percent(geometry.bezel.bottomPercent),
    '--device-body-radius': percent(geometry.cornerRadiusPercent),
    '--device-screen-radius': percent(geometry.screenCornerRadiusPercent),
    '--device-body-background': palette.bodyBackground,
    '--device-body-border': palette.bodyBorderColor,
    '--device-body-shadow': palette.bodyRingColor === null
      ? 'none'
      : `0 17px 30px rgba(10, 8, 25, 0.42), inset 0 0 0 1px ${palette.bodyRingColor}`,
    '--device-screen-backdrop': palette.screenBackdrop,
  } as unknown as CSSProperties
}

const roundedRectPath = (x: number, y: number, width: number, height: number, radius: number) => {
  const r = round(Math.max(0, Math.min(radius, Math.min(width, height) / 2)))
  return [
    `M ${round(x + r)} ${round(y)}`,
    `H ${round(x + width - r)}`,
    `A ${r} ${r} 0 0 1 ${round(x + width)} ${round(y + r)}`,
    `V ${round(y + height - r)}`,
    `A ${r} ${r} 0 0 1 ${round(x + width - r)} ${round(y + height)}`,
    `H ${round(x + r)}`,
    `A ${r} ${r} 0 0 1 ${round(x)} ${round(y + height - r)}`,
    `V ${round(y + r)}`,
    `A ${r} ${r} 0 0 1 ${round(x + r)} ${round(y)}`,
    'Z',
  ].join(' ')
}

/** A notch hangs off the top edge, so it is closed by the edge itself. */
const notchPath = (centerX: number, width: number, height: number, radius: number) => {
  const left = round(centerX - width / 2)
  const right = round(centerX + width / 2)
  const r = round(Math.max(0, Math.min(radius, height)))
  return [
    `M ${left} 0`,
    `H ${right}`,
    `V ${round(height - r)}`,
    `A ${r} ${r} 0 0 1 ${round(right - r)} ${round(height)}`,
    `H ${round(left + r)}`,
    `A ${r} ${r} 0 0 1 ${left} ${round(height - r)}`,
    'Z',
  ].join(' ')
}

const circlePath = (centerX: number, centerY: number, radius: number) => {
  const r = round(radius)
  return [
    `M ${round(centerX - r)} ${round(centerY)}`,
    `a ${r} ${r} 0 1 0 ${round(r * 2)} 0`,
    `a ${r} ${r} 0 1 0 ${round(-r * 2)} 0`,
    'Z',
  ].join(' ')
}

/**
 * The cutout drawn over the aperture, as one path in display pixel coordinates,
 * or null when the frame has no cutout. The SVG view box is the display itself,
 * so the path needs no per-export scaling.
 */
export const getDeviceCutoutPath = (value: unknown): string | null => {
  const { cutout } = getDeviceGeometry(value)
  if (cutout.kind === 'none' || cutout.width <= 0 || cutout.height <= 0) return null
  if (cutout.kind === 'notch') return notchPath(cutout.centerX, cutout.width, cutout.height, cutout.radius)
  if (cutout.kind === 'punch-hole') {
    return circlePath(cutout.centerX, cutout.offsetTop + cutout.height / 2, cutout.width / 2)
  }
  return roundedRectPath(
    cutout.centerX - cutout.width / 2,
    cutout.offsetTop,
    cutout.width,
    cutout.height,
    cutout.radius,
  )
}

/** The view box the cutout path is drawn in: the display, in device pixels. */
export const getDeviceCutoutViewBox = (value: unknown): string => {
  const { screen } = getDeviceGeometry(value)
  return `0 0 ${screen.width} ${screen.height}`
}

const groupByFamily = (presets: readonly DeviceFramePreset[]): DeviceFamilyGroup[] => {
  const order: DeviceFamilyId[] = ['ios-phone', 'android-phone', 'ios-tablet', 'android-tablet', 'frameless']
  return order
    .map((id) => ({
      id,
      label: deviceFamilyLabels[id],
      presets: presets.filter((preset) => preset.family === id),
    }))
    .filter((group) => group.presets.length > 0)
}

const allGroups = groupByFamily(deviceFramePresets)
const featuredGroups = groupByFamily(deviceFramePresets.filter((preset) => preset.featured))

/** Every preset, grouped by family in picker order. */
export const getDeviceFamilyGroups = (): readonly DeviceFamilyGroup[] => allGroups

/** The shortlist offered in compact pickers, still grouped by family. */
export const getFeaturedDeviceFamilyGroups = (): readonly DeviceFamilyGroup[] => featuredGroups

/** The shortlist itself, for callers that render one flat list. */
export const getFeaturedDeviceFramePresets = (): readonly DeviceFramePreset[] =>
  featuredGroups.flatMap((group) => group.presets)
