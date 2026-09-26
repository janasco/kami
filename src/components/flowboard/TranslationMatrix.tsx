import { useCallback, useMemo, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { SlideTextField } from '../../lib/localization'
import {
  buildTranslationMatrix,
  collectIncompleteSlideNumbers,
  describeTranslationCellText,
  describeTranslationMatrixText,
  isSameTranslationCell,
  TRANSLATION_FIELDS,
  translationCellKey,
  type TranslationCell,
  type TranslationCellRef,
  type TranslationMatrix,
} from '../../lib/translationMatrix'
import type { LocaleId, Slide } from '../../types'

interface TranslationMatrixProps {
  slides: Slide[]
  /** Beat the beat strip and the Refine stage currently point at. */
  selectedSlide: Slide
  /** Locale the canvas and the Inspector preview. */
  activeLocale: LocaleId
  onLocaleChange: (locale: LocaleId) => void
  /** Cell currently open for inline editing, held by the Flowboard shell. */
  editingCell: TranslationCellRef | null
  onEditingCellChange: (cell: TranslationCellRef | null) => void
  /** The shared text update path, so undo, autosave, and saving all work. */
  onTextUpdate: (slideId: string, locale: LocaleId, field: SlideTextField, value: string) => void
  /** Selects the beat, sets the preview locale, and opens the copy editor. */
  onOpenInEditor: (slideId: string, locale: LocaleId) => void
}

const idPrefix = 'flowboard-matrix'

const fieldState = (cell: TranslationCell, field: SlideTextField) =>
  cell.fields.find((state) => state.field === field)

/** Flattens the grid into row-major order so arrow keys can walk the cells. */
const flattenCells = (matrix: TranslationMatrix): TranslationCell[] =>
  matrix.rows.flatMap((row) => row.cells)

/**
 * The Story stage translation matrix.
 *
 * One row per beat, one column per supported locale. A cell reports the
 * headline and supporting copy it holds, marks a missing translation instead of
 * quietly showing the English fallback, and can either be typed into right here
 * or handed to the normal copy editor in the Refine stage.
 *
 * The inline fields write through `onTextUpdate`, which is the same
 * `commitEditorUpdate` path the Inspector uses, so one burst of typing is one
 * undo step, autosaves like any other edit, and lands in the project document
 * as an ordinary `messages` entry. Nothing about the matrix is serialized.
 */
export function TranslationMatrixPanel({
  slides,
  selectedSlide,
  activeLocale,
  onLocaleChange,
  editingCell,
  onEditingCellChange,
  onTextUpdate,
  onOpenInEditor,
}: TranslationMatrixProps) {
  const matrix = useMemo(() => buildTranslationMatrix(slides), [slides])
  const cells = useMemo(() => flattenCells(matrix), [matrix])
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())
  const incompleteSlides = collectIncompleteSlideNumbers(matrix)
  const titleId = `${idPrefix}-title`
  const hintId = `${idPrefix}-hint`

  const registerCellButton = useCallback((key: string, node: HTMLButtonElement | null) => {
    if (node) cellRefs.current.set(key, node)
    else cellRefs.current.delete(key)
  }, [])

  /**
   * Arrow keys walk the matrix from a cell control. The grid itself stays
   * left-to-right so the arrow keys always match the visual column order, and
   * each cell's own text fields are marked `dir`, so a right-to-left locale is
   * edited right-to-left inside a cell that is still read left-to-right.
   */
  const handleCellKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    const target = event.target as HTMLElement | null
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    const currentKey = target?.getAttribute('data-matrix-cell')
    if (!currentKey) return
    const index = cells.findIndex((cell) => translationCellKey(cell.slideId, cell.locale) === currentKey)
    if (index < 0) return

    // Escape closes the open cell from its own control, without the shell
    // treating it as a request to clear the multi-selection.
    if (event.key === 'Escape') {
      if (!isSameTranslationCell(editingCell, cells[index])) return
      event.preventDefault()
      event.stopPropagation()
      onEditingCellChange(null)
      return
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    const columns = matrix.locales.length
    const nextIndex = event.key === 'ArrowUp'
      ? index - columns
      : event.key === 'ArrowDown'
        ? index + columns
        : event.key === 'ArrowLeft'
          ? index - 1
          : index + 1
    const next = cells[nextIndex]
    if (!next) return

    const nextButton = cellRefs.current.get(translationCellKey(next.slideId, next.locale))
    if (!nextButton) return
    event.preventDefault()
    nextButton.focus()
  }

  const toggleCell = (cell: TranslationCell) => {
    onEditingCellChange(isSameTranslationCell(editingCell, cell)
      ? null
      : { slideId: cell.slideId, locale: cell.locale })
  }

  return (
    <section className="flowboard-panel flowboard-panel--wide flowboard-matrix" aria-labelledby={titleId}>
      <div className="flowboard-panel__heading flowboard-panel__heading--row">
        <div>
          <span className="eyebrow">Locales</span>
          <h3 id={titleId}>Translation matrix</h3>
          <p className="flowboard-hint">
            One row per beat, one column per language. The active language previews the canvas and the editor; the
            matrix can edit any locale without changing it.
          </p>
        </div>
        <div className="flowboard-panel__heading-actions">
          <span className="flowboard-badge">{matrix.locales.length} locales</span>
          <span
            className={`flowboard-matrix__completion${matrix.complete ? ' is-complete' : ''}`}
            role="status"
            aria-live="polite"
          >
            {matrix.summary}
          </span>
        </div>
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {describeTranslationMatrixText(matrix)}
      </p>

      <div className="flowboard-matrix__scroll">
        <table className="flowboard-matrix__table" dir="ltr">
          <caption className="flowboard-matrix__caption">
            Translation coverage for {matrix.slideCount} beat{matrix.slideCount === 1 ? '' : 's'} across{' '}
            {matrix.locales.length} locales. Fields without their own copy are marked missing.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="flowboard-matrix__corner">Beat</th>
              {matrix.locales.map((locale) => {
                const isActive = locale.id === activeLocale
                return (
                  <th
                    key={locale.id}
                    scope="col"
                    className={`flowboard-matrix__locale${isActive ? ' is-active' : ''}`}
                    data-direction={locale.direction}
                  >
                    <span className="flowboard-matrix__locale-name">{locale.label}</span>
                    <span className="flowboard-matrix__locale-meta">
                      <span
                        className={`locale-direction__badge locale-direction__badge--${locale.direction}`}
                        title={locale.direction === 'rtl' ? 'Right-to-left text' : 'Left-to-right text'}
                      >
                        {locale.direction.toUpperCase()}
                      </span>
                      {locale.id === matrix.sourceLocale && <span className="flowboard-matrix__tag">Source</span>}
                      {isActive
                        ? <span className="flowboard-matrix__tag is-active">Active preview</span>
                        : (
                          <button
                            className="text-button text-button--compact flowboard-matrix__locale-button"
                            type="button"
                            onClick={() => onLocaleChange(locale.id)}
                            aria-label={`Preview ${locale.label} on the canvas and in the copy editor`}
                          >
                            Preview
                          </button>
                        )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody onKeyDown={handleCellKeyDown}>
            {matrix.rows.map((row) => {
              const behind = row.cells.filter((cell) => !cell.complete).length
              return (
                <tr key={row.slideId} className={row.complete ? '' : 'is-incomplete'}>
                  <th scope="row" className="flowboard-matrix__beat">
                    <span className="flowboard-beat__number">{String(row.slideNumber).padStart(2, '0')}</span>
                    <span className="flowboard-matrix__beat-title">
                      {row.headline.replace(/\n/g, ' ') || <em>No headline yet</em>}
                    </span>
                    <span className="flowboard-matrix__beat-meta">
                      {row.supporting ? 'Headline and supporting copy' : 'Headline only'}
                      {row.slideId === selectedSlide.id ? ' · active beat' : ''}
                      {row.complete ? '' : ` · ${behind} locale${behind === 1 ? '' : 's'} behind`}
                    </span>
                  </th>
                  {row.cells.map((cell) => {
                    const key = translationCellKey(cell.slideId, cell.locale)
                    const isEditing = isSameTranslationCell(editingCell, cell)
                    const editorId = `${idPrefix}-${cell.slideNumber}-${cell.locale.toLowerCase()}`
                    return (
                      <td
                        key={key}
                        className={`flowboard-matrix__cell${isEditing ? ' is-editing' : ''}${cell.complete ? '' : ' is-missing'}`}
                        data-direction={cell.direction}
                        data-locale={cell.locale}
                      >
                        <p className="visually-hidden">{describeTranslationCellText(cell)}</p>
                        {cell.direction === 'rtl' && (
                          <p className="flowboard-matrix__rtl">
                            <span className="locale-direction__badge locale-direction__badge--rtl">RTL</span>
                            Right-to-left copy, edited right-to-left
                          </p>
                        )}
                        <ul className="flowboard-matrix__fields" aria-hidden="true">
                          {TRANSLATION_FIELDS.map((field) => {
                            const state = fieldState(cell, field)
                            if (!state) return null
                            const tone = state.optional ? 'is-optional' : state.translated ? 'is-done' : 'is-missing'
                            return (
                              <li key={field} className={`flowboard-matrix__field ${tone}`}>
                                <i aria-hidden="true">{state.optional ? '–' : state.translated ? '✓' : '!'}</i>
                                <span>{state.label}</span>
                                <span className="flowboard-matrix__field-note">
                                  {state.optional
                                    ? 'not used'
                                    : state.translated
                                      ? 'translated'
                                      : 'missing · falls back to English'}
                                </span>
                              </li>
                            )
                          })}
                        </ul>

                        <div className="flowboard-matrix__actions">
                          <button
                            ref={(node) => registerCellButton(key, node)}
                            className="text-button text-button--compact"
                            type="button"
                            data-matrix-cell={key}
                            onClick={() => toggleCell(cell)}
                            aria-expanded={isEditing}
                            aria-controls={isEditing ? editorId : undefined}
                            aria-label={`${isEditing ? 'Close the inline editor for' : 'Edit copy for'} beat ${cell.slideNumber} in ${cell.label}`}
                          >
                            {isEditing ? 'Close' : 'Edit'}
                          </button>
                          <button
                            className="text-button text-button--compact"
                            type="button"
                            onClick={() => onOpenInEditor(cell.slideId, cell.locale)}
                            aria-label={`Open ${cell.label} copy for beat ${cell.slideNumber} in the copy editor`}
                          >
                            Open in editor
                          </button>
                        </div>

                        {isEditing && (
                          <div className="flowboard-matrix__editor" id={editorId}>
                            {TRANSLATION_FIELDS.map((field) => {
                              const state = fieldState(cell, field)
                              if (!state) return null
                              const inputId = `${editorId}-${field}`
                              return (
                                <div key={field} className="flowboard-matrix__field-edit">
                                  <label className="field-label" htmlFor={inputId}>
                                    {state.label}
                                    {state.optional ? ' · unused on this beat' : ''}
                                  </label>
                                  <textarea
                                    id={inputId}
                                    rows={field === 'title' ? 2 : 3}
                                    dir={cell.direction}
                                    value={state.value}
                                    spellCheck={false}
                                    onChange={(event) => onTextUpdate(cell.slideId, cell.locale, field, event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key !== 'Escape' || event.defaultPrevented) return
                                      event.stopPropagation()
                                      toggleCell(cell)
                                    }}
                                  />
                                </div>
                              )
                            })}
                            <p className="flowboard-hint">
                              Typing here autosaves and undoes like any other edit. English stays the source text; this
                              cell only writes {cell.label}.
                            </p>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="flowboard-hint" id={hintId}>
        Arrow keys move between cells, Tab walks each cell, and Escape closes an open editor. Missing fields fall back to
        the source language {matrix.sourceLocale} in the canvas and the Inspector until they are translated here.
        {incompleteSlides.length > 0
          ? ` Beats still behind: ${incompleteSlides.join(', ')}.`
          : ' Every beat is complete in every locale.'}
      </p>
    </section>
  )
}
