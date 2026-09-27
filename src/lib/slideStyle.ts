/**
 * The rule behind "apply this style to all slides".
 *
 * The editor's one button that makes a whole deck look like one slide has to
 * answer two questions in the same place: which fields count as style, and
 * whether a slide already has it. Both used to live inline in a click handler,
 * which is the one place no test can reach, and a list that quietly falls behind
 * the slide model is exactly how "apply to all" ends up desynchronising the deck
 * it was meant to unify.
 *
 * So the field list lives here, next to the model it has to stay in step with,
 * and the handler only decides *when* to run it.
 */

import {
  clampFocalPoint,
  formatBackgroundGradient,
  formatFocalPoint,
  isDefaultFocalPoint,
  resolveBackgroundFill,
  resolveBackgroundGradient,
} from './backgroundFill'
import type { Slide } from '../types'

/** The slice of a slide "style" is, written out once. */
export type SlideStyle = Pick<
  Slide,
  | 'accentShapeStyle'
  | 'backgroundFocalPoint'
  | 'backgroundFill'
  | 'deviceFrameId'
  | 'layout'
  | 'screenshotFit'
  | 'showDeviceStatusBar'
  | 'theme'
>

/**
 * Whether two slides already read the same.
 *
 * The accent colour and the focal point are compared through their normalized
 * form, so `#0B1020` and `#0b1020` and a focal point stored as `0.5` do not
 * register as a difference and produce a no-op edit. The fill is compared by the
 * paint it produces rather than field by field, so a field added to the fill
 * later cannot be forgotten here.
 */
export const isSameSlideStyle = (slide: Slide, source: Slide): boolean => {
  const fill = resolveBackgroundFill(slide.backgroundFill)
  const sourceFill = resolveBackgroundFill(source.backgroundFill)
  return slide.layout === source.layout
    && slide.theme === source.theme
    && slide.deviceFrameId === source.deviceFrameId
    && slide.showDeviceStatusBar === source.showDeviceStatusBar
    && slide.screenshotFit === source.screenshotFit
    && slide.accentShapeStyle.type === source.accentShapeStyle.type
    && slide.accentShapeStyle.color.toLowerCase() === source.accentShapeStyle.color.toLowerCase()
    && formatBackgroundGradient(resolveBackgroundGradient(fill.gradient))
      === formatBackgroundGradient(resolveBackgroundGradient(sourceFill.gradient))
    && fill.kind === sourceFill.kind
    && fill.blend === sourceFill.blend
    && formatFocalPoint(slide.backgroundFocalPoint) === formatFocalPoint(clampFocalPoint(source.backgroundFocalPoint))
}

/**
 * The style copied from one slide onto another.
 *
 * The optional records are copied rather than shared, so a later edit to one
 * slide's fill can never reach back into the others, and the values that mean
 * "unset" are written as absent rather than as a theme record nobody chose.
 */
export const slideStyleOf = (source: Slide): SlideStyle => {
  const fill = resolveBackgroundFill(source.backgroundFill)
  const focal = clampFocalPoint(source.backgroundFocalPoint)
  return {
    layout: source.layout,
    theme: source.theme,
    deviceFrameId: source.deviceFrameId,
    showDeviceStatusBar: source.showDeviceStatusBar,
    screenshotFit: source.screenshotFit,
    accentShapeStyle: { ...source.accentShapeStyle },
    backgroundFill: fill.kind === 'theme' ? undefined : { ...fill },
    backgroundFocalPoint: isDefaultFocalPoint(focal) ? undefined : focal,
  }
}

/**
 * Copies the source slide's style onto every other slide.
 *
 * Returns the slides unchanged, with the same object identities, when there is
 * nothing to do: the caller uses that to skip the history entry entirely.
 */
export const applySlideStyleToDeck = (slides: readonly Slide[], source: Slide): { slides: Slide[]; changedCount: number } => {
  const style = slideStyleOf(source)
  let changedCount = 0

  const slidesNext = slides.map((slide) => {
    if (slide.id === source.id) return slide
    if (isSameSlideStyle(slide, source)) return slide
    changedCount += 1
    return { ...slide, ...style }
  })

  return { slides: slidesNext, changedCount }
}
