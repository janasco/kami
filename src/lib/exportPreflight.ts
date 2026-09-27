import { exportProfiles, pendingExportProfiles, slideLayerLabels } from '../data'
import { enabledVariantsForProfile, expandVariantRenders } from './deviceVariants'
import { isDeviceFrameId, isKnownDeviceFrameId } from './devicePresets'
import { getSlideText } from './localization'
import type { ExportProfile, LayerId, LocaleId, OutputVariant, Slide } from '../types'

export type ExportPreflightStatus = 'ready' | 'warnings' | 'blocked'
export type ExportPreflightSeverity = 'warning' | 'blocking'

export type ExportPreflightIssueCode =
  | 'missing-screenshot'
  | 'missing-app-icon'
  | 'hidden-required-layer'
  | 'zero-opacity-required-layer'
  | 'missing-localized-copy'
  | 'unsupported-export-profile'
  | 'pending-export-profile'
  | 'dimension-warning'
  | 'orientation-warning'
  | 'bounds-outside-canvas'
  | 'invalid-image-data'
  /** An enabled variant renders a slide with no capture, and the profile needs one. */
  | 'missing-variant-capture'
  /** A variant override names a device frame this catalog does not have. */
  | 'unsupported-device-variant'

export interface ExportPreflightIssue {
  code: ExportPreflightIssueCode
  severity: ExportPreflightSeverity
  message: string
  /**
   * 1-based positions in the **authoring deck**, never in a variant.
   *
   * A variant names a subset of the slides, so a number that counted within the
   * variant would not index `slides` and every "open this slide" affordance would
   * point at the wrong slide. The variant is carried as a label beside these
   * numbers rather than as a second coordinate system; see
   * {@link formatPreflightIssueLocation}.
   */
  slideNumbers: number[]
  layerId?: LayerId
  profileId?: string
  /** Set when the issue belongs to one output variant rather than the deck. */
  variantId?: string
  variantName?: string
}

/**
 * Where an issue is, in one line: the deck position plus the variant name.
 *
 * The alternative was a second coordinate system, a variant-relative slide
 * number. That would have broken `slides[slideNumber - 1]`, which the Ship stage
 * uses to find the slide its "Open slide" button navigates to, and the button
 * disappears without warning on a miss. So the number keeps indexing the deck
 * and the variant is appended as a label.
 */
export const formatPreflightIssueLocation = (issue: Pick<ExportPreflightIssue, 'slideNumbers' | 'variantName'>): string => {
  const positions = issue.slideNumbers
  const deck = positions.length === 0
    ? 'Project'
    : positions.length === 1
      ? `Slide ${positions[0]}`
      : `Slides ${positions.join(', ')}`
  return issue.variantName ? `${deck} · ${issue.variantName}` : deck
}

export interface ExportPreflightResult {
  status: ExportPreflightStatus
  issues: ExportPreflightIssue[]
  blockingIssues: ExportPreflightIssue[]
  warningIssues: ExportPreflightIssue[]
  checkedSlides: number
  profileId: string
}

export interface PreflightRect {
  left: number
  top: number
  right: number
  bottom: number
}

export type PreflightLayerBounds = Partial<Record<LayerId, PreflightRect>>
export type PreflightLayerBoundsBySlide = Record<string, PreflightLayerBounds>

export interface ExportPreflightInput {
  profile: ExportProfile
  slides: Slide[]
  activeLocale: LocaleId
  layerBounds?: PreflightLayerBoundsBySlide
  /**
   * The deck's output variants, in document order.
   *
   * Optional and additive: a caller that knows nothing about variants gets
   * exactly the deck-wide result it got before the field existed. Only the
   * enabled variants targeting `profile` are inspected, so a deck of many
   * variants costs one pass per relevant one rather than a render of all of them.
   */
  variants?: readonly OutputVariant[]
}

const OUTSIDE_CANVAS_TOLERANCE_PX = 0.5

const addIssue = (
  issues: ExportPreflightIssue[],
  issue: Omit<ExportPreflightIssue, 'slideNumbers'> & { slideNumbers?: number[] },
) => {
  issues.push({ ...issue, slideNumbers: issue.slideNumbers ?? [] })
}

const uniqueSlideNumbers = (slideNumbers: number[]) => [...new Set(slideNumbers)].sort((a, b) => a - b)

const decodeBase64 = (payload: string): Uint8Array | null => {
  try {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

const hasBytes = (bytes: Uint8Array, values: number[], offset = 0) =>
  values.every((value, index) => bytes[offset + index] === value)

const matchesAscii = (bytes: Uint8Array, value: string, offset = 0) =>
  [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0))

const hasSupportedImageSignature = (mimeType: string, bytes: Uint8Array) => {
  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/jpeg':
    case 'image/jpg':
      return hasBytes(bytes, [0xff, 0xd8, 0xff])
    case 'image/webp':
      return matchesAscii(bytes, 'RIFF', 0)
        && bytes.length >= 12
        && matchesAscii(bytes, 'WEBP', 8)
    case 'image/gif':
      return matchesAscii(bytes, 'GIF87a') || matchesAscii(bytes, 'GIF89a')
    case 'image/avif':
      return matchesAscii(bytes, 'ftyp', 4)
    case 'image/svg+xml':
      try {
        const source = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '').trimStart()
        const svgStart = source.search(/<svg(?:\s|>)/i)
        return svgStart >= 0 && svgStart < 1024
      } catch {
        return false
      }
    default:
      return false
  }
}

export const isValidImageDataUrl = (value: string): boolean => {
  const match = value.match(/^data:([^;,]+)((?:;[^,]*)*),(.*)$/is)
  if (!match) return false

  const mimeType = match[1].trim().toLowerCase()
  if (!/^image\/[a-z0-9.+-]+$/.test(mimeType)) return false

  const parameters = match[2].toLowerCase().split(';').filter(Boolean)
  const payload = match[3].trim()
  if (!payload) return false

  if (parameters.includes('base64')) {
    if (!/^[a-z0-9+/]*={0,2}$/i.test(payload) || payload.length % 4 === 1) return false
    const bytes = decodeBase64(payload)
    return bytes !== null && bytes.length > 0 && hasSupportedImageSignature(mimeType, bytes)
  }

  try {
    const decoded = decodeURIComponent(payload).trim()
    return decoded.length > 0 && hasSupportedImageSignature(mimeType, new TextEncoder().encode(decoded))
  } catch {
    return false
  }
}

/**
 * Measures the drawn layers of each slide on the export stage.
 *
 * The export stage now lays out one node per *planned entry*, so the node at
 * index N is not necessarily `slides[N]`. `slideIds` states which slide each node
 * belongs to, and the caller passes the first enabled variant's renders: that is
 * one coherent device set, and for a deck with a single default variant it is
 * exactly the base deck, so the measured boxes are the ones they always were.
 */
export const collectExportPreflightBounds = (
  stage: HTMLElement,
  slides: Slide[],
  slideIds: readonly string[] = slides.map((slide) => slide.id),
): PreflightLayerBoundsBySlide => {
  const slideNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-export-slide]'))
  const byId = new Map(slides.map((slide) => [slide.id, slide]))
  const result: PreflightLayerBoundsBySlide = {}

  slideNodes.slice(0, slideIds.length).forEach((slideNode, index) => {
    const slide = byId.get(slideIds[index])
    const canvas = slideNode.querySelector<HTMLElement>('.slide-canvas')
    if (!slide || !canvas) return

    const canvasBounds = canvas.getBoundingClientRect()
    if (!Number.isFinite(canvasBounds.width) || !Number.isFinite(canvasBounds.height)) return

    const bounds: PreflightLayerBounds = {}
    const layerNodes = canvas.querySelectorAll<HTMLElement>('[data-layer-id]')
    layerNodes.forEach((layerNode) => {
      if (layerNode.hidden || !slide.layerSettings[layerNode.dataset.layerId as LayerId]?.visible) return
      const layerId = layerNode.dataset.layerId as LayerId
      if (!slide.layerTransforms[layerId]) return

      const rect = layerNode.getBoundingClientRect()
      if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) return
      bounds[layerId] = {
        left: rect.left - canvasBounds.left,
        top: rect.top - canvasBounds.top,
        right: rect.right - canvasBounds.left,
        bottom: rect.bottom - canvasBounds.top,
      }
    })
    result[slide.id] = bounds
  })

  return result
}

const imageDataIssue = (
  issues: ExportPreflightIssue[],
  slideNumber: number,
  layerId: LayerId,
  label: string,
  value: string,
) => {
  const isExternalImage = /^(?:https?:\/\/|blob:)/i.test(value)
  if (isExternalImage || isValidImageDataUrl(value)) return
  addIssue(issues, {
    code: 'invalid-image-data',
    severity: 'blocking',
    message: `${label} has an invalid image data URL.`,
    slideNumbers: [slideNumber],
    layerId,
  })
}

export function runExportPreflight({
  profile,
  slides,
  activeLocale,
  layerBounds = {},
  variants = [],
}: ExportPreflightInput): ExportPreflightResult {
  const issues: ExportPreflightIssue[] = []
  const supportedProfile = exportProfiles.find((candidate) => candidate.id === profile.id)
  const pendingProfile = pendingExportProfiles.find((candidate) => candidate.id === profile.id)
  const availability = profile.preflight?.availability

  if (!supportedProfile) {
    addIssue(issues, {
      code: availability === 'pending' || pendingProfile ? 'pending-export-profile' : 'unsupported-export-profile',
      severity: 'blocking',
      message: availability === 'pending' || pendingProfile
        ? 'The active export profile is pending renderer support.'
        : 'The active export profile is not supported by this renderer.',
      slideNumbers: [],
      profileId: profile.id,
    })
  } else if (availability === 'pending') {
    addIssue(issues, {
      code: 'pending-export-profile',
      severity: 'blocking',
      message: 'The active export profile is pending renderer support.',
      slideNumbers: [],
      profileId: profile.id,
    })
  }

  if (!supportedProfile || !Number.isInteger(profile.width) || !Number.isInteger(profile.height) || profile.width <= 0 || profile.height <= 0 || profile.format !== 'png') {
    if (supportedProfile) {
      addIssue(issues, {
        code: 'unsupported-export-profile',
        severity: 'blocking',
        message: 'The active profile must use positive integer PNG dimensions.',
        slideNumbers: [],
        profileId: profile.id,
      })
    }
  } else if (profile.width !== supportedProfile.width || profile.height !== supportedProfile.height) {
    addIssue(issues, {
      code: 'dimension-warning',
      severity: 'warning',
      message: `Profile dimensions are ${profile.width} × ${profile.height}; the built-in target is ${supportedProfile.width} × ${supportedProfile.height}.`,
      slideNumbers: [],
      profileId: profile.id,
    })
  }

  if (supportedProfile && ((profile.width > profile.height && profile.orientation !== 'landscape')
    || (profile.height > profile.width && profile.orientation !== 'portrait'))) {
    addIssue(issues, {
      code: 'orientation-warning',
      severity: 'warning',
      message: 'Profile orientation does not match its width and height.',
      slideNumbers: [],
      profileId: profile.id,
    })
  }

  const missingScreenshotsRequired: number[] = []
  const missingScreenshotsOptional: number[] = []
  const missingAppIcons: number[] = []
  const hiddenRequiredLayers = new Map<LayerId, number[]>()
  const zeroOpacityRequiredLayers = new Map<LayerId, number[]>()
  const missingLocalizedCopy = new Map<string, number[]>()

  slides.forEach((slide, index) => {
    const slideNumber = index + 1
    if (!slide.screenshot) {
      if (profile.preflight?.requirements.screenshot === false) missingScreenshotsOptional.push(slideNumber)
      else missingScreenshotsRequired.push(slideNumber)
    } else {
      imageDataIssue(issues, slideNumber, 'screenshot', 'Screenshot', slide.screenshot)
    }

    const appIconUnavailable = !slide.appIcon
      || !slide.layerSettings['app-icon'].visible
      || slide.layerSettings['app-icon'].opacity <= 0
    if (appIconUnavailable) missingAppIcons.push(slideNumber)
    else imageDataIssue(issues, slideNumber, 'app-icon', 'App icon', slide.appIcon!.dataUrl)

    if (slide.backgroundImage) {
      imageDataIssue(issues, slideNumber, 'background-image', 'Background image', slide.backgroundImage.dataUrl)
    }

    const requiredLayers: LayerId[] = ['headline']
    if (profile.preflight?.requirements.screenshot !== false) requiredLayers.push('screenshot')
    if (profile.preflight?.requirements.appIcon === true) requiredLayers.push('app-icon')
    requiredLayers.forEach((layerId) => {
      const settings = slide.layerSettings[layerId]
      if (!settings.visible) {
        const slideNumbers = hiddenRequiredLayers.get(layerId) ?? []
        slideNumbers.push(slideNumber)
        hiddenRequiredLayers.set(layerId, slideNumbers)
      }
      if (settings.opacity <= 0) {
        const slideNumbers = zeroOpacityRequiredLayers.get(layerId) ?? []
        slideNumbers.push(slideNumber)
        zeroOpacityRequiredLayers.set(layerId, slideNumbers)
      }
    })

    if (activeLocale !== 'en-US') {
      const text = getSlideText(slide, activeLocale)
      const missingFields = [
        ...(!text.isTitleTranslated ? ['headline'] : []),
        ...(slide.subtitle.length > 0 && !text.isSubtitleTranslated ? ['supporting text'] : []),
      ]
      if (missingFields.length > 0) {
        const key = `${activeLocale}:${missingFields.join(',')}`
        const slideNumbers = missingLocalizedCopy.get(key) ?? []
        slideNumbers.push(slideNumber)
        missingLocalizedCopy.set(key, slideNumbers)
      }
    }

    Object.entries(layerBounds[slide.id] ?? {}).forEach(([layerIdValue, rect]) => {
      const layerId = layerIdValue as LayerId
      if (!rect || !slideLayerLabels[layerId]) return
      const outside = rect.left < -OUTSIDE_CANVAS_TOLERANCE_PX
        || rect.top < -OUTSIDE_CANVAS_TOLERANCE_PX
        || rect.right > profile.width + OUTSIDE_CANVAS_TOLERANCE_PX
        || rect.bottom > profile.height + OUTSIDE_CANVAS_TOLERANCE_PX
      if (outside) {
        addIssue(issues, {
          code: 'bounds-outside-canvas',
          severity: 'warning',
          message: `${slideLayerLabels[layerId]} extends outside the export canvas.`,
          slideNumbers: [slideNumber],
          layerId,
        })
      }
    })
  })

  if (missingScreenshotsRequired.length > 0) {
    addIssue(issues, {
      code: 'missing-screenshot',
      severity: 'blocking',
      message: `Add a screenshot to ${missingScreenshotsRequired.length} slide${missingScreenshotsRequired.length === 1 ? '' : 's'}.`,
      slideNumbers: missingScreenshotsRequired,
      layerId: 'screenshot',
    })
  }

  if (missingScreenshotsOptional.length > 0) {
    addIssue(issues, {
      code: 'missing-screenshot',
      severity: 'warning',
      message: `The screenshot/device preview is optional and missing on ${missingScreenshotsOptional.length} slide${missingScreenshotsOptional.length === 1 ? '' : 's'}.`,
      slideNumbers: missingScreenshotsOptional,
      layerId: 'screenshot',
    })
  }

  if (missingAppIcons.length > 0) {
    const appIconRequired = profile.preflight?.requirements.appIcon === true
    const appIconStronglyEncouraged = profile.preflight?.requirements.appIconRecommendation === 'strongly-encouraged'
    addIssue(issues, {
      code: 'missing-app-icon',
      severity: appIconRequired ? 'blocking' : 'warning',
      message: appIconRequired
        ? `Add a visible app icon to ${missingAppIcons.length} profile-required slide${missingAppIcons.length === 1 ? '' : 's'}.`
        : appIconStronglyEncouraged
          ? `An app icon is strongly encouraged but missing or hidden on ${missingAppIcons.length} slide${missingAppIcons.length === 1 ? '' : 's'}.`
          : `App icon is optional but missing or hidden on ${missingAppIcons.length} slide${missingAppIcons.length === 1 ? '' : 's'}.`,
      slideNumbers: missingAppIcons,
      layerId: 'app-icon',
    })
  }

  hiddenRequiredLayers.forEach((slideNumbers, layerId) => {
    addIssue(issues, {
      code: 'hidden-required-layer',
      severity: 'blocking',
      message: `Required layer “${slideLayerLabels[layerId]}” is hidden.`,
      slideNumbers,
      layerId,
    })
  })

  zeroOpacityRequiredLayers.forEach((slideNumbers, layerId) => {
    addIssue(issues, {
      code: 'zero-opacity-required-layer',
      severity: 'blocking',
      message: `Required layer “${slideLayerLabels[layerId]}” has zero opacity.`,
      slideNumbers,
      layerId,
    })
  })

  missingLocalizedCopy.forEach((slideNumbers, key) => {
    const [locale, fields] = key.split(':')
    const localizedCopyRequired = profile.preflight?.requirements.localizedCopy === true
    addIssue(issues, {
      code: 'missing-localized-copy',
      severity: localizedCopyRequired ? 'blocking' : 'warning',
      message: localizedCopyRequired
        ? `Profile-required ${locale} localized ${fields?.replace(',', ' and ')} is missing.`
        : `${locale} localized ${fields?.replace(',', ' and ')} is missing; English fallback will be used.`,
      slideNumbers,
    })
  })

  /*
   * The variant dimension.
   *
   * Two things the deck-wide pass above cannot see, both of which would otherwise
   * reach the store as a finished-looking file:
   *
   * - a variant that renders a slide with no capture, which is a per-variant
   *   fact and not a deck one, and
   * - a variant naming a device frame this catalog does not have, which would
   *   otherwise be silently resolved to some other device.
   *
   * Both are blocking. The name comes from the variant, and the slide numbers
   * stay 1-based positions in the authoring deck.
   */
  for (const variant of enabledVariantsForProfile(variants, profile.id)) {
    const scope = { variantId: variant.id, variantName: variant.name }
    for (const render of expandVariantRenders(slides, variant)) {
      if (render.missingCapture && profile.preflight?.requirements.screenshot !== false) {
        addIssue(issues, {
          code: 'missing-variant-capture',
          severity: 'blocking',
          message: `The “${variant.name}” variant has no capture on slide ${render.slideNumber}.`,
          slideNumbers: [render.slideNumber],
          layerId: 'screenshot',
          ...scope,
        })
      }
      const override = render.override
      if (override?.deviceFrameId === undefined) continue
      // An older spelling is migratable, so it is not a blocker; a name nothing
      // can map is, because the renderer would have to guess a device.
      if (isDeviceFrameId(override.deviceFrameId) || isKnownDeviceFrameId(override.deviceFrameId)) continue
      addIssue(issues, {
        code: 'unsupported-device-variant',
        severity: 'blocking',
        message: `The “${variant.name}” variant asks for a device this editor does not have: ${String(override.deviceFrameId)}.`,
        slideNumbers: [render.slideNumber],
        ...scope,
      })
    }
  }

  const normalizedIssues = issues.map((entry) => ({ ...entry, slideNumbers: uniqueSlideNumbers(entry.slideNumbers) }))
  const blockingIssues = normalizedIssues.filter((entry) => entry.severity === 'blocking')
  const warningIssues = normalizedIssues.filter((entry) => entry.severity === 'warning')

  return {
    status: blockingIssues.length > 0 ? 'blocked' : warningIssues.length > 0 ? 'warnings' : 'ready',
    issues: normalizedIssues,
    blockingIssues,
    warningIssues,
    checkedSlides: slides.length,
    profileId: profile.id,
  }
}
