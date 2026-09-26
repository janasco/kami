import { toBlob } from 'html-to-image'
import JSZip from 'jszip'
import type { ExportProfile, Slide } from '../types'

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

export async function exportSlidesAsZip(
  projectName: string,
  slides: Slide[],
  stage: HTMLDivElement,
  profile: ExportProfile,
  onProgress: (progress: ExportProgress) => void,
) {
  const slideNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-export-slide]'))
  if (slideNodes.length !== slides.length) {
    throw new Error('The export canvas is not ready. Try exporting again.')
  }

  if ('fonts' in document) {
    await document.fonts.ready
  }

  const zip = new JSZip()
  for (let index = 0; index < slideNodes.length; index += 1) {
    const blob = await toBlob(slideNodes[index], {
      width: profile.width,
      height: profile.height,
      canvasWidth: profile.width,
      canvasHeight: profile.height,
      pixelRatio: 1,
      cacheBust: true,
      type: profile.format,
    })

    if (!blob) throw new Error(`Slide ${index + 1} could not be rendered.`)
    zip.file(`slide-${String(index + 1).padStart(2, '0')}.png`, blob)
    onProgress({
      completed: index + 1,
      total: slides.length,
      detail: `Rendered slide ${index + 1} of ${slides.length}`,
    })
    await waitForBrowser()
  }

  const archive = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => {
      onProgress({
        completed: slides.length,
        total: slides.length,
        detail: `Building ZIP ${Math.round(metadata.percent)}%`,
      })
    },
  )

  return { archive, filename: `${filenamePart(projectName)}.zip` }
}
