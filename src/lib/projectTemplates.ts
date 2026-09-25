import {
  createDefaultAccentShapeStyle,
  createDefaultLayerSettings,
  createDefaultLayerTransforms,
  DEFAULT_SLIDE_TRANSFORM,
  deviceFramePresets,
  layouts,
  slideLayerIds,
  themes,
} from '../data'
import type {
  AccentShapeStyle,
  DeviceFrameId,
  LayerId,
  LayerSettings,
  LayoutId,
  Slide,
  SlideTransform,
  ThemeId,
} from '../types'

export type ProjectTemplateId =
  | 'minimal-launch'
  | 'feature-highlight'
  | 'benefits-carousel'
  | 'dark-premium'
  | 'playful-creator'
  | 'saas-dashboard'

export type TemplateLayerTransforms = {
  [LayerKey in LayerId]?: Partial<SlideTransform>
}

export type TemplateLayerSettings = {
  [LayerKey in LayerId]?: Partial<LayerSettings>
}

export interface ProjectTemplateSlide {
  title: string
  subtitle: string
  layout: LayoutId
  theme: ThemeId
  deviceFrameId: DeviceFrameId
  transform?: Partial<SlideTransform>
  layerTransforms?: TemplateLayerTransforms
  layerSettings?: TemplateLayerSettings
  accentShapeStyle?: AccentShapeStyle
}

export interface ProjectTemplate {
  id: ProjectTemplateId
  name: string
  description: string
  category: string
  projectName: string
  slides: ProjectTemplateSlide[]
}

const templateSlide = (slide: ProjectTemplateSlide): ProjectTemplateSlide => slide

const transform = (overrides: Partial<SlideTransform> = {}): Partial<SlideTransform> => overrides
const layerTransform = (overrides: Partial<SlideTransform> = {}): Partial<SlideTransform> => overrides
const layerSettings = (overrides: Partial<LayerSettings> = {}): Partial<LayerSettings> => overrides

export const projectTemplates: ProjectTemplate[] = [
  {
    id: 'minimal-launch',
    name: 'Minimal product launch',
    description: 'A clean three-slide launch story with a calm, product-first rhythm.',
    category: 'Launch',
    projectName: 'Minimal product launch',
    slides: [
      templateSlide({
        title: 'Meet your new\neveryday tool.',
        subtitle: 'A thoughtful product that makes the important work feel refreshingly simple.',
        layout: 'hero',
        theme: 'lilac',
        deviceFrameId: 'iphone',
        layerTransforms: {
          screenshot: layerTransform({ y: 3, scale: 0.94, widthScale: 0.98 }),
          'accent-shape': layerTransform({ x: 13, y: 5, scale: 1.08 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.16 }),
          kicker: layerSettings({ opacity: 0.55 }),
        },
        accentShapeStyle: { type: 'circle', color: '#bda8ff' },
      }),
      templateSlide({
        title: 'Everything important.\nNothing in the way.',
        subtitle: 'Plan, create, and move forward from one focused workspace.',
        layout: 'split',
        theme: 'mint',
        deviceFrameId: 'none',
        layerTransforms: {
          headline: layerTransform({ scale: 0.96 }),
          'supporting-text': layerTransform({ y: 2 }),
          screenshot: layerTransform({ scale: 0.88, heightScale: 0.9 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.1 }),
        },
        accentShapeStyle: { type: 'pill', color: '#70d6aa' },
      }),
      templateSlide({
        title: 'Ready when\nyou are.',
        subtitle: 'Start with a clear canvas and make it yours.',
        layout: 'device-top',
        theme: 'forest',
        deviceFrameId: 'iphone',
        layerTransforms: {
          screenshot: layerTransform({ y: -2, scale: 0.9 }),
          headline: layerTransform({ y: -1 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.12 }),
          footer: layerSettings({ opacity: 0.35 }),
        },
        accentShapeStyle: { type: 'circle', color: '#1f8a5b' },
      }),
    ],
  },
  {
    id: 'feature-highlight',
    name: 'Feature highlight',
    description: 'Lead with one capability, then zoom out to show the complete workflow.',
    category: 'Product',
    projectName: 'Feature highlight',
    slides: [
      templateSlide({
        title: 'See the whole\npicture at once.',
        subtitle: 'Bring your most important signals into a single, focused view.',
        layout: 'spotlight',
        theme: 'ocean',
        deviceFrameId: 'iphone',
        layerTransforms: {
          headline: layerTransform({ x: -2 }),
          'supporting-text': layerTransform({ y: 3 }),
          screenshot: layerTransform({ x: 3, scale: 1.03 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.18 }),
        },
        accentShapeStyle: { type: 'circle', color: '#4b9ee8' },
      }),
      templateSlide({
        title: 'Move at the speed\nof thought.',
        subtitle: 'Turn a quick decision into meaningful progress without the busywork.',
        layout: 'caption-left',
        theme: 'lilac',
        deviceFrameId: 'none',
        layerTransforms: {
          headline: layerTransform({ scale: 1.04 }),
          screenshot: layerTransform({ x: 2, scale: 0.96 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.12 }),
        },
        accentShapeStyle: { type: 'pill', color: '#bda8ff' },
      }),
      templateSlide({
        title: 'Built for\ndeep work.',
        subtitle: 'Powerful where it matters, simple everywhere else.',
        layout: 'caption-right',
        theme: 'mint',
        deviceFrameId: 'android',
        layerTransforms: {
          'supporting-text': layerTransform({ y: 2 }),
          screenshot: layerTransform({ x: -2, rotation: -2, scale: 0.98 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.14 }),
        },
        accentShapeStyle: { type: 'circle', color: '#70d6aa' },
      }),
    ],
  },
  {
    id: 'benefits-carousel',
    name: 'Benefits carousel',
    description: 'A friendly sequence of clear, benefit-led messages for quick social carousels.',
    category: 'Marketing',
    projectName: 'Benefits carousel',
    slides: [
      templateSlide({
        title: 'One workspace.\nZero friction.',
        subtitle: 'The simplest path from scattered ideas to meaningful action.',
        layout: 'centered',
        theme: 'coral',
        deviceFrameId: 'iphone',
        layerTransforms: {
          headline: layerTransform({ scale: 1.06 }),
          screenshot: layerTransform({ y: 3, scale: 0.9 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.2 }),
        },
        accentShapeStyle: { type: 'circle', color: '#ff795e' },
      }),
      templateSlide({
        title: 'Stay organized.\nAutomatically.',
        subtitle: 'Keep priorities visible and every next step close at hand.',
        layout: 'centered',
        theme: 'sunset',
        deviceFrameId: 'none',
        layerTransforms: {
          headline: layerTransform({ y: -1 }),
          'supporting-text': layerTransform({ y: 2 }),
          screenshot: layerTransform({ scale: 0.86, widthScale: 1.06 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.17 }),
        },
        accentShapeStyle: { type: 'pill', color: '#f59e0b' },
      }),
      templateSlide({
        title: 'Bring everyone\ntogether.',
        subtitle: 'A shared view that keeps creative and productive work in sync.',
        layout: 'centered',
        theme: 'ocean',
        deviceFrameId: 'iphone',
        layerTransforms: {
          headline: layerTransform({ scale: 1.04 }),
          screenshot: layerTransform({ x: 2, y: 2, scale: 0.92 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.16 }),
        },
        accentShapeStyle: { type: 'circle', color: '#4b9ee8' },
      }),
    ],
  },
  {
    id: 'dark-premium',
    name: 'Dark premium',
    description: 'A restrained, editorial sequence for considered products and premium stories.',
    category: 'Premium',
    projectName: 'Dark premium campaign',
    slides: [
      templateSlide({
        title: 'A quieter kind\nof power.',
        subtitle: 'Exceptional performance, shaped into an experience that feels effortless.',
        layout: 'spotlight',
        theme: 'midnight',
        deviceFrameId: 'iphone',
        layerTransforms: {
          headline: layerTransform({ x: -3, scale: 1.03 }),
          'supporting-text': layerTransform({ x: -2, y: 2 }),
          screenshot: layerTransform({ x: 3, y: 1, scale: 1.02 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.1 }),
          kicker: layerSettings({ opacity: 0.48 }),
          footer: layerSettings({ opacity: 0.32 }),
        },
        accentShapeStyle: { type: 'circle', color: '#5b4cf0' },
      }),
      templateSlide({
        title: 'Crafted\naround you.',
        subtitle: 'Every detail is designed to keep attention on what matters.',
        layout: 'caption-right',
        theme: 'graphite',
        deviceFrameId: 'none',
        layerTransforms: {
          headline: layerTransform({ x: -2 }),
          screenshot: layerTransform({ x: -3, scale: 0.92 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.08 }),
        },
        accentShapeStyle: { type: 'pill', color: '#5f6878' },
      }),
      templateSlide({
        title: 'Made for the moments\nthat matter.',
        subtitle: 'Present your best work with clarity, confidence, and composure.',
        layout: 'device-top',
        theme: 'midnight',
        deviceFrameId: 'android',
        layerTransforms: {
          headline: layerTransform({ y: -1, scale: 0.94 }),
          'supporting-text': layerTransform({ y: 2 }),
          screenshot: layerTransform({ y: -1, scale: 0.88 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.09 }),
          footer: layerSettings({ opacity: 0.28 }),
        },
        accentShapeStyle: { type: 'circle', color: '#5b4cf0' },
      }),
    ],
  },
  {
    id: 'playful-creator',
    name: 'Playful creator',
    description: 'Bright layouts and upbeat copy for personal brands, portfolios, and side projects.',
    category: 'Creator',
    projectName: 'Creator showcase',
    slides: [
      templateSlide({
        title: 'Make something\nonly you can make.',
        subtitle: 'A colorful home for your ideas, experiments, and creative point of view.',
        layout: 'centered',
        theme: 'coral',
        deviceFrameId: 'iphone',
        transform: transform({ rotation: -1 }),
        layerTransforms: {
          headline: layerTransform({ scale: 1.04 }),
          screenshot: layerTransform({ rotation: 3, scale: 0.92 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.24 }),
        },
        accentShapeStyle: { type: 'circle', color: '#ff795e' },
      }),
      templateSlide({
        title: 'From blank page\nto big idea.',
        subtitle: 'Make space for the unexpected and build something worth sharing.',
        layout: 'split',
        theme: 'sunset',
        deviceFrameId: 'none',
        layerTransforms: {
          headline: layerTransform({ rotation: -1 }),
          screenshot: layerTransform({ y: 3, rotation: -2, scale: 0.9 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.19 }),
        },
        accentShapeStyle: { type: 'pill', color: '#f59e0b' },
      }),
      templateSlide({
        title: 'Share\nyour world.',
        subtitle: 'Invite people in with a story that feels unmistakably yours.',
        layout: 'device-top',
        theme: 'lilac',
        deviceFrameId: 'android',
        layerTransforms: {
          headline: layerTransform({ scale: 1.03 }),
          screenshot: layerTransform({ rotation: -3, scale: 0.9 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.2 }),
        },
        accentShapeStyle: { type: 'circle', color: '#bda8ff' },
      }),
    ],
  },
  {
    id: 'saas-dashboard',
    name: 'SaaS dashboard',
    description: 'A crisp product narrative for analytics, workflows, and B2B growth tools.',
    category: 'SaaS',
    projectName: 'SaaS product story',
    slides: [
      templateSlide({
        title: 'Run the business.\nNot the busywork.',
        subtitle: 'Bring operations, reporting, and your next best action into one clear view.',
        layout: 'hero',
        theme: 'ocean',
        deviceFrameId: 'none',
        layerTransforms: {
          headline: layerTransform({ scale: 0.96 }),
          'supporting-text': layerTransform({ y: 2 }),
          screenshot: layerTransform({ y: 3, scale: 0.92, widthScale: 1.05 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.14 }),
        },
        accentShapeStyle: { type: 'circle', color: '#4b9ee8' },
      }),
      templateSlide({
        title: 'Every signal.\nOne view.',
        subtitle: 'Know what changed, what matters, and where your team should focus next.',
        layout: 'split',
        theme: 'graphite',
        deviceFrameId: 'iphone',
        layerTransforms: {
          headline: layerTransform({ scale: 0.94 }),
          screenshot: layerTransform({ y: 2, scale: 0.84, widthScale: 1.08 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.1 }),
        },
        accentShapeStyle: { type: 'pill', color: '#5f6878' },
      }),
      templateSlide({
        title: 'From insight\nto action.',
        subtitle: 'Give every decision a clear owner, a next step, and momentum.',
        layout: 'caption-left',
        theme: 'ocean',
        deviceFrameId: 'none',
        layerTransforms: {
          headline: layerTransform({ x: -2 }),
          'supporting-text': layerTransform({ y: 2 }),
          screenshot: layerTransform({ x: 3, scale: 0.92 }),
        },
        layerSettings: {
          'accent-shape': layerSettings({ opacity: 0.12 }),
        },
        accentShapeStyle: { type: 'circle', color: '#4b9ee8' },
      }),
    ],
  },
]

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const validateTransform = (value: Partial<SlideTransform> | undefined, path: string, errors: string[]) => {
  if (value === undefined) return
  const fields: Array<keyof SlideTransform> = [
    'x', 'y', 'scale', 'rotation', 'widthScale', 'heightScale', 'flipX', 'flipY',
  ]
  fields.forEach((field) => {
    const fieldValue = value[field]
    if (fieldValue === undefined) return
    if ((field === 'flipX' || field === 'flipY') && typeof fieldValue !== 'boolean') {
      errors.push(`${path}.${field} must be a boolean`)
      return
    }
    if ((field !== 'flipX' && field !== 'flipY') && !isFiniteNumber(fieldValue)) {
      errors.push(`${path}.${field} must be a finite number`)
    }
  })
  if (value.scale !== undefined && value.scale <= 0) errors.push(`${path}.scale must be greater than zero`)
  if (value.widthScale !== undefined && value.widthScale <= 0) errors.push(`${path}.widthScale must be greater than zero`)
  if (value.heightScale !== undefined && value.heightScale <= 0) errors.push(`${path}.heightScale must be greater than zero`)
}

export interface TemplateCatalogValidation {
  valid: boolean
  errors: string[]
}

/** Runtime validation keeps catalog mistakes out of editor projects. */
export const validateProjectTemplateCatalog = (
  catalog: ProjectTemplate[] = projectTemplates,
): TemplateCatalogValidation => {
  const errors: string[] = []
  const ids = new Set<string>()

  catalog.forEach((template, templateIndex) => {
    const path = `templates[${templateIndex}]`
    if (!nonEmptyString(template.id) || ids.has(template.id)) errors.push(`${path}.id must be unique and non-empty`)
    ids.add(template.id)
    if (!nonEmptyString(template.name)) errors.push(`${path}.name must be non-empty`)
    if (!nonEmptyString(template.description)) errors.push(`${path}.description must be non-empty`)
    if (!nonEmptyString(template.category)) errors.push(`${path}.category must be non-empty`)
    if (!nonEmptyString(template.projectName)) errors.push(`${path}.projectName must be non-empty`)
    if (!Array.isArray(template.slides) || template.slides.length === 0) {
      errors.push(`${path}.slides must contain at least one slide`)
      return
    }

    template.slides.forEach((slide, slideIndex) => {
      const slidePath = `${path}.slides[${slideIndex}]`
      if (!nonEmptyString(slide.title)) errors.push(`${slidePath}.title must be non-empty`)
      if (!nonEmptyString(slide.subtitle)) errors.push(`${slidePath}.subtitle must be non-empty`)
      if (!layouts.some((layout) => layout.id === slide.layout)) errors.push(`${slidePath}.layout is unsupported`)
      if (!themes.some((theme) => theme.id === slide.theme)) errors.push(`${slidePath}.theme is unsupported`)
      if (!deviceFramePresets.some((preset) => preset.id === slide.deviceFrameId)) errors.push(`${slidePath}.deviceFrameId is unsupported`)

      const forbiddenAssetKeys = ['screenshot', 'screenshotName', 'appIcon', 'backgroundImage'] as const
      forbiddenAssetKeys.forEach((key) => {
        if (key in slide) errors.push(`${slidePath}.${key} is forbidden; templates cannot include assets`)
      })

      validateTransform(slide.transform, `${slidePath}.transform`, errors)
      Object.entries(slide.layerTransforms ?? {}).forEach(([layerId, value]) => {
        if (!slideLayerIds.includes(layerId as LayerId)) errors.push(`${slidePath}.layerTransforms has unsupported layer ${layerId}`)
        validateTransform(value, `${slidePath}.layerTransforms.${layerId}`, errors)
      })
      Object.entries(slide.layerSettings ?? {}).forEach(([layerId, value]) => {
        if (!slideLayerIds.includes(layerId as LayerId)) errors.push(`${slidePath}.layerSettings has unsupported layer ${layerId}`)
        if (!value) return
        if (value.opacity !== undefined && (!isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 1)) {
          errors.push(`${slidePath}.layerSettings.${layerId}.opacity must be between 0 and 1`)
        }
        if (value.visible !== undefined && typeof value.visible !== 'boolean') {
          errors.push(`${slidePath}.layerSettings.${layerId}.visible must be a boolean`)
        }
      })
      if (slide.accentShapeStyle !== undefined) {
        if (!['circle', 'pill'].includes(slide.accentShapeStyle.type)) errors.push(`${slidePath}.accentShapeStyle.type is unsupported`)
        if (!/^#[0-9a-f]{6}$/i.test(slide.accentShapeStyle.color)) errors.push(`${slidePath}.accentShapeStyle.color must be a six-digit hex color`)
      }
    })
  })

  if (catalog.length < 6) errors.push('The template catalog must contain at least 6 templates')
  return { valid: errors.length === 0, errors }
}

export const createSlidesFromProjectTemplate = (template: ProjectTemplate): Slide[] => {
  const validation = validateProjectTemplateCatalog(projectTemplates)
  if (!validation.valid) throw new Error(`Project template catalog is invalid: ${validation.errors.join(' ')}`)

  return template.slides.map((defaults) => {
    const layerTransforms = createDefaultLayerTransforms()
    slideLayerIds.forEach((layerId) => {
      const overrides = defaults.layerTransforms?.[layerId]
      layerTransforms[layerId] = { ...layerTransforms[layerId], ...overrides }
    })

    const defaultLayerSettings = createDefaultLayerSettings()
    const layerSettings = { ...defaultLayerSettings }
    slideLayerIds.forEach((layerId) => {
      layerSettings[layerId] = { ...defaultLayerSettings[layerId], ...defaults.layerSettings?.[layerId] }
    })

    return {
      id: `slide-${crypto.randomUUID()}`,
      title: defaults.title,
      subtitle: defaults.subtitle,
      layout: defaults.layout,
      theme: defaults.theme,
      deviceFrameId: defaults.deviceFrameId,
      transform: { ...DEFAULT_SLIDE_TRANSFORM, ...defaults.transform },
      layerTransforms,
      layerSettings,
      accentShapeStyle: { ...createDefaultAccentShapeStyle(), ...defaults.accentShapeStyle },
      appIcon: null,
      backgroundImage: null,
      screenshot: null,
      screenshotName: null,
    }
  })
}
