#!/usr/bin/env node
import { createServer } from 'vite'

/**
 * The catalog, as the app declares it.
 *
 * `server.ssrLoadModule` hands back `Record<string, any>`, so without these the
 * whole body is unchecked: `template.slides.length` and `slide.id` would be
 * reads off `any`, and renaming either in `src/lib/projectTemplates.ts` or
 * `src/types.ts` would leave this validator still printing a green line about a
 * field that no longer exists. JSDoc `import()` is a comment, which is the only
 * way to say this in a file node runs directly — `import type` is TypeScript
 * syntax and node parses this with no build step.
 *
 * @typedef {import('../src/lib/projectTemplates').ProjectTemplate} ProjectTemplate
 * @typedef {import('../src/lib/projectTemplates').TemplateCatalogValidation} TemplateCatalogValidation
 * @typedef {import('../src/types').Slide} Slide
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
   * The cast is at the one boundary where the module is untyped: `ssrLoadModule`
   * answers `Record<string, any>`, which has no index-free members and so
   * satisfies no object type, and it is the *only* thing in this file that is
   * `any`. Everything below — `template.slides`, `slide.id`, `slide.appIcon` —
   * is then a checked read, so renaming one of them in the app is an error here.
   */
  const {
    projectTemplates,
    validateProjectTemplateCatalog,
    createSlidesFromProjectTemplate,
  } = /** @type {{
   *   projectTemplates: ProjectTemplate[],
   *   validateProjectTemplateCatalog: (catalog: ProjectTemplate[]) => TemplateCatalogValidation,
   *   createSlidesFromProjectTemplate: (template: ProjectTemplate) => Slide[],
   * }} */ (await server.ssrLoadModule('/src/lib/projectTemplates.ts'))
  const report = validateProjectTemplateCatalog(projectTemplates)
  if (!report.valid) {
    console.error('Template catalog validation failed:')
    report.errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
  } else {
    let instantiationError = ''
    const ids = new Set()
    for (const template of projectTemplates) {
      const slides = createSlidesFromProjectTemplate(template)
      if (slides.length !== template.slides.length) instantiationError = `${template.id} created the wrong slide count`
      for (const slide of slides) {
        if (slide.appIcon || slide.backgroundImage || slide.screenshot) instantiationError = `${template.id} created imported assets`
        if (ids.has(slide.id)) instantiationError = `${template.id} created a duplicate slide ID`
        ids.add(slide.id)
      }
    }
    if (instantiationError) {
      console.error(`Template catalog validation failed: ${instantiationError}`)
      process.exitCode = 1
    } else {
      const slideCount = projectTemplates.reduce((total, template) => total + template.slides.length, 0)
      console.log(`Template catalog validated: ${projectTemplates.length} templates, ${slideCount} slides, no imported assets`)
    }
  }
} catch (error) {
  console.error('Template catalog validation could not run:')
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
} finally {
  await server?.close()
}
