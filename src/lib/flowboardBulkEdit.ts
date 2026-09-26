/**
 * Bulk edit payloads for the Flowboard Frame and Story stages.
 *
 * A bulk action is a small, serializable description of one change ("set the
 * device frame to iPhone") rather than a `Partial<Slide>`. Keeping it a
 * description lets the stages build a control from the existing data catalogs,
 * lets the bar disable a choice the whole selection already holds, and lets
 * the editor apply it through `commitEditorUpdate` so undo, redo, and autosave
 * behave exactly like a single-slide edit.
 *
 * Only fields the project document already carries are touched, so no schema,
 * migration, or validation change is involved.
 */

import { getLayout, getTheme, sanitizeLayerOpacity, slideLayerLabels, screenshotFitOptions } from '../data'
import { isFramelessDeviceId } from './devicePresets'
import { describeDeviceFrame } from './flowboardStages'
import type { DeviceFrameId, LayerId, LayoutId, ScreenshotFit, Slide, ThemeId } from '../types'

/** The three compact groups the bulk action bar can show. */
export type BulkActionGroup = 'framing' | 'style' | 'layers'

export type BulkSlideAction =
  | { kind: 'device-frame'; deviceFrameId: DeviceFrameId }
  | { kind: 'screenshot-fit'; screenshotFit: ScreenshotFit }
  | { kind: 'device-status-bar'; visible: boolean }
  | { kind: 'layout'; layout: LayoutId }
  | { kind: 'theme'; theme: ThemeId }
  | { kind: 'layer-visibility'; layerId: LayerId; visible: boolean }
  | { kind: 'layer-opacity'; layerId: LayerId; opacity: number }

/** Select placeholder shown when a selection does not share one value. */
export const MIXED_BULK_VALUE = ''

const percentLabel = (opacity: number) => `${Math.round(opacity * 100)}%`

/** The scalar a bulk action writes, used for merge keys and copy. */
export const bulkActionValue = (action: BulkSlideAction): string => {
  switch (action.kind) {
    case 'device-frame': return action.deviceFrameId
    case 'screenshot-fit': return action.screenshotFit
    case 'device-status-bar': return action.visible ? 'on' : 'off'
    case 'layout': return action.layout
    case 'theme': return action.theme
    case 'layer-visibility': return `${action.layerId}:${action.visible ? 'visible' : 'hidden'}`
    case 'layer-opacity': return String(action.opacity)
  }
}

/** Human-readable description of what a bulk action does to one slide. */
export const describeBulkSlideAction = (action: BulkSlideAction): string => {
  switch (action.kind) {
    case 'device-frame':
      return `Device frame set to ${describeDeviceFrame(action.deviceFrameId)}`
    case 'screenshot-fit':
      return `Screenshot fit set to ${screenshotFitOptions.find((option) => option.id === action.screenshotFit)?.label ?? 'Contain'}`
    case 'device-status-bar':
      return action.visible ? 'Device status bar turned on' : 'Device status bar turned off'
    case 'layout':
      return `Layout set to ${getLayout(action.layout).name}`
    case 'theme':
      return `Theme set to ${getTheme(action.theme).name}`
    case 'layer-visibility':
      return `${action.visible ? 'Show' : 'Hide'} the ${slideLayerLabels[action.layerId].toLowerCase()} layer`
    case 'layer-opacity':
      return `${slideLayerLabels[action.layerId]} opacity set to ${percentLabel(action.opacity)}`
  }
}

/** Notice shown after a bulk action, phrased with the number of real changes. */
export const describeBulkSlideResult = (action: BulkSlideAction, changedCount: number): string => {
  const slides = `${changedCount} slide${changedCount === 1 ? '' : 's'}`
  return `${describeBulkSlideAction(action)} on ${slides}. Undo is available.`
}

/**
 * History merge key for a bulk edit.
 *
 * Discrete choices include their value, so flipping between two options always
 * records its own undo step. The opacity slider leaves the value out, matching
 * the existing per-slide slider, so a drag coalesces into one entry.
 */
export const bulkActionMergeKey = (action: BulkSlideAction, slideIds: readonly string[]): string => {
  const scope = `bulk:${slideIds.length}`
  if (action.kind === 'layer-opacity') return `${scope}:layer-opacity:${action.layerId}`
  return `${scope}:${action.kind}:${bulkActionValue(action)}`
}

/**
 * Applies one bulk action to a single slide.
 *
 * Returns the updated slide, or `null` when the slide already holds the
 * requested value so the caller can skip it and keep the object identity of
 * untouched slides stable.
 */
export const applyBulkSlideAction = (slide: Slide, action: BulkSlideAction): Slide | null => {
  switch (action.kind) {
    case 'device-frame':
      return slide.deviceFrameId === action.deviceFrameId ? null : { ...slide, deviceFrameId: action.deviceFrameId }
    case 'screenshot-fit':
      return slide.screenshotFit === action.screenshotFit ? null : { ...slide, screenshotFit: action.screenshotFit }
    case 'device-status-bar':
      return slide.showDeviceStatusBar === action.visible ? null : { ...slide, showDeviceStatusBar: action.visible }
    case 'layout':
      return slide.layout === action.layout ? null : { ...slide, layout: action.layout }
    case 'theme':
      return slide.theme === action.theme ? null : { ...slide, theme: action.theme }
    case 'layer-visibility': {
      const settings = slide.layerSettings[action.layerId]
      if (!settings || settings.visible === action.visible) return null
      return {
        ...slide,
        layerSettings: { ...slide.layerSettings, [action.layerId]: { ...settings, visible: action.visible } },
      }
    }
    case 'layer-opacity': {
      const settings = slide.layerSettings[action.layerId]
      if (!settings) return null
      const opacity = sanitizeLayerOpacity(action.opacity, settings.opacity)
      if (settings.opacity === opacity) return null
      return {
        ...slide,
        layerSettings: { ...slide.layerSettings, [action.layerId]: { ...settings, opacity } },
      }
    }
  }
}

/**
 * The value every item shares, or `null` when the selection is mixed. A null
 * result is what makes the bar show an honest "Mixed" placeholder instead of
 * pretending the active slide speaks for the whole selection.
 */
export const sharedValue = <TItem, TValue>(
  items: readonly TItem[],
  read: (item: TItem) => TValue,
): TValue | null => {
  if (items.length === 0) return null
  const first = read(items[0])
  return items.every((item) => Object.is(read(item), first)) ? first : null
}

/** Resolves the target slides for a selection, in deck order. */
export const resolveTargetSlides = (slides: readonly Slide[], targetIds: readonly string[]): Slide[] => {
  const targets = new Set(targetIds)
  return slides.filter((slide) => targets.has(slide.id))
}

/**
 * Warning shown when the selection mixes framed and frameless presets, because
 * the status chrome is not drawn on a frameless aperture no matter what the
 * stored flag says.
 */
export const describeFramelessTargets = (slides: readonly Slide[]): string | null => {
  const frameless = slides.filter((slide) => isFramelessDeviceId(slide.deviceFrameId)).length
  if (frameless === 0) return null
  return `${frameless} selected slide${frameless === 1 ? ' uses' : 's use'} a frameless preset, so no status chrome is drawn there.`
}
