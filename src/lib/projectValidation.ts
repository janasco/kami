import {
  backgroundBlendOptions,
  backgroundFillOptions,
  deviceFramePresets,
  layouts,
  slideLayerLabels,
  themes,
  exportProfiles,
  localeOptions,
  pendingExportProfiles,
  screenshotFitOptions,
  TRANSFORM_SIZE_MAX,
  TRANSFORM_SIZE_MIN,
} from '../data'
/*
 * The one asset path boundary, shared with the restore path in `project.ts`.
 * It used to have a second, looser copy that accepted a `..` segment, so a
 * hand-edited document could be reported as unsafe here and then opened anyway.
 */
import { isSafeAssetPath } from './assetPath'
import { isBackgroundFillKind } from './backgroundFill'
import { isKnownDeviceFrameId } from './devicePresets'
import type { LayerId } from '../types'
import { isScreenshotFit } from './screenshotFit'

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  path: string
  code: string
  message: string
  severity: ValidationSeverity
}

export interface ValidationReport {
  valid: boolean
  issues: ValidationIssue[]
}

export interface ValidationOptions {
  /** Permit the one known v1 layout spelling while the migration runs. */
  allowLegacyLayouts?: boolean
}

export const PROJECT_VERSION = 1
export const CANVAS_ID = 'main-story'

const supportedLayouts = new Set<string>(layouts.map((layout) => layout.id))
const supportedThemes = new Set<string>(themes.map((theme) => theme.id))
const supportedDevices = new Set<string>(deviceFramePresets.map((preset) => preset.id))
const supportedLocales = new Set<string>(localeOptions.map((locale) => locale.id))
const supportedProfiles = new Set<string>([...exportProfiles, ...pendingExportProfiles].map((profile) => profile.id))
const supportedScreenshotFits = new Set<string>(screenshotFitOptions.map((option) => option.id))
const screenshotFitIds = [...supportedScreenshotFits]
const backgroundFillIds: string[] = backgroundFillOptions.map((option) => option.id)
const backgroundBlendIds: string[] = backgroundBlendOptions.map((option) => option.id)
const legacyLayouts = new Set(['portrait-store'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const issue = (path: string, code: string, message: string): ValidationIssue =>
  ({ path, code, message, severity: 'error' })

const addIssue = (issues: ValidationIssue[], path: string, code: string, message: string) => {
  issues.push(issue(path, code, message))
}

const addWarning = (issues: ValidationIssue[], path: string, code: string, message: string) => {
  issues.push({ ...issue(path, code, message), severity: 'warning' })
}

const requireRecord = (value: unknown, path: string, issues: ValidationIssue[]): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    addIssue(issues, path, 'invalid-type', 'Must be an object.')
    return false
  }
  return true
}

const requireString = (value: unknown, path: string, issues: ValidationIssue[], code = 'required') => {
  if (!isString(value)) addIssue(issues, path, code, 'Must be a non-empty string.')
}

const requireId = (value: unknown, path: string, issues: ValidationIssue[]) =>
  requireString(value, path, issues, 'invalid-id')

const validateFrame = (value: unknown, path: string, issues: ValidationIssue[], requireOrigin = true) => {
  if (!requireRecord(value, path, issues)) return
  for (const field of ['x', 'y', 'width', 'height'] as const) {
    if (field === 'x' || field === 'y') {
      if (requireOrigin && !isFiniteNumber(value[field])) addIssue(issues, `${path}.${field}`, 'invalid-frame', 'Frame coordinates and dimensions must be finite numbers.')
    } else if (!isFiniteNumber(value[field])) {
      addIssue(issues, `${path}.${field}`, 'invalid-frame', 'Frame coordinates and dimensions must be finite numbers.')
    }
  }
  if (isFiniteNumber(value.width) && value.width <= 0) addIssue(issues, `${path}.width`, 'invalid-frame', 'Frame width must be greater than zero.')
  if (isFiniteNumber(value.height) && value.height <= 0) addIssue(issues, `${path}.height`, 'invalid-frame', 'Frame height must be greater than zero.')
}

const validateTransform = (value: unknown, path: string, issues: ValidationIssue[]) => {
  if (value === undefined) return
  if (!requireRecord(value, path, issues)) return
  for (const field of ['x', 'y', 'scale', 'rotation', 'widthScale', 'heightScale'] as const) {
    if (value[field] !== undefined && !isFiniteNumber(value[field])) {
      addIssue(issues, `${path}.${field}`, 'invalid-transform', 'Transform values must be finite numbers.')
    }
  }
  if (isFiniteNumber(value.scale) && value.scale <= 0) addIssue(issues, `${path}.scale`, 'invalid-transform', 'Scale must be greater than zero.')
  for (const field of ['widthScale', 'heightScale'] as const) {
    if (isFiniteNumber(value[field]) && (value[field] < TRANSFORM_SIZE_MIN || value[field] > TRANSFORM_SIZE_MAX)) {
      addIssue(issues, `${path}.${field}`, 'invalid-transform', `Size scale must be between ${TRANSFORM_SIZE_MIN} and ${TRANSFORM_SIZE_MAX}.`)
    }
  }
  for (const field of ['flipX', 'flipY'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      addIssue(issues, `${path}.${field}`, 'invalid-transform', 'Flip settings must be booleans.')
    }
  }
}

/**
 * Validates the optional background fill.
 *
 * The asymmetry is deliberate and matches `screenshotFit`: the record and its
 * `kind` are optional, so a document that never had a fill is untouched, and a
 * record that lost its kind is completed by the migration. A `kind` that is
 * present but unrecognised is an error, because the editor cannot know which
 * fill was meant, while a malformed colour, angle, or stop is a warning,
 * because the slide still opens with a repaired value rather than being lost.
 */
const validateBackgroundFill = (value: unknown, path: string, issues: ValidationIssue[]) => {
  if (value === undefined) return
  if (!requireRecord(value, path, issues)) return
  if (value.kind !== undefined && !isBackgroundFillKind(value.kind)) {
    addIssue(issues, `${path}.kind`, 'invalid-background-fill', `The background fill kind must be one of: ${backgroundFillIds.join(', ')}.`)
    // The remaining fields only mean something next to a known kind.
    return
  }
  if (value.blend !== undefined && !backgroundBlendIds.includes(String(value.blend))) {
    addIssue(issues, `${path}.blend`, 'invalid-background-fill', `The background blend must be one of: ${backgroundBlendIds.join(', ')}.`)
  }
  if (value.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(value.color))) {
    addWarning(issues, `${path}.color`, 'invalid-background-fill', 'The background fill colour is not a #rrggbb value; the default colour is used.')
  }
  if (value.gradient === undefined) return
  const gradientPath = `${path}.gradient`
  if (!requireRecord(value.gradient, gradientPath, issues)) return
  if (value.gradient.angle !== undefined && !isFiniteNumber(value.gradient.angle)) {
    addWarning(issues, `${gradientPath}.angle`, 'invalid-background-fill', 'The background fill angle must be a finite number; the default angle is used.')
  }
  if (value.gradient.stops === undefined) return
  if (!Array.isArray(value.gradient.stops)) {
    addWarning(issues, `${gradientPath}.stops`, 'invalid-background-fill', 'The background fill stops must be an array of colours; the default stops are used.')
    return
  }
  value.gradient.stops.forEach((stop, index) => {
    if (!/^#[0-9a-f]{6}$/i.test(String(stop))) {
      addWarning(issues, `${gradientPath}.stops[${index}]`, 'invalid-background-fill', 'A background fill stop is not a #rrggbb value; the default colour is used in its place.')
    }
  })
}

/**
 * Validates the optional focal point of an image layer.
 *
 * Out of range or non-finite is a warning, not an error: the value is clamped
 * into `0..1` on read, so a hand-edited project still frames the way it meant
 * to instead of refusing to open.
 */
const validateFocalPoint = (value: unknown, path: string, issues: ValidationIssue[]) => {
  if (value === undefined) return
  if (!requireRecord(value, path, issues)) return
  for (const axis of ['x', 'y'] as const) {
    const coordinate = value[axis]
    if (coordinate === undefined) continue
    if (!isFiniteNumber(coordinate) || coordinate < 0 || coordinate > 1) {
      addWarning(issues, `${path}.${axis}`, 'invalid-focal-point', 'A focal point must be a number between 0 and 1; it is clamped on open.')
    }
  }
}

const validateIdCollection = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  itemLabel: string,
): Set<string> => {
  const ids = new Set<string>()
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'invalid-type', `Must be an array of ${itemLabel} objects.`)
    return ids
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!requireRecord(item, itemPath, issues)) return
    requireId(item.id, `${itemPath}.id`, issues)
    if (isString(item.id)) {
      if (ids.has(item.id)) addIssue(issues, `${itemPath}.id`, 'duplicate-id', 'IDs must be unique.')
      ids.add(item.id)
    }
  })
  return ids
}

/**
 * Validates the optional per-device overrides of one output variant.
 *
 * The asymmetry follows the rest of the document and is deliberate:
 *
 * - An **enum** is an error with the exact path. A device frame, a fit, or a
 *   boolean flag that is present but wrong is a value the editor cannot render
 *   and cannot guess at, so the document is refused rather than opened with a
 *   device the author did not ask for.
 * - A **continuous** value is a warning and is clamped. A layer transform is a
 *   position and a scale, and a hand-edited `widthScale: 900` is repairable: the
 *   reader clamps it into range and the deck opens as close to the intent as the
 *   numbers allow.
 *
 * The whole array is optional, so a variant with no overrides is untouched, and
 * so is every project authored before this field.
 */
const validateDeviceOverrides = (value: unknown, path: string, assetIds: Set<string>, issues: ValidationIssue[]) => {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'invalid-variant', 'Output variant deviceOverrides must be an array.')
    return
  }
  value.forEach((override, index) => {
    const overridePath = `${path}[${index}]`
    if (!requireRecord(override, overridePath, issues)) return
    requireId(override.slideId, `${overridePath}.slideId`, issues)
    if (override.deviceFrameId !== undefined) {
      // A current preset is fine, an older spelling is migratable and reported,
      // and any other name is an error: the renderer would have to guess a device.
      if (!supportedDevices.has(String(override.deviceFrameId))) {
        if (isKnownDeviceFrameId(override.deviceFrameId)) {
          issues.push({ ...issue(`${overridePath}.deviceFrameId`, 'legacy-device-frame', 'Device frame uses an older name and will be updated on open.'), severity: 'warning' })
        } else addIssue(issues, `${overridePath}.deviceFrameId`, 'unsupported-device-frame', 'Device frame is not supported by this editor.')
      }
    }
    if (override.showDeviceStatusBar !== undefined && typeof override.showDeviceStatusBar !== 'boolean') {
      addIssue(issues, `${overridePath}.showDeviceStatusBar`, 'invalid-device-setting', 'The device status bar flag must be a boolean.')
    }
    if (override.screenshotFit !== undefined && !isScreenshotFit(override.screenshotFit)) {
      addIssue(issues, `${overridePath}.screenshotFit`, 'invalid-device-setting', `The screenshot fit must be one of: ${screenshotFitIds.join(', ')}.`)
    }
    if (override.assetId !== undefined) {
      requireString(override.assetId, `${overridePath}.assetId`, issues)
      if (isString(override.assetId) && !assetIds.has(override.assetId)) {
        addIssue(issues, `${overridePath}.assetId`, 'missing-reference', 'Device variant override references an asset that does not exist.')
      }
    }
    if (override.layerTransforms !== undefined) {
      if (!requireRecord(override.layerTransforms, `${overridePath}.layerTransforms`, issues)) return
      for (const [layerId, transform] of Object.entries(override.layerTransforms)) {
        const transformPath = `${overridePath}.layerTransforms.${layerId}`
        if (!slideLayerLabels[layerId as LayerId]) {
          addIssue(issues, transformPath, 'invalid-variant', 'Device variant layer transform names a layer this editor does not have.')
          continue
        }
        if (!requireRecord(transform, transformPath, issues)) continue
        for (const field of ['x', 'y', 'scale', 'rotation', 'widthScale', 'heightScale'] as const) {
          if (transform[field] !== undefined && !isFiniteNumber(transform[field])) {
            addIssue(issues, `${transformPath}.${field}`, 'invalid-variant', 'Device variant transform values must be finite numbers.')
          }
        }
        for (const field of ['flipX', 'flipY'] as const) {
          if (transform[field] !== undefined && typeof transform[field] !== 'boolean') {
            addIssue(issues, `${transformPath}.${field}`, 'invalid-variant', 'Device variant flip settings must be booleans.')
          }
        }
        // The continuous values are repaired rather than refused, so the reader's
        // own clamping is what the document ends up holding.
        if (isFiniteNumber(transform.scale) && transform.scale <= 0) {
          addWarning(issues, `${transformPath}.scale`, 'invalid-variant', 'A device variant scale must be greater than zero; it is clamped on open.')
        }
        for (const field of ['widthScale', 'heightScale'] as const) {
          if (isFiniteNumber(transform[field])
            && (transform[field] < TRANSFORM_SIZE_MIN || transform[field] > TRANSFORM_SIZE_MAX)) {
            addWarning(issues, `${transformPath}.${field}`, 'invalid-variant', `Size scale must be between ${TRANSFORM_SIZE_MIN} and ${TRANSFORM_SIZE_MAX}; it is clamped on open.`)
          }
        }
      }
    }
  })
}

/**
 * Validates the portable project document without changing it. Optional fields
 * may be absent so the migration pipeline can apply deterministic defaults;
 * malformed supplied fields are always errors.
 */
export function validateProjectDocument(value: unknown, options: ValidationOptions = {}): ValidationReport {
  const issues: ValidationIssue[] = []
  if (!requireRecord(value, '$', issues)) return { valid: false, issues }

  if (value.version !== PROJECT_VERSION) {
    addIssue(issues, '$.version', value.version !== undefined && Number(value.version) > PROJECT_VERSION ? 'newer-version' : 'unsupported-version', `Unsupported project version. Expected version ${PROJECT_VERSION}.`)
  }

  const project = requireRecord(value.project, '$.project', issues) ? value.project : null
  if (project) {
    requireId(project.id, '$.project.id', issues)
    requireString(project.name, '$.project.name', issues)
    requireString(project.defaultLocale, '$.project.defaultLocale', issues)
    if (isString(project.defaultLocale) && !supportedLocales.has(project.defaultLocale)) addIssue(issues, '$.project.defaultLocale', 'unsupported-locale', 'The default locale is not supported.')
    if (project.activeLocale !== undefined) {
      if (!isString(project.activeLocale) || !supportedLocales.has(project.activeLocale)) addIssue(issues, '$.project.activeLocale', 'unsupported-locale', 'The active locale is not supported.')
    }
  }

  const canvasIds = validateIdCollection(value.canvases, '$.canvases', issues, 'canvas')
  const slideIds = validateIdCollection(value.slides, '$.slides', issues, 'slide')
  const assetIds = value.assets === undefined ? new Set<string>() : validateIdCollection(value.assets, '$.assets', issues, 'asset')
  if (value.layouts !== undefined) validateIdCollection(value.layouts, '$.layouts', issues, 'layout')
  if (value.themes !== undefined) validateIdCollection(value.themes, '$.themes', issues, 'theme')
  const variantIds = value.outputVariants === undefined ? new Set<string>() : validateIdCollection(value.outputVariants, '$.outputVariants', issues, 'output variant')
  validateIdCollection(value.exportProfiles, '$.exportProfiles', issues, 'export profile')

  if (Array.isArray(value.canvases)) {
    value.canvases.forEach((canvas, index) => {
      if (!isRecord(canvas)) return
      const path = `$.canvases[${index}]`
      requireString(canvas.name, `${path}.name`, issues)
      if (canvas.mode !== 'connected' && canvas.mode !== 'isolated') addIssue(issues, `${path}.mode`, 'unsupported-canvas-mode', 'Canvas mode must be connected or isolated.')
      if (!Array.isArray(canvas.slideIds)) {
        addIssue(issues, `${path}.slideIds`, 'required', 'Canvas slideIds must be an array.')
        return
      }
      const seen = new Set<string>()
      canvas.slideIds.forEach((id, slideIndex) => {
        const slidePath = `${path}.slideIds[${slideIndex}]`
        if (!isString(id)) addIssue(issues, slidePath, 'invalid-reference', 'Canvas slide IDs must be non-empty strings.')
        else if (seen.has(id)) addIssue(issues, slidePath, 'duplicate-reference', 'A canvas may not reference the same slide twice.')
        else {
          seen.add(id)
          if (!slideIds.has(id)) addIssue(issues, slidePath, 'missing-reference', 'Canvas references a slide that does not exist.')
        }
      })
    })
  }

  if (Array.isArray(value.assets)) {
    const allowedKinds = new Set(['screenshot', 'icon', 'font', 'frame', 'other'])
    value.assets.forEach((asset, index) => {
      if (!isRecord(asset)) return
      const path = `$.assets[${index}]`
      requireString(asset.kind, `${path}.kind`, issues, 'invalid-kind')
      if (isString(asset.kind) && !allowedKinds.has(asset.kind)) addIssue(issues, `${path}.kind`, 'unsupported-asset-kind', 'Asset kind is not supported.')
      requireString(asset.path, `${path}.path`, issues)
      if (isString(asset.path) && !isSafeAssetPath(asset.path)) addIssue(issues, `${path}.path`, 'unsafe-asset-path', 'Asset path is unsafe or uses an unsupported scheme.')
      requireString(asset.mimeType, `${path}.mimeType`, issues)
      // An intrinsic size is a hint for the panoramic overscan, so a bad one is
      // ignored with a warning rather than a size the canvas has to trust.
      for (const axis of ['width', 'height'] as const) {
        if (asset[axis] !== undefined && !(isFiniteNumber(asset[axis]) && asset[axis] > 0)) {
          addWarning(issues, `${path}.${axis}`, 'invalid-asset-hint', 'An asset intrinsic size must be a positive number; the hint is ignored.')
        }
      }
    })
  }

  if (value.localization !== undefined) {
    const localization = requireRecord(value.localization, '$.localization', issues) ? value.localization : null
    if (localization) {
      if (!Array.isArray(localization.locales) || localization.locales.length === 0) addIssue(issues, '$.localization.locales', 'required', 'Localization must declare at least one locale.')
      const locales = new Set<string>()
      if (Array.isArray(localization.locales)) localization.locales.forEach((locale, index) => {
        const path = `$.localization.locales[${index}]`
        if (!isString(locale) || !supportedLocales.has(locale)) addIssue(issues, path, 'unsupported-locale', 'Localization locale is not supported.')
        else if (locales.has(locale)) addIssue(issues, path, 'duplicate-locale', 'Localization locales must be unique.')
        locales.add(locale)
      })
      if (isRecord(localization.messages)) {
        Object.entries(localization.messages).forEach(([key, translations]) => {
          const path = `$.localization.messages[${JSON.stringify(key)}]`
          if (!key.trim()) addIssue(issues, path, 'invalid-message-key', 'Message keys must not be empty.')
          if (!isRecord(translations)) {
            addIssue(issues, path, 'invalid-type', 'Message translations must be an object.')
            return
          }
          Object.entries(translations).forEach(([locale, text]) => {
            if (!supportedLocales.has(locale)) addIssue(issues, `${path}.${locale}`, 'unsupported-locale', 'Message locale is not supported.')
            if (typeof text !== 'string') addIssue(issues, `${path}.${locale}`, 'invalid-message', 'Message text must be a string.')
          })
        })
      } else addIssue(issues, '$.localization.messages', 'required', 'Localization messages must be an object.')
    }
  }

  if (Array.isArray(value.canvases) && Array.isArray(value.slides)) {
    value.slides.forEach((slide, index) => {
      if (!isRecord(slide)) return
      const path = `$.slides[${index}]`
      requireId(slide.canvasId, `${path}.canvasId`, issues)
      if (isString(slide.canvasId) && !canvasIds.has(slide.canvasId)) addIssue(issues, `${path}.canvasId`, 'missing-reference', 'Slide references a canvas that does not exist.')
      if (isString(slide.canvasId) && Array.isArray(value.canvases)) {
        const owner = value.canvases.find((canvas) => isRecord(canvas) && canvas.id === slide.canvasId)
        if (isRecord(owner) && Array.isArray(owner.slideIds) && !owner.slideIds.includes(slide.id)) {
          addIssue(issues, `${path}.canvasId`, 'missing-membership', 'Slide is not listed in its canvas slideIds.')
        }
      }
      requireString(slide.name, `${path}.name`, issues)
      requireString(slide.layoutId, `${path}.layoutId`, issues)
      const allowedLayout = supportedLayouts.has(String(slide.layoutId)) || (options.allowLegacyLayouts && legacyLayouts.has(String(slide.layoutId)))
      if (!allowedLayout) addIssue(issues, `${path}.layoutId`, 'unsupported-layout', 'Slide layout is not supported by this editor.')
      if (Array.isArray(value.layouts) && value.layouts.length > 0 && isString(slide.layoutId) && !value.layouts.some((layout) => isRecord(layout) && layout.id === slide.layoutId)) addIssue(issues, `${path}.layoutId`, 'missing-reference', 'Slide references a layout definition that does not exist.')
      requireString(slide.themeId, `${path}.themeId`, issues)
      if (!supportedThemes.has(String(slide.themeId))) addIssue(issues, `${path}.themeId`, 'unsupported-theme', 'Slide theme is not supported by this editor.')
      if (Array.isArray(value.themes) && value.themes.length > 0 && isString(slide.themeId) && !value.themes.some((theme) => isRecord(theme) && theme.id === slide.themeId)) addIssue(issues, `${path}.themeId`, 'missing-reference', 'Slide references a theme definition that does not exist.')
      if (slide.deviceFrameId !== undefined && !supportedDevices.has(String(slide.deviceFrameId))) {
        // A pre-catalog spelling is still openable: the migration maps it onto
        // the preset it meant, so it is reported rather than rejected.
        if (isKnownDeviceFrameId(slide.deviceFrameId)) {
          issues.push({ ...issue(`${path}.deviceFrameId`, 'legacy-device-frame', 'Device frame uses an older name and will be updated on open.'), severity: 'warning' })
        } else addIssue(issues, `${path}.deviceFrameId`, 'unsupported-device-frame', 'Device frame is not supported by this editor.')
      }
      if (slide.showDeviceStatusBar !== undefined && typeof slide.showDeviceStatusBar !== 'boolean') addIssue(issues, `${path}.showDeviceStatusBar`, 'invalid-device-setting', 'The device status bar flag must be a boolean.')
      if (slide.screenshotFit !== undefined && !isScreenshotFit(slide.screenshotFit)) addIssue(issues, `${path}.screenshotFit`, 'invalid-device-setting', `The screenshot fit must be one of: ${screenshotFitIds.join(', ')}.`)
      validateBackgroundFill(slide.backgroundFill, `${path}.backgroundFill`, issues)
      validateFrame(slide.frame, `${path}.frame`, issues)
      validateTransform(slide.transform, `${path}.transform`, issues)
      if (!Array.isArray(slide.layers)) {
        addIssue(issues, `${path}.layers`, 'required', 'Slide layers must be an array.')
        return
      }
      const layerIds = new Set<string>()
      slide.layers.forEach((layer, layerIndex) => {
        if (!isRecord(layer)) {
          addIssue(issues, `${path}.layers[${layerIndex}]`, 'invalid-type', 'Layer must be an object.')
          return
        }
        const layerPath = `${path}.layers[${layerIndex}]`
        requireId(layer.id, `${layerPath}.id`, issues)
        if (isString(layer.id)) {
          if (layerIds.has(layer.id)) addIssue(issues, `${layerPath}.id`, 'duplicate-id', 'Layer IDs must be unique within a slide.')
          layerIds.add(layer.id)
        }
        if (!['text', 'image', 'shape'].includes(String(layer.type))) addIssue(issues, `${layerPath}.type`, 'unsupported-layer-type', 'Layer type must be text, image, or shape.')
        if (layer.type === 'text') {
          requireString(layer.textKey, `${layerPath}.textKey`, issues)
          const messages = isRecord(value.localization) && isRecord(value.localization.messages) ? value.localization.messages : null
          if (isString(layer.textKey) && (!messages || !isRecord(messages[layer.textKey]))) addIssue(issues, `${layerPath}.textKey`, 'missing-message', 'Text layer must reference an existing localization message.')
        }
        if (layer.type === 'image' && layer.assetId !== undefined) {
          requireString(layer.assetId, `${layerPath}.assetId`, issues)
          if (isString(layer.assetId) && !assetIds.has(layer.assetId)) addIssue(issues, `${layerPath}.assetId`, 'missing-reference', 'Image layer references an asset that does not exist.')
        }
        validateFrame(layer.frame, `${layerPath}.frame`, issues)
        if (layer.zIndex !== undefined && (!Number.isInteger(layer.zIndex))) addIssue(issues, `${layerPath}.zIndex`, 'invalid-layer-setting', 'zIndex must be an integer.')
        if (layer.opacity !== undefined && (!isFiniteNumber(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) addIssue(issues, `${layerPath}.opacity`, 'invalid-layer-setting', 'Opacity must be a finite number between 0 and 1.')
        if (layer.visible !== undefined && typeof layer.visible !== 'boolean') addIssue(issues, `${layerPath}.visible`, 'invalid-layer-setting', 'Visibility must be a boolean.')
        validateTransform(layer.transform, `${layerPath}.transform`, issues)
        validateFocalPoint(layer.focalPoint, `${layerPath}.focalPoint`, issues)
        if (layer.style !== undefined) {
          if (!isRecord(layer.style) || (layer.style.type !== 'circle' && layer.style.type !== 'pill') || (layer.style.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(layer.style.color)))) addIssue(issues, `${layerPath}.style`, 'invalid-style', 'Shape style is invalid.')
        }
      })
    })
  }

  if (Array.isArray(value.layouts)) {
    value.layouts.forEach((layout, index) => {
      if (!isRecord(layout)) return
      const path = `$.layouts[${index}]`
      if (isString(layout.id) && !supportedLayouts.has(layout.id) && !(options.allowLegacyLayouts && legacyLayouts.has(layout.id))) addIssue(issues, `${path}.id`, 'unsupported-layout', 'Layout is not supported by this editor.')
      requireString(layout.name, `${path}.name`, issues)
      if (typeof layout.version !== 'number' || !Number.isInteger(layout.version) || layout.version < 1) addIssue(issues, `${path}.version`, 'invalid-layout', 'Layout version must be a positive integer.')
      validateFrame(layout.frame, `${path}.frame`, issues, false)
      if (!Array.isArray(layout.slots)) addIssue(issues, `${path}.slots`, 'required', 'Layout slots must be an array.')
    })
  }

  if (Array.isArray(value.themes)) {
    value.themes.forEach((theme, index) => {
      if (!isRecord(theme)) return
      const path = `$.themes[${index}]`
      if (isString(theme.id) && !supportedThemes.has(theme.id)) addIssue(issues, `${path}.id`, 'unsupported-theme', 'Theme is not supported by this editor.')
      requireString(theme.name, `${path}.name`, issues)
      if (typeof theme.version !== 'number' || !Number.isInteger(theme.version) || theme.version < 1) addIssue(issues, `${path}.version`, 'invalid-theme', 'Theme version must be a positive integer.')
      if (!isRecord(theme.tokens)) addIssue(issues, `${path}.tokens`, 'required', 'Theme tokens must be an object.')
    })
  }

  if (Array.isArray(value.outputVariants)) {
    value.outputVariants.forEach((variant, index) => {
      if (!isRecord(variant)) return
      const path = `$.outputVariants[${index}]`
      requireString(variant.name, `${path}.name`, issues)
      requireId(variant.canvasId, `${path}.canvasId`, issues)
      if (isString(variant.canvasId) && !canvasIds.has(variant.canvasId)) addIssue(issues, `${path}.canvasId`, 'missing-reference', 'Output variant references a missing canvas.')
      if (!isString(variant.locale) || !supportedLocales.has(variant.locale)) addIssue(issues, `${path}.locale`, 'unsupported-locale', 'Output variant locale is not supported.')
      if (!isString(variant.themeId) || !supportedThemes.has(variant.themeId)) addIssue(issues, `${path}.themeId`, 'unsupported-theme', 'Output variant theme is not supported.')
      if (variant.enabled !== undefined && typeof variant.enabled !== 'boolean') addIssue(issues, `${path}.enabled`, 'invalid-variant', 'Output variant enabled must be a boolean.')
      if (variant.exportProfileId !== undefined) {
        if (!isString(variant.exportProfileId) || !supportedProfiles.has(variant.exportProfileId)) addIssue(issues, `${path}.exportProfileId`, 'unsupported-profile', 'Output variant export profile is not supported.')
      }
      if (Array.isArray(variant.slideIds)) variant.slideIds.forEach((id, slideIndex) => {
        if (!isString(id) || !slideIds.has(id)) addIssue(issues, `${path}.slideIds[${slideIndex}]`, 'missing-reference', 'Output variant references a missing slide.')
      })
      else addIssue(issues, `${path}.slideIds`, 'required', 'Output variant slideIds must be an array.')
      validateDeviceOverrides(variant.deviceOverrides, `${path}.deviceOverrides`, assetIds, issues)
    })
  }

  if (Array.isArray(value.exportProfiles)) {
    value.exportProfiles.forEach((profile, index) => {
      if (!isRecord(profile)) return
      const path = `$.exportProfiles[${index}]`
      if (isString(profile.id) && !supportedProfiles.has(profile.id)) addIssue(issues, `${path}.id`, 'unsupported-profile', 'Export profile is not supported by this editor.')
      requireString(profile.name, `${path}.name`, issues)
      if (profile.orientation !== undefined && profile.orientation !== 'portrait' && profile.orientation !== 'landscape') addIssue(issues, `${path}.orientation`, 'unsupported-orientation', 'Export profile orientation is not supported.')
      if (profile.format !== 'png') addIssue(issues, `${path}.format`, 'unsupported-format', 'The editor supports PNG export profiles only.')
      if (!Array.isArray(profile.sizes) || profile.sizes.length === 0) addIssue(issues, `${path}.sizes`, 'required', 'Export profile must contain at least one size.')
      else profile.sizes.forEach((size, sizeIndex) => {
        if (!isRecord(size) || typeof size.width !== 'number' || typeof size.height !== 'number' || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width <= 0 || size.height <= 0) addIssue(issues, `${path}.sizes[${sizeIndex}]`, 'invalid-size', 'Profile sizes must contain positive integer width and height.')
      })
      if (!Array.isArray(profile.variantIds)) addIssue(issues, `${path}.variantIds`, 'required', 'Export profile variantIds must be an array.')
      else profile.variantIds.forEach((id, variantIndex) => {
        if (!isString(id) || !variantIds.has(id)) addIssue(issues, `${path}.variantIds[${variantIndex}]`, 'missing-reference', 'Export profile references a missing output variant.')
      })
      if (!['planned', 'ready', 'needs-assets', 'invalid'].includes(String(profile.status))) addIssue(issues, `${path}.status`, 'invalid-profile-status', 'Export profile status is invalid.')
      if (profile.selected !== undefined && typeof profile.selected !== 'boolean') addIssue(issues, `${path}.selected`, 'invalid-profile', 'Selected profile flag must be a boolean.')
    })
  }

  return { valid: !issues.some((entry) => entry.severity === 'error'), issues }
}

export const validateProject = validateProjectDocument

export const validationSummary = (issues: ValidationIssue[]) => {
  const first = issues[0]
  if (!first) return 'Project validation passed.'
  const prefix = `Project validation failed at ${first.path}: ${first.message}`
  return issues.length > 1 ? `${prefix} (${issues.length - 1} more issue${issues.length === 2 ? '' : 's'})` : prefix
}
