import { getTheme, numberSlide } from '../data'
import type { Slide } from '../types'

interface SlideNavigatorProps {
  slides: Slide[]
  selectedId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function MiniPreview({ slide }: { slide: Slide }) {
  const theme = getTheme(slide.theme)
  return (
    <div
      className="mini-slide"
      style={{
        background: `linear-gradient(145deg, ${theme.colors[0]}, ${theme.colors[1]})`,
        color: theme.text ?? '#ffffff',
      }}
    >
      <div className="mini-slide__headline" style={{ color: theme.text ?? '#ffffff' }}>{slide.title.split('\n')[0]}</div>
      {slide.screenshot ? (
        <img src={slide.screenshot} alt="" />
      ) : (
        <div className="mini-slide__device" />
      )}
    </div>
  )
}

export function SlideNavigator({
  slides,
  selectedId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
}: SlideNavigatorProps) {
  return (
    <aside className="slide-navigator" aria-label="Slide navigator">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Canvas</span>
          <h2>Slides</h2>
        </div>
        <button className="icon-button" type="button" onClick={onAdd} aria-label="Add slide" title="Add slide">
          +
        </button>
      </div>

      <div className="slide-list">
        {slides.map((slide, index) => (
          <button
            className={`slide-list-item ${selectedId === slide.id ? 'is-selected' : ''}`}
            key={slide.id}
            type="button"
            onClick={() => onSelect(slide.id)}
            aria-pressed={selectedId === slide.id}
          >
            <span className="slide-list-item__number">{numberSlide(index)}</span>
            <MiniPreview slide={slide} />
          </button>
        ))}
      </div>

      <div className="navigator-actions">
        <button className="text-button" type="button" onClick={onAdd}>
          <span aria-hidden="true">＋</span> New slide
        </button>
        <div className="navigator-actions__row">
          <button className="text-button" type="button" onClick={onDuplicate} disabled={!slides.length}>
            <span aria-hidden="true">⧉</span> Duplicate
          </button>
          <button
            className="text-button text-button--danger"
            type="button"
            onClick={onDelete}
            disabled={slides.length <= 1}
            title={slides.length <= 1 ? 'A project needs at least one slide' : 'Delete selected slide'}
          >
            Delete
          </button>
        </div>
      </div>
    </aside>
  )
}
