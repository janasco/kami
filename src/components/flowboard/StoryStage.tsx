import { getLayout, getTheme } from '../../data'
import { getSlideText, type SlideTextField } from '../../lib/localization'
import { summarizeCapture } from '../../lib/flowboardStages'
import type { BulkActionGroup, BulkSlideAction } from '../../lib/flowboardBulkEdit'
import {
  describeSlideCardLabel,
  describeSlideCardState,
  type FlowboardSelection,
} from '../../lib/flowboardSelection'
import type { TranslationCellRef } from '../../lib/translationMatrix'
import type { LocaleId, Slide } from '../../types'
import { BulkActionBar, SlideSelectionSummary, createCardSelectionHandlers } from './SlideSelection'
import { SlideThumbnail } from './SlideThumbnail'
import { TranslationMatrixPanel } from './TranslationMatrix'

const idPrefix = 'flowboard-story'

/** Bulk controls the Story stage exposes: framing, style, and layer visibility. */
const bulkGroups: BulkActionGroup[] = ['framing', 'style', 'layers']

interface StoryStageProps {
  slides: Slide[]
  selectedSlide: Slide
  selectedIndex: number
  selection: FlowboardSelection
  activeLocale: LocaleId
  onLocaleChange: (locale: LocaleId) => void
  onSelect: (id: string) => void
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onAdd: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMove: (id: string, direction: -1 | 1) => void
  onApplyStyleToAll: () => void
  onApplyBulkAction: (action: BulkSlideAction) => void
  bulkNotice: string | null
  /** Matrix cell open for inline editing, held by the Flowboard shell. */
  editingCell: TranslationCellRef | null
  onEditingCellChange: (cell: TranslationCellRef | null) => void
  onSlideTextUpdate: (slideId: string, locale: LocaleId, field: SlideTextField, value: string) => void
  /** Selects the beat and locale, then opens the normal copy editor. */
  onOpenCopyEditor: (slideId: string, locale: LocaleId) => void
}

const truncate = (value: string, limit: number) => {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean
}

const isSameStyle = (a: Slide, b: Slide) =>
  a.layout === b.layout
  && a.theme === b.theme
  && a.deviceFrameId === b.deviceFrameId
  && a.showDeviceStatusBar === b.showDeviceStatusBar
  && a.screenshotFit === b.screenshotFit
  && a.accentShapeStyle.type === b.accentShapeStyle.type
  && a.accentShapeStyle.color.toLowerCase() === b.accentShapeStyle.color.toLowerCase()

/**
 * Stage 3. The deck as an ordered list of beats: layout, theme, and copy
 * summaries plus the ordering and duplication actions, and the translation
 * matrix that follows the copy across every supported locale.
 *
 * Beats can be added to a multi-selection, which adds a compact bulk bar for
 * style changes, while the ordering, duplication, and apply-to-all actions keep
 * working against the active beat exactly as before.
 */
export function StoryStage({
  slides,
  selectedSlide,
  selectedIndex,
  selection,
  activeLocale,
  onLocaleChange,
  onSelect,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onApplyStyleToAll,
  onApplyBulkAction,
  bulkNotice,
  editingCell,
  onEditingCellChange,
  onSlideTextUpdate,
  onOpenCopyEditor,
}: StoryStageProps) {
  const selectedStyle = {
    layout: getLayout(selectedSlide.layout).name,
    theme: getTheme(selectedSlide.theme).name,
    device: summarizeCapture(selectedSlide).deviceName,
    fit: summarizeCapture(selectedSlide).fitLabel,
    statusBar: summarizeCapture(selectedSlide).statusBarLabel,
  }
  const styleTargetCount = slides.filter((slide) => slide.id !== selectedSlide.id && !isSameStyle(slide, selectedSlide)).length
  const selectHintId = `${idPrefix}-select-hint`

  return (
    <div className="flowboard-stage-body flowboard-story">
      {selection.bulk && (
        <BulkActionBar
          slides={slides}
          selection={selection}
          groups={bulkGroups}
          idPrefix={idPrefix}
          onApply={onApplyBulkAction}
          onClear={onClearSelection}
          notice={bulkNotice}
        />
      )}

      <section className="flowboard-panel flowboard-panel--wide" aria-labelledby="story-beats-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Beat strip</span>
          <h3 id="story-beats-title">{slides.length} beat{slides.length === 1 ? '' : 's'} in export order</h3>
          <p className="flowboard-hint">
            Reordering does not change any slide content. Every beat keeps its own copy and capture.
          </p>
        </div>

        <SlideSelectionSummary
          selection={selection}
          slideCount={slides.length}
          idPrefix={idPrefix}
          onSelectAll={onSelectAll}
          onClear={onClearSelection}
        />

        <ol className="flowboard-beats" role="list" aria-describedby={selectHintId}>
          {slides.map((slide, index) => {
            const text = getSlideText(slide, activeLocale)
            const capture = summarizeCapture(slide)
            const theme = getTheme(slide.theme)
            // Editing and bulk selection are separate states, so a range of beats
            // still leaves one clearly marked as the one being edited.
            const card = describeSlideCardState(
              index + 1,
              slide.id === selectedSlide.id,
              selection.selectedIds.includes(slide.id),
            )
            const handlers = createCardSelectionHandlers(slide.id, onSelect, onToggleSelect)
            return (
              <li key={slide.id} className={card.className} data-selected={card.dataSelected} data-selection-state={card.state}>
                <div className={`flowboard-beat${card.className ? ` ${card.className}` : ''}`}>
                  <button
                    className="flowboard-beat__select"
                    type="button"
                    data-selected={card.dataSelected}
                    data-selection-state={card.state}
                    onClick={handlers.onClick}
                    onContextMenu={handlers.onContextMenu}
                    aria-pressed={card.selected}
                    aria-current={card.editing ? 'true' : undefined}
                    aria-describedby={selectHintId}
                    aria-label={describeSlideCardLabel(
                      index + 1,
                      `Beat ${index + 1}: ${text.title.replace(/\n/g, ' ') || 'Untitled slide'}.`,
                      card,
                    )}
                  >
                    <SlideThumbnail slide={slide} index={index} />
                    <span className="flowboard-card__mark" aria-hidden="true">{card.mark}</span>
                    <span className="flowboard-beat__copy">
                      <span className="flowboard-beat__flags">
                        <span className="flowboard-beat__number">{String(index + 1).padStart(2, '0')}</span>
                        <span className={`flowboard-card__badge${card.editing ? '' : ' is-selected'}`}>{card.badge}</span>
                      </span>
                      <strong className="flowboard-beat__headline">
                        {truncate(text.title, 42) || <em>No headline yet</em>}
                      </strong>
                      <span className="flowboard-beat__supporting">{truncate(text.subtitle, 64) || 'No supporting text'}</span>
                      <span className="flowboard-beat__tags">
                        <span className="flowboard-beat__tag">{getLayout(slide.layout).name}</span>
                        <span className="flowboard-beat__tag" data-swatch={theme.colors.join(',')}>
                          <i aria-hidden="true" style={{ background: `linear-gradient(135deg, ${theme.colors[0]}, ${theme.colors[1]})` }} />
                          {theme.name}
                        </span>
                        <span className={`flowboard-beat__tag${slide.screenshot ? '' : ' is-warn'}`}>
                          {slide.screenshot ? capture.deviceName : 'No capture'}
                        </span>
                        {!text.isTitleTranslated && <span className="flowboard-beat__tag is-warn">Needs {activeLocale} headline</span>}
                      </span>
                    </span>
                  </button>
                  <div className="flowboard-beat__actions">
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => onMove(slide.id, -1)}
                      disabled={index === 0}
                      aria-label={`Move beat ${index + 1} earlier`}
                      title="Move earlier"
                    >
                      ←
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => onMove(slide.id, 1)}
                      disabled={index === slides.length - 1}
                      aria-label={`Move beat ${index + 1} later`}
                      title="Move later"
                    >
                      →
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        <div className="flowboard-beats__footer">
          <button className="button button--outline" type="button" onClick={onAdd}>
            <span aria-hidden="true">＋</span> New beat
          </button>
          <button className="button button--outline" type="button" onClick={onDuplicate} disabled={slides.length === 0}>
            <span aria-hidden="true">⧉</span> Duplicate beat {selectedIndex + 1}
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={onDelete}
            disabled={slides.length <= 1}
            title={slides.length <= 1 ? 'A project needs at least one slide' : `Delete beat ${selectedIndex + 1}`}
          >
            Delete beat {selectedIndex + 1}
          </button>
        </div>
        {selection.bulk && (
          <p className="flowboard-hint">
            Add, duplicate, and delete still act on beat {selectedIndex + 1}, the beat marked Editing. The bulk bar above
            changes the {selection.selectedIds.length} selected beats.
          </p>
        )}
      </section>

      <TranslationMatrixPanel
        slides={slides}
        selectedSlide={selectedSlide}
        activeLocale={activeLocale}
        onLocaleChange={onLocaleChange}
        editingCell={editingCell}
        onEditingCellChange={onEditingCellChange}
        onTextUpdate={onSlideTextUpdate}
        onOpenInEditor={onOpenCopyEditor}
      />

      <section className="flowboard-panel flowboard-panel--wide" aria-labelledby="story-style-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Deck level</span>
          <h3 id="story-style-title">Style the whole deck</h3>
        </div>
        <p className="flowboard-hint">
          Beat {selectedIndex + 1}, the one marked Editing, is the style source. Applying it copies layout, theme, device
          frame, fit, status bar, and accent shape to every other beat. Copy and captures are untouched, and undo restores
          the previous mix.
        </p>
        <dl className="flowboard-record">
          <div className="flowboard-record__row">
            <span>Layout</span>
            <strong>{selectedStyle.layout}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Theme</span>
            <strong>{selectedStyle.theme}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Device</span>
            <strong>{selectedStyle.device}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Fit</span>
            <strong>{selectedStyle.fit}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Status bar</span>
            <strong>{selectedStyle.statusBar}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Beats to update</span>
            <strong>{styleTargetCount}</strong>
          </div>
          <div className="flowboard-record__row">
            <span>Beats selected</span>
            <strong>{selection.selectedIds.length} of {slides.length}</strong>
          </div>
        </dl>
        <button
          className="button button--primary flowboard-wide-action"
          type="button"
          onClick={onApplyStyleToAll}
          disabled={styleTargetCount === 0}
          title={styleTargetCount === 0 ? 'Every beat already matches this style' : undefined}
        >
          <span aria-hidden="true">⇉</span> Apply this style to all {slides.length} beats
        </button>
      </section>
    </div>
  )
}
