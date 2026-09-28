import { toBlob } from 'html-to-image'
import JSZip from 'jszip'
import { exportEntryName, type ExportEntry } from './exportPlan'
import type { ExportProfile } from '../types'

export type ExportProgress = {
  completed: number
  total: number
  detail: string
}

const waitForBrowser = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))

/**
 * How long the export waits for the document's webfonts before giving up.
 *
 * Generous on purpose. `document.fonts.ready` resolves once every pending font
 * load has settled, and the only fonts in play are the two families
 * `src/styles.css` imports from Google Fonts — a handful of weights, fetched
 * once per session and already warm by the time a user finishes composing a
 * deck. On a slow connection that is seconds, not tens of seconds, so fifteen is
 * roughly an order of magnitude of headroom over the worst legitimate case: no
 * realistic network makes a real user wait this long, which is the point. The
 * value is a bound on a *hang*, not a target. Tightening it to something that
 * merely sounds safe (two or three seconds) would convert a slow export into a
 * failed one, and a failed export is worse than a slow one — the user loses the
 * work of the click and has to press it again.
 */
export const FONT_READY_TIMEOUT_MS = 15_000

/**
 * The message a timed-out font wait produces.
 *
 * Written for the person watching the export bar, not for a log. It says what
 * stopped, why the result would have been wrong, and what to do about it, in
 * that order, because "Fonts did not load" alone leaves the reader to guess
 * whether their file is safe.
 */
export const fontReadyTimeoutMessage = (ms: number) =>
  `Fonts did not finish loading within ${Math.round(ms / 1000)} seconds, so the PNGs would have been drawn with the wrong typeface. ` +
  'Nothing was downloaded. Check your internet connection, or try again once the page has settled.'

/**
 * Awaits `document.fonts.ready`, bounded.
 *
 * **Fatal, not a warning.** The alternative — log it and carry on — produces a
 * ZIP that looks finished and is not: the whole point of the wait is that
 * `html-to-image` rasterises text through a foreignObject, and if the families
 * are not loaded the browser falls back to a system face with different metrics,
 * so headlines reflow, wrap, and can overflow the frame. That is a silently
 * wrong deliverable in the exact shape a store screenshot must not be, and this
 * function's caller already has one error path that shows a message and
 * downloads nothing, so a warning would need a second, quieter channel to carry
 * a defect the user cannot see in the file. Failing loudly and pointing at the
 * retry is strictly better than succeeding with broken type.
 *
 * The error is deliberately distinguishable from every other export failure, so
 * a report of "the export failed" can name the cause rather than leave the user
 * guessing which of six throws it was.
 */
export const waitForFonts = async (timeoutMs: number = FONT_READY_TIMEOUT_MS): Promise<void> => {
  // Older engines, and the non-DOM environments the module is imported in, have
  // no FontFaceSet at all. There is nothing to wait for, and the original
  // `'fonts' in document` guard is the right behaviour, not a workaround.
  if (!('fonts' in document)) return

  let timer: number | undefined
  const expiry = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(fontReadyTimeoutMessage(timeoutMs))), timeoutMs)
  })

  try {
    // `fonts.ready` resolves once every pending load has settled and never
    // rejects, so racing it against a timer is the whole mechanism. The
    // `finally` disarms that timer once the fonts win: otherwise every fast
    // export leaves a live 15-second timer behind for the rest of the session,
    // on a page whose entire purpose is long editing sessions.
    await Promise.race([document.fonts.ready, expiry])
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * The project name turned into the ZIP filename.
 *
 * Exported so a surface that names the download before it happens, such as the
 * guided Download step, shows the file the export will really write.
 */
export const filenamePart = (name: string) => {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'kami-screenshots'
}

/**
 * Writes the planned entries into a ZIP, in order, and reports progress.
 *
 * The caller supplies the render function, which is what lets the archive be
 * assembled and read back in a test with no DOM while the real export uses
 * `html-to-image`. The name is minted here and only here, so the file in the
 * bundle and the name the store preview shows cannot drift apart.
 */
export const writeExportArchive = async (
  zip: JSZip,
  entries: readonly ExportEntry[],
  profileId: string,
  render: (entry: ExportEntry, index: number) => Promise<Blob | Uint8Array | null>,
  onProgress: (progress: ExportProgress) => void,
) => {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const blob = await render(entry, index)
    if (!blob) throw new Error(`Slide ${entry.slideNumber} of “${entry.variantName}” could not be rendered.`)
    /*
     * `<profile>--<variant>--slide-NN.png`. Two device variants would otherwise
     * both want `slide-01.png`, and a bundle that overwrites itself is worse
     * than a long one.
     */
    zip.file(exportEntryName(profileId, entry.variantName, entry.slideNumber), blob)
    onProgress({
      completed: index + 1,
      total: entries.length,
      detail: `Rendered “${entry.variantName}” slide ${entry.slideNumber} of ${entries.length}`,
    })
  }

  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => {
      onProgress({
        completed: entries.length,
        total: entries.length,
        detail: `Building ZIP ${Math.round(metadata.percent)}%`,
      })
    },
  )
}

export interface ExportSlidesRun {
  projectName: string
  /** The plan, in the order the files are written. */
  entries: readonly ExportEntry[]
  profile: ExportProfile
  /** The off-screen stage, laid out one node per entry by `ExportSlides`. */
  stage: HTMLDivElement
  onProgress: (progress: ExportProgress) => void
}

/**
 * Renders every planned entry off the export stage and returns the ZIP.
 *
 * The stage is laid out one node per entry, in plan order, so the node at index
 * N belongs to entry N. The count is checked rather than trusted: a mismatch
 * means the stage and the plan disagree, and rendering the wrong slide into a
 * named file is worse than refusing to start.
 */
export async function exportSlidesAsZip({ projectName, entries, profile, stage, onProgress }: ExportSlidesRun) {
  const slideNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-export-slide]'))
  if (slideNodes.length !== entries.length) {
    throw new Error('The export canvas is not ready. Try exporting again.')
  }

  await waitForFonts()

  const archive = await writeExportArchive(
    new JSZip(),
    entries,
    profile.id,
    async (_entry, index) => {
      const blob = await toBlob(slideNodes[index], {
        width: profile.width,
        height: profile.height,
        canvasWidth: profile.width,
        canvasHeight: profile.height,
        pixelRatio: 1,
        cacheBust: true,
        type: profile.format,
      })
      // Yield between frames so a long multi-variant export stays responsive.
      await waitForBrowser()
      return blob
    },
    onProgress,
  )

  return { archive, filename: `${filenamePart(projectName)}.zip` }
}
