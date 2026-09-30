#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const file = resolve(process.cwd(), 'screenshot-studio.json')
const errors = []
/*
 * Device frame IDs the editor can open, mirrored from src/lib/devicePresets.ts.
 * This validator runs without the app, so the list is repeated here on purpose:
 * it is an independent check of the tracked project file, not a second source
 * of truth for the catalog.
 */
const DEVICE_FRAME_IDS = [
  'iphone', 'iphone-se', 'iphone-island', 'iphone-island-max', 'ipad-mini', 'ipad-air',
  'android', 'android-pixel', 'android-galaxy', 'android-tablet', 'none', 'canvas',
  // Spellings from before the parametric catalog; the migration maps them on open.
  'iphone-x', 'iphone-notch', 'iphone-11', 'ios-phone', 'iphone-se-2', 'iphone-se-3', 'se',
  'iphone-14-pro', 'iphone-15-pro', 'dynamic-island', 'iphone-14-pro-max', 'iphone-15-pro-max',
  'dynamic-island-max', 'ipad', 'ipad-mini-6', 'ipad-pro', 'ipad-air-11', 'android-generic',
  'android-phone', 'google-android', 'pixel', 'pixel-8', 'galaxy', 'samsung', 'android-samsung',
  'android-tablet-10', 'tablet', 'frameless', 'no-frame', 'plain', 'feature-graphic',
  'feature-graphic-canvas',
]
/*
 * The predicates below are this file's entire trust model, and each one is a
 * type predicate so the checker can follow the narrowing the code already
 * performs. Every field read out of the document goes through one of them, which
 * is what makes `unknown` the right type for the document: this validator's job
 * is to distrust it, so it should never be able to read a field unchecked.
 *
 * `isList` rather than `Array.isArray` because `Array.isArray` narrows `unknown`
 * to `any[]`, and `any[]` makes every *element* of every array in the document
 * unchecked again — which is most of this file. `isList` asserts `unknown[]`, the
 * same runtime test with an element type that stays honest. Only the element type
 * differs; `Array.isArray(value)` is what it calls.
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * @param {unknown} value
 * @returns {value is unknown[]}
 */
const isList = (value) => Array.isArray(value)

/**
 * Non-empty string. Narrows to `string`, not to a non-empty-string type: the
 * distinction is not modelled, and every use here is a membership or length
 * test where `''` and a missing value are both simply "not acceptable".
 *
 * @param {unknown} value
 * @returns {value is string}
 */
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0

/**
 * @param {unknown} value
 * @returns {value is number}
 */
const finite = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * @param {unknown} value
 * @returns {value is string}
 */
const hexColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

/**
 * Membership in a fixed vocabulary.
 *
 * `Array.prototype.includes` takes the array's element type, so testing a value
 * read out of the document — an `unknown` — against one of the `string[]`
 * vocabularies above is a type error. The alternative is an `any` cast at each
 * of the eight sites below; this is the one cast, and it asserts exactly what
 * `includes` returns. No narrowing to the literal union is claimed, because
 * nothing downstream reads one.
 *
 * @param {readonly string[]} allowed
 * @param {unknown} value
 * @returns {boolean}
 */
const isOneOf = (allowed, value) => allowed.includes(/** @type {string} */ (value))
/*
 * Optional background fill vocabulary, mirrored from src/data.ts. Optional here
 * for the same reason the device frames are repeated: this validator runs
 * without the app, so it is an independent check of the tracked file rather than
 * a second source of truth for the editor.
 */
const BACKGROUND_FILL_KINDS = ['theme', 'solid', 'gradient', 'image', 'panoramic']
const BACKGROUND_BLENDS = ['normal', 'multiply', 'screen', 'overlay']
const SCREENSHOT_FITS = ['cover', 'contain']
/* The eight layers a device variant may place differently, mirrored from src/data.ts. */
const VARIANT_LAYER_IDS = [
  'background-image', 'accent-shape', 'screenshot', 'app-icon',
  'headline', 'supporting-text', 'kicker', 'footer',
]
/*
 * Per-device overrides, mirrored from src/lib/projectValidation.ts. An enum the
 * editor cannot render is an error with its exact path; a continuous value out of
 * range is a warning and is clamped on open, which is why it is not collected
 * here — this script reports errors only.
 */
/**
 * @param {unknown} value
 * @param {string} path
 */
const deviceOverrides = (value, path) => {
  if (value === undefined) return
  if (!isList(value)) { errors.push(`${path} must be an array`); return }
  value.forEach((override, index) => {
    const at = `${path}[${index}]`
    if (!isRecord(override)) { errors.push(`${at} must be an object`); return }
    if (!nonEmpty(override.slideId)) errors.push(`${at}.slideId must be a non-empty string`)
    if (override.deviceFrameId !== undefined && !isOneOf(DEVICE_FRAME_IDS, override.deviceFrameId)) {
      errors.push(`${at}.deviceFrameId is unsupported`)
    }
    if (override.showDeviceStatusBar !== undefined && typeof override.showDeviceStatusBar !== 'boolean') {
      errors.push(`${at}.showDeviceStatusBar must be a boolean`)
    }
    if (override.screenshotFit !== undefined && !isOneOf(SCREENSHOT_FITS, override.screenshotFit)) {
      errors.push(`${at}.screenshotFit must be one of: ${SCREENSHOT_FITS.join(', ')}`)
    }
    if (override.assetId !== undefined && !assetIds.has(override.assetId)) {
      errors.push(`${at}.assetId references a missing asset ${override.assetId}`)
    }
    if (override.layerTransforms === undefined) return
    if (!isRecord(override.layerTransforms)) { errors.push(`${at}.layerTransforms must be an object`); return }
    for (const [layerId, transform] of Object.entries(override.layerTransforms)) {
      if (!isOneOf(VARIANT_LAYER_IDS, layerId)) {
        errors.push(`${at}.layerTransforms.${layerId} names a layer this editor does not have`)
        continue
      }
      if (!isRecord(transform)) { errors.push(`${at}.layerTransforms.${layerId} must be an object`); continue }
      for (const field of ['x', 'y', 'scale', 'rotation', 'widthScale', 'heightScale']) {
        if (transform[field] !== undefined && !finite(transform[field])) {
          errors.push(`${at}.layerTransforms.${layerId}.${field} must be a finite number`)
        }
      }
      if (finite(transform.scale) && transform.scale <= 0) errors.push(`${at}.layerTransforms.${layerId}.scale must be greater than zero`)
      for (const field of ['flipX', 'flipY']) {
        if (transform[field] !== undefined && typeof transform[field] !== 'boolean') {
          errors.push(`${at}.layerTransforms.${layerId}.${field} must be a boolean`)
        }
      }
    }
  })
}
/**
 * @param {unknown} value
 * @param {string} path
 */
const backgroundFill = (value, path) => {
  if (value === undefined) return
  if (!isRecord(value)) { errors.push(`${path} must be an object`); return }
  if (value.kind !== undefined && !isOneOf(BACKGROUND_FILL_KINDS, value.kind)) {
    errors.push(`${path}.kind must be one of: ${BACKGROUND_FILL_KINDS.join(', ')}`)
    return
  }
  if (value.blend !== undefined && !isOneOf(BACKGROUND_BLENDS, value.blend)) errors.push(`${path}.blend must be one of: ${BACKGROUND_BLENDS.join(', ')}`)
  if (value.color !== undefined && !hexColor(value.color)) errors.push(`${path}.color must be a #rrggbb value`)
  if (value.gradient === undefined) return
  if (!isRecord(value.gradient)) { errors.push(`${path}.gradient must be an object`); return }
  if (value.gradient.angle !== undefined && !finite(value.gradient.angle)) errors.push(`${path}.gradient.angle must be a finite number`)
  if (value.gradient.stops === undefined) return
  if (!isList(value.gradient.stops)) errors.push(`${path}.gradient.stops must be an array`)
  else value.gradient.stops.forEach((stop, index) => {
    if (!hexColor(stop)) errors.push(`${path}.gradient.stops[${index}] must be a #rrggbb value`)
  })
}

/**
 * @param {unknown} value
 * @param {string} path
 */
const focalPoint = (value, path) => {
  if (value === undefined) return
  if (!isRecord(value)) { errors.push(`${path} must be an object`); return }
  for (const axis of ['x', 'y']) {
    if (value[axis] !== undefined && !(finite(value[axis]) && value[axis] >= 0 && value[axis] <= 1)) {
      errors.push(`${path}.${axis} must be a number between 0 and 1`)
    }
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Set<unknown>}
 */
const ids = (value, label) => {
  if (!isList(value)) { errors.push(`${label} must be an array`); return new Set() }
  /**
   * `Set<unknown>`, not `Set<string>`: the set answers "did the document already
   * use this id", and the thing it is asked about is a raw field of the
   * document, which may be a number or an object. `Set<string>.has` would refuse
   * to be asked — and the refusal would have to be cast away at every call site,
   * because a wrong-typed id has to produce the error below rather than a crash.
   * Only non-empty strings are ever added, which `nonEmpty` above guarantees.
   *
   * @type {Set<unknown>}
   */
  const result = new Set()
  value.forEach((item, index) => {
    if (!isRecord(item) || !nonEmpty(item.id)) { errors.push(`${label}[${index}].id must be a non-empty string`); return }
    if (result.has(item.id)) errors.push(`${label}[${index}].id is duplicated: ${item.id}`)
    result.add(item.id)
  })
  return result
}

/**
 * @param {unknown} value
 * @param {string} path
 */
const frame = (value, path) => {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y) || !finite(value.width) || !finite(value.height) || value.width <= 0 || value.height <= 0) errors.push(`${path} must have finite x/y and positive width/height`)
}

/**
 * The parsed document, typed as an object so the `document?.field` reads below
 * are reads rather than type errors.
 *
 * `JSON.parse` is declared as returning `any`, and the honest annotation for an
 * untrusted parse is `unknown` — but `unknown?.field` is not readable at all,
 * because optional chaining on `unknown` yields `{}`. So the object shape is
 * asserted here and the trust is *not*: nothing below reads a field without
 * putting it through `isRecord`, `isList`, `isOneOf`, `nonEmpty`, `finite` or
 * `hexColor` first, which is why every field's type is `unknown`. The one error
 * that says the document is not an object is reported without returning, so a
 * broken file yields every problem it has instead of only the first — which is
 * the point of a validator — and a non-object parse cannot make `document?.x`
 * throw, because a primitive's missing property is `undefined`, not a TypeError.
 *
 * @type {Record<string, unknown> | undefined}
 */
let document
try {
  document = JSON.parse(await readFile(file, 'utf8'))
} catch (error) {
  console.error(`Project validation failed: ${file}\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

if (!isRecord(document)) errors.push('$ must be an object')
if (document?.version !== 1) errors.push('$.version must be 1')
if (!isRecord(document?.project) || !nonEmpty(document.project.id) || typeof document.project.name !== 'string' || !nonEmpty(document.project.defaultLocale)) errors.push('$.project is missing required fields')
if (!isList(document?.canvases) || !isList(document?.slides) || !isList(document?.exportProfiles)) errors.push('$.canvases, $.slides, and $.exportProfiles are required arrays')

const canvasIds = ids(document?.canvases, '$.canvases')
const slideIds = ids(document?.slides, '$.slides')
const assetIds = ids(document?.assets, '$.assets')
const variantIds = ids(document?.outputVariants, '$.outputVariants')
const profileIds = ids(document?.exportProfiles, '$.exportProfiles')

if (isList(document?.canvases)) document.canvases.forEach((canvas, index) => {
  if (!isRecord(canvas)) return
  if (!nonEmpty(canvas.name) || !isOneOf(['connected', 'isolated'], canvas.mode)) errors.push(`$.canvases[${index}] has an invalid name or mode`)
  if (!isList(canvas.slideIds)) errors.push(`$.canvases[${index}].slideIds must be an array`)
  else canvas.slideIds.forEach((id) => { if (!slideIds.has(id)) errors.push(`$.canvases[${index}] references missing slide ${id}`) })
})
if (isList(document?.slides)) document.slides.forEach((slide, index) => {
  if (!isRecord(slide)) return
  if (!nonEmpty(slide.canvasId) || !canvasIds.has(slide.canvasId)) errors.push(`$.slides[${index}].canvasId references a missing canvas`)
  if (!nonEmpty(slide.name) || !nonEmpty(slide.layoutId) || !nonEmpty(slide.themeId)) errors.push(`$.slides[${index}] is missing name, layoutId, or themeId`)
  if (slide.deviceFrameId !== undefined && !isOneOf(DEVICE_FRAME_IDS, slide.deviceFrameId)) errors.push(`$.slides[${index}].deviceFrameId is unsupported`)
  if (slide.showDeviceStatusBar !== undefined && typeof slide.showDeviceStatusBar !== 'boolean') errors.push(`$.slides[${index}].showDeviceStatusBar must be a boolean`)
  backgroundFill(slide.backgroundFill, `$.slides[${index}].backgroundFill`)
  frame(slide.frame, `$.slides[${index}].frame`)
  if (!isList(slide.layers)) { errors.push(`$.slides[${index}].layers must be an array`); return }
  /**
   * @type {Set<unknown>}
   */
  const layerIds = new Set()
  // `shape` is the one narrowing for the whole walk, and it is the same test the
  // three `isRecord(layer)` guards below used to repeat: a layer that is not an
  // object answers `undefined` to every read here, because a primitive's missing
  // property is `undefined` rather than a TypeError. Spelling that once is what
  // lets `layer` stay the `unknown` it is, out of an untrusted document. The
  // opacity test is rewritten as the range test `focalPoint` below already uses
  // because `!finite(x) || x < 0 || x > 1` compares before it has proved `x` is
  // a number; the two forms accept and reject exactly the same values.
  slide.layers.forEach((layer, layerIndex) => {
    const path = `$.slides[${index}].layers[${layerIndex}]`
    const shape = isRecord(layer) ? layer : undefined
    if (!shape || !nonEmpty(shape.id)) errors.push(`${path}.id must be a non-empty string`)
    if (shape && layerIds.has(shape.id)) errors.push(`${path}.id is duplicated`)
    if (shape) layerIds.add(shape.id)
    frame(shape?.frame, `${path}.frame`)
    if (shape?.opacity !== undefined && !(finite(shape.opacity) && shape.opacity >= 0 && shape.opacity <= 1)) errors.push(`${path}.opacity is invalid`)
    if (shape?.visible !== undefined && typeof shape.visible !== 'boolean') errors.push(`${path}.visible is invalid`)
    if (shape?.assetId !== undefined && !assetIds.has(shape.assetId)) errors.push(`${path}.assetId references a missing asset`)
    focalPoint(shape?.focalPoint, `${path}.focalPoint`)
  })
})
if (isList(document?.exportProfiles)) document.exportProfiles.forEach((profile, index) => {
  if (!isRecord(profile) || !nonEmpty(profile.id) || !nonEmpty(profile.name) || profile.format !== 'png' || !isList(profile.sizes) || !isList(profile.variantIds)) errors.push(`$.exportProfiles[${index}] is invalid`)
  else profile.variantIds.forEach((id) => { if (!variantIds.has(id)) errors.push(`$.exportProfiles[${index}].variantIds references missing variant ${id}`) })
})
if (isList(document?.outputVariants)) document.outputVariants.forEach((variant, index) => {
  if (!isRecord(variant) || !canvasIds.has(variant.canvasId)) errors.push(`$.outputVariants[${index}].canvasId is invalid`)
  if (isRecord(variant) && isList(variant.slideIds)) variant.slideIds.forEach((id) => { if (!slideIds.has(id)) errors.push(`$.outputVariants[${index}] references missing slide ${id}`) })
  if (isRecord(variant)) deviceOverrides(variant.deviceOverrides, `$.outputVariants[${index}].deviceOverrides`)
})
if (isList(document?.assets)) document.assets.forEach((asset, index) => {
  if (!isRecord(asset) || !nonEmpty(asset.id) || !nonEmpty(asset.path) || !nonEmpty(asset.mimeType)) errors.push(`$.assets[${index}] is missing required fields`)
  else for (const axis of ['width', 'height']) {
    if (asset[axis] !== undefined && !(finite(asset[axis]) && asset[axis] > 0)) errors.push(`$.assets[${index}].${axis} must be a positive number`)
  }
})

if (errors.length > 0) {
  console.error(`Project validation failed: ${file}`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}
console.log(`Project validated: ${file} (${slideIds.size} slide${slideIds.size === 1 ? '' : 's'}, ${profileIds.size} export profile${profileIds.size === 1 ? '' : 's'})`)
