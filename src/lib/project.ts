import { createDefaultAccentShapeStyle, createDefaultLayerSettings, createDefaultLayerTransforms, DEFAULT_BACKGROUND_FILL, DEFAULT_SLIDE_TRANSFORM, exportProfiles, layouts as editorLayouts, localeOptions, pendingExportProfiles, resolveDeviceFrameId, sanitizeLayerOpacity, slideLayerIds, themes as editorThemes, TRANSFORM_SIZE_MAX, TRANSFORM_SIZE_MIN } from '../data'
/*
 * `isSafeAssetPath` used to have a second, looser copy in this file that
 * accepted a `..` segment, so a hand-edited background pointing outside the
 * bundle passed restore and was then rejected by validation. Both call sites
 * now read the one function in `lib/assetPath`; see that file for the rule and
 * for why the order of its checks is part of it.
 */
import { isSafeAssetPath } from './assetPath'
import { loadAutosavedDocument, saveAutosavedDocument } from './autosave'
import { clampFocalPoint, isDefaultFocalPoint, resolveBackgroundFill, resolveIntrinsicSize } from './backgroundFill'
import {
  createDefaultOutputVariant,
  DEFAULT_VARIANT_ID,
  isProfileReadyForVariants,
  variantsForProfile,
} from './deviceVariants'
import { resolveShowDeviceStatusBar } from './deviceStatusBar'
import { parseLayerOrder, serializeLayerOrder } from './layerOrder'
import { migrateProjectDocument, type MigrationReport } from './projectMigration'
import { resolveScreenshotFit } from './screenshotFit'
import { PROJECT_VERSION, validateProjectDocument, validationSummary, type ValidationReport } from './projectValidation'
import type { AccentShapeStyle, BackgroundFill, CanvasMode, DeviceFrameId, DeviceVariantSlideOverride, ExportProfile, ExportProfileId, FocalPoint, LayerId, LayerTransforms, LayoutId, LocaleId, OutputVariant, ScreenshotFit, Slide, SlideTextCopy, SlideTransform, ThemeId } from '../types'
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
  /**
   * Intrinsic pixel size of the referenced file, written for background assets
   * so a panoramic fill can compute its overscan before the image has loaded.
   * A hint only: the renderer re-measures, and a document without one renders
   * as a plain cover.
   */
  width?: number
  height?: number
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
    showDeviceStatusBar: boolean
    screenshotFit: ScreenshotFit
    /**
     * Optional background fill. Absent means the theme, so a deck that never
     * touched a fill keeps saving the document it always saved.
     */
    backgroundFill?: BackgroundFill
    transform: SlideTransform
    /**
     * Optional stacking order, written only when a slide has reordered its
     * layers. Absent means the catalog order, so the field adds no requirement
     * to an existing project and needs no version bump.
     */
    layerOrder?: LayerId[]
    layers: Array<{
      id: string
      type: 'text' | 'image' | 'shape'
      textKey?: string
      assetId?: string
      /**
       * Normalized focal point of an image layer, written only when it differs
       * from the centre. The `background-image` layer is the only one that uses
       * it today, and the key stays on the layer so a focal point is a property
       * of the image rather than of the slide.
       */
      focalPoint?: FocalPoint
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
    /**
     * Per-device differences, written only when at least one slide has one. The
     * editor model stores a capture as bytes and the document stores an asset
     * id, so a capture shared by two variants is one asset rather than two
     * copies of the same base64 in one JSON file.
     */
    deviceOverrides?: Array<{
      slideId: string
      deviceFrameId?: DeviceFrameId
      showDeviceStatusBar?: boolean
      screenshotFit?: ScreenshotFit
      assetId?: string
      layerTransforms?: Partial<Record<LayerId, SlideTransform>>
    }>
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
  /**
   * The deck's output variants, in document order.
   *
   * Optional and additive. Absent means the single default variant, which is the
   * record the serializer hard-coded before this field existed, so a deck that
   * never used a device variant keeps producing the identical document. Absent
   * rather than an empty array, so "never used the feature" and "used it and
   * deleted everything" cannot produce the same bytes.
   */
  outputVariants?: OutputVariant[]
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

/**
 * The per-device layer transforms worth storing, and nothing else.
 *
 * A transform that resolves back to the slide's own is dropped, so clearing a
 * device override in the editor removes the field and the document returns to
 * the shape it had before the override existed. Unusable values are dropped for
 * the same reason: a stored `NaN` would survive JSON and re-enter the renderer.
 */
const serializeVariantLayerTransforms = (
  slide: Slide,
  overrides: Partial<Record<LayerId, SlideTransform>> | undefined,
): Partial<Record<LayerId, SlideTransform>> | undefined => {
  if (!overrides) return undefined
  const result: Partial<Record<LayerId, SlideTransform>> = {}
  let count = 0
  for (const [layerId, transform] of Object.entries(overrides) as Array<[LayerId, SlideTransform]>) {
    if (!slide.layerTransforms[layerId] || !transform) continue
    if (!isUsableTransform(transform)) continue
    if (isSameTransform(slide.layerTransforms[layerId], transform)) continue
    result[layerId] = { ...transform }
    count += 1
  }
  return count > 0 ? result : undefined
}

const isUsableTransform = (transform: SlideTransform): boolean =>
  [transform.x, transform.y, transform.scale, transform.rotation, transform.widthScale, transform.heightScale]
    .every((value) => typeof value === 'number' && Number.isFinite(value))
  && transform.scale > 0
  && typeof transform.flipX === 'boolean'
  && typeof transform.flipY === 'boolean'

const isSameTransform = (a: SlideTransform, b: SlideTransform): boolean =>
  a.x === b.x
  && a.y === b.y
  && a.scale === b.scale
  && a.rotation === b.rotation
  && a.widthScale === b.widthScale
  && a.heightScale === b.heightScale
  && a.flipX === b.flipX
  && a.flipY === b.flipY

export function serializeProject(project: EditorProject): ProjectFile {
  const assets: ProjectAsset[] = []
  const assetIdsByPath = new Map<string, string>()
  const screenshotAssetIds = new Map<string, string | null>()
  const iconAssetIds = new Map<string, string | null>()
  const backgroundAssetIds = new Map<string, string | null>()
  const messages: Record<string, Record<string, string>> = {}

  /**
   * One asset for a set of bytes, shared by every reference to it.
   *
   * Variant captures go through the same map as slide captures, so a capture a
   * variant shares with its slide, or with another variant, is stored once.
   */
  const assetIdForPath = (path: string, name: string | null, kind: ProjectAsset['kind']) => {
    const existing = assetIdsByPath.get(path)
    if (existing) return existing
    const id = `asset-${assets.length + 1}`
    assets.push({ id, kind, path, mimeType: mimeTypeFor(path, name), sourceName: name ?? undefined })
    assetIdsByPath.set(path, id)
    return id
  }

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
      screenshotAssetIds.set(slide.id, assetIdForPath(slide.screenshot, slide.screenshotName, 'screenshot'))
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
      const intrinsic = resolveIntrinsicSize(slide.backgroundImage)
      assets.push({
        id: assetId,
        kind: 'other',
        path: slide.backgroundImage.dataUrl,
        mimeType: slide.backgroundImage.mimeType || mimeTypeFor(slide.backgroundImage.dataUrl, slide.backgroundImage.name),
        sourceName: slide.backgroundImage.name || undefined,
        // Written only when both numbers are usable, so a document never claims
        // a size nobody measured.
        ...(intrinsic ? { width: intrinsic.width, height: intrinsic.height } : {}),
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

  /*
   * The output variants.
   *
   * This used to be one hard-coded record, unconditionally, which meant every
   * autosave collapsed whatever the author or a hand-edited file had written. An
   * absent list is not "collapse it": it is the shape a project that never used
   * a device variant has always had, and it is written through the same code
   * path as before so the bytes do not move.
   */
  const authoredVariants = project.outputVariants
  const variants: OutputVariant[] = authoredVariants && authoredVariants.length > 0
    ? authoredVariants
    : [createDefaultOutputVariant({
      slideIds,
      locale: project.activeLocale,
      themeId: primaryTheme,
      exportProfileId: selectedProfile.id,
    })]

  /*
   * Whether the variant set is still the shape every pre-variant project has.
   *
   * That record is a legacy shape: one variant named after the locale, and every
   * supported profile linked to it whether or not it named that profile. Deriving
   * `variantIds` from it instead would empty five of six profiles and rewrite
   * every existing project on its next autosave, so a document that is still the
   * legacy shape is written as the legacy shape. The moment a second variant
   * exists, or the default one is renamed, disabled, given overrides, or no
   * longer covers the whole deck, the links become real.
   */
  const isLegacyDefaultVariantSet = (() => {
    if (variants.length !== 1) return false
    const [only] = variants
    return only.id === DEFAULT_VARIANT_ID
      && only.enabled
      && only.slideIds.length === slideIds.length
      && only.slideIds.every((id, index) => id === slideIds[index])
      && only.exportProfileId === selectedProfile.id
      && (only.deviceOverrides?.length ?? 0) === 0
  })()

  const serializedVariants: ProjectFile['outputVariants'] = variants.map((variant) => {
    const overrides = (variant.deviceOverrides ?? [])
      .filter((override) => override && typeof override.slideId === 'string' && override.slideId.length > 0)
      .map((override) => {
        const source = project.slides.find((slide) => slide.id === override.slideId)
        const layerTransforms = source
          ? serializeVariantLayerTransforms(source, override.layerTransforms)
          : undefined
        return {
          slideId: override.slideId,
          // Normalized on the way out, so a variant can only ever carry a
          // current catalog spelling, exactly as a slide does.
          ...(override.deviceFrameId !== undefined ? { deviceFrameId: resolveDeviceFrameId(override.deviceFrameId) } : {}),
          ...(typeof override.showDeviceStatusBar === 'boolean' ? { showDeviceStatusBar: override.showDeviceStatusBar } : {}),
          ...(override.screenshotFit !== undefined ? { screenshotFit: resolveScreenshotFit(override.screenshotFit) } : {}),
          ...(override.screenshot?.dataUrl
            ? { assetId: assetIdForPath(override.screenshot.dataUrl, override.screenshot.name, 'screenshot') }
            : {}),
          ...(layerTransforms ? { layerTransforms } : {}),
        }
      })
      .filter((override) => Object.keys(override).length > 1)

    return {
      id: variant.id,
      name: variant.name,
      canvasId: variant.canvasId,
      locale: variant.locale,
      themeId: variant.themeId,
      slideIds: [...variant.slideIds],
      enabled: variant.enabled,
      exportProfileId: variant.exportProfileId,
      // Absent, not an empty array, when nothing is customised: an untouched
      // deck must not grow a field.
      ...(overrides.length > 0 ? { deviceOverrides: overrides } : {}),
    }
  })

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
      // The authoring canvas: one profile frame per slide, and never a count of
      // variant renders. A two-variant deck renders twice as many PNGs but
      // authors one scene, and a `scene.width` that grew with the variants would
      // desynchronise the document from the deck the editor holds.
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
      const slideLayerOrder = serializeLayerOrder(slide.layerOrder)
      const backgroundFill = resolveBackgroundFill(slide.backgroundFill)
      // The centre is the CSS default and the value a document leaves out, so a
      // focal point is written only when the author actually moved it.
      const backgroundFocalPoint = clampFocalPoint(slide.backgroundFocalPoint)
      const layers: ProjectFile['slides'][number]['layers'] = [
        {
          id: 'background-image',
          type: 'image',
          ...(backgroundAssetId ? { assetId: backgroundAssetId } : {}),
          ...(!isDefaultFocalPoint(backgroundFocalPoint) ? { focalPoint: backgroundFocalPoint } : {}),
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
        // Normalized on the way out, so a saved project only ever carries a
        // current catalog ID and an older spelling cannot travel any further.
        deviceFrameId: resolveDeviceFrameId(slide.deviceFrameId),
        showDeviceStatusBar: slide.showDeviceStatusBar,
        screenshotFit: slide.screenshotFit,
        transform: { ...slide.transform },
        // Omitted for a slide still on the theme fill, so an untouched deck keeps
        // saving the document it always saved.
        ...(backgroundFill.kind !== DEFAULT_BACKGROUND_FILL ? { backgroundFill } : {}),
        // Omitted for a slide that has not reordered anything, so an untouched
        // deck keeps saving the document it always saved.
        ...(slideLayerOrder ? { layerOrder: slideLayerOrder } : {}),
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
    outputVariants: serializedVariants,
    /*
     * The profiles, with `variantIds` and `status` derived from the variants
     * rather than hard-coded.
     *
     * `status` used to be `slides.every(s => s.screenshot)` over the base deck,
     * which reported a profile as ready while a variant with no capture was
     * quietly exporting a placeholder. It is now `ready` only when *every enabled
     * variant targeting the profile* is complete, and a pending profile stays
     * `planned` with no variants at all.
     */
    exportProfiles: [...exportProfiles, ...pendingExportProfiles].map((profile) => {
      const isPending = pendingExportProfiles.some((pendingProfile) => pendingProfile.id === profile.id)
      const variantIds = isPending
        ? []
        : isLegacyDefaultVariantSet
          ? [variants[0].id]
          : variantsForProfile(variants, profile.id as ExportProfileId).map((entry) => entry.id)
      return {
        id: profile.id,
        name: profile.name,
        orientation: profile.orientation,
        format: profile.format,
        sizes: [{ width: profile.width, height: profile.height }],
        variantIds,
        status: isPending
          ? 'planned' as const
          : isProfileReadyForVariants(
            project.slides,
            variants,
            profile.id as ExportProfileId,
            profile.preflight?.requirements.screenshot !== false,
          )
            ? 'ready' as const
            : 'needs-assets' as const,
        selected: profile.id === selectedProfile.id,
      }
    }),
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

const supportedLayout = (value: string): LayoutId =>
  editorLayouts.some((layout) => layout.id === value) ? value as LayoutId : 'hero'

const supportedTheme = (value: string): ThemeId =>
  editorThemes.some((theme) => theme.id === value) ? value as ThemeId : 'midnight'

/** Whether a stored theme id names a theme this editor has. */
const supportedThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && editorThemes.some((theme) => theme.id === value)

/** Whether a stored locale id names a locale this editor has. */
const isKnownLocale = (value: unknown): value is LocaleId =>
  typeof value === 'string' && localeOptions.some((locale) => locale.id === value)

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
        !isSafeAssetPath(asset.path as unknown)
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
    let backgroundFocalPoint: FocalPoint | undefined
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
      if (semanticLayerId === 'background-image' && layer.focalPoint !== undefined) {
        // Clamped on read, and a focal point that lands on the centre is dropped
        // so re-saving the document does not add a field nobody asked for.
        const focalPoint = clampFocalPoint(layer.focalPoint)
        if (!isDefaultFocalPoint(focalPoint)) backgroundFocalPoint = focalPoint
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
          /*
           * No mime filter here. Every asset has already passed the path
           * validator above, which is the security boundary, and the renderer
           * degrades to the theme paint when the browser cannot draw a file, so
           * restoring a permitted background is strictly better than guessing
           * from its type. Filtering to raster types silently discarded
           * `image/svg+xml`, which the validator and the JSON Schema both allow
           * and which the demo project ships.
           */
          const intrinsic = resolveIntrinsicSize(asset)
          backgroundImage = {
            name: assetName,
            dataUrl: assetPath,
            mimeType: assetMimeType,
            ...(intrinsic ? { width: intrinsic.width, height: intrinsic.height } : {}),
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

    const deviceFrameId = resolveDeviceFrameId(slide.deviceFrameId)
    // Optional and additive: a project without the field, or with a partial or
    // stale one, resolves to the catalog order rather than being rejected.
    const layerOrder = parseLayerOrder(slide.layerOrder)
    /*
     * Both are optional and additive. An absent or unusable fill resolves to the
     * theme and resolves to no record at all, so a slide the author never
     * restyled still serializes without the field.
     */
    const backgroundFill = resolveBackgroundFill(slide.backgroundFill)

    restoredSlides.push({
      id: slide.id,
      title: getMessage(titleMessages, project.defaultLocale),
      subtitle: getMessage(subtitleMessages, project.defaultLocale),
      translations: getTranslations(localization as JsonRecord | null, titleKey, subtitleKey),
      layout: supportedLayout(slide.layoutId),
      theme: supportedTheme(slide.themeId),
      deviceFrameId,
      // Older projects predate the field; derive the default from the frame preset.
      showDeviceStatusBar: resolveShowDeviceStatusBar(deviceFrameId, slide.showDeviceStatusBar),
      // Older projects predate the field; contain keeps the capture uncropped.
      screenshotFit: resolveScreenshotFit(slide.screenshotFit),
      ...(backgroundFill.kind !== DEFAULT_BACKGROUND_FILL ? { backgroundFill } : {}),
      ...(backgroundFocalPoint ? { backgroundFocalPoint } : {}),
      transform: parseTransform(slide.transform),
      layerTransforms,
      ...(layerOrder ? { layerOrder } : {}),
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

  const restoredVariants = restoreOutputVariants(value.outputVariants, {
    assets,
    canvasIds,
    slideIds,
    isKnownProfileId,
  })

  /*
   * Which profile the editor opens on.
   *
   * The authority is `selected === true` on the profile, and only that. It used
   * to be "the first profile with selected === true, then the first variant with
   * a known exportProfileId", and with one variant the two agreed by accident.
   * With N variants "first match" is arbitrary, so the fallback is now
   * deterministic: the first **enabled** variant in array order, and nothing
   * else. A document where several profiles claim selection resolves to the
   * first of them, in document order, rather than to whichever the code happened
   * to reach.
   */
  const selectedProfile = Array.isArray(value.exportProfiles)
    ? value.exportProfiles.find((profile) => isRecord(profile) && profile.selected === true)
    : undefined
  const firstEnabledVariantProfile = restoredVariants.find(
    (variant) => variant.enabled && isKnownProfileId(variant.exportProfileId),
  )
  const selectedExportProfileId = isKnownProfileId(selectedProfile?.id)
    ? selectedProfile.id
    : isKnownProfileId(firstEnabledVariantProfile?.exportProfileId)
      ? firstEnabledVariantProfile.exportProfileId
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
      // Absent, not an empty array, for a project with no variants, so the
      // editor can tell "never used the feature" from "deleted everything" and
      // serialize the first back to the record it always wrote.
      ...(restoredVariants.length > 0 ? { outputVariants: restoredVariants } : {}),
    },
  }
}

interface RestoreVariantContext {
  assets: Map<string, JsonRecord>
  canvasIds: Set<string>
  slideIds: Set<string>
  isKnownProfileId: (id: unknown) => id is ExportProfileId
}

/**
 * Reads the output variants, or returns nothing.
 *
 * Optional and additive, so a project that never had variants restores exactly
 * as it did. A record that is present but unusable is dropped rather than
 * rejected, because a variant is a delivery target and a broken one must not
 * cost the author the deck. The document validator is the place that reports it.
 */
const restoreOutputVariants = (value: unknown, context: RestoreVariantContext): OutputVariant[] => {
  if (!Array.isArray(value)) return []
  const restored: OutputVariant[] = []
  const seen = new Set<string>()

  for (const entry of value) {
    if (!isRecord(entry)) continue
    const id = entry.id
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue
    if (typeof entry.name !== 'string' || entry.name.length === 0) continue
    if (typeof entry.canvasId !== 'string' || !context.canvasIds.has(entry.canvasId)) continue
    if (!isKnownLocale(entry.locale)) continue
    if (!supportedThemeId(entry.themeId)) continue
    if (!Array.isArray(entry.slideIds)) continue
    if (!context.isKnownProfileId(entry.exportProfileId)) continue

    const slideIdList: string[] = []
    for (const slideId of entry.slideIds) {
      if (typeof slideId === 'string' && context.slideIds.has(slideId) && !slideIdList.includes(slideId)) slideIdList.push(slideId)
    }
    if (slideIdList.length === 0) continue

    const deviceOverrides = restoreDeviceOverrides(entry.deviceOverrides, context)
    seen.add(id)
    restored.push({
      id,
      name: entry.name,
      canvasId: entry.canvasId,
      locale: entry.locale,
      themeId: entry.themeId,
      slideIds: slideIdList,
      // Absent means enabled, matching the schema's required flag and the
      // preflight semantics: a variant is exported unless it says otherwise.
      enabled: entry.enabled !== false,
      exportProfileId: entry.exportProfileId,
      ...(deviceOverrides.length > 0 ? { deviceOverrides } : {}),
    })
  }

  return restored
}

/**
 * Reads the per-device overrides of one variant.
 *
 * An override naming a slide the variant does not render, or naming no field at
 * all, is dropped: it would otherwise be a record of nothing. A device frame is
 * resolved through the same alias table a slide uses, so a variant cannot carry
 * an older spelling the slide could not.
 */
const restoreDeviceOverrides = (value: unknown, context: RestoreVariantContext): DeviceVariantSlideOverride[] => {
  if (!Array.isArray(value)) return []
  const overrides: DeviceVariantSlideOverride[] = []

  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.slideId !== 'string' || entry.slideId.length === 0) continue
    const override: DeviceVariantSlideOverride = { slideId: entry.slideId }

    if (entry.deviceFrameId !== undefined) override.deviceFrameId = resolveDeviceFrameId(entry.deviceFrameId)
    if (typeof entry.showDeviceStatusBar === 'boolean') override.showDeviceStatusBar = entry.showDeviceStatusBar
    if (entry.screenshotFit !== undefined) override.screenshotFit = resolveScreenshotFit(entry.screenshotFit)

    if (typeof entry.assetId === 'string') {
      const asset = context.assets.get(entry.assetId)
      if (asset && typeof asset.path === 'string' && isSafeAssetPath(asset.path)) {
        const name = typeof asset.sourceName === 'string' && asset.sourceName.length > 0
          ? asset.sourceName
          : `${entry.slideId}.png`
        override.screenshot = {
          name,
          dataUrl: asset.path,
          mimeType: typeof asset.mimeType === 'string' && asset.mimeType.length > 0
            ? asset.mimeType
            : mimeTypeFor(asset.path, name),
        }
      }
    }

    if (isRecord(entry.layerTransforms)) {
      const layerTransforms: Partial<LayerTransforms> = {}
      let count = 0
      for (const [layerId, transform] of Object.entries(entry.layerTransforms)) {
        if (!slideLayerIds.includes(layerId as LayerId)) continue
        const parsed = parseTransform(transform)
        layerTransforms[layerId as LayerId] = parsed
        count += 1
      }
      if (count > 0) override.layerTransforms = layerTransforms
    }

    // `slideId` alone is not an override; the serializer never writes one.
    if (Object.keys(override).length > 1) overrides.push(override)
  }

  return overrides
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
