import type { AccentShapeStyle, BackgroundBlend, BackgroundFillKind, BackgroundGradient, ExportProfile, ExportProfileId, LayerId, LayerSettingsById, LayoutId, LocaleId, LocaleOption, ScreenshotFit, Slide, SlideTransform, ThemeId } from './types'
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

/**
 * Default background fill. The theme is the safe default because it is what a
 * slide renders when the field is absent, and absent is what every project
 * authored before this field has.
 */
export const DEFAULT_BACKGROUND_FILL: BackgroundFillKind = 'theme'

export const DEFAULT_BACKGROUND_COLOR = '#151525'

/** Same 145° sweep the theme gradients use, so a gradient fill reads as Kami. */
export const DEFAULT_BACKGROUND_GRADIENT: BackgroundGradient = { angle: 145, stops: ['#151525', '#5b4cf0'] }

export const backgroundFillOptions: Array<{
  id: BackgroundFillKind
  label: string
  description: string
}> = [
  { id: 'theme', label: 'Theme', description: 'The slide theme paint' },
  { id: 'solid', label: 'Solid', description: 'One flat colour' },
  { id: 'gradient', label: 'Gradient', description: 'Two colours across an angle' },
  { id: 'image', label: 'Image', description: 'The background image, cropped to fill' },
  { id: 'panoramic', label: 'Panoramic', description: 'The background image, bled past the frame' },
]

export const backgroundBlendOptions: Array<{
  id: BackgroundBlend
  label: string
  description: string
}> = [
  { id: 'normal', label: 'Normal', description: 'Draw the image as it is' },
  { id: 'multiply', label: 'Multiply', description: 'Darken the image into the theme' },
  { id: 'screen', label: 'Screen', description: 'Lighten the image into the theme' },
  { id: 'overlay', label: 'Overlay', description: 'Keep contrast, let the theme through' },
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

/**
 * How one set reads in a store carousel.
 *
 * Every field here **describes** a surface rather than asserting a rule. The
 * editor cannot see a review queue, cannot see a carousel, and cannot see which
 * images a store surfaces first, so copy that claimed to know would be wrong the
 * first time a store changed. What the code can honestly do is say how many
 * images sit side by side in a narrow tile, where the icon tile sits, and roughly
 * how much headline fits on a line — and those are what an author is guessing at
 * when they are deciding whether a set is finished.
 *
 * `headlineReference` is a reading length, not a limit. Nothing rejects a longer
 * headline; the preview only says how it wraps.
 */
export interface StoreListing {
  /** The profile whose tile shape this describes. */
  profileId: ExportProfileId
  /** The store this profile targets, named the way a person would. */
  storeName: string
  /**
   * How many images sit side by side at the front of the carousel before the
   * rest are shown one at a time. A landscape tile is shown on its own, so its
   * count is 1.
   */
  leadingImages: number
  /** What the front of the carousel looks like. */
  leading: string
  /** Where the icon tile sits relative to the carousel. */
  icon: string
  /** What a long headline does inside a tile this shape. */
  headline: string
  /** Characters that read as roughly one line in a tile this shape. */
  headlineReference: number
}

const phoneCarousel: Omit<StoreListing, 'profileId'> = {
  storeName: 'App Store',
  leadingImages: 3,
  leading: 'The first 3 images are shown side by side at the front of the carousel, and the rest one at a time.',
  icon: 'The icon tile sits above the carousel, beside the name and the subtitle.',
  headline: 'A tile is narrow, so a headline of more than a few words wraps onto a second line.',
  headlineReference: 30,
}

const playPhoneCarousel: Omit<StoreListing, 'profileId'> = {
  storeName: 'Google Play',
  leadingImages: 3,
  leading: 'The first 3 images are shown side by side at the front of the listing, and the rest one at a time.',
  icon: 'The icon and the title sit above the images.',
  headline: 'A tile is narrow, so a headline of more than a few words wraps onto a second line.',
  headlineReference: 30,
}

const playTabletPortrait: Omit<StoreListing, 'profileId'> = {
  storeName: 'Google Play',
  leadingImages: 2,
  leading: 'A tablet image is wider than a phone one, so only the first 2 sit side by side.',
  icon: 'The icon and the title sit above the images.',
  headline: 'A wide tile fits more on one line, so a headline usually stays on one.',
  headlineReference: 44,
}

const playTabletLandscape: Omit<StoreListing, 'profileId'> = {
  storeName: 'Google Play',
  leadingImages: 1,
  leading: 'A landscape image is shown on its own at full width rather than in a row.',
  icon: 'The icon and the title sit above the image.',
  headline: 'The whole width is available, so a long headline still reads on one line.',
  headlineReference: 70,
}

const playFeatureGraphic: Omit<StoreListing, 'profileId'> = {
  storeName: 'Google Play',
  leadingImages: 1,
  leading: 'A feature graphic is one image rather than a carousel, so nothing is placed beside it.',
  icon: 'An icon tile is shown above the feature graphic, and the graphic fills the width below it.',
  headline: 'The graphic fills the width, so a headline set across it reads at any length.',
  headlineReference: 70,
}

/**
 * One listing description per profile, kept beside the profile catalog so the
 * two cannot describe different shapes. The copy is data rather than JSX, which
 * is what lets a surface render it, a test assert it, and a future profile be
 * added without touching a component.
 */
export const storeListings: StoreListing[] = [
  { profileId: 'app-store', ...phoneCarousel },
  { profileId: 'app-store-1125', ...phoneCarousel },
  { profileId: 'google-play', ...playPhoneCarousel },
  { profileId: 'google-play-tablet-7-portrait', ...playTabletPortrait },
  { profileId: 'google-play-tablet-7-landscape', ...playTabletLandscape },
  { profileId: 'google-play-feature-graphic', ...playFeatureGraphic },
]

/**
 * The listing for one profile, derived from the profile's own shape when the
 * catalog has no entry for it.
 *
 * A new profile is renderable the moment it is added to `exportProfiles`, so this
 * cannot refuse; it falls back to a description built from the one fact a new
 * profile is certain to have, which is whether it is landscape or portrait. The
 * fallback says so in its own copy rather than borrowing a store's name, because
 * a store this catalog has not heard of is not a store to attribute a claim to.
 */
export const getStoreListing = (profile: ExportProfile): StoreListing => {
  const listed = storeListings.find((listing) => listing.profileId === profile.id)
  if (listed) return listed
  const landscape = profile.orientation === 'landscape'
  return {
    profileId: profile.id,
    storeName: profile.name,
    leadingImages: landscape ? 1 : 3,
    leading: landscape
      ? 'A landscape image is shown on its own at full width rather than in a row.'
      : 'The first 3 images are shown side by side at the front, and the rest one at a time.',
    icon: 'The icon tile sits above the images, beside the name.',
    headline: landscape
      ? 'The whole width is available, so a long headline still reads on one line.'
      : 'A tile is narrow, so a headline of more than a few words wraps onto a second line.',
    headlineReference: landscape ? 70 : 30,
  }
}

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
