import { describe, expect, it } from 'vitest'
import { DEFAULT_BACKGROUND_FILL, exportProfiles } from '../data'
import { createProjectDocument, createTestSlide, VALID_PNG_DATA_URL, VALID_SVG_DATA_URL } from '../test/projectFixtures'
import { migrateProjectDocument } from './projectMigration'
import { parseProjectDocument, serializeProject, type EditorProject } from './project'
import { validateProjectDocument } from './projectValidation'
import type { Slide } from '../types'

const projectWith = (slides: Slide[]): EditorProject => ({
  name: 'Background fill project',
  slides,
  activeLocale: 'en-US',
  canvasMode: 'isolated',
  selectedExportProfileId: exportProfiles[0].id,
})

const migratedFixture = () => {
  const result = migrateProjectDocument(createProjectDocument())
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const slidesOf = (document: object) => (document as { slides?: unknown }).slides as Array<Record<string, unknown>>
const layerNamed = (document: object, index: number, id: string) =>
  (slidesOf(document)[index].layers as Array<Record<string, unknown>>).find((layer) => layer.id === id)
const assetsOf = (document: object) => (document as { assets?: unknown }).assets as Array<Record<string, unknown>>
/** The asset a layer points at, so a shared data URL is not confused with a capture. */
const assetForLayer = (document: object, index: number, id: string) =>
  assetsOf(document).find((asset) => asset.id === layerNamed(document, index, id)?.assetId)

/**
 * The tracked fixture carries only a title and a subtitle layer, so a test that
 * is about the background image adds the layer the editor would have written.
 */
const withBackgroundLayer = (document: Record<string, unknown>, index: number, extra: Record<string, unknown> = {}) => {
  const layer = {
    id: 'background-image',
    type: 'image',
    frame: { x: 0, y: 0, width: 100, height: 100 },
    zIndex: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, widthScale: 1, heightScale: 1, flipX: false, flipY: false },
    opacity: 1,
    visible: true,
    ...extra,
  }
  const layers = slidesOf(document)[index].layers as Array<Record<string, unknown>>
  layers.unshift(layer)
  return layer
}

/**
 * The serialized bytes, with the save timestamp neutralised.
 *
 * `revision.createdAt` is the one part of the document that is not a function of
 * the project, and it has always been a wall-clock stamp. Everything else has to
 * match byte for byte.
 */
const serializeBytes = (project: EditorProject) => {
  const document = serializeProject(project)
  return JSON.stringify({ ...document, revision: { ...document.revision, createdAt: '' } })
}

const backgroundSlide = (overrides: Partial<Slide> = {}): Slide => createTestSlide({
  backgroundImage: { name: 'backdrop.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png', width: 3000, height: 1000 },
  ...overrides,
})

describe('background fill persistence', () => {
  it('round-trips every fill kind and its focal point through the project document', () => {
    const original = projectWith([
      backgroundSlide({ id: 'themed' }),
      backgroundSlide({ id: 'solid', backgroundFill: { kind: 'solid', color: '#0b1020' } }),
      backgroundSlide({
        id: 'gradient',
        backgroundFill: { kind: 'gradient', gradient: { angle: 145, stops: ['#151525', '#5b4cf0'] } },
      }),
      backgroundSlide({ id: 'image', backgroundFill: { kind: 'image' }, backgroundFocalPoint: { x: 0.5, y: 0.42 } }),
      backgroundSlide({ id: 'panoramic', backgroundFill: { kind: 'panoramic', blend: 'screen' } }),
    ])

    const document = serializeProject(original)
    expect(validateProjectDocument(document).valid).toBe(true)
    expect(slidesOf(document).map((slide) => slide.backgroundFill)).toEqual([
      undefined,
      { kind: 'solid', color: '#0b1020' },
      { kind: 'gradient', gradient: { angle: 145, stops: ['#151525', '#5b4cf0'] } },
      { kind: 'image' },
      { kind: 'panoramic', blend: 'screen' },
    ])
    expect(layerNamed(document, 3, 'background-image')?.focalPoint).toEqual({ x: 0.5, y: 0.42 })
    expect(layerNamed(document, 0, 'background-image')?.focalPoint).toBeUndefined()

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides.map((slide) => slide.backgroundFill)).toEqual([
      undefined,
      { kind: 'solid', color: '#0b1020' },
      { kind: 'gradient', gradient: { angle: 145, stops: ['#151525', '#5b4cf0'] } },
      { kind: 'image' },
      { kind: 'panoramic', blend: 'screen' },
    ])
    expect(result.project.slides[3].backgroundFocalPoint).toEqual({ x: 0.5, y: 0.42 })
    expect(result.project.slides[0].backgroundFocalPoint).toBeUndefined()
  })

  it('leaves the field out entirely for a slide still on the theme fill', () => {
    const document = serializeProject(projectWith([backgroundSlide({ id: 'plain' })]))

    expect(slidesOf(document)[0]).not.toHaveProperty('backgroundFill')
    expect(layerNamed(document, 0, 'background-image')).not.toHaveProperty('focalPoint')
    expect(JSON.stringify(document)).not.toContain('backgroundFill')
  })

  it('serializes an untouched project byte-identically on every save', () => {
    const project = projectWith([
      backgroundSlide({ id: 'a' }),
      createTestSlide({ id: 'b' }),
      createTestSlide({ id: 'c', layerOrder: ['footer', 'headline'] }),
    ])

    expect(serializeBytes(project)).toBe(serializeBytes(project))

    // And stable across a load/save cycle, so opening a deck nobody edited
    // cannot quietly add a field the editor would then own forever.
    const first = parseProjectDocument(JSON.stringify(serializeProject(project)))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(serializeBytes(first.project)).toBe(serializeBytes(project))
  })

  it('round-trips the intrinsic size hint as an asset hint, never as a requirement', () => {
    const document = serializeProject(projectWith([backgroundSlide({ id: 'hinted' })]))
    const asset = assetForLayer(document, 0, 'background-image')
    expect(asset?.width).toBe(3000)
    expect(asset?.height).toBe(1000)

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].backgroundImage).toEqual({
      name: 'backdrop.png',
      dataUrl: VALID_PNG_DATA_URL,
      mimeType: 'image/png',
      width: 3000,
      height: 1000,
    })
  })

  it('leaves the asset hint out when the image size is unknown', () => {
    const document = serializeProject(projectWith([createTestSlide({
      id: 'hintless',
      backgroundImage: { name: 'backdrop.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' },
    })]))
    for (const asset of assetsOf(document)) {
      expect(asset).not.toHaveProperty('width')
      expect(asset).not.toHaveProperty('height')
    }
  })

  it('defaults a missing fill kind and clamps a focal point on open', () => {
    const document = migratedFixture()
    slidesOf(document)[0].backgroundFill = { color: '#0b1020' }
    withBackgroundLayer(document, 0, { focalPoint: { x: 4, y: -1 } })

    // A record that lost its kind is completed, not thrown away, so a
    // hand-edited fill still means the theme rather than an unknown fill. A
    // focal point outside the unit square is clamped to its edge.
    const migrated = migrateProjectDocument(structuredClone(document))
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(slidesOf(migrated.document)[0].backgroundFill)
      .toEqual({ kind: DEFAULT_BACKGROUND_FILL, color: '#0b1020' })
    expect(layerNamed(migrated.document, 0, 'background-image')?.focalPoint).toEqual({ x: 1, y: 0 })

    // The theme fill is stored as no record at all, which is what keeps an
    // untouched slide from growing a field on every open.
    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].backgroundFill).toBeUndefined()
    expect(result.project.slides[0].backgroundFocalPoint).toEqual({ x: 1, y: 0 })
  })

  it('drops a focal point that sits on the centre, so the document records nothing', () => {
    const document = migratedFixture()
    withBackgroundLayer(document, 0, { focalPoint: { x: 0.5, y: 0.5 } })

    const migrated = migrateProjectDocument(structuredClone(document))
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(layerNamed(migrated.document, 0, 'background-image')).not.toHaveProperty('focalPoint')

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].backgroundFocalPoint).toBeUndefined()
  })

  it('keeps an in-range focal point that the author actually moved', () => {
    const document = migratedFixture()
    withBackgroundLayer(document, 0, { focalPoint: { x: 0.25, y: 0.8 } })

    const migrated = migrateProjectDocument(structuredClone(document))
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(layerNamed(migrated.document, 0, 'background-image')?.focalPoint).toEqual({ x: 0.25, y: 0.8 })
  })

  it('adds nothing to the applied-migration notice for a project that needs no migration', () => {
    // The list is shown to the author verbatim, so a milestone that only adds
    // optional fields must not lengthen it. These are the two entries the
    // tracked fixture has always produced.
    const result = migrateProjectDocument(createProjectDocument())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.report.applied).toEqual([
      'v1: normalize legacy layout id',
      'v1: apply optional field defaults',
    ])
  })

  it('rejects an unsupported fill kind with a precise path', () => {
    const document = migratedFixture()
    slidesOf(document)[0].backgroundFill = { kind: 'mesh' }

    const report = validateProjectDocument(document)
    expect(report.valid).toBe(false)
    expect(report.issues).toContainEqual({
      path: '$.slides[0].backgroundFill.kind',
      code: 'invalid-background-fill',
      message: 'The background fill kind must be one of: theme, solid, gradient, image, panoramic.',
      severity: 'error',
    })
  })

  it('warns about a bad colour, angle, and focal range without blocking the open', () => {
    const document = migratedFixture()
    slidesOf(document)[0].backgroundFill = { kind: 'solid', color: 'rebeccapurple' }
    withBackgroundLayer(document, 0, { focalPoint: { x: 0.5, y: 12 } })

    const report = validateProjectDocument(document)
    expect(report.valid).toBe(true)
    expect(report.issues.map((issue) => issue.path)).toEqual([
      '$.slides[0].backgroundFill.color',
      '$.slides[0].layers[0].focalPoint.y',
    ])
    expect(report.issues.every((issue) => issue.severity === 'warning')).toBe(true)
  })

  it('warns about a bad gradient without blocking the open', () => {
    const document = migratedFixture()
    slidesOf(document)[0].backgroundFill = { kind: 'gradient', gradient: { angle: 'sideways', stops: ['nope'] } }

    const report = validateProjectDocument(document)
    expect(report.valid).toBe(true)
    expect(report.issues.map((issue) => issue.path)).toEqual([
      '$.slides[0].backgroundFill.gradient.angle',
      '$.slides[0].backgroundFill.gradient.stops[0]',
    ])
  })

  it('warns about an unusable intrinsic size hint rather than trusting it', () => {
    const document = migratedFixture()
    ;(document.assets as Array<Record<string, unknown>>).push({
      id: 'asset-bg', kind: 'other', path: 'backdrop.png', mimeType: 'image/png', width: 0, height: 'tall',
    })
    withBackgroundLayer(document, 0, { assetId: 'asset-bg' })

    const report = validateProjectDocument(document)
    expect(report.valid).toBe(true)
    expect(report.issues.map((issue) => `${issue.path}:${issue.severity}`)).toEqual([
      '$.assets[0].width:warning',
      '$.assets[0].height:warning',
    ])
  })
})

describe('background asset restore', () => {
  it('restores an SVG background instead of dropping it', () => {
    const original = projectWith([backgroundSlide({
      id: 'vector',
      backgroundImage: { name: 'backdrop.svg', dataUrl: VALID_SVG_DATA_URL, mimeType: 'image/svg+xml' },
    })])
    const document = serializeProject(original)
    expect(assetForLayer(document, 0, 'background-image')?.mimeType).toBe('image/svg+xml')

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].backgroundImage).toEqual({
      name: 'backdrop.svg',
      dataUrl: VALID_SVG_DATA_URL,
      mimeType: 'image/svg+xml',
    })
  })

  it('restores a background whose asset declares no usable mime type', () => {
    const document = migratedFixture()
    document.assets = [{
      id: 'asset-bg',
      kind: 'other',
      path: 'backdrop.png',
      mimeType: 'application/octet-stream',
    }]
    withBackgroundLayer(document, 0, { assetId: 'asset-bg' })

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].backgroundImage?.dataUrl).toBe('backdrop.png')
  })

  it('restores the intrinsic size hint a background asset carries', () => {
    const document = migratedFixture()
    document.assets = [{
      id: 'asset-bg',
      kind: 'other',
      path: 'backdrop.png',
      mimeType: 'image/png',
      width: 2400,
      height: 600,
    }]
    withBackgroundLayer(document, 0, { assetId: 'asset-bg' })

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].backgroundImage).toMatchObject({ width: 2400, height: 600 })
  })

  it('ignores a half-written intrinsic size hint instead of guessing a crop', () => {
    const document = migratedFixture()
    document.assets = [{
      id: 'asset-bg',
      kind: 'other',
      path: 'backdrop.png',
      mimeType: 'image/png',
      width: 2400,
    }]
    withBackgroundLayer(document, 0, { assetId: 'asset-bg' })

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].backgroundImage).not.toHaveProperty('width')
  })

  it('still refuses a background whose path the asset validator rejects', () => {
    const document = migratedFixture()
    document.assets = [{
      id: 'asset-bg',
      kind: 'other',
      path: 'javascript:alert(1)',
      mimeType: 'image/png',
    }]
    withBackgroundLayer(document, 0, { assetId: 'asset-bg' })

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(false)
  })
})
