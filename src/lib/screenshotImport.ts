export const SCREENSHOT_IMPORT_MAX_BYTES = 10 * 1024 * 1024
export const SCREENSHOT_IMPORT_ACCEPT = 'image/png,image/jpeg,image/webp'

export interface ScreenshotFileCandidate {
  file: File
  valid: boolean
  error: string | null
  slideNumber: number | null
  createsSlide: boolean
}

export interface ScreenshotImportItem {
  name: string
  dataUrl: string
}

const acceptedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const acceptedExtensions = new Set(['png', 'jpg', 'jpeg', 'webp'])

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Whether a file is a capture Kami can embed.
 *
 * Exported so every path that has to recognise a capture — the import dialog,
 * the deck-wide file import, and the drop planner — asks the same question of
 * the same file, and cannot drift into accepting a different set of types.
 */
export const isAcceptedScreenshotFile = (file: { name: string; type?: string }) => {
  if (file.type) return acceptedTypes.has(file.type.toLowerCase())
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension !== undefined && acceptedExtensions.has(extension)
}

export const validateScreenshotFiles = (files: File[]): ScreenshotFileCandidate[] => {
  let validIndex = 0
  return files.map((file) => {
    let error: string | null = null
    if (!isAcceptedScreenshotFile(file)) error = 'Not a PNG, JPG, or WebP image.'
    else if (file.size > SCREENSHOT_IMPORT_MAX_BYTES) {
      error = `Too large: ${formatFileSize(file.size)}. The limit is 10 MB per image.`
    }

    if (error) {
      return { file, valid: false, error, slideNumber: null, createsSlide: false }
    }
    validIndex += 1
    return {
      file,
      valid: true,
      error: null,
      slideNumber: validIndex,
      createsSlide: false,
    }
  })
}

export const readScreenshotFile = (file: File) => new Promise<ScreenshotImportItem>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/')) {
      reject(new Error(`${file.name} did not produce an image data URL.`))
      return
    }
    resolve({ name: file.name, dataUrl: reader.result })
  }
  reader.onerror = () => reject(new Error(`${file.name} could not be read.`))
  reader.onabort = () => reject(new Error(`Reading ${file.name} was cancelled.`))
  reader.readAsDataURL(file)
})
