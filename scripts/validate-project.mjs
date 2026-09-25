#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const file = resolve(process.cwd(), 'screenshot-studio.json')
const errors = []
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
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
  if (slide.deviceFrameId !== undefined && !['iphone', 'android', 'none'].includes(slide.deviceFrameId)) errors.push(`$.slides[${index}].deviceFrameId is unsupported`)
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
  })
})
if (Array.isArray(document?.exportProfiles)) document.exportProfiles.forEach((profile, index) => {
  if (!isRecord(profile) || !nonEmpty(profile.id) || !nonEmpty(profile.name) || profile.format !== 'png' || !Array.isArray(profile.sizes) || !Array.isArray(profile.variantIds)) errors.push(`$.exportProfiles[${index}] is invalid`)
  else profile.variantIds.forEach((id) => { if (!variantIds.has(id)) errors.push(`$.exportProfiles[${index}].variantIds references missing variant ${id}`) })
})
if (Array.isArray(document?.outputVariants)) document.outputVariants.forEach((variant, index) => {
  if (!isRecord(variant) || !canvasIds.has(variant.canvasId)) errors.push(`$.outputVariants[${index}].canvasId is invalid`)
  if (isRecord(variant) && Array.isArray(variant.slideIds)) variant.slideIds.forEach((id) => { if (!slideIds.has(id)) errors.push(`$.outputVariants[${index}] references missing slide ${id}`) })
})
if (Array.isArray(document?.assets)) document.assets.forEach((asset, index) => {
  if (!isRecord(asset) || !nonEmpty(asset.id) || !nonEmpty(asset.path) || !nonEmpty(asset.mimeType)) errors.push(`$.assets[${index}] is missing required fields`)
})

if (errors.length > 0) {
  console.error(`Project validation failed: ${file}`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}
console.log(`Project validated: ${file} (${slideIds.size} slide${slideIds.size === 1 ? '' : 's'}, ${profileIds.size} export profile${profileIds.size === 1 ? '' : 's'})`)
