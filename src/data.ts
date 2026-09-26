import type { AccentShapeStyle, ExportProfile, LayerId, LayerSettingsById, LayoutId, LocaleId, LocaleOption, ScreenshotFit, Slide, SlideTransform, ThemeId } from './types'
import { DEFAULT_DEVICE_FRAME_ID, defaultShowDeviceStatusBar } from './lib/devicePresets'

// The device catalog is parametric data with its own derivation helpers, so it
// is re-exported from here to keep one import site for the editor defaults.
export {
  DEFAULT_DEVICE_FRAME_ID,
  defaultShowDeviceStatusBar,
  deviceFramePresets,
  FRAMELESS_DEVICE_FRAME_ID,
  resolveDeviceFrameId,
} from './lib/devicePresets'

export const layouts: Array<{
  id: LayoutId
  name: string
  description: string
}> = [
  { id: 'hero', name: 'Hero', description: 'Title first, device below' },
  { id: 'centered', name: 'Centered', description: 'Balanced product focus' },
  { id: 'spotlight', name: 'Spotlight', description: 'Bold, editorial crop' },
  { id: 'caption-left', name: 'Caption left', description: 'Copy left, device right' },
  { id: 'caption-right', name: 'Caption right', description: 'Device left, copy right' },
  { id: 'split', name: 'Split story', description: 'Headline above, product below' },
  { id: 'device-top', name: 'Device top', description: 'Product first, caption below' },
  { id: 'feature-graphic', name: 'Feature graphic', description: 'Landscape store story with safe margins' },
]

export const themes: Array<{
  id: ThemeId
  name: string
  colors: [string, string]
  background?: string
  text?: string
  accent?: string
}> = [
  { id: 'midnight', name: 'Midnight', colors: ['#151525', '#5b4cf0'], background: '#151525', text: '#ffffff', accent: '#a99dff' },
  { id: 'lilac', name: 'Lilac', colors: ['#efeaff', '#bda8ff'], background: '#efeaff', text: '#292637', accent: '#735fca' },
  { id: 'coral', name: 'Coral', colors: ['#ffded3', '#ff795e'], background: '#ffded3', text: '#34251f', accent: '#d84d36' },
  { id: 'mint', name: 'Mint', colors: ['#dff8ed', '#70d6aa'], background: '#dff8ed', text: '#183c30', accent: '#248b63' },
  { id: 'ocean', name: 'Ocean', colors: ['#e5f4ff', '#4b9ee8'], background: '#e5f4ff', text: '#15334b', accent: '#1673bd' },
  { id: 'sunset', name: 'Sunset', colors: ['#fff0c7', '#f59e0b'], background: '#fff0c7', text: '#4a2c18', accent: '#dc6b16' },
  { id: 'forest', name: 'Forest', colors: ['#dff3e5', '#1f8a5b'], background: '#dff3e5', text: '#153c2c', accent: '#176f49' },
  { id: 'graphite', name: 'Graphite', colors: ['#1b1d24', '#5f6878'], background: '#1b1d24', text: '#f5f7fa', accent: '#9eb7d5' },
]

export const getLayout = (id: unknown) =>
  layouts.find((layout) => layout.id === id) ?? layouts[0]

export const getTheme = (id: unknown) =>
  themes.find((theme) => theme.id === id) ?? themes[0]

/**
 * Default fit for imported captures. `contain` keeps the entire screenshot
 * visible, which is the safe choice because a cropped capture hides UI the
 * author never meant to remove.
 */
export const DEFAULT_SCREENSHOT_FIT: ScreenshotFit = 'contain'

export const screenshotFitOptions: Array<{
  id: ScreenshotFit
  label: string
  description: string
}> = [
  { id: 'contain', label: 'Contain', description: 'Whole capture inside the frame' },
  { id: 'cover', label: 'Cover', description: 'Fill the frame and crop the edges' },
]

export const localeOptions: LocaleOption[] = [
  { id: 'en-US', label: 'English (US)', direction: 'ltr' },
  { id: 'es-ES', label: 'Español (España)', direction: 'ltr' },
  { id: 'ar-SA', label: 'العربية (السعودية)', direction: 'rtl' },
]

export const supportedLocales: LocaleId[] = localeOptions.map((locale) => locale.id)

export const exportProfiles: ExportProfile[] = [
  {
    // Keep the established ID for existing projects authored at 1242 × 2688.
    id: 'app-store',
    name: 'App Store portrait 1242',
    width: 1242,
    height: 2688,
    orientation: 'portrait',
    deviceClass: 'phone',
    format: 'png',
    preflight: {
      availability: 'ready',
      requirements: { screenshot: true, appIcon: false, localizedCopy: false },
    },
  },
  {
    id: 'app-store-1125',
    name: 'App Store portrait 1125',
    width: 1125,
    height: 2436,
    orientation: 'portrait',
    deviceClass: 'phone',
    format: 'png',
    preflight: {
      availability: 'ready',
      requirements: { screenshot: true, appIcon: false, localizedCopy: false },
    },
  },
  {
    id: 'google-play',
    name: 'Google Play phone portrait',
    width: 1080,
    height: 1920,
    orientation: 'portrait',
    deviceClass: 'phone',
    format: 'png',
    preflight: {
      availability: 'ready',
      requirements: { screenshot: true, appIcon: false, localizedCopy: false },
    },
  },
  {
    id: 'google-play-tablet-7-portrait',
    name: 'Google Play tablet 7-inch portrait',
    width: 1200,
    height: 1920,
    orientation: 'portrait',
    deviceClass: 'tablet',
    format: 'png',
    preflight: {
      availability: 'ready',
      requirements: { screenshot: true, appIcon: false, localizedCopy: false },
    },
  },
  {
    id: 'google-play-tablet-7-landscape',
    name: 'Google Play tablet 7-inch landscape',
    width: 1920,
    height: 1200,
    orientation: 'landscape',
    deviceClass: 'tablet',
    format: 'png',
    preflight: {
      availability: 'ready',
      requirements: { screenshot: true, appIcon: false, localizedCopy: false },
    },
  },
  {
    id: 'google-play-feature-graphic',
    name: 'Google Play feature graphic',
    width: 1024,
    height: 500,
    orientation: 'landscape',
    deviceClass: 'tablet',
    format: 'png',
    preflight: {
      availability: 'ready',
      requirements: { screenshot: false, appIcon: false, appIconRecommendation: 'strongly-encouraged', localizedCopy: false },
    },
  },
]

// Retained as an extension point for future profiles; all currently published
// profiles, including the feature graphic, are renderer-ready.
export const pendingExportProfiles: ExportProfile[] = []

export const TRANSFORM_SIZE_MIN = 0.25
export const TRANSFORM_SIZE_MAX = 4

export const DEFAULT_SLIDE_TRANSFORM: SlideTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  widthScale: 1,
  heightScale: 1,
  flipX: false,
  flipY: false,
}

export const DEFAULT_ACCENT_SHAPE_STYLE: AccentShapeStyle = {
  type: 'circle',
  color: '#6f62e8',
}

export const slideLayerIds: LayerId[] = [
  'background-image',
  'accent-shape',
  'screenshot',
  'app-icon',
  'headline',
  'supporting-text',
  'kicker',
  'footer',
]

export const slideLayerLabels: Record<LayerId, string> = {
  'background-image': 'Background image',
  'accent-shape': 'Accent shape',
  screenshot: 'Screenshot / device',
  'app-icon': 'App icon',
  headline: 'Headline',
  'supporting-text': 'Supporting text',
  kicker: 'Kicker',
  footer: 'Footer',
}

export const createDefaultLayerTransforms = (): Slide['layerTransforms'] => Object.fromEntries(
  slideLayerIds.map((id) => [id, { ...DEFAULT_SLIDE_TRANSFORM }]),
) as Slide['layerTransforms']

export const sanitizeLayerOpacity = (value: unknown, fallback = 1): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : sanitizeFallbackOpacity(fallback)

const sanitizeFallbackOpacity = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1

export const createDefaultLayerSettings = (): LayerSettingsById => Object.fromEntries(
  slideLayerIds.map((id) => [id, { opacity: id === 'accent-shape' ? 0.2 : 1, visible: true }]),
) as LayerSettingsById

export const createDefaultAccentShapeStyle = (): AccentShapeStyle => ({ ...DEFAULT_ACCENT_SHAPE_STYLE })

export const starterSlide: Slide = {
  id: 'slide-1',
  title: 'Your idea,\nbeautifully presented.',
  subtitle: 'Turn everyday app moments into scroll-stopping stories.',
  layout: 'hero',
  theme: 'midnight',
  deviceFrameId: DEFAULT_DEVICE_FRAME_ID,
  showDeviceStatusBar: defaultShowDeviceStatusBar(DEFAULT_DEVICE_FRAME_ID),
  screenshotFit: DEFAULT_SCREENSHOT_FIT,
  transform: { ...DEFAULT_SLIDE_TRANSFORM },
  layerTransforms: createDefaultLayerTransforms(),
  layerSettings: createDefaultLayerSettings(),
  accentShapeStyle: createDefaultAccentShapeStyle(),
  appIcon: null,
  backgroundImage: null,
  screenshot: null,
  screenshotName: null,
}

export const createSlide = (): Slide => ({
  id: `slide-${crypto.randomUUID()}`,
  title: `A better way to\nshowcase your app.`,
  subtitle: 'Add a clear, compelling message for this slide.',
  layout: 'centered',
  theme: 'midnight',
  deviceFrameId: DEFAULT_DEVICE_FRAME_ID,
  showDeviceStatusBar: defaultShowDeviceStatusBar(DEFAULT_DEVICE_FRAME_ID),
  screenshotFit: DEFAULT_SCREENSHOT_FIT,
  transform: { ...DEFAULT_SLIDE_TRANSFORM },
  layerTransforms: createDefaultLayerTransforms(),
  layerSettings: createDefaultLayerSettings(),
  accentShapeStyle: createDefaultAccentShapeStyle(),
  appIcon: null,
  backgroundImage: null,
  screenshot: null,
  screenshotName: null,
})

export const numberSlide = (index: number) => String(index + 1).padStart(2, '0')
