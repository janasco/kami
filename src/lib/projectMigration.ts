import {
  createDefaultAccentShapeStyle,
  createDefaultLayerSettings,
  createDefaultLayerTransforms,
  DEFAULT_BACKGROUND_FILL,
  DEFAULT_DEVICE_FRAME_ID,
  DEFAULT_SCREENSHOT_FIT,
  defaultShowDeviceStatusBar,
  resolveDeviceFrameId,
  DEFAULT_SLIDE_TRANSFORM,
} from '../data'
import { clampFocalPoint, isDefaultFocalPoint } from './backgroundFill'
import { isKnownDeviceFrameId } from './devicePresets'
import { resolveScreenshotFit } from './screenshotFit'
import { validateProjectDocument, validationSummary, type ValidationIssue } from './projectValidation'
import { PROJECT_VERSION } from './projectValidation'

export interface MigrationReport {
  fromVersion: number
  toVersion: number
  applied: string[]
  warnings: ValidationIssue[]
}

export type MigrationResult =
  | { ok: true; document: Record<string, unknown>; report: MigrationReport }
  | { ok: false; error: string; issues: ValidationIssue[]; report?: MigrationReport }

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const clone = <T>(value: T): T => structuredClone(value)

const defaultTransform = () => ({ ...DEFAULT_SLIDE_TRANSFORM })

/** Apply only deterministic, non-semantic defaults for the v1 editor format. */
const applyV1Defaults = (source: JsonRecord): JsonRecord => {
  const document = clone(source)
  const project = isRecord(document.project) ? document.project : {}
  if (project.description === undefined) project.description = ''
  if (project.activeLocale === undefined && isRecord(document.localization) && Array.isArray(document.localization.locales) && typeof document.localization.locales[0] === 'string') project.activeLocale = document.localization.locales[0]
  if (project.activeLocale === undefined && typeof project.defaultLocale === 'string') project.activeLocale = project.defaultLocale
  document.project = project

  if (document.localization === undefined) {
    document.localization = { locales: [typeof project.defaultLocale === 'string' ? project.defaultLocale : 'en-US'], messages: {} }
  }
  if (document.assets === undefined) document.assets = []
  if (document.scene === undefined) document.scene = { unit: 'px', origin: 'top-left', coordinateSpace: 'global', width: 1080, height: 1920 }
  if (document.layouts === undefined) document.layouts = []
  if (document.themes === undefined) document.themes = []
  if (document.outputVariants === undefined) document.outputVariants = []

  if (Array.isArray(document.canvases)) document.canvases.forEach((canvas) => {
    if (!isRecord(canvas)) return
    if (canvas.name === undefined) canvas.name = 'Main story'
    if (canvas.mode === undefined) canvas.mode = 'isolated'
    if (canvas.slideIds === undefined && Array.isArray(document.slides)) canvas.slideIds = document.slides.map((slide) => isRecord(slide) ? slide.id : '').filter((id): id is string => typeof id === 'string')
  })

  if (Array.isArray(document.slides)) document.slides.forEach((slide) => {
    if (!isRecord(slide)) return
    if (slide.deviceFrameId === undefined) slide.deviceFrameId = DEFAULT_DEVICE_FRAME_ID
    // Applied after the frame default so frameless projects stay frameless.
    if (slide.showDeviceStatusBar === undefined) {
      slide.showDeviceStatusBar = defaultShowDeviceStatusBar(resolveDeviceFrameId(slide.deviceFrameId))
    }
    // Imports must never be cropped without the author choosing it.
    if (slide.screenshotFit === undefined) slide.screenshotFit = DEFAULT_SCREENSHOT_FIT
    /*
     * Both background fields are optional, so a project that never had them is
     * left exactly as it was and the applied-migration notice below is
     * unchanged. A record that exists but lost its kind is completed rather than
     * dropped, so a partially hand-edited fill still means something.
     */
    if (isRecord(slide.backgroundFill) && slide.backgroundFill.kind === undefined) {
      slide.backgroundFill.kind = DEFAULT_BACKGROUND_FILL
    }
    if (slide.transform === undefined) slide.transform = defaultTransform()
    if (!Array.isArray(slide.layers)) return
    const defaults = createDefaultLayerTransforms()
    const defaultSettings = createDefaultLayerSettings()
    slide.layers.forEach((layer, layerIndex) => {
      if (!isRecord(layer)) return
      if (layer.zIndex === undefined) layer.zIndex = layerIndex
      if (layer.transform === undefined) layer.transform = defaultTransform()
      const semantic = typeof layer.id === 'string' && Object.prototype.hasOwnProperty.call(defaults, layer.id)
        ? layer.id as keyof typeof defaults
        : null
      if (layer.opacity === undefined) layer.opacity = semantic ? defaultSettings[semantic].opacity : 1
      if (layer.visible === undefined) layer.visible = true
      if (semantic === 'accent-shape' && layer.style === undefined) layer.style = createDefaultAccentShapeStyle()
      /*
       * A focal point is normalized, so an out-of-range one is clamped here and
       * a value that lands on the centre is removed again: the document then
       * carries no record of a framing nobody chose.
       */
      if (semantic === 'background-image' && layer.focalPoint !== undefined) {
        const focalPoint = clampFocalPoint(layer.focalPoint)
        if (isDefaultFocalPoint(focalPoint)) delete layer.focalPoint
        else layer.focalPoint = { x: focalPoint.x, y: focalPoint.y }
      }
    })
  })

  if (Array.isArray(document.layouts)) document.layouts.forEach((layout) => {
    if (!isRecord(layout)) return
    if (isRecord(layout.frame)) {
      if (layout.frame.x === undefined) layout.frame.x = 0
      if (layout.frame.y === undefined) layout.frame.y = 0
    }
  })

  /*
   * The output variants, completed rather than created.
   *
   * Nothing is added to a document that has no variants, so a project that never
   * used the feature still goes through the migration unchanged and the
   * `report.applied` line the user reads stays exactly what it was. Only a record
   * that is present but incomplete is completed, which is the same rule every
   * other optional field follows.
   */
  if (Array.isArray(document.outputVariants)) document.outputVariants.forEach((variant) => {
    if (!isRecord(variant)) return
    if (variant.enabled === undefined) variant.enabled = true
    if (!Array.isArray(variant.deviceOverrides)) return
    variant.deviceOverrides.forEach((override) => {
      if (!isRecord(override)) return
      /*
       * A device frame the catalog does not have is only migrated when an older
       * spelling says so. An unknown name is left for the validator, which
       * refuses the document rather than quietly drawing a different device.
       */
      if (override.deviceFrameId === undefined) return
      if (isKnownDeviceFrameId(override.deviceFrameId)) {
        override.deviceFrameId = resolveDeviceFrameId(override.deviceFrameId)
      }
      if (override.screenshotFit !== undefined) override.screenshotFit = resolveScreenshotFit(override.screenshotFit)
    })
  })

  return document
}

/** Normalize the known v1 fixture spelling without accepting arbitrary layouts. */
const migrateKnownV1Ids = (source: JsonRecord): JsonRecord => {
  const document = clone(source)
  if (Array.isArray(document.layouts)) document.layouts.forEach((layout) => {
    if (isRecord(layout) && layout.id === 'portrait-store') layout.id = 'hero'
  })
  if (Array.isArray(document.slides)) document.slides.forEach((slide) => {
    if (isRecord(slide) && slide.layoutId === 'portrait-store') slide.layoutId = 'hero'
  })
  return document
}

/**
 * Bring a pre-catalog device spelling up to the preset it meant. The document
 * version is untouched: only the stored value changes, and a value that already
 * names a current preset is left exactly as it is.
 */
const migrateLegacyDeviceFrames = (source: JsonRecord): JsonRecord => {
  const document = clone(source)
  if (Array.isArray(document.slides)) document.slides.forEach((slide) => {
    if (!isRecord(slide) || slide.deviceFrameId === undefined) return
    const resolved = resolveDeviceFrameId(slide.deviceFrameId)
    if (resolved !== slide.deviceFrameId) slide.deviceFrameId = resolved
  })
  return document
}

export function migrateProjectDocument(value: unknown): MigrationResult {
  if (!isRecord(value)) {
    const issues = [{ path: '$', code: 'invalid-type', message: 'The project root must be a JSON object.', severity: 'error' as const }]
    return { ok: false, error: issues[0].message, issues }
  }
  if (typeof value.version !== 'number' || !Number.isInteger(value.version)) {
    const issues = [{ path: '$.version', code: 'required', message: 'Project version must be an integer.', severity: 'error' as const }]
    return { ok: false, error: issues[0].message, issues }
  }
  if (value.version > PROJECT_VERSION) {
    const issues = [{ path: '$.version', code: 'newer-version', message: `This project uses version ${value.version}; this editor supports version ${PROJECT_VERSION} and will not downgrade it.`, severity: 'error' as const }]
    return { ok: false, error: issues[0].message, issues }
  }
  if (value.version < 1) {
    const issues = [{ path: '$.version', code: 'unsupported-version', message: 'No migration is available for this project version.', severity: 'error' as const }]
    return { ok: false, error: issues[0].message, issues }
  }

  const preflight = validateProjectDocument(value, { allowLegacyLayouts: true })
  if (!preflight.valid) return { ok: false, error: validationSummary(preflight.issues), issues: preflight.issues }

  const report: MigrationReport = { fromVersion: value.version, toVersion: PROJECT_VERSION, applied: [], warnings: [] }
  let document = applyV1Defaults(value)
  const beforeKnownIds = JSON.stringify(document)
  document = migrateKnownV1Ids(document)
  if (JSON.stringify(document) !== beforeKnownIds) report.applied.push('v1: normalize legacy layout id')
  const beforeDeviceIds = JSON.stringify(document)
  document = migrateLegacyDeviceFrames(document)
  if (JSON.stringify(document) !== beforeDeviceIds) report.applied.push('v1: normalize legacy device frame id')
  if (value.version === PROJECT_VERSION) report.applied.push('v1: apply optional field defaults')

  const validation = validateProjectDocument(document)
  if (!validation.valid) return { ok: false, error: validationSummary(validation.issues), issues: validation.issues, report }
  report.warnings = validation.issues
  return { ok: true, document, report }
}

export const migrateProject = migrateProjectDocument
