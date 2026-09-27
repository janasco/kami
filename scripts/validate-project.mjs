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
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const hexColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
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
const deviceOverrides = (value, path) => {
  if (value === undefined) return
  if (!Array.isArray(value)) { errors.push(`${path} must be an array`); return }
  value.forEach((override, index) => {
    const at = `${path}[${index}]`
    if (!isRecord(override)) { errors.push(`${at} must be an object`); return }
    if (!nonEmpty(override.slideId)) errors.push(`${at}.slideId must be a non-empty string`)
    if (override.deviceFrameId !== undefined && !DEVICE_FRAME_IDS.includes(override.deviceFrameId)) {
      errors.push(`${at}.deviceFrameId is unsupported`)
    }
    if (override.showDeviceStatusBar !== undefined && typeof override.showDeviceStatusBar !== 'boolean') {
      errors.push(`${at}.showDeviceStatusBar must be a boolean`)
    }
    if (override.screenshotFit !== undefined && !SCREENSHOT_FITS.includes(override.screenshotFit)) {
      errors.push(`${at}.screenshotFit must be one of: ${SCREENSHOT_FITS.join(', ')}`)
    }
    if (override.assetId !== undefined && !assetIds.has(override.assetId)) {
      errors.push(`${at}.assetId references a missing asset ${override.assetId}`)
    }
    if (override.layerTransforms === undefined) return
    if (!isRecord(override.layerTransforms)) { errors.push(`${at}.layerTransforms must be an object`); return }
    for (const [layerId, transform] of Object.entries(override.layerTransforms)) {
      if (!VARIANT_LAYER_IDS.includes(layerId)) {
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
const backgroundFill = (value, path) => {
  if (value === undefined) return
  if (!isRecord(value)) { errors.push(`${path} must be an object`); return }
  if (value.kind !== undefined && !BACKGROUND_FILL_KINDS.includes(value.kind)) {
    errors.push(`${path}.kind must be one of: ${BACKGROUND_FILL_KINDS.join(', ')}`)
    return
  }
  if (value.blend !== undefined && !BACKGROUND_BLENDS.includes(value.blend)) errors.push(`${path}.blend must be one of: ${BACKGROUND_BLENDS.join(', ')}`)
  if (value.color !== undefined && !hexColor(value.color)) errors.push(`${path}.color must be a #rrggbb value`)
  if (value.gradient === undefined) return
  if (!isRecord(value.gradient)) { errors.push(`${path}.gradient must be an object`); return }
  if (value.gradient.angle !== undefined && !finite(value.gradient.angle)) errors.push(`${path}.gradient.angle must be a finite number`)
  if (value.gradient.stops === undefined) return
  if (!Array.isArray(value.gradient.stops)) errors.push(`${path}.gradient.stops must be an array`)
  else value.gradient.stops.forEach((stop, index) => {
    if (!hexColor(stop)) errors.push(`${path}.gradient.stops[${index}] must be a #rrggbb value`)
  })
}
const focalPoint = (value, path) => {
  if (value === undefined) return
  if (!isRecord(value)) { errors.push(`${path} must be an object`); return }
  for (const axis of ['x', 'y']) {
    if (value[axis] !== undefined && !(finite(value[axis]) && value[axis] >= 0 && value[axis] <= 1)) {
      errors.push(`${path}.${axis} must be a number between 0 and 1`)
    }
  }
}
const ids = (value, label) => {
  if (!Array.isArray(value)) { errors.push(`${label} must be an array`); return new Set() }
  const result = new Set()
  value.forEach((item, index) => {
    if (!isRecord(item) || !nonEmpty(item.id)) { errors.push(`${label}[${index}].id must be a non-empty string`); return }
    if (result.has(item.id)) errors.push(`${label}[${index}].id is duplicated: ${item.id}`)
    result.add(item.id)
  })
  return result
}
const frame = (value, path) => {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y) || !finite(value.width) || !finite(value.height) || value.width <= 0 || value.height <= 0) errors.push(`${path} must have finite x/y and positive width/height`)
}

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
if (!Array.isArray(document?.canvases) || !Array.isArray(document?.slides) || !Array.isArray(document?.exportProfiles)) errors.push('$.canvases, $.slides, and $.exportProfiles are required arrays')

const canvasIds = ids(document?.canvases, '$.canvases')
const slideIds = ids(document?.slides, '$.slides')
const assetIds = ids(document?.assets, '$.assets')
const variantIds = ids(document?.outputVariants, '$.outputVariants')
const profileIds = ids(document?.exportProfiles, '$.exportProfiles')

if (Array.isArray(document?.canvases)) document.canvases.forEach((canvas, index) => {
  if (!isRecord(canvas)) return
  if (!nonEmpty(canvas.name) || !['connected', 'isolated'].includes(canvas.mode)) errors.push(`$.canvases[${index}] has an invalid name or mode`)
  if (!Array.isArray(canvas.slideIds)) errors.push(`$.canvases[${index}].slideIds must be an array`)
  else canvas.slideIds.forEach((id) => { if (!slideIds.has(id)) errors.push(`$.canvases[${index}] references missing slide ${id}`) })
})
if (Array.isArray(document?.slides)) document.slides.forEach((slide, index) => {
  if (!isRecord(slide)) return
  if (!nonEmpty(slide.canvasId) || !canvasIds.has(slide.canvasId)) errors.push(`$.slides[${index}].canvasId references a missing canvas`)
  if (!nonEmpty(slide.name) || !nonEmpty(slide.layoutId) || !nonEmpty(slide.themeId)) errors.push(`$.slides[${index}] is missing name, layoutId, or themeId`)
  if (slide.deviceFrameId !== undefined && !DEVICE_FRAME_IDS.includes(slide.deviceFrameId)) errors.push(`$.slides[${index}].deviceFrameId is unsupported`)
  if (slide.showDeviceStatusBar !== undefined && typeof slide.showDeviceStatusBar !== 'boolean') errors.push(`$.slides[${index}].showDeviceStatusBar must be a boolean`)
  backgroundFill(slide.backgroundFill, `$.slides[${index}].backgroundFill`)
  frame(slide.frame, `$.slides[${index}].frame`)
  if (!Array.isArray(slide.layers)) { errors.push(`$.slides[${index}].layers must be an array`); return }
  const layerIds = new Set()
  slide.layers.forEach((layer, layerIndex) => {
    const path = `$.slides[${index}].layers[${layerIndex}]`
    if (!isRecord(layer) || !nonEmpty(layer.id)) errors.push(`${path}.id must be a non-empty string`)
    if (isRecord(layer) && layerIds.has(layer.id)) errors.push(`${path}.id is duplicated`)
    if (isRecord(layer)) layerIds.add(layer.id)
    frame(layer?.frame, `${path}.frame`)
    if (layer?.opacity !== undefined && (!finite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) errors.push(`${path}.opacity is invalid`)
    if (layer?.visible !== undefined && typeof layer.visible !== 'boolean') errors.push(`${path}.visible is invalid`)
    if (layer?.assetId !== undefined && !assetIds.has(layer.assetId)) errors.push(`${path}.assetId references a missing asset`)
    focalPoint(layer?.focalPoint, `${path}.focalPoint`)
  })
})
if (Array.isArray(document?.exportProfiles)) document.exportProfiles.forEach((profile, index) => {
  if (!isRecord(profile) || !nonEmpty(profile.id) || !nonEmpty(profile.name) || profile.format !== 'png' || !Array.isArray(profile.sizes) || !Array.isArray(profile.variantIds)) errors.push(`$.exportProfiles[${index}] is invalid`)
  else profile.variantIds.forEach((id) => { if (!variantIds.has(id)) errors.push(`$.exportProfiles[${index}].variantIds references missing variant ${id}`) })
})
if (Array.isArray(document?.outputVariants)) document.outputVariants.forEach((variant, index) => {
  if (!isRecord(variant) || !canvasIds.has(variant.canvasId)) errors.push(`$.outputVariants[${index}].canvasId is invalid`)
  if (isRecord(variant) && Array.isArray(variant.slideIds)) variant.slideIds.forEach((id) => { if (!slideIds.has(id)) errors.push(`$.outputVariants[${index}] references missing slide ${id}`) })
  if (isRecord(variant)) deviceOverrides(variant.deviceOverrides, `$.outputVariants[${index}].deviceOverrides`)
})
if (Array.isArray(document?.assets)) document.assets.forEach((asset, index) => {
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
