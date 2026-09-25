#!/usr/bin/env node
import { createServer } from 'vite'

let server
try {
  server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  const {
    projectTemplates,
    validateProjectTemplateCatalog,
    createSlidesFromProjectTemplate,
  } = await server.ssrLoadModule('/src/lib/projectTemplates.ts')
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
