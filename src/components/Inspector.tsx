import { createDefaultLayerTransforms, exportProfiles, layouts, localeOptions, sanitizeLayerOpacity, slideLayerIds, slideLayerLabels, screenshotFitOptions, themes, TRANSFORM_SIZE_MAX, TRANSFORM_SIZE_MIN } from '../data'
import { isFramelessDeviceId } from '../lib/devicePresets'
import { DEFAULT_DEVICE_STATUS_BAR_TIME } from '../lib/deviceStatusBar'
import { describeScreenshotFit } from '../lib/screenshotFit'
import { getSlideText, translationFieldLabel } from '../lib/localization'
import type { ExportPreflightResult } from '../lib/exportPreflight'
import type { AccentShapeType, ExportProfile, LayerId, LayerSettings, LayoutId, LocaleId, Slide, ThemeId } from '../types'
import { DeviceFramePicker } from './DeviceFramePicker'

type NumericTransformField = 'x' | 'y' | 'scale' | 'rotation' | 'widthScale' | 'heightScale'

const transformNumericFields: NumericTransformField[] = ['x', 'y', 'scale', 'rotation', 'widthScale', 'heightScale']

const preflightStatusLabel = {
  ready: 'Ready',
  warnings: 'Warnings',
  blocked: 'Blocked',
} as const

const preflightSlideLabel = (slideNumbers: number[]) => {
  if (slideNumbers.length === 0) return 'Project'
  if (slideNumbers.length === 1) return `Slide ${slideNumbers[0]}`
  return `Slides ${slideNumbers.join(', ')}`
}

export interface InspectorProps {
  slide: Slide
  activeLocale: LocaleId
  onLocaleChange: (locale: LocaleId) => void
  onUpdate: (updates: Partial<Slide>, mergeKey?: string) => void
  onTextUpdate: (field: 'title' | 'subtitle', value: string) => void
  onImport: () => void
  onImportIcon: () => void
  onRemoveIcon: () => void
  onImportBackground: () => void
  onRemoveBackground: () => void
  selectedLayerId: LayerId
  onLayerSelect: (layerId: LayerId) => void
  profile: ExportProfile
  preflight: ExportPreflightResult
  onProfileChange: (profileId: ExportProfile['id']) => void
  exportDisabled: boolean
}

export function Inspector({
  slide,
  activeLocale,
  onLocaleChange,
  onUpdate,
  onTextUpdate,
  onImport,
  onImportIcon,
  onRemoveIcon,
  onImportBackground,
  onRemoveBackground,
  selectedLayerId,
  onLayerSelect,
  profile,
  preflight,
  onProfileChange,
  exportDisabled,
}: InspectorProps) {
  const text = getSlideText(slide, activeLocale)
  const locale = localeOptions.find((option) => option.id === activeLocale) ?? localeOptions[0]
  const missingFields = [
    ...(text.isTitleTranslated ? [] : ['title' as const]),
    ...(text.isSubtitleTranslated ? [] : ['subtitle' as const]),
  ]
  const selectedTransform = slide.layerTransforms[selectedLayerId]
  const selectedSettings = slide.layerSettings[selectedLayerId]
  const isFramelessDevice = isFramelessDeviceId(slide.deviceFrameId)
  const defaultTransforms = createDefaultLayerTransforms()
  const isDefaultTransform = transformNumericFields.every(
    (field) => selectedTransform[field] === defaultTransforms[selectedLayerId][field],
  ) && selectedTransform.flipX === defaultTransforms[selectedLayerId].flipX
    && selectedTransform.flipY === defaultTransforms[selectedLayerId].flipY

  const updateTransform = (field: NumericTransformField, value: number) => {
    if (!Number.isFinite(value) || (field === 'scale' && value <= 0)) return
    const safeValue = field === 'widthScale' || field === 'heightScale'
      ? Math.min(TRANSFORM_SIZE_MAX, Math.max(TRANSFORM_SIZE_MIN, value))
      : value
    onUpdate({
      layerTransforms: {
        ...slide.layerTransforms,
        [selectedLayerId]: { ...selectedTransform, [field]: safeValue },
      },
    }, `layer-transform:${slide.id}:${selectedLayerId}:${field}`)
  }

  const updateLayerSettings = (
    field: keyof LayerSettings,
    value: LayerSettings[keyof LayerSettings],
    mergeKey?: string,
  ) => {
    const nextValue = field === 'opacity'
      ? sanitizeLayerOpacity(value, selectedSettings.opacity)
      : value
    if (selectedSettings[field] === nextValue) return

    onUpdate({
      layerSettings: {
        ...slide.layerSettings,
        [selectedLayerId]: { ...selectedSettings, [field]: nextValue },
      },
    }, mergeKey)
  }

  const updateAccentShape = (updates: Partial<Slide['accentShapeStyle']>, mergeKey: string) => {
    onUpdate({
      accentShapeStyle: { ...slide.accentShapeStyle, ...updates },
    }, `accent-shape:${slide.id}:${mergeKey}`)
  }

  return (
    <aside className="inspector" aria-label="Slide inspector">
      <div className="panel-heading inspector__heading">
        <div>
          <span className="eyebrow">Selected slide</span>
          <h2>Inspector</h2>
        </div>
        <button className="icon-button icon-button--quiet" type="button" aria-label="Inspector menu" title="More inspector options">•••</button>
      </div>

      <div className="inspector__scroll">
        <section className="inspector-section inspector-section--locale">
          <div className="section-label">
            <span>Locale</span>
            <span className="section-label__hint">Preview copy</span>
          </div>
          <label className="field-label" htmlFor="active-locale">Active language</label>
          <select
            id="active-locale"
            className="profile-select locale-select"
            value={activeLocale}
            onChange={(event) => onLocaleChange(event.target.value as LocaleId)}
          >
            {localeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} · {option.direction.toUpperCase()}
              </option>
            ))}
          </select>
          <div className="locale-direction">
            <span className={`locale-direction__badge locale-direction__badge--${locale.direction}`}>
              {locale.direction.toUpperCase()}
            </span>
            <span>{locale.direction === 'rtl' ? 'Right-to-left canvas and text' : 'Left-to-right canvas and text'}</span>
          </div>
        </section>

        <section className="inspector-section">
          <div className="section-label">
            <span>Content</span>
            <span className="section-label__hint">Text & image</span>
          </div>
          <label className="field-label" htmlFor="slide-title">Headline</label>
          <textarea
            id="slide-title"
            value={text.title}
            dir={locale.direction}
            rows={3}
            onChange={(event) => onTextUpdate('title', event.target.value)}
          />
          <div className="field-meta"><span>Use a new line for emphasis</span><span>{text.title.length}/54</span></div>

          <label className="field-label" htmlFor="slide-subtitle">Supporting text</label>
          <textarea
            id="slide-subtitle"
            value={text.subtitle}
            dir={locale.direction}
            rows={2}
            onChange={(event) => onTextUpdate('subtitle', event.target.value)}
          />

          {activeLocale !== 'en-US' && missingFields.length > 0 && (
            <div className="translation-status" role="status" aria-live="polite">
              <strong>Missing {locale.label} translation</strong>
              <span>
                {missingFields.map(translationFieldLabel).join(' and ')} will use English fallback in the editor and canvas.
              </span>
            </div>
          )}

          <div className="image-field">
            <div>
              <span className="field-label">App screenshot</span>
              <span className="image-field__name">{slide.screenshotName ?? 'No image selected'}</span>
            </div>
            <button className="button button--outline button--small" type="button" onClick={onImport}>
              {slide.screenshot ? 'Replace' : 'Import'}
            </button>
          </div>
          <div className="image-field">
            <div>
              <span className="field-label">App icon</span>
              <span className="image-field__name">{slide.appIcon?.name ?? 'Optional · No icon selected'}</span>
            </div>
            <div className="image-field__actions">
              <button className="button button--outline button--small" type="button" onClick={onImportIcon}>
                {slide.appIcon ? 'Replace' : 'Import'}
              </button>
              {slide.appIcon && (
                <button className="button button--quiet button--small" type="button" onClick={onRemoveIcon}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="image-field">
            <div>
              <span className="field-label">Background image</span>
              <span className="image-field__name">{slide.backgroundImage?.name ?? 'Optional · Theme fallback'}</span>
            </div>
            <div className="image-field__actions">
              <button className="button button--outline button--small" type="button" onClick={onImportBackground}>
                {slide.backgroundImage ? 'Replace' : 'Import'}
              </button>
              {slide.backgroundImage && (
                <button className="button button--quiet button--small" type="button" onClick={onRemoveBackground}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="inspector-section">
          <div className="section-label">
            <span>Device frame</span>
            <span className="section-label__hint">Screenshot</span>
          </div>
          <DeviceFramePicker
            value={slide.deviceFrameId}
            label="Device frame"
            onChange={(deviceFrameId) => onUpdate(
              { deviceFrameId },
              `device-frame:${slide.id}:${deviceFrameId}`,
            )}
          />
          <div className="device-status-control">
            <label className="layer-visibility-toggle device-status-toggle" htmlFor="device-status-bar">
              <span>Device status bar</span>
              <input
                id="device-status-bar"
                type="checkbox"
                checked={slide.showDeviceStatusBar}
                disabled={isFramelessDevice}
                onChange={(event) => onUpdate(
                  { showDeviceStatusBar: event.target.checked },
                  `device-status-bar:${slide.id}:toggle`,
                )}
                aria-label="Show device status bar"
              />
              <span className="switch" aria-hidden="true" />
            </label>
            <p className="device-status-hint">
              {isFramelessDevice
                ? 'Frameless presets always export the screenshot on its own.'
                : `A fixed ${DEFAULT_DEVICE_STATUS_BAR_TIME} clock with signal, Wi-Fi, and battery keeps exports reproducible.`}
            </p>
          </div>
          <span className="field-label" id="screenshot-fit-label">Screenshot fit</span>
          <div className="screenshot-fit-options" role="group" aria-labelledby="screenshot-fit-label">
            {screenshotFitOptions.map((option) => {
              const active = slide.screenshotFit === option.id
              return (
                <button
                  key={option.id}
                  className={`screenshot-fit-option${active ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => onUpdate(
                    { screenshotFit: option.id },
                    `screenshot-fit:${slide.id}:${option.id}`,
                  )}
                  aria-pressed={active}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              )
            })}
          </div>
          <p className="device-status-hint">
            {slide.screenshot
              ? `${slide.screenshotName ?? 'The capture'} is shown with ${describeScreenshotFit(slide.screenshotFit).toLowerCase()}.`
              : 'Contain keeps the whole capture visible. Switch to cover to fill the frame and crop the edges.'}
          </p>
        </section>

        <section className="inspector-section">
          <div className="section-label">
            <span>Layer transform</span>
            <button
              className="text-button text-button--compact"
              type="button"
              disabled={isDefaultTransform}
              onClick={() => onUpdate({
                layerTransforms: {
                  ...slide.layerTransforms,
                  [selectedLayerId]: defaultTransforms[selectedLayerId],
                },
              }, `layer-transform:${slide.id}:${selectedLayerId}:reset`)}
              aria-label={`Reset ${slideLayerLabels[selectedLayerId]} transform`}
            >
              Reset
            </button>
          </div>
          <div className="layer-picker" role="group" aria-label="Canvas layer">
            {slideLayerIds.map((layerId) => (
              <button
                key={layerId}
                className={`layer-option ${selectedLayerId === layerId ? 'is-active' : ''}${slide.layerSettings[layerId].visible ? '' : ' is-hidden'}`}
                type="button"
                onClick={() => onLayerSelect(layerId)}
                aria-label={`${slideLayerLabels[layerId]}${slide.layerSettings[layerId].visible ? '' : ', hidden'}`}
                aria-pressed={selectedLayerId === layerId}
              >
                <span className={`layer-option__icon layer-option__icon--${layerId}`} aria-hidden="true" />
                <span>{slideLayerLabels[layerId]}</span>
              </button>
            ))}
          </div>
          <div className="selected-layer-name">
            <span>Editing</span>
            <strong>{slideLayerLabels[selectedLayerId]}</strong>
            <span>X/Y are canvas percentages</span>
          </div>
          <div className="layer-appearance-controls">
            <label className="layer-visibility-toggle" htmlFor="layer-visible">
              <span>Visible on canvas</span>
              <input
                id="layer-visible"
                type="checkbox"
                checked={selectedSettings.visible}
                onChange={(event) => updateLayerSettings('visible', event.target.checked)}
                aria-label={`Show ${slideLayerLabels[selectedLayerId]} on canvas`}
              />
              <span className="switch" aria-hidden="true" />
            </label>
            <div className="layer-opacity-control">
              <div className="layer-opacity-control__label">
                <label className="field-label" htmlFor="layer-opacity">Opacity</label>
                <output htmlFor="layer-opacity">{Math.round(selectedSettings.opacity * 100)}%</output>
              </div>
              <input
                id="layer-opacity"
                className="layer-opacity-slider"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={sanitizeLayerOpacity(selectedSettings.opacity, selectedSettings.opacity)}
                onChange={(event) => updateLayerSettings(
                  'opacity',
                  Number(event.target.value),
                  `layer-opacity:${slide.id}:${selectedLayerId}`,
                )}
                aria-label={`${slideLayerLabels[selectedLayerId]} opacity`}
                aria-valuetext={`${Math.round(selectedSettings.opacity * 100)} percent`}
              />
            </div>
          </div>
          {selectedLayerId === 'accent-shape' && (
            <div className="shape-controls">
              <div className="shape-controls__field">
                <label className="field-label" htmlFor="accent-shape-type">Shape</label>
                <select
                  id="accent-shape-type"
                  className="profile-select shape-controls__select"
                  value={slide.accentShapeStyle.type}
                  onChange={(event) => updateAccentShape(
                    { type: event.target.value as AccentShapeType },
                    'type',
                  )}
                >
                  <option value="circle">Circle</option>
                  <option value="pill">Pill</option>
                </select>
              </div>
              <div className="shape-controls__field">
                <label className="field-label" htmlFor="accent-shape-color">Color</label>
                <input
                  id="accent-shape-color"
                  className="shape-color-input"
                  type="color"
                  value={slide.accentShapeStyle.color}
                  onChange={(event) => updateAccentShape({ color: event.target.value }, 'color')}
                  aria-label="Accent shape color"
                />
              </div>
            </div>
          )}
          <div className="transform-grid">
            <div className="transform-field">
              <label className="field-label" htmlFor="layer-transform-x">Position X</label>
              <div className="transform-input-wrap">
                <input
                  id="layer-transform-x"
                  className="transform-input"
                  type="number"
                  step="1"
                  value={selectedTransform.x}
                  onChange={(event) => updateTransform('x', Number(event.target.value))}
                  aria-label={`${slideLayerLabels[selectedLayerId]} position X percentage`}
                />
                <span aria-hidden="true">%</span>
              </div>
            </div>
            <div className="transform-field">
              <label className="field-label" htmlFor="layer-transform-y">Position Y</label>
              <div className="transform-input-wrap">
                <input
                  id="layer-transform-y"
                  className="transform-input"
                  type="number"
                  step="1"
                  value={selectedTransform.y}
                  onChange={(event) => updateTransform('y', Number(event.target.value))}
                  aria-label={`${slideLayerLabels[selectedLayerId]} position Y percentage`}
                />
                <span aria-hidden="true">%</span>
              </div>
            </div>
            <div className="transform-field">
              <label className="field-label" htmlFor="layer-transform-scale">Scale</label>
              <div className="transform-input-wrap">
                <input
                  id="layer-transform-scale"
                  className="transform-input"
                  type="number"
                  min="0.05"
                  step="0.05"
                  value={selectedTransform.scale}
                  onChange={(event) => updateTransform('scale', Number(event.target.value))}
                  aria-label={`${slideLayerLabels[selectedLayerId]} scale`}
                />
                <span aria-hidden="true">×</span>
              </div>
            </div>
            <div className="transform-field">
              <label className="field-label" htmlFor="layer-transform-rotation">Rotation</label>
              <div className="transform-input-wrap">
                <input
                  id="layer-transform-rotation"
                  className="transform-input"
                  type="number"
                  step="1"
                  value={selectedTransform.rotation}
                  onChange={(event) => updateTransform('rotation', Number(event.target.value))}
                  aria-label={`${slideLayerLabels[selectedLayerId]} rotation in degrees`}
                />
                <span aria-hidden="true">°</span>
              </div>
            </div>
          </div>
          <div className="transform-grid transform-grid--size" role="group" aria-label="Layer size">
            <div className="transform-field">
              <label className="field-label" htmlFor="layer-transform-width-scale">Width scale</label>
              <div className="transform-input-wrap">
                <input
                  id="layer-transform-width-scale"
                  className="transform-input"
                  type="number"
                  min={TRANSFORM_SIZE_MIN}
                  max={TRANSFORM_SIZE_MAX}
                  step="0.05"
                  value={selectedTransform.widthScale}
                  onChange={(event) => updateTransform('widthScale', Number(event.target.value))}
                  aria-label={`${slideLayerLabels[selectedLayerId]} width scale`}
                />
                <span aria-hidden="true">×</span>
              </div>
            </div>
            <div className="transform-field">
              <label className="field-label" htmlFor="layer-transform-height-scale">Height scale</label>
              <div className="transform-input-wrap">
                <input
                  id="layer-transform-height-scale"
                  className="transform-input"
                  type="number"
                  min={TRANSFORM_SIZE_MIN}
                  max={TRANSFORM_SIZE_MAX}
                  step="0.05"
                  value={selectedTransform.heightScale}
                  onChange={(event) => updateTransform('heightScale', Number(event.target.value))}
                  aria-label={`${slideLayerLabels[selectedLayerId]} height scale`}
                />
                <span aria-hidden="true">×</span>
              </div>
            </div>
          </div>
          <div className="transform-flip-controls" role="group" aria-label={`${slideLayerLabels[selectedLayerId]} flips`}>
            <label className="transform-flip-control" htmlFor="layer-transform-flip-x">
              <input
                id="layer-transform-flip-x"
                type="checkbox"
                checked={selectedTransform.flipX}
                onChange={(event) => onUpdate({
                  layerTransforms: {
                    ...slide.layerTransforms,
                    [selectedLayerId]: { ...selectedTransform, flipX: event.target.checked },
                  },
                }, `layer-transform:${slide.id}:${selectedLayerId}:flipX`)}
              />
              <span>Flip horizontal</span>
            </label>
            <label className="transform-flip-control" htmlFor="layer-transform-flip-y">
              <input
                id="layer-transform-flip-y"
                type="checkbox"
                checked={selectedTransform.flipY}
                onChange={(event) => onUpdate({
                  layerTransforms: {
                    ...slide.layerTransforms,
                    [selectedLayerId]: { ...selectedTransform, flipY: event.target.checked },
                  },
                }, `layer-transform:${slide.id}:${selectedLayerId}:flipY`)}
              />
              <span>Flip vertical</span>
            </label>
          </div>
        </section>

        <section className="inspector-section">
          <div className="section-label">
            <span>Layout</span>
            <span className="section-label__hint">Arrangement</span>
          </div>
          <div className="layout-options">
            {layouts.map((layout) => (
              <button
                key={layout.id}
                className={`layout-option ${slide.layout === layout.id ? 'is-active' : ''}`}
                type="button"
                onClick={() => onUpdate({ layout: layout.id as LayoutId })}
                aria-pressed={slide.layout === layout.id}
                title={layout.description}
              >
                <span className={`layout-sketch layout-sketch--${layout.id}`}>
                  <i /><i /><i />
                </span>
                <span className="layout-option__copy">
                  <strong>{layout.name}</strong>
                  <small>{layout.description}</small>
                </span>
                {slide.layout === layout.id && <b aria-hidden="true">✓</b>}
              </button>
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <div className="section-label">
            <span>Color theme</span>
            <span className="section-label__hint">Background</span>
          </div>
          <div className="theme-options">
            {themes.map((theme) => (
              <button
                key={theme.id}
                className={`theme-option ${slide.theme === theme.id ? 'is-active' : ''}`}
                type="button"
                onClick={() => onUpdate({ theme: theme.id as ThemeId })}
                aria-pressed={slide.theme === theme.id}
              >
                <span
                  className="theme-swatch"
                  style={{ background: `linear-gradient(135deg, ${theme.colors[0]}, ${theme.colors[1]})` }}
                />
                <span>{theme.name}</span>
                {slide.theme === theme.id && <b aria-hidden="true">✓</b>}
              </button>
            ))}
          </div>
        </section>

        <section className={`preflight-panel preflight-panel--${preflight.status}`} aria-labelledby="preflight-heading">
          <div className="section-label">
            <span id="preflight-heading">Export preflight</span>
            <span className={`preflight-status preflight-status--${preflight.status}`}>
              <i aria-hidden="true" /> {preflightStatusLabel[preflight.status]}
            </span>
          </div>
          {preflight.status === 'ready' ? (
            <p className="preflight-ready">All required checks passed for {preflight.checkedSlides} slide{preflight.checkedSlides === 1 ? '' : 's'}.</p>
          ) : (
            <ul className="preflight-issues" aria-live="polite">
              {preflight.issues.map((issue, index) => (
                <li key={`${issue.code}-${issue.layerId ?? 'project'}-${index}`}>
                  <span>{issue.message}</span>
                  <small>{preflightSlideLabel(issue.slideNumbers)}</small>
                </li>
              ))}
            </ul>
          )}
          <p className="preflight-footnote">
            {preflight.blockingIssues.length > 0
              ? 'Resolve blocking checks before exporting.'
              : preflight.warningIssues.length > 0
                ? 'Warnings do not prevent export.'
                : 'The active profile and all slide assets passed preflight.'}
          </p>
        </section>

        <section className="inspector-section inspector-section--muted">
          <div className="section-label">
            <span>Export profile</span>
            <span className="section-label__hint">PNG output</span>
          </div>
          <label className="field-label" htmlFor="export-profile">Target</label>
          <select
            id="export-profile"
            className="profile-select"
            value={profile.id}
            disabled={exportDisabled}
            onChange={(event) => onProfileChange(event.target.value as ExportProfile['id'])}
          >
            {exportProfiles.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} · {option.width} × {option.height} px
              </option>
            ))}
          </select>
          <div className="property-row"><span>Dimensions</span><strong>{profile.width} × {profile.height} px</strong></div>
          <div className="property-row"><span>Orientation</span><strong>{profile.orientation[0].toUpperCase() + profile.orientation.slice(1)}</strong></div>
          <div className="property-row"><span>Safe area</span><strong className="property-good">On</strong></div>
        </section>
      </div>
    </aside>
  )
}
