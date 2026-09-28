/**
 * Measuring the panoramic overscan at the moment of capture.
 *
 * The bug this exists to close
 * ---------------------------
 * `--background-scale` is the only value in the canvas's background-fill block
 * that depends on a *measurement* rather than on the document. It is computed
 * from the background image's intrinsic size, and that size only exists once the
 * browser has decoded the image. The renderer learns it from an `onLoad` event
 * and holds it in React state, so it reaches the stylesheet one re-render after
 * the image arrives. The export rasterises every slide at one instant, and if
 * that instant lands in the gap, the PNG is drawn at `--background-scale: 1` —
 * the panoramic bleed silently missing from a file the export reports as a
 * success, while the editor preview shows the overscan.
 *
 * Why measuring at capture time rather than waiting longer
 * --------------------------------------------------------
 * `html-to-image` snapshots the source node's *computed* style before it touches
 * any image: `toSvg` calls `cloneNode` (which does
 * `targetStyle.cssText = getComputedStyle(nativeNode).cssText`) and only then
 * runs `embedImages`. So the transform that reaches the PNG is the resolved
 * `transform` as it stood the moment `toBlob` was called. Waiting on
 * `img.decode()` and yielding a frame does not fix that by itself: `decode`
 * resolving says the pixels are ready, not that React has committed a render
 * derived from them, and React schedules that render through a message-channel
 * task whose ordering against a `requestAnimationFrame` continuation is not
 * guaranteed. The value has to be on the node before the call, and the only way
 * to be sure of that is to read it off the node and write it back.
 *
 * So this module does the measurement itself, from the DOM, and writes the
 * declaration directly onto the canvas it is about to rasterise — the same
 * declaration string the renderer publishes, from the same function, so the two
 * cannot disagree about what a panoramic fill looks like.
 *
 * Scope: `panoramic` only
 * -----------------------
 * `resolveBackgroundScale` returns `1` for every other fill kind, so a non-panoramic
 * canvas already publishes the value this would write. The write is skipped when
 * the node already carries that value, which means **for a deck with no panoramic
 * fill this function touches no node and waits for nothing.** That is deliberate:
 * a fix for a silent wrong PNG must not be able to make an unrelated export slow
 * or fail.
 */

import {
  BACKGROUND_SCALE_VARIABLE,
  formatBackgroundScale,
  measureIntrinsicSize,
  resolveIntrinsicAspect,
} from './backgroundFill'

/**
 * How long the export waits for a background image to become measurable.
 *
 * The same bound and the same reasoning as `FONT_READY_TIMEOUT_MS` in
 * `exportSlides.ts`: the only images in play are data URLs the browser either
 * already has or fetches from memory, so the real cost is milliseconds and the
 * value is a bound on a *hang*, not a target. Tightening it to something that
 * merely sounds safe converts a slow export into a failed one.
 */
export const BACKGROUND_MEASURE_TIMEOUT_MS = 15_000

/**
 * The message a timed-out measurement wait produces.
 *
 * Same shape as the font-wait message and for the same reason: it names what
 * stopped, says why the file would have been wrong, and says that nothing was
 * downloaded. "Background image did not load" alone leaves the reader unsure
 * whether the ZIP they are about to trust is usable.
 */
export const backgroundMeasureTimeoutMessage = (ms: number) =>
  `A panoramic background image did not finish loading within ${Math.round(ms / 1000)} seconds, ` +
  'so its PNG would have been drawn without the panoramic bleed. ' +
  'Nothing was downloaded. Check your internet connection, or try again once the page has settled.'

export interface MeasureExportBackgroundsRun {
  /** The off-screen export stage, laid out one node per entry. */
  stage: HTMLElement
  /** Width over height of the profile the slides are being rasterised at. */
  profileAspectRatio: number
  /** Overrides the bound, so a test does not have to wait fifteen seconds. */
  timeoutMs?: number
  /** Overrides the clock the deadline is measured against. */
  now?: () => number
}

/**
 * The canvas inside one export node, which is where the fill block is published.
 *
 * `[data-export-slide]` is the node the rasteriser is handed, and the canvas is
 * its child. Both the class and the fill attribute are the renderer's own, so
 * this is the same element the editor preview publishes onto.
 */
const canvasOf = (slideNode: HTMLElement): HTMLElement | null =>
  slideNode.querySelector<HTMLElement>('.slide-canvas')

/** The background image layer's `<img>`, addressed the way the codebase addresses layers. */
const backgroundImageOf = (slideNode: HTMLElement): HTMLImageElement | null =>
  slideNode.querySelector<HTMLImageElement>('[data-layer-id="background-image"] img')

/**
 * True when this node might still gain a measurement, and so is worth waiting for.
 *
 * Two exclusions, both of them "there is nothing coming":
 *
 * - The fill is not `panoramic`. No other kind consumes the measurement, so
 *   waiting would be waiting for a value nobody reads.
 * - The image is `complete`. `complete` is true once the fetch has settled
 *   *either way*, so a complete image reporting `naturalWidth === 0` is an image
 *   the browser refused to decode and it will never report a size. Waiting for it
 *   would hang until the timeout on a slide that is already as correct as it can
 *   be — and a failed background degrades to the theme paint, not to a hole.
 *
 * A node with no image at all, or a canvas it cannot find, is likewise not worth
 * waiting on.
 */
const isAwaitingMeasurement = (slideNode: HTMLElement): boolean => {
  const canvas = canvasOf(slideNode)
  if (!canvas || canvas.dataset.backgroundFill !== 'panoramic') return false
  const image = backgroundImageOf(slideNode)
  return image !== null && !image.complete
}

const awaitingNodes = (stage: HTMLElement): HTMLElement[] =>
  Array.from(stage.querySelectorAll<HTMLElement>('[data-export-slide]')).filter(isAwaitingMeasurement)

const nextFrame = () => new Promise<void>((resolve) => {
  window.requestAnimationFrame(() => resolve())
})

/**
 * Measures every background image on the export stage and publishes the
 * resulting `--background-scale` on the canvas it belongs to.
 *
 * Called once, after the stage has mounted and before the first `toBlob`. Two
 * halves, and the second is the one that matters:
 *
 * - **Wait**, bounded, for a panoramic image that is still loading. Without this
 *   there is nothing to measure and the write below is a no-op, which is the bug.
 *   Bounded, because a stalled fetch must fail loudly rather than hang; a failed
 *   export is recoverable, a silently unscaled PNG is not.
 * - **Measure and write**, per node, from `naturalWidth`/`naturalHeight` on the
 *   image that is actually in that node. A node whose value is already correct is
 *   left alone, so a deck the bug never touched is not rewritten at all.
 *
 * Returns how many nodes were changed, so a caller (and a test) can tell the
 * "measured and fixed" case from the "already right" case.
 */
export async function measureExportBackgroundScales({
  stage,
  profileAspectRatio,
  timeoutMs = BACKGROUND_MEASURE_TIMEOUT_MS,
  now = Date.now,
}: MeasureExportBackgroundsRun): Promise<number> {
  const deadline = now() + timeoutMs
  let pending = awaitingNodes(stage)
  while (pending.length > 0 && now() < deadline) {
    // Polling a frame rather than awaiting one fixed frame, for the reason
    // `App.tsx` gives before it waits on the node count: a single frame is not a
    // guarantee, and a wrong answer here is a silently mis-scaled PNG.
    await nextFrame()
    pending = awaitingNodes(stage)
  }
  if (pending.length > 0) {
    throw new Error(backgroundMeasureTimeoutMessage(timeoutMs))
  }

  let changed = 0
  for (const slideNode of Array.from(stage.querySelectorAll<HTMLElement>('[data-export-slide]'))) {
    const canvas = canvasOf(slideNode)
    if (!canvas) continue
    // `measureIntrinsicSize` is null both for "not loaded" (which the wait above
    // has already ruled out for a panoramic fill) and for "will never load", and
    // in the second case the renderer's own fallback — the stored hint — is the
    // best available answer, so the node keeps it.
    const measured = measureIntrinsicSize(backgroundImageOf(slideNode))
    if (!measured) continue

    const value = formatBackgroundScale(
      canvas.dataset.backgroundFill,
      resolveIntrinsicAspect(measured),
      profileAspectRatio,
    )
    if (canvas.style.getPropertyValue(BACKGROUND_SCALE_VARIABLE) === value) continue
    canvas.style.setProperty(BACKGROUND_SCALE_VARIABLE, value)
    changed += 1
  }
  return changed
}
