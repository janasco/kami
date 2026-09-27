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

  if ('fonts' in document) {
    await document.fonts.ready
  }

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
