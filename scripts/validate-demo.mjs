#!/usr/bin/env node
import { createServer } from 'vite'

/**
 * The app's own types, read across the dynamic-import boundary.
 *
 * `server.ssrLoadModule` hands back `Record<string, any>`, so without these every
 * read below would be unchecked: `project` is `any`, `slide` is an implicit
 * `any`, and `slide.screenshot` could be silently renamed in `src/types.ts`
 * without this validator noticing. The types come from the app's own modules
 * rather than from local shapes, so a rename is an error here instead.
 *
 * A JSDoc `import()` is a comment, which is the only way to say this in a file
 * node runs directly: `import type` would be TypeScript syntax in a `.mjs`, and
 * node parses this file with no build step. All three modules are already in the
 * `tsconfig.node.json` program through `scripts/gate/roundtrip.ts`, so this adds
 * no file the typecheck was not already seeing.
 *
 * @typedef {import('../src/lib/project').EditorProject} EditorProject
 * @typedef {import('../src/lib/project').ProjectFile} ProjectFile
 * @typedef {import('../src/lib/projectValidation').ValidationReport} ValidationReport
 */

/** @type {import('vite').ViteDevServer | undefined} */
let server
try {
  server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  /**
   * Each cast is at the one place the module is untyped. `Record<string, any>`
   * satisfies no object type, so the annotation cannot be a plain declaration
   * and has to be an assertion; nothing below it is `any`.
   */
  const { createDemoProject } = /** @type {{ createDemoProject: () => EditorProject }} */ (
    await server.ssrLoadModule('/src/lib/demoProject.ts')
  )
  const { serializeProject } = /** @type {{ serializeProject: (project: EditorProject) => ProjectFile }} */ (
    await server.ssrLoadModule('/src/lib/project.ts')
  )
  const { validateProjectDocument, validationSummary } = /** @type {{
   *   validateProjectDocument: (document: ProjectFile) => ValidationReport,
   *   validationSummary: (issues: import('../src/lib/projectValidation').ValidationIssue[]) => string,
   * }} */ (await server.ssrLoadModule('/src/lib/projectValidation.ts'))

  const project = createDemoProject()
  const document = serializeProject(project)
  const report = validateProjectDocument(document)
  if (!report.valid) throw new Error(validationSummary(report.issues))
  if (project.slides.length !== 3) throw new Error(`Expected 3 slides, found ${project.slides.length}`)

  // `screenshot` is `string | null` and `appIcon` is nullable, so the flatMap
  // yields nullables that `filter(Boolean)` then removes. `Boolean` is a
  // constructor rather than a predicate the checker can read, so the filter's
  // narrowing is asserted here instead; the expression is untouched, because a
  // `typeof === 'string'` predicate would also keep `''` and that is a
  // different validator.
  const inlineAssets = /** @type {string[]} */ (
    project.slides.flatMap((slide) => [slide.screenshot, slide.appIcon?.dataUrl]).filter(Boolean)
  )
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
