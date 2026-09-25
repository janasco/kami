#!/usr/bin/env node
import { createServer } from 'vite'

let server
try {
  server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  const { createDemoProject } = await server.ssrLoadModule('/src/lib/demoProject.ts')
  const { serializeProject } = await server.ssrLoadModule('/src/lib/project.ts')
  const { validateProjectDocument, validationSummary } = await server.ssrLoadModule('/src/lib/projectValidation.ts')

  const project = createDemoProject()
  const document = serializeProject(project)
  const report = validateProjectDocument(document)
  if (!report.valid) throw new Error(validationSummary(report.issues))
  if (project.slides.length !== 3) throw new Error(`Expected 3 slides, found ${project.slides.length}`)

  const inlineAssets = project.slides.flatMap((slide) => [slide.screenshot, slide.appIcon?.dataUrl]).filter(Boolean)
  if (inlineAssets.length !== 6) throw new Error(`Expected 6 generated inline asset uses, found ${inlineAssets.length}`)
  const uniqueInlineAssets = [...new Set(inlineAssets)]
  if (document.assets.length !== 6 || uniqueInlineAssets.length !== 4) {
    throw new Error(`Expected 6 asset records backed by 4 unique data URLs, found ${document.assets.length} and ${uniqueInlineAssets.length}`)
  }
  uniqueInlineAssets.forEach((asset, index) => {
    if (!asset.startsWith('data:image/svg+xml;base64,')) throw new Error(`Demo asset ${index + 1} is not an inline SVG data URL`)
    const svg = Buffer.from(asset.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')
    if (!svg.startsWith('<svg') || /<script|<foreignObject|\b(?:href|src)\s*=/i.test(svg)) {
      throw new Error(`Demo asset ${index + 1} contains unsafe or non-local SVG markup`)
    }
  })

  console.log(`Demo project validated: ${project.slides.length} slides, ${inlineAssets.length} safe inline SVG uses (${uniqueInlineAssets.length} unique), portable project valid`)
} catch (error) {
  console.error('Demo project validation failed:')
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
} finally {
  await server?.close()
}
