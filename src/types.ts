/**
 * The device frame vocabulary lives with the parametric catalog, and is
 * re-exported here so the slide model keeps one import for its own types.
 */
import type { DeviceFrameId } from './lib/devicePresets'

export type {
  DeviceBodySpec,
  DeviceCutoutKind,
  DeviceFamilyId,
  DeviceFrameId,
  DeviceFramePreset,
  DeviceOrientation,
  DeviceSafeAreaSpec,
  DeviceScreenClass,
  DeviceScreenSpec,
  DeviceStatusBarSpec,
} from './lib/devicePresets'

export type LayoutId =
  | 'hero'
  | 'centered'
  | 'spotlight'
  | 'caption-left'
  | 'caption-right'
  | 'split'
  | 'device-top'
  | 'feature-graphic'
export type ThemeId = 'midnight' | 'lilac' | 'coral' | 'mint' | 'ocean' | 'sunset' | 'forest' | 'graphite'
export type CanvasMode = 'connected' | 'isolated'
export type ExportProfileId =
  | 'app-store-1125'
  | 'app-store'
  | 'google-play'
  | 'google-play-tablet-7-portrait'
  | 'google-play-tablet-7-landscape'
  | 'google-play-feature-graphic'
/**
 * How an imported capture fills the device aperture. `contain` keeps the whole
 * capture visible inside the frame, `cover` fills the aperture and crops the
 * overflow.
 */
export type ScreenshotFit = 'cover' | 'contain'

/**
 * What paints the back of a slide.
 *
 * `theme`, `solid`, and `gradient` paint the canvas itself and turn the
 * background image layer off. `image` and `panoramic` mean the existing
 * `background-image` layer *is* the fill and differ only in fit: `image` crops
 * to cover, `panoramic` bleeds the artwork a few percent past the frame so the
 * crop reads as a designed one. There is deliberately no separate flag for "the
 * layer is on" — the kind already says so, so the two can never disagree.
 */
export type BackgroundFillKind = 'theme' | 'solid' | 'gradient' | 'image' | 'panoramic'

/** How an image fill composites over the theme paint underneath it. */
export type BackgroundBlend = 'normal' | 'multiply' | 'screen' | 'overlay'

export interface BackgroundGradient {
  /** Direction of the gradient in degrees, CSS convention: 0 is to top. */
  angle: number
  /** Two or more `#rrggbb` stops, in order. */
  stops: string[]
}

/**
 * The one optional per-slide background record.
 *
 * Absent means `theme`, so a project that predates the field renders and
 * serializes exactly as it always did. Fields that do not apply to the chosen
 * kind are not stored, which keeps a saved fill minimal.
 */
export interface BackgroundFill {
  kind: BackgroundFillKind
  /** `solid` only. */
  color?: string
  /** `gradient` only. */
  gradient?: BackgroundGradient
  /** `image` and `panoramic` only. `normal` is the default and is not stored. */
  blend?: BackgroundBlend
}

/**
 * The focal point of the background image, normalized to `0..1` on both axes.
 *
 * Normalized, never pixels: one slide exports at six profile sizes, and a
 * pixel focal point drifts on every one of them. Physical, not logical: the
 * renderer sets `dir="rtl"` for `ar-SA` and a percentage `object-position` is
 * direction-agnostic, so an Arabic export frames the artwork the same way.
 */
export interface FocalPoint {
  x: number
  y: number
}

export type LocaleId = 'en-US' | 'es-ES' | 'ar-SA'
export type LayerId = 'background-image' | 'accent-shape' | 'screenshot' | 'app-icon' | 'headline' | 'supporting-text' | 'kicker' | 'footer'

export interface LocaleOption {
  id: LocaleId
  label: string
  direction: 'ltr' | 'rtl'
}

export interface SlideTextCopy {
  title?: string
  subtitle?: string
}

export interface SlideTransform {
  x: number
  y: number
  scale: number
  rotation: number
  /** Additional non-uniform size scales, composed with the legacy uniform scale. */
  widthScale: number
  heightScale: number
  flipX: boolean
  flipY: boolean
}

export interface AppIconAsset {
  name: string
  dataUrl: string
  mimeType: string
}

export interface BackgroundImageAsset {
  name: string
  dataUrl: string
  mimeType: string
  /**
   * Intrinsic pixel size, captured at import as a *hint* for the panoramic
   * overscan. It is never trusted: the renderer re-measures the loaded image,
   * and a project with no hint, or a hand-edited project with a wrong one,
   * degrades to plain `cover` rather than to a wrong crop.
   */
  width?: number
  height?: number
}

export type AccentShapeType = 'circle' | 'pill'

export interface AccentShapeStyle {
  type: AccentShapeType
  color: string
}

export type LayerTransforms = Record<LayerId, SlideTransform>

export interface LayerSettings {
  opacity: number
  visible: boolean
}

export type LayerSettingsById = Record<LayerId, LayerSettings>

export interface ExportProfile {
  id: ExportProfileId
  name: string
  width: number
  height: number
  orientation: 'portrait' | 'landscape'
  deviceClass: 'phone' | 'tablet'
  format: 'png'
  preflight?: {
    availability: 'ready' | 'pending'
    requirements: {
      /** Whether every slide must provide the screenshot/device preview. */
      screenshot: boolean
      appIcon: boolean
      appIconRecommendation?: 'strongly-encouraged'
      localizedCopy: boolean
    }
  }
}

/**
 * One slide's device-specific differences inside an output variant.
 *
 * Every field is optional and an absent field means "use the slide's own value".
 * That is the whole reason a device variant needs no migration: a slide the
 * author never gave a device override to renders exactly as it always did, and a
 * default project with one variant and no overrides serializes byte-identically.
 *
 * Only a device's chrome, its capture, and its layer placement are overridable.
 * Copy, theme, layout, and the background fill stay properties of the slide, so
 * there is one place a reader looks for the words on a slide.
 */
export interface DeviceVariantSlideOverride {
  /** The editor slide this override applies to. Stable, so reordering is safe. */
  slideId: string
  deviceFrameId?: DeviceFrameId
  showDeviceStatusBar?: boolean
  screenshotFit?: ScreenshotFit
  /**
   * The capture this device shows instead of the slide's own.
   *
   * Stored in the document as an `assetId` into `assets[]`, so one capture
   * imported twice is one asset rather than two copies of the same bytes. An
   * absent capture means the slide's own, never "no capture at all": a variant
   * that has to withhold a capture blocks its own export instead of silently
   * rendering a hole.
   */
  screenshot?: CaptureAsset
  /**
   * Per-layer placement for this device only. Absent layers keep the slide's own
   * transform, and a transform that resolves back to it is not written.
   */
  layerTransforms?: Partial<LayerTransforms>
}

/** A capture: the bytes plus the name the document was given for them. */
export interface CaptureAsset {
  name: string
  dataUrl: string
  mimeType: string
}

/**
 * One delivery target: a canvas, a locale, a theme, a slide set, and the
 * per-device differences inside it.
 *
 * A variant is not a copy of the deck. It names the slides it renders, so the
 * deck stays the single source of authoring truth and every consumer that uses
 * 1-based slide positions keeps working.
 */
export interface OutputVariant {
  id: string
  name: string
  canvasId: string
  locale: LocaleId
  themeId: ThemeId
  slideIds: string[]
  enabled: boolean
  exportProfileId: ExportProfileId
  /**
   * Per-device differences, written only when at least one slide has one, so a
   * project that never used a device variant stores no array at all.
   */
  deviceOverrides?: DeviceVariantSlideOverride[]
}

export interface Slide {
  id: string
  title: string
  subtitle: string
  translations?: Partial<Record<LocaleId, SlideTextCopy>>
  layout: LayoutId
  theme: ThemeId
  deviceFrameId: DeviceFrameId
  /**
   * Draws a small status chrome (time, cellular, Wi-Fi, battery) inside the
   * device aperture. Frameless presets never render it; restoring an older
   * project derives the default from {@link Slide.deviceFrameId}.
   */
  showDeviceStatusBar: boolean
  /**
   * Fit policy applied to {@link Slide.screenshot} inside the device aperture.
   * Restoring an older project without the field resolves to `contain` so an
   * import is never cropped without the author asking for it.
   */
  screenshotFit: ScreenshotFit
  /**
   * How the back of this slide is painted. Optional and additive: an absent
   * record is the theme fill, which is what every project authored before this
   * field renders. See {@link BackgroundFill}.
   */
  backgroundFill?: BackgroundFill
  /**
   * Focal point of the background image layer, stored on that layer in the
   * project document. Absent means centred, so a deck with nothing to say about
   * framing keeps no record of it.
   */
  backgroundFocalPoint?: FocalPoint
  /** Legacy composition-wide transform retained for direct composition dragging. */
  transform: SlideTransform
  layerTransforms: LayerTransforms
  /**
   * Optional bottom-to-top stacking order for this slide. A slide without the
   * field draws in the catalog order, so an older project is unaffected, and a
   * stored order that does not name every layer still resolves to a complete one
   * when it is read. See `lib/layerOrder`.
   */
  layerOrder?: LayerId[]
  layerSettings: LayerSettingsById
  accentShapeStyle: AccentShapeStyle
  appIcon: AppIconAsset | null
  backgroundImage: BackgroundImageAsset | null
  screenshot: string | null
  screenshotName: string | null
}
