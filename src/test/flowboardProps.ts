import { createDemoProject } from '../lib/demoProject'
import { runExportPreflight } from '../lib/exportPreflight'
import { planExportEntries } from '../lib/exportPlan'
import { createDefaultOutputVariant } from '../lib/deviceVariants'
import { exportProfiles } from '../data'
import type { FlowboardProps } from '../components/Flowboard'

/**
 * Shared props factory for the shell tests.
 *
 * Both editor shells take the same props, so the tests need the same fixture.
 * Keeping it here means a new shell prop is added in one place, and the
 * Full Editor regression tests keep testing the same deck.
 */

const noop = () => undefined

export const makeFlowboardProps = (overrides: Partial<FlowboardProps> = {}): FlowboardProps => {
  const demo = createDemoProject()
  const profile = exportProfiles[0]
  /*
   * The one default variant, derived the same way the App derives it, so a shell
   * test exercises the same shape the editor renders rather than a fixture that
   * can drift from it.
   */
  const variants = [createDefaultOutputVariant({
    slideIds: demo.slides.map((slide) => slide.id),
    locale: demo.activeLocale,
    themeId: demo.slides[0]?.theme ?? 'midnight',
    exportProfileId: demo.selectedExportProfileId,
  })]
  const exportPlan = planExportEntries({
    slides: demo.slides,
    variants,
    profileId: profile.id,
    requiresScreenshot: true,
  })
  const preflight = runExportPreflight({
    profile,
    slides: demo.slides,
    activeLocale: 'en-US',
    variants,
  })
  const selectedSlide = demo.slides[0]

  return {
    projectName: demo.name,
    onProjectNameChange: noop,
    canUndo: true,
    canRedo: false,
    onUndo: noop,
    onRedo: noop,
    onSaveProject: noop,
    onOpenProject: noop,
    onOpenProjectFile: noop,
    slides: demo.slides,
    selectedSlide,
    selectedIndex: 0,
    onSelect: noop,
    onAddSlide: noop,
    onDuplicateSlide: noop,
    onDeleteSlide: noop,
    onMoveSlide: noop,
    onApplyStyleToAllSlides: noop,
    onUpdateSlide: noop,
    onApplyBulkSlideAction: () => null,
    onTextUpdate: noop,
    onSlideTextUpdate: noop,
    onTransformChange: noop,
    selectedLayerId: 'headline',
    onLayerSelect: noop,
    onLayerTransformChange: noop,
    layerBounds: {},
    onArrange: noop,
    onImportScreenshot: noop,
    onImportFiles: noop,
    onDropFilesOnSlide: async () => 'Nothing was placed.',
    onDropCaptureOnSlide: () => 'Nothing was placed.',
    onOpenScreenshotImport: noop,
    onImportAppIcon: noop,
    onRemoveAppIcon: noop,
    onImportBackground: noop,
    onRemoveBackground: noop,
    onOpenTemplates: noop,
    templatesDisabled: false,
    onApplyTemplate: noop,
    onLoadDemo: noop,
    onStartBlank: noop,
    onOpenGuide: noop,
    activeLocale: 'en-US',
    onLocaleChange: noop,
    canvasMode: 'isolated',
    onCanvasModeChange: noop,
    profile,
    onProfileChange: noop,
    preflight,
    variants,
    activeVariantId: variants[0].id,
    exportEntries: exportPlan.entries,
    exportBlockedVariant: exportPlan.blocked,
    onVariantPreviewChange: noop,
    onVariantProfileChange: noop,
    onVariantToggleEnabled: noop,
    onVariantRename: noop,
    onVariantAdd: noop,
    onVariantRemove: noop,
    onVariantOverrideChange: noop,
    onVariantCaptureChange: noop,
    onExport: noop,
    exportStatus: 'idle',
    exportDetail: '',
    exportCompleted: 0,
    exportTotal: demo.slides.length,
    persistenceStatus: 'saved',
    persistenceDetail: 'A local browser draft is saved.',
    projectValidationNotice: null,
    onShowClassicEditor: noop,
    onEditorModeChange: noop,
    ...overrides,
  }
}

export const collectIds = (markup: string) => [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
