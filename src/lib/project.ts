import { createDefaultAccentShapeStyle, createDefaultLayerSettings, createDefaultLayerTransforms, DEFAULT_DEVICE_FRAME_ID, DEFAULT_SLIDE_TRANSFORM, deviceFramePresets, exportProfiles, layouts as editorLayouts, localeOptions, pendingExportProfiles, sanitizeLayerOpacity, themes as editorThemes, TRANSFORM_SIZE_MAX, TRANSFORM_SIZE_MIN } from '../data'
import { loadAutosavedDocument, saveAutosavedDocument } from './autosave'
import { migrateProjectDocument, type MigrationReport } from './projectMigration'
import { PROJECT_VERSION, validateProjectDocument, validationSummary, type ValidationReport } from './projectValidation'
import type { AccentShapeStyle, CanvasMode, DeviceFrameId, ExportProfile, ExportProfileId, LayerId, LayoutId, LocaleId, Slide, SlideTextCopy, SlideTransform, ThemeId } from '../types'
const CANVAS_ID = 'main-story'
const AUTHORING_PROFILE = exportProfiles[0]
const CANVAS_WIDTH = AUTHORING_PROFILE.width
const CANVAS_HEIGHT = AUTHORING_PROFILE.height
const DEFAULT_LOCALE: LocaleId = 'en-US'

interface Frame {
  x: number
  y: number
  width: number
  height: number
}

interface ProjectAsset {
  id: string
  kind: 'screenshot' | 'icon' | 'other'
  path: string
  mimeType: string
  sourceName?: string
}

interface ProjectFile {
  $schema: string
  version: typeof PROJECT_VERSION
  revision: {
    number: number
    createdAt: string
    message: string
  }
  project: {
    id: string
    name: string
    description: string
    defaultLocale: string
    activeLocale: LocaleId
  }
  localization: {
    locales: string[]
    messages: Record<string, Record<string, string>>
  }
  assets: ProjectAsset[]
  scene: {
    unit: 'px'
    origin: 'top-left'
    coordinateSpace: 'global'
    width: number
    height: number
  }
  canvases: Array<{
    id: string
    name: string
    mode: CanvasMode
    slideIds: string[]
  }>
  slides: Array<{
    id: string
    canvasId: string
    name: string
    frame: Frame
    layoutId: LayoutId
    themeId: ThemeId
    deviceFrameId: DeviceFrameId
    transform: SlideTransform
    layers: Array<{
      id: string
      type: 'text' | 'image' | 'shape'
      textKey?: string
      assetId?: string
      frame: Frame
      zIndex: number
      transform: SlideTransform
      opacity: number
      visible: boolean
      style?: AccentShapeStyle
    }>
  }>
  layouts: Array<{
    id: LayoutId
    name: string
    version: number
    frame: Frame
    slots: Array<{ id: string; type: 'text' | 'image'; required: boolean }>
  }>
  themes: Array<{
    id: ThemeId
    name: string
    version: number
    tokens: { colors: { background: string; accent: string; text: string } }
  }>
  outputVariants: Array<{
    id: string
    name: string
    canvasId: string
    locale: string
    themeId: ThemeId
    slideIds: string[]
    enabled: boolean
    exportProfileId?: ExportProfileId
  }>
  exportProfiles: Array<{
    id: string
    name: string
    orientation: ExportProfile['orientation']
    format: 'png'
    sizes: Array<{ width: number; height: number }>
    variantIds: string[]
    status: 'planned' | 'ready' | 'needs-assets' | 'invalid'
    selected?: boolean
  }>
}

export interface EditorProject {
  name: string
  slides: Slide[]
  activeLocale: LocaleId
  canvasMode: CanvasMode
  selectedExportProfileId: ExportProfileId
}

export type ProjectParseResult =
  | { ok: true; project: EditorProject; validation: ValidationReport; migration: MigrationReport }
  | { ok: false; error: string; issues?: ValidationReport['issues']; migration?: MigrationReport }

type JsonRecord = Record<string, unknown>

const frame = (x: number, y: number, width = CANVAS_WIDTH, height = CANVAS_HEIGHT): Frame => ({
  x,
  y,
  width,
  height,
})

const mimeTypeFor = (path: string, name: string | null) => {
  const dataUrlType = path.match(/^data:([^;,]+)/i)?.[1]
  if (dataUrlType) return dataUrlType

  const extension = name?.split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'svg') return 'image/svg+xml'
  if (extension === 'png') return 'image/png'
  return 'application/octet-stream'
}

export function serializeProject(project: EditorProject): ProjectFile {
  const assets: ProjectAsset[] = []
  const assetIdsByPath = new Map<string, string>()
  const screenshotAssetIds = new Map<string, string | null>()
  const iconAssetIds = new Map<string, string | null>()
  const backgroundAssetIds = new Map<string, string | null>()
  const messages: Record<string, Record<string, string>> = {}

  project.slides.forEach((slide) => {
    const titleKey = `${slide.id}.title`
    const subtitleKey = `${slide.id}.subtitle`
    messages[titleKey] = { [DEFAULT_LOCALE]: slide.title }
    messages[subtitleKey] = { [DEFAULT_LOCALE]: slide.subtitle }

    localeOptions.forEach(({ id: locale }) => {
      if (locale === DEFAULT_LOCALE) return
      const translation = slide.translations?.[locale]
      if (typeof translation?.title === 'string' && translation.title.length > 0) messages[titleKey][locale] = translation.title
      if (typeof translation?.subtitle === 'string') messages[subtitleKey][locale] = translation.subtitle
    })

    if (!slide.screenshot) {
      screenshotAssetIds.set(slide.id, null)
    } else {
      let assetId = assetIdsByPath.get(slide.screenshot)
      if (!assetId) {
        assetId = `asset-${assets.length + 1}`
        assets.push({
          id: assetId,
          kind: 'screenshot',
          path: slide.screenshot,
          mimeType: mimeTypeFor(slide.screenshot, slide.screenshotName),
          sourceName: slide.screenshotName ?? undefined,
        })
        assetIdsByPath.set(slide.screenshot, assetId)
      }
      screenshotAssetIds.set(slide.id, assetId)
    }

    if (!slide.appIcon) {
      iconAssetIds.set(slide.id, null)
    } else {
      const assetId = `asset-${assets.length + 1}`
      assets.push({
        id: assetId,
        kind: 'icon',
        path: slide.appIcon.dataUrl,
        mimeType: slide.appIcon.mimeType || mimeTypeFor(slide.appIcon.dataUrl, slide.appIcon.name),
        sourceName: slide.appIcon.name || undefined,
      })
      iconAssetIds.set(slide.id, assetId)
    }

    if (!slide.backgroundImage) {
      backgroundAssetIds.set(slide.id, null)
    } else {
      const assetId = `asset-${assets.length + 1}`
      assets.push({
        id: assetId,
        kind: 'other',
        path: slide.backgroundImage.dataUrl,
        mimeType: slide.backgroundImage.mimeType || mimeTypeFor(slide.backgroundImage.dataUrl, slide.backgroundImage.name),
        sourceName: slide.backgroundImage.name || undefined,
      })
      backgroundAssetIds.set(slide.id, assetId)
    }
  })

  const usedThemes = new Set<ThemeId>(project.slides.map((slide) => slide.theme))
  const primaryTheme = project.slides[0]?.theme ?? 'midnight'
  const selectedProfile = exportProfiles.find((profile) => profile.id === project.selectedExportProfileId) ?? exportProfiles[0]
  const profileScale = {
    x: selectedProfile.width / CANVAS_WIDTH,
    y: selectedProfile.height / CANVAS_HEIGHT,
  }
  const scaledFrame = (source: Frame): Frame => ({
    x: source.x * profileScale.x,
    y: source.y * profileScale.y,
    width: source.width * profileScale.x,
    height: source.height * profileScale.y,
  })
  const featureGraphicScale = {
    x: selectedProfile.width / 1024,
    y: selectedProfile.height / 500,
  }
  const scaledFeatureGraphicFrame = (source: Frame): Frame => ({
    x: source.x * featureGraphicScale.x,
    y: source.y * featureGraphicScale.y,
    width: source.width * featureGraphicScale.x,
    height: source.height * featureGraphicScale.y,
  })
  const featureGraphicFrames: Record<LayerId, Frame> = {
    'background-image': frame(0, 0, 1024, 500),
    'accent-shape': frame(610, 55, 350, 350),
    screenshot: frame(750, 48, 226, 404),
    'app-icon': frame(58, 60, 92, 92),
    headline: frame(182, 96, 500, 180),
    'supporting-text': frame(182, 290, 500, 95),
    kicker: frame(182, 48, 360, 36),
    footer: frame(58, 448, 908, 20),
  }
  const layerFrame = (slide: Slide, layerId: LayerId, source: Frame) =>
    slide.layout === 'feature-graphic'
      ? scaledFeatureGraphicFrame(featureGraphicFrames[layerId])
      : scaledFrame(source)
  const slideIds = project.slides.map((slide) => slide.id)

  return {
    $schema: './schemas/screenshot-studio.v1.json',
    version: PROJECT_VERSION,
    revision: {
      number: 1,
      createdAt: new Date().toISOString(),
      message: 'Saved from Kami editor',
    },
    project: {
      id: 'project-main',
      name: project.name,
      description: '',
      defaultLocale: DEFAULT_LOCALE,
      activeLocale: project.activeLocale,
    },
    localization: {
      locales: localeOptions.map(({ id }) => id),
      messages,
    },
    assets,
    scene: {
      unit: 'px',
      origin: 'top-left',
      coordinateSpace: 'global',
      width: selectedProfile.width * Math.max(1, project.slides.length),
      height: selectedProfile.height,
    },
    canvases: [
      {
        id: CANVAS_ID,
        name: 'Main story',
        mode: project.canvasMode,
        slideIds,
      },
    ],
    slides: project.slides.map((slide, index) => {
      const screenshotAssetId = screenshotAssetIds.get(slide.id)
      const appIconAssetId = iconAssetIds.get(slide.id)
      const backgroundAssetId = backgroundAssetIds.get(slide.id)
      const layerOpacity = (layerId: LayerId) => sanitizeLayerOpacity(slide.layerSettings[layerId].opacity)
      const layers: ProjectFile['slides'][number]['layers'] = [
        {
          id: 'background-image',
          type: 'image',
          ...(backgroundAssetId ? { assetId: backgroundAssetId } : {}),
          frame: layerFrame(slide, 'background-image', frame(0, 0)),
          zIndex: 0,
          transform: { ...slide.layerTransforms['background-image'] },
          opacity: layerOpacity('background-image'),
          visible: slide.layerSettings['background-image'].visible,
        },
        {
          id: 'accent-shape',
          type: 'shape',
          style: { ...slide.accentShapeStyle },
          frame: layerFrame(slide, 'accent-shape', frame(300, 1100, 642, 642)),
          zIndex: 1,
          transform: { ...slide.layerTransforms['accent-shape'] },
          opacity: layerOpacity('accent-shape'),
          visible: slide.layerSettings['accent-shape'].visible,
        },
        {
          id: 'screenshot',
          type: 'image',
          ...(screenshotAssetId ? { assetId: screenshotAssetId } : {}),
          frame: layerFrame(slide, 'screenshot', frame(400, 1150, 460, 900)),
          zIndex: 2,
          transform: { ...slide.layerTransforms.screenshot },
          opacity: layerOpacity('screenshot'),
          visible: slide.layerSettings.screenshot.visible,
        },
        {
          id: 'app-icon',
          type: 'image',
          ...(appIconAssetId ? { assetId: appIconAssetId } : {}),
          frame: layerFrame(slide, 'app-icon', frame(1010, 185, 130, 130)),
          zIndex: 5,
          transform: { ...slide.layerTransforms['app-icon'] },
          opacity: layerOpacity('app-icon'),
          visible: slide.layerSettings['app-icon'].visible,
        },
        {
          id: 'headline',
          type: 'text',
          textKey: `${slide.id}.title`,
          frame: layerFrame(slide, 'headline', frame(100, 380, 1042, 420)),
          zIndex: 3,
          transform: { ...slide.layerTransforms.headline },
          opacity: layerOpacity('headline'),
          visible: slide.layerSettings.headline.visible,
        },
        {
          id: 'supporting-text',
          type: 'text',
          textKey: `${slide.id}.subtitle`,
          frame: layerFrame(slide, 'supporting-text', frame(100, 900, 900, 180)),
          zIndex: 4,
          transform: { ...slide.layerTransforms['supporting-text'] },
          opacity: layerOpacity('supporting-text'),
          visible: slide.layerSettings['supporting-text'].visible,
        },
        {
          id: 'kicker',
          type: 'shape',
          frame: layerFrame(slide, 'kicker', frame(100, 228, 520, 72)),
          zIndex: 4,
          transform: { ...slide.layerTransforms.kicker },
          opacity: layerOpacity('kicker'),
          visible: slide.layerSettings.kicker.visible,
        },
        {
          id: 'footer',
          type: 'shape',
          frame: layerFrame(slide, 'footer', frame(100, 2560, 1042, 74)),
          zIndex: 6,
          transform: { ...slide.layerTransforms.footer },
          opacity: layerOpacity('footer'),
          visible: slide.layerSettings.footer.visible,
        },
      ]

      return {
        id: slide.id,
        canvasId: CANVAS_ID,
        name: `Slide ${index + 1}`,
        frame: frame(index * selectedProfile.width, 0, selectedProfile.width, selectedProfile.height),
        layoutId: slide.layout,
        themeId: slide.theme,
        deviceFrameId: slide.deviceFrameId,
        transform: { ...slide.transform },
        layers,
      }
    }),
    layouts: editorLayouts.map((layout) => ({
      id: layout.id,
      name: layout.name,
      version: 1,
      frame: layout.id === 'feature-graphic'
        ? scaledFeatureGraphicFrame(frame(0, 0, 1024, 500))
        : scaledFrame(frame(0, 0)),
      slots: [
        { id: 'title', type: 'text', required: true },
        { id: 'subtitle', type: 'text', required: false },
        { id: 'screenshot', type: 'image', required: false },
        ...(layout.id === 'feature-graphic'
          ? [{ id: 'app-icon', type: 'image' as const, required: false }]
          : []),
      ],
    })),
    themes: editorThemes
      .filter((theme) => usedThemes.has(theme.id))
      .map((theme) => ({
        id: theme.id,
        name: theme.name,
        version: 1,
        tokens: {
          colors: {
            background: theme.background ?? theme.colors[0],
            accent: theme.accent ?? theme.colors[1],
            text: theme.text ?? (theme.id === 'midnight' || theme.id === 'graphite' ? '#ffffff' : '#24232d'),
          },
        },
      })),
    outputVariants: [
      {
        id: 'variant-en-us',
        name: 'English',
        canvasId: CANVAS_ID,
        locale: project.activeLocale,
        themeId: primaryTheme,
        slideIds,
        enabled: true,
        exportProfileId: selectedProfile.id,
      },
    ],
    exportProfiles: [...exportProfiles, ...pendingExportProfiles].map((profile) => ({
      id: profile.id,
      name: profile.name,
      orientation: profile.orientation,
      format: profile.format,
      sizes: [{ width: profile.width, height: profile.height }],
      variantIds: pendingExportProfiles.some((pendingProfile) => pendingProfile.id === profile.id)
        ? []
        : ['variant-en-us'],
      status: pendingExportProfiles.some((pendingProfile) => pendingProfile.id === profile.id)
        ? 'planned'
        : (profile.preflight?.requirements.screenshot === false
            || project.slides.every((slide) => Boolean(slide.screenshot))
          ? 'ready'
          : 'needs-assets'),
      selected: profile.id === selectedProfile.id,
    })),
  }
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasString = (value: JsonRecord, key: string): value is JsonRecord & Record<string, string> =>
  typeof value[key] === 'string' && (value[key] as string).length > 0

const isValidFrame = (value: unknown): value is Frame =>
  isRecord(value) &&
  typeof value.x === 'number' && Number.isFinite(value.x) &&
  typeof value.y === 'number' && Number.isFinite(value.y) &&
  typeof value.width === 'number' && Number.isFinite(value.width) && value.width > 0 &&
  typeof value.height === 'number' && Number.isFinite(value.height) && value.height > 0

const isSafeAssetPath = (path: string) =>
  /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/i.test(path) ||
  /^(?:https?:\/\/|blob:)/i.test(path) ||
  (!/^[a-z][a-z\d+.-]*:/i.test(path) && !/[\u0000-\u001f]/.test(path))

const supportedLayout = (value: string): LayoutId =>
  editorLayouts.some((layout) => layout.id === value) ? value as LayoutId : 'hero'

const supportedTheme = (value: string): ThemeId =>
  editorThemes.some((theme) => theme.id === value) ? value as ThemeId : 'midnight'

const supportedDeviceFrame = (value: unknown): DeviceFrameId =>
  typeof value === 'string' && deviceFramePresets.some((preset) => preset.id === value)
    ? value as DeviceFrameId
    : DEFAULT_DEVICE_FRAME_ID

const parseTransform = (value: unknown): SlideTransform => {
  if (!isRecord(value)) return { ...DEFAULT_SLIDE_TRANSFORM }
  const readNumber = (key: 'x' | 'y' | 'scale' | 'rotation', fallback: number) =>
    typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] : fallback
  const readSize = (key: 'widthScale' | 'heightScale') => {
    const fallback = DEFAULT_SLIDE_TRANSFORM[key]
    return typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] > 0
      ? Math.min(TRANSFORM_SIZE_MAX, Math.max(TRANSFORM_SIZE_MIN, value[key]))
      : fallback
  }
  const scale = readNumber('scale', DEFAULT_SLIDE_TRANSFORM.scale)
  return {
    x: readNumber('x', DEFAULT_SLIDE_TRANSFORM.x),
    y: readNumber('y', DEFAULT_SLIDE_TRANSFORM.y),
    scale: scale > 0 ? scale : DEFAULT_SLIDE_TRANSFORM.scale,
    rotation: readNumber('rotation', DEFAULT_SLIDE_TRANSFORM.rotation),
    widthScale: readSize('widthScale'),
    heightScale: readSize('heightScale'),
    flipX: typeof value.flipX === 'boolean' ? value.flipX : DEFAULT_SLIDE_TRANSFORM.flipX,
    flipY: typeof value.flipY === 'boolean' ? value.flipY : DEFAULT_SLIDE_TRANSFORM.flipY,
  }
}

const layerAliases: Record<LayerId, string[]> = {
  'background-image': ['background-image', 'background', 'backgroundImage'],
  'accent-shape': ['accent-shape', 'accent', 'decoration'],
  screenshot: ['screenshot', 'image', 'device'],
  'app-icon': ['app-icon', 'icon'],
  headline: ['headline', 'title'],
  'supporting-text': ['supporting-text', 'subtitle'],
  kicker: ['kicker'],
  footer: ['footer'],
}

const layerIdFor = (layer: JsonRecord, slideId: string): LayerId | null => {
  const id = typeof layer.id === 'string' ? layer.id : ''
  const textKey = typeof layer.textKey === 'string' ? layer.textKey : ''
  for (const [layerId, aliases] of Object.entries(layerAliases) as Array<[LayerId, string[]]>) {
    if (aliases.includes(id) || aliases.some((alias) => `${slideId}-${alias}` === id)) return layerId
  }
  if (textKey === `${slideId}.title` || textKey.endsWith('.title')) return 'headline'
  if (textKey === `${slideId}.subtitle` || textKey.endsWith('.subtitle')) return 'supporting-text'
  return null
}

const parseAccentShapeStyle = (value: unknown): AccentShapeStyle => {
  const fallback = createDefaultAccentShapeStyle()
  if (!isRecord(value)) return fallback
  return {
    type: value.type === 'pill' ? 'pill' : 'circle',
    color: typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)
      ? value.color
      : fallback.color,
  }
}

const getMessages = (localization: JsonRecord | null, key: string): JsonRecord | null => {
  if (!localization) return null
  const messages = localization.messages
  if (!isRecord(messages) || !isRecord(messages[key])) return null
  return messages[key]
}

const getMessage = (messages: JsonRecord | null, defaultLocale: string) => {
  if (!messages) return ''
  const preferred = messages[defaultLocale]
  if (typeof preferred === 'string') return preferred

  const firstTranslation = Object.values(messages).find(
    (translation): translation is string => typeof translation === 'string',
  )
  return firstTranslation ?? ''
}

const getTranslations = (localization: JsonRecord | null, titleKey: string, subtitleKey: string) => {
  const titleMessages = getMessages(localization, titleKey)
  const subtitleMessages = getMessages(localization, subtitleKey)
  const translations: Partial<Record<LocaleId, SlideTextCopy>> = {}

  localeOptions.forEach(({ id }) => {
    if (id === DEFAULT_LOCALE) return
    const title = titleMessages?.[id]
    const subtitle = subtitleMessages?.[id]
    const hasTitle = typeof title === 'string' && title.length > 0
    if (!hasTitle && typeof subtitle !== 'string') return
    translations[id] = {
      ...(hasTitle ? { title: title as string } : {}),
      ...(typeof subtitle === 'string' ? { subtitle } : {}),
    }
  })

  return Object.keys(translations).length > 0 ? translations : undefined
}

type RestoredProjectResult =
  | { ok: true; project: EditorProject }
  | { ok: false; error: string }

const restoreProject = (value: Record<string, unknown>): RestoredProjectResult => {
  if (!isRecord(value)) return { ok: false, error: 'The project root must be a JSON object.' }
  if (value.version !== PROJECT_VERSION) {
    return { ok: false, error: 'Unsupported project version. Expected version 1.' }
  }

  const project = value.project
  if (!isRecord(project) || !hasString(project, 'id') || typeof project.name !== 'string' || !hasString(project, 'defaultLocale')) {
    return { ok: false, error: 'The project object is missing required fields.' }
  }
  if (!Array.isArray(value.canvases) || !Array.isArray(value.slides) || !Array.isArray(value.exportProfiles)) {
    return { ok: false, error: 'The project is missing required arrays.' }
  }
  if (value.slides.length === 0) return { ok: false, error: 'A project must contain at least one slide.' }

  const canvasIds = new Set<string>()
  for (const canvas of value.canvases) {
    if (
      !isRecord(canvas) ||
      !hasString(canvas, 'id') ||
      typeof canvas.name !== 'string' ||
      (canvas.mode !== 'connected' && canvas.mode !== 'isolated') ||
      !Array.isArray(canvas.slideIds) ||
      !canvas.slideIds.every((id) => typeof id === 'string' && id.length > 0)
    ) {
      return { ok: false, error: 'A canvas is missing required fields or has an invalid mode.' }
    }
    if (canvasIds.has(canvas.id)) return { ok: false, error: 'Canvas IDs must be unique.' }
    canvasIds.add(canvas.id)
  }
  if (canvasIds.size === 0) return { ok: false, error: 'A project must contain at least one canvas.' }

  const assets = new Map<string, JsonRecord>()
  if (value.assets !== undefined) {
    if (!Array.isArray(value.assets)) return { ok: false, error: 'The assets field must be an array.' }
    for (const asset of value.assets) {
      if (
        !isRecord(asset) ||
        !hasString(asset, 'id') ||
        !hasString(asset, 'kind') ||
        !hasString(asset, 'path') ||
        typeof asset.mimeType !== 'string' ||
        !isSafeAssetPath(asset.path)
      ) {
        return { ok: false, error: 'An asset is missing required fields or has an unsafe path.' }
      }
      if (assets.has(asset.id)) return { ok: false, error: 'Asset IDs must be unique.' }
      assets.set(asset.id, asset)
    }
  }

  const localization = value.localization === undefined ? null : value.localization
  if (localization !== null && !isRecord(localization)) {
    return { ok: false, error: 'The localization field must be an object.' }
  }
  const isKnownLocale = (id: unknown): id is LocaleId =>
    typeof id === 'string' && localeOptions.some((locale) => locale.id === id)
  const activeLocale = isKnownLocale(project.activeLocale) ? project.activeLocale : DEFAULT_LOCALE

  const slideIds = new Set<string>()
  const restoredSlides: Slide[] = []

  for (const slide of value.slides) {
    if (
      !isRecord(slide) ||
      !hasString(slide, 'id') ||
      !hasString(slide, 'canvasId') ||
      typeof slide.name !== 'string' ||
      !hasString(slide, 'layoutId') ||
      !hasString(slide, 'themeId') ||
      !isValidFrame(slide.frame) ||
      !Array.isArray(slide.layers)
    ) {
      return { ok: false, error: 'A slide is missing required fields or has an invalid frame.' }
    }
    if (slideIds.has(slide.id)) return { ok: false, error: 'Slide IDs must be unique.' }
    if (!canvasIds.has(slide.canvasId)) return { ok: false, error: `Slide ${slide.id} references a missing canvas.` }
    slideIds.add(slide.id)

    const textLayers: JsonRecord[] = []
    const layerTransforms = createDefaultLayerTransforms()
    const defaultLayerSettings = createDefaultLayerSettings()
    const layerSettings = Object.fromEntries(
      Object.entries(defaultLayerSettings).map(([layerId, settings]) => [layerId, { ...settings }]),
    ) as Slide['layerSettings']
    let accentShapeStyle = createDefaultAccentShapeStyle()
    let appIcon: Slide['appIcon'] = null
    let backgroundImage: Slide['backgroundImage'] = null
    let screenshot: string | null = null
    let screenshotName: string | null = null

    for (const layer of slide.layers) {
      if (
        !isRecord(layer) ||
        !hasString(layer, 'id') ||
        (layer.type !== 'text' && layer.type !== 'image' && layer.type !== 'shape') ||
        !isValidFrame(layer.frame)
      ) {
        return { ok: false, error: `Slide ${slide.id} contains an invalid layer.` }
      }
      const semanticLayerId = layerIdFor(layer, slide.id)
      if (semanticLayerId) {
        layerTransforms[semanticLayerId] = parseTransform(layer.transform)
        layerSettings[semanticLayerId] = {
          opacity: sanitizeLayerOpacity(layer.opacity, defaultLayerSettings[semanticLayerId].opacity),
          visible: typeof layer.visible === 'boolean'
            ? layer.visible
            : defaultLayerSettings[semanticLayerId].visible,
        }
        if (semanticLayerId === 'accent-shape') accentShapeStyle = parseAccentShapeStyle(layer.style)
      }
      if (layer.type === 'text') {
        if (typeof layer.textKey !== 'string' || layer.textKey.length === 0) {
          return { ok: false, error: `Slide ${slide.id} contains a text layer without a text key.` }
        }
        textLayers.push(layer)
      } else if (layer.type === 'image' && layer.assetId !== undefined) {
        if (typeof layer.assetId !== 'string' || !assets.has(layer.assetId)) {
          return { ok: false, error: `Slide ${slide.id} references a missing image asset.` }
        }
        const asset = assets.get(layer.assetId)!
        const assetName = typeof asset.sourceName === 'string' && asset.sourceName.length > 0
          ? asset.sourceName
          : semanticLayerId === 'background-image'
            ? `${slide.id}-background`
            : semanticLayerId === 'app-icon' ? `${slide.id}-app-icon` : `${slide.id}.png`
        const assetPath = asset.path as string
        const assetMimeType = typeof asset.mimeType === 'string' && asset.mimeType.length > 0
          ? asset.mimeType
          : mimeTypeFor(assetPath, assetName)
        if (semanticLayerId === 'background-image') {
          if (/^image\/(?:png|jpeg|webp)$/i.test(assetMimeType)) {
            backgroundImage = {
              name: assetName,
              dataUrl: assetPath,
              mimeType: assetMimeType,
            }
          }
        } else if (semanticLayerId === 'app-icon' || (!semanticLayerId && asset.kind === 'icon')) {
          appIcon = {
            name: assetName,
            dataUrl: assetPath,
            mimeType: assetMimeType,
          }
        } else {
          screenshot = assetPath
          screenshotName = assetName
        }
      }
    }

    const titleLayer = textLayers.find((layer) => layer.textKey === `${slide.id}.title`) ?? textLayers[0]
    const subtitleLayer = textLayers.find((layer) => layer.textKey === `${slide.id}.subtitle`) ?? textLayers[1]

    const titleKey = typeof titleLayer?.textKey === 'string' ? titleLayer.textKey : `${slide.id}.title`
    const subtitleKey = typeof subtitleLayer?.textKey === 'string' ? subtitleLayer.textKey : `${slide.id}.subtitle`
    const titleMessages = getMessages(localization as JsonRecord | null, titleKey)
    const subtitleMessages = getMessages(localization as JsonRecord | null, subtitleKey)

    restoredSlides.push({
      id: slide.id,
      title: getMessage(titleMessages, project.defaultLocale),
      subtitle: getMessage(subtitleMessages, project.defaultLocale),
      translations: getTranslations(localization as JsonRecord | null, titleKey, subtitleKey),
      layout: supportedLayout(slide.layoutId),
      theme: supportedTheme(slide.themeId),
      deviceFrameId: supportedDeviceFrame(slide.deviceFrameId),
      transform: parseTransform(slide.transform),
      layerTransforms,
      layerSettings,
      accentShapeStyle,
      appIcon,
      backgroundImage,
      screenshot,
      screenshotName,
    })
  }

  const firstCanvas = value.canvases[0]
  const isKnownProfileId = (id: unknown): id is ExportProfileId =>
    typeof id === 'string' && exportProfiles.some((profile) => profile.id === id)
  const variantProfile = Array.isArray(value.outputVariants)
    ? value.outputVariants.find((variant) => isRecord(variant) && isKnownProfileId(variant.exportProfileId))
    : undefined
  const selectedProfile = Array.isArray(value.exportProfiles)
    ? value.exportProfiles.find((profile) => isRecord(profile) && profile.selected === true)
    : undefined
  const selectedExportProfileId = isKnownProfileId(selectedProfile?.id)
    ? selectedProfile.id
    : isKnownProfileId(variantProfile?.exportProfileId)
      ? variantProfile.exportProfileId
      : exportProfiles.some((profile) => profile.id === 'app-store')
        ? 'app-store'
        : exportProfiles[0].id

  return {
    ok: true,
    project: {
      name: project.name,
      slides: restoredSlides,
      activeLocale,
      canvasMode: firstCanvas.mode,
      selectedExportProfileId,
    },
  }
}

const parseProject = (value: unknown): ProjectParseResult => {
  const migration = migrateProjectDocument(value)
  if (!migration.ok) {
    return {
      ok: false,
      error: migration.error,
      issues: migration.issues,
      ...(migration.report ? { migration: migration.report } : {}),
    }
  }

  const validation = validateProjectDocument(migration.document)
  if (!validation.valid) {
    return {
      ok: false,
      error: validationSummary(validation.issues),
      issues: validation.issues,
      migration: migration.report,
    }
  }

  const restored = restoreProject(migration.document)
  if (!restored.ok) {
    return { ok: false, error: restored.error, migration: migration.report }
  }

  return { ok: true, project: restored.project, validation, migration: migration.report }
}

export function parseProjectDocument(text: string): ProjectParseResult {
  try {
    return parseProject(JSON.parse(text) as unknown)
  } catch {
    return { ok: false, error: 'The selected file is not valid JSON.' }
  }
}

export interface AutosavedProjectLoadResult {
  project: EditorProject | null
  parseResult?: ProjectParseResult
  error?: string
}

export async function loadAutosavedProjectWithReport(): Promise<AutosavedProjectLoadResult> {
  const saved = await loadAutosavedDocument()
  if (!saved) return { project: null }
  const result = parseProjectDocument(saved)
  return result.ok
    ? { project: result.project, parseResult: result }
    : { project: null, parseResult: result, error: result.error }
}

/** Kept as a small compatibility wrapper for non-UI callers. */
export async function loadAutosavedProject(): Promise<EditorProject | null> {
  return (await loadAutosavedProjectWithReport()).project
}

export async function saveProjectLocally(project: EditorProject): Promise<void> {
  const document = serializeProject(project)
  const validation = validateProjectDocument(document)
  if (!validation.valid) throw new Error(validationSummary(validation.issues))
  await saveAutosavedDocument(JSON.stringify(document))
}
