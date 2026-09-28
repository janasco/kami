import { describe, expect, it } from 'vitest'
import { buildExportManifest } from './exportManifest'
import { planExportEntries } from './exportPlan'
import { exportEntryLocale } from './exportManifest'
import { exportProfiles } from '../data'
import { createTestSlide } from '../test/projectFixtures'
import type { OutputVariant, Slide } from '../types'

/**
 * A variant's language is not decoration. It decides three things, and this file
 * exists to prove the new control reaches all of them rather than only the label
 * on the select.
 *
 * Before the control existed, `locale` was persisted and validated but had no
 * editor path, so a multi-language set could not be authored at all. That made
 * "preview this deck in every language" unimplementable regardless of what the
 * preview surface looked like: there was nothing to preview.
 */

const slides: Slide[] = [
  createTestSlide({ id: 'slide-1', title: 'One' }),
  createTestSlide({ id: 'slide-2', title: 'Two' }),
]

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'v-en',
  name: 'English set',
  canvasId: 'main-story',
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1', 'slide-2'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

const profile = exportProfiles[0]

describe('a variant locale reaches the plan, the manifest, and the locale record', () => {
  it('resolves each entry to the variant language, not the editor language', () => {
    // The editor is in English; the variant is Arabic. The entry must be Arabic,
    // because the PNG is drawn from the entry's locale.
    const variants = [variant({ locale: 'ar-SA' })]
    const plan = planExportEntries({ slides, variants, profileId: 'app-store', requiresScreenshot: true })

    expect(plan.entries).toHaveLength(2)
    for (const entry of plan.entries) {
      expect(exportEntryLocale({ variantId: entry.variantId }, variants, 'en-US')).toBe('ar-SA')
    }
  })

  it('records the language per manifest row, so a multi-language set is legible', () => {
    const variants = [
      variant({ id: 'v-en', name: 'English set', locale: 'en-US' }),
      variant({ id: 'v-es', name: 'Spanish set', locale: 'es-ES' }),
      variant({ id: 'v-ar', name: 'Arabic set', locale: 'ar-SA' }),
    ]
    const plan = planExportEntries({ slides, variants, profileId: 'app-store', requiresScreenshot: true })
    const manifest = buildExportManifest({ plan, profile, variants, locale: 'en-US' })

    // Three languages, two slides each.
    expect(manifest.entries).toHaveLength(6)
    const languages = new Set(manifest.entries.map((row) => row.locale))
    expect([...languages].sort()).toEqual(['ar-SA', 'en-US', 'es-ES'])
  })

  it('keeps two variants in different languages in one bundle, side by side', () => {
    const variants = [
      variant({ id: 'v-en', name: 'English set', locale: 'en-US' }),
      variant({ id: 'v-ar', name: 'Arabic set', locale: 'ar-SA' }),
    ]
    const plan = planExportEntries({ slides, variants, profileId: 'app-store', requiresScreenshot: true })
    const manifest = buildExportManifest({ plan, profile, variants, locale: 'en-US' })

    const names = manifest.entries.map((row) => row.filename)
    expect(names).toContain('app-store--english-set--slide-01.png')
    expect(names).toContain('app-store--arabic-set--slide-01.png')
    // The filename records the variant name, and the row records the language,
    // so the bundle is self-describing rather than two identical-looking sets.
    expect(new Set(names).size).toBe(4)
  })

  it('falls back to the editor language only when the variant names none', () => {
    // A document that predates the field, read as a plain record so the absence
    // is expressible without lying to the type. The rule is unchanged: the
    // variant wins, and the editor's locale is the fallback.
    const legacy = { ...variant() } as Record<string, unknown>
    delete legacy.locale
    expect(exportEntryLocale({ variantId: 'v-en' }, [legacy as unknown as OutputVariant], 'es-ES')).toBe('es-ES')
  })

  it('is a per-variant property, so one deck can hold several at once', () => {
    // The whole point of the control: not a deck-wide switch.
    const variants = [
      variant({ id: 'v-en', locale: 'en-US' }),
      variant({ id: 'v-es', locale: 'es-ES' }),
    ]
    const resolved = variants.map((entry) => exportEntryLocale({ variantId: entry.id }, variants, 'ar-SA'))
    expect(resolved).toEqual(['en-US', 'es-ES'])
  })
})
