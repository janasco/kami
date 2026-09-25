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
export type DeviceFrameId = 'iphone' | 'android' | 'none'
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

export interface DeviceFramePreset {
  id: DeviceFrameId
  name: string
  description: string
}

export interface Slide {
  id: string
  title: string
  subtitle: string
  translations?: Partial<Record<LocaleId, SlideTextCopy>>
  layout: LayoutId
  theme: ThemeId
  deviceFrameId: DeviceFrameId
  /** Legacy composition-wide transform retained for direct composition dragging. */
  transform: SlideTransform
  layerTransforms: LayerTransforms
  layerSettings: LayerSettingsById
  accentShapeStyle: AccentShapeStyle
  appIcon: AppIconAsset | null
  backgroundImage: BackgroundImageAsset | null
  screenshot: string | null
  screenshotName: string | null
}
