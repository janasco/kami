/**
 * The background fill model, as pure functions.
 *
 * Everything the editor preview, the connected strip, and the export stage need
 * in order to agree on what the back of a slide looks like is decided here and
 * nowhere else. The renderer applies the result as CSS custom properties and the
 * stylesheet consumes them, so a fill can never be a JSX branch in one place and
 * a stylesheet rule in another — the failure mode that would let a preview lie
 * about an export.
 *
 * The design decisions encoded below are load-bearing:
 *
 * - `image` and `panoramic` mean the existing `background-image` layer *is* the
 *   fill; `theme`, `solid`, and `gradient` mean that layer is off. One record,
 *   one dropdown, and no way for "the layer is on" and "the fill is a gradient"
 *   to disagree.
 * - An image fill still resolves to the theme paint underneath, so a missing or
 *   failed image degrades to the theme rather than to a hole.
 * - The focal point is normalized, because one slide exports at six profile
 *   sizes and a pixel focal point drifts on every one of them.
 */

import {
  backgroundBlendOptions,
  backgroundFillOptions,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BACKGROUND_FILL,
  DEFAULT_BACKGROUND_GRADIENT,
  getTheme,
} from '../data'
import type { BackgroundBlend, BackgroundFill, BackgroundFillKind, BackgroundGradient, FocalPoint, ThemeId } from '../types'

/** Angle of the theme gradient, reused so a gradient fill matches the theme. */
const THEME_PAINT_ANGLE = DEFAULT_BACKGROUND_GRADIENT.angle

/**
 * How far a panoramic fill bleeds past the frame at full strength.
 *
 * Six percent is small enough to be invisible as a zoom and large enough that
 * the crop never lands on a hard image edge.
 */
export const PANORAMIC_MAX_BLEED = 0.06

/**
 * How much wider than the frame the image has to be before the bleed reaches its
 * full strength. At `1` an image twice as wide as the frame is fully bled.
 */
const PANORAMIC_BLEED_SPAN = 1

const HEX_COLOR = /^#[0-9a-f]{6}$/i

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** Rounds to four decimals so a CSS variable never carries float noise. */
const round4 = (value: number) => Math.round(value * 10000) / 10000

/** Rounds to two decimals and trims, for the percentages a focal point shows. */
const percentNumber = (value: number) => String(Math.round(value * 100) / 100)

/** Type guard for a stored or untrusted fill kind. */
export const isBackgroundFillKind = (value: unknown): value is BackgroundFillKind =>
  typeof value === 'string' && backgroundFillOptions.some((option) => option.id === value)

/** The kind a fill resolves to, tolerating a loose spelling in a hand-edited file. */
const resolveKind = (value: unknown): BackgroundFillKind => {
  if (isBackgroundFillKind(value)) return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (isBackgroundFillKind(normalized)) return normalized
  }
  return DEFAULT_BACKGROUND_FILL
}

/** True when the kind paints the back with the background image layer. */
export const usesBackgroundImageLayer = (value: unknown): boolean => {
  const kind = resolveKind(value)
  return kind === 'image' || kind === 'panoramic'
}

/** Resolves a blend mode, treating anything unrecognised as no blending. */
export const resolveBackgroundBlend = (value: unknown): BackgroundBlend =>
  typeof value === 'string'
    && backgroundBlendOptions.some((option) => option.id === value)
    ? value as BackgroundBlend
    : 'normal'

const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX_COLOR.test(value)

/**
 * Reads a colour, falling back to the default rather than rejecting the fill.
 *
 * A malformed colour is a warning, not an error: the slide still opens and the
 * author sees a sensible colour instead of a lost background.
 */
export const resolveBackgroundColor = (value: unknown, fallback = DEFAULT_BACKGROUND_COLOR): string =>
  isHexColor(value) ? value : fallback

/**
 * Repairs a gradient rather than rejecting it.
 *
 * A non-finite angle falls back to the theme angle, and a stop that is not
 * `#rrggbb` is replaced in place by the matching default. Repairing in place
 * keeps the author's stop count, so a single typo cannot silently flatten a
 * gradient to a solid colour.
 */
export const resolveBackgroundGradient = (value: unknown): BackgroundGradient => {
  const source = isRecord(value) ? value : {}
  const angle = finite(source.angle)
  const stops = Array.isArray(source.stops) && source.stops.length > 0 ? source.stops : []
  return {
    angle: angle === null ? DEFAULT_BACKGROUND_GRADIENT.angle : angle,
    stops: stops.length > 0
      ? stops.map((stop, index) => (isHexColor(stop)
        ? stop
        : DEFAULT_BACKGROUND_GRADIENT.stops[Math.min(index, DEFAULT_BACKGROUND_GRADIENT.stops.length - 1)]))
      : [...DEFAULT_BACKGROUND_GRADIENT.stops],
  }
}

/** The CSS gradient a gradient fill paints with. */
export const formatBackgroundGradient = (gradient: BackgroundGradient): string => {
  const angle = finite(gradient.angle) ?? DEFAULT_BACKGROUND_GRADIENT.angle
  const stops = (Array.isArray(gradient.stops) ? gradient.stops : []).filter(isHexColor)
  const list = stops.length > 0 ? stops : [...DEFAULT_BACKGROUND_GRADIENT.stops]
  return `linear-gradient(${angle}deg, ${list.join(', ')})`
}

/**
 * Reads the kind out of a fill, which may be the record or the bare kind.
 *
 * Both shapes are accepted so every reader in the editor and the tests can ask
 * the same question of the same value. Strictness is not this function's job:
 * validation is what rejects a malformed document, and it checks the record
 * shape directly.
 */
const kindOf = (value: unknown): BackgroundFillKind => resolveKind(
  isRecord(value) ? value.kind : value,
)

/**
 * Normalizes a stored fill.
 *
 * Fields that do not apply to the resolved kind are dropped, so a record is
 * always minimal: a theme fill is exactly `{ kind: 'theme' }`, a plain blend is
 * absent, and the document never carries a colour nobody is painting.
 */
export const resolveBackgroundFill = (value: unknown): BackgroundFill => {
  const source = isRecord(value) ? value : {}
  const kind = kindOf(value)
  const fill: BackgroundFill = { kind }

  if (kind === 'solid') fill.color = resolveBackgroundColor(source.color)
  if (kind === 'gradient') fill.gradient = resolveBackgroundGradient(source.gradient)

  if (usesBackgroundImageLayer(kind)) {
    const blend = resolveBackgroundBlend(source.blend)
    // `normal` is the absence of blending, so it is left out of the document.
    if (blend !== 'normal') fill.blend = blend
  }

  return fill
}

/**
 * Clamps a focal point into the unit square.
 *
 * Both axes are physical, so the same numbers work in a right-to-left export.
 * A missing or unusable value lands dead centre, which is the CSS default and
 * the value a document leaves out.
 */
export const clampFocalPoint = (value: unknown): FocalPoint => {
  if (!isRecord(value)) return { x: 0.5, y: 0.5 }
  const x = finite(value.x)
  const y = finite(value.y)
  return {
    x: x === null ? 0.5 : clamp01(x),
    y: y === null ? 0.5 : clamp01(y),
  }
}

/** True when the focal point is the centre, so a document does not record it. */
export const isDefaultFocalPoint = (value: FocalPoint): boolean => value.x === 0.5 && value.y === 0.5

/**
 * Formats a focal point as the `object-position` the stylesheet consumes.
 *
 * Percentages, not logical units: a percentage position is direction-agnostic,
 * so an `ar-SA` canvas frames the artwork exactly as the `en-US` one does.
 */
export const formatFocalPoint = (value: unknown): string => {
  const point = clampFocalPoint(value)
  return `${percentNumber(point.x * 100)}% ${percentNumber(point.y * 100)}%`
}

/** Human-readable summary of a fill, used by the control's hint line. */
export const describeBackgroundFill = (value: unknown): string => {
  const kind = kindOf(value)
  return backgroundFillOptions.find((option) => option.id === kind)?.description ?? ''
}

/**
 * The paint a theme slide draws.
 *
 * Kept here rather than in the stylesheet so the renderer can resolve it in
 * JavaScript and hand it back as a variable: an image fill needs the same paint
 * as its degradation target, and preview and export must agree on it.
 */
export const getThemePaint = (themeId: unknown): string => {
  const theme = getTheme(themeId)
  return `linear-gradient(${THEME_PAINT_ANGLE}deg, ${theme.background ?? theme.colors[0]}, ${theme.colors[1]})`
}

/**
 * Reads an intrinsic size hint, or null when it is absent or unusable.
 *
 * Strictly a hint. A hand-edited document can claim any size it likes, so a
 * partial, non-numeric, or non-positive pair is treated as no hint at all
 * rather than as a crop computed from a number nobody measured.
 */
export const resolveIntrinsicSize = (value: unknown): { width: number; height: number } | null => {
  if (!isRecord(value)) return null
  const width = finite(value.width)
  const height = finite(value.height)
  if (width === null || height === null || width <= 0 || height <= 0) return null
  return { width, height }
}

/** The width-over-height ratio of a size hint, or null when there is none. */
export const resolveIntrinsicAspect = (value: unknown): number | null => {
  const size = resolveIntrinsicSize(value)
  return size ? size.width / size.height : null
}

/**
 * The single source of truth for the panoramic overscan factor.
 *
 * `image` and every other kind stay at 1, which is plain `cover`. A panoramic
 * fill bleeds by up to {@link PANORAMIC_MAX_BLEED}, tapering from nothing at an
 * image exactly as wide as the frame to the full bleed at twice that width — a
 * wider panorama is already cropping hard, so it is the one that needs the
 * extra room. An unknown intrinsic size returns 1, so a document with no hint
 * renders as a plain cover rather than at a guessed scale.
 *
 * Both the preview and the export call this, so they cannot disagree about how
 * far a panoramic image bleeds.
 */
export const resolveBackgroundScale = (
  kind: unknown,
  imageAspectRatio: unknown,
  profileAspectRatio: unknown,
): number => {
  if (resolveKind(kind) !== 'panoramic') return 1
  const image = finite(imageAspectRatio)
  const frame = finite(profileAspectRatio)
  if (image === null || frame === null || image <= 0 || frame <= 0) return 1

  const overscan = image / frame - 1
  if (overscan <= 0) return 1
  return round4(1 + PANORAMIC_MAX_BLEED * Math.min(1, overscan / PANORAMIC_BLEED_SPAN))
}

export interface BackgroundFillStyleOptions {
  /** The stored fill, if the slide has one. Absent resolves to the theme. */
  fill?: BackgroundFill | null
  /** The stored focal point for the background image layer. */
  focalPoint?: FocalPoint | null
  /** The slide theme, used for the theme paint and the image degradation. */
  themeId: ThemeId
  /** Intrinsic size of the background asset, as a hint. */
  intrinsicSize?: { width?: number; height?: number } | null
  /** Width over height of the profile the canvas is being drawn at. */
  profileAspectRatio: number
}

/**
 * The CSS custom properties the canvas and its stylesheet read.
 *
 * The full set is always published, never partly, so the stylesheet never has
 * to guess a value and a missing variable can never mean a different colour in
 * preview than in export. `--background-scale` is `1` outside `panoramic`.
 */
export const getBackgroundFillStyle = ({
  fill,
  focalPoint,
  themeId,
  intrinsicSize,
  profileAspectRatio,
}: BackgroundFillStyleOptions): Record<string, string> => {
  const resolved = resolveBackgroundFill(fill)
  const themePaint = getThemePaint(themeId)
  const color = resolved.kind === 'solid' && isHexColor(resolved.color) ? resolved.color : DEFAULT_BACKGROUND_COLOR
  const gradient = formatBackgroundGradient(resolveBackgroundGradient(resolved.gradient))
  const paint = resolved.kind === 'solid' ? color : resolved.kind === 'gradient' ? gradient : themePaint

  return {
    '--background-fill': resolved.kind,
    '--background-solid': color,
    '--background-gradient': gradient,
    // An image fill keeps the theme paint underneath, so a missing or failed
    // image degrades to the theme instead of exporting a hole.
    '--background-paint': paint,
    '--background-position': formatFocalPoint(focalPoint),
    '--background-scale': String(resolveBackgroundScale(
      resolved.kind,
      resolveIntrinsicAspect(intrinsicSize),
      profileAspectRatio,
    )),
    '--background-blend': resolveBackgroundBlend(resolved.blend),
  }
}
