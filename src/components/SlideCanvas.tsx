import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { deviceFramePresets, getLayout, getTheme, sanitizeLayerOpacity, slideLayerLabels } from '../data'
import { getSlideText } from '../lib/localization'
import type {
  CanvasMode,
  ExportProfile,
  LayerId,
  LayerSettings,
  LocaleId,
  Slide,
  SlideTransform,
} from '../types'
import { CanvasModeToggle } from './CanvasModeToggle'
import type { ExportStatus, PersistenceStatus } from './TopToolbar'

const persistenceLabel: Record<PersistenceStatus, string> = {
  loading: 'Loading local draft…',
  saving: 'Saving locally…',
  saved: 'Saved locally',
  error: 'Save failed',
  'open-error': 'Open failed',
}

interface SlideCanvasProps {
  slides: Slide[]
  selectedSlide: Slide
  selectedIndex: number
  selectedId: string
  mode: CanvasMode
  onModeChange: (mode: CanvasMode) => void
  onSelect: (id: string) => void
  onImport: (slideId?: string) => void
  onTransformChange: (slideId: string, position: Pick<SlideTransform, 'x' | 'y'>, mergeKey: string) => void
  selectedLayerId: LayerId
  onLayerSelect: (layerId: LayerId) => void
  onLayerTransformChange: (
    slideId: string,
    layerId: LayerId,
    position: Pick<SlideTransform, 'x' | 'y'>,
    mergeKey: string,
  ) => void
  persistenceStatus: PersistenceStatus
  persistenceDetail: string
  projectValidationNotice: string | null
  exportStatus: ExportStatus
  exportDetail: string
  exportCompleted: number
  exportTotal: number
  profile: ExportProfile
  locale: LocaleId
}

interface SlideRendererProps {
  slide: Slide
  slideNumber: number
  onImport: () => void
  profile: ExportProfile
  locale: LocaleId
  exportMode?: boolean
  onSelect?: (id: string) => void
  onTransformChange?: (slideId: string, position: Pick<SlideTransform, 'x' | 'y'>, mergeKey: string) => void
  selectedLayerId?: LayerId
  onLayerSelect?: (layerId: LayerId) => void
  onLayerTransformChange?: (
    slideId: string,
    layerId: LayerId,
    position: Pick<SlideTransform, 'x' | 'y'>,
    mergeKey: string,
  ) => void
}

interface CompositionDragState {
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  mergeKey: string
  active: boolean
  latestPosition: Pick<SlideTransform, 'x' | 'y'>
}

interface LayerDragState extends CompositionDragState {
  layerId: LayerId
}

const DRAG_THRESHOLD_PX = 4
const interactiveSelector = 'button, input, textarea, select, a, [contenteditable="true"]'

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest(interactiveSelector) !== null
}

const roundPosition = (position: Pick<SlideTransform, 'x' | 'y'>) => ({
  x: Math.round(position.x * 10) / 10,
  y: Math.round(position.y * 10) / 10,
})

const positionForPointer = (
  event: ReactPointerEvent<HTMLElement>,
  bounds: DOMRect,
  drag: CompositionDragState,
) => {
  if (bounds.width === 0 || bounds.height === 0) return null
  const deltaX = event.clientX - drag.startClientX
  const deltaY = event.clientY - drag.startClientY
  return roundPosition({
    x: drag.startX + (deltaX / bounds.width) * 100,
    y: drag.startY + (deltaY / bounds.height) * 100,
  })
}

const layerStyle = (
  transform: SlideTransform,
  settings: LayerSettings,
  dragPosition: Pick<SlideTransform, 'x' | 'y'> | null,
): CSSProperties => ({
  '--layer-transform-x': `${dragPosition?.x ?? transform.x}cqw`,
  '--layer-transform-y': `${dragPosition?.y ?? transform.y}cqh`,
  '--layer-transform-scale': transform.scale,
  '--layer-transform-scale-x': transform.scale * transform.widthScale,
  '--layer-transform-scale-y': transform.scale * transform.heightScale,
  '--layer-transform-flip-x': transform.flipX ? -1 : 1,
  '--layer-transform-flip-y': transform.flipY ? -1 : 1,
  '--layer-transform-rotation': `${transform.rotation}deg`,
  opacity: sanitizeLayerOpacity(settings.opacity),
} as unknown as CSSProperties)

function Placeholder({ onImport }: { onImport: () => void }) {
  return (
    <button className="device-placeholder" type="button" onClick={onImport}>
      <span className="device-placeholder__icon" aria-hidden="true">↑</span>
      <strong>Add your screenshot</strong>
      <span>PNG, JPG, or WebP</span>
    </button>
  )
}

export function SlideRenderer({
  slide,
  slideNumber,
  onImport,
  profile,
  locale,
  exportMode = false,
  onSelect,
  onTransformChange,
  selectedLayerId,
  onLayerSelect,
  onLayerTransformChange,
}: SlideRendererProps) {
  const theme = getTheme(slide.theme)
  const layout = getLayout(slide.layout)
  const deviceFrame = deviceFramePresets.find((preset) => preset.id === slide.deviceFrameId) ?? deviceFramePresets[0]
  const text = getSlideText(slide, locale)
  const compositionDragRef = useRef<CompositionDragState | null>(null)
  const layerDragRef = useRef<LayerDragState | null>(null)
  const dragSequenceRef = useRef(0)
  const [compositionDragPosition, setCompositionDragPosition] = useState<Pick<SlideTransform, 'x' | 'y'> | null>(null)
  const [layerDragPosition, setLayerDragPosition] = useState<{
    layerId: LayerId
    position: Pick<SlideTransform, 'x' | 'y'>
  } | null>(null)
  const [backgroundImageFailed, setBackgroundImageFailed] = useState(false)

  useEffect(() => {
    setBackgroundImageFailed(false)
  }, [slide.backgroundImage?.dataUrl])

  const startCompositionDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      exportMode
      || !onTransformChange
      || !event.isPrimary
      || event.button !== 0
      || isInteractiveTarget(event.target)
    ) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragSequenceRef.current += 1
    compositionDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: slide.transform.x,
      startY: slide.transform.y,
      mergeKey: `transform:${slide.id}:drag:${dragSequenceRef.current}`,
      active: false,
      latestPosition: { x: slide.transform.x, y: slide.transform.y },
    }
    onSelect?.(slide.id)
  }

  const continueCompositionDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = compositionDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.startClientX
    const deltaY = event.clientY - drag.startClientY
    if (!drag.active && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return

    const position = positionForPointer(event, event.currentTarget.getBoundingClientRect(), drag)
    if (!position) return
    drag.active = true
    drag.latestPosition = position
    setCompositionDragPosition(position)
    event.preventDefault()
  }

  const finishCompositionDragging = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const drag = compositionDragRef.current
    if (drag?.pointerId !== event.pointerId) return

    if (commit && drag.active) {
      const position = positionForPointer(event, event.currentTarget.getBoundingClientRect(), drag) ?? drag.latestPosition
      drag.latestPosition = position
      onTransformChange?.(slide.id, position, drag.mergeKey)
    }
    compositionDragRef.current = null
    setCompositionDragPosition(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const startLayerDragging = (layerId: LayerId, event: ReactPointerEvent<HTMLElement>) => {
    if (exportMode || !slide.layerSettings[layerId].visible || !event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    onLayerSelect?.(layerId)
    onSelect?.(slide.id)
    if (!onLayerTransformChange || isInteractiveTarget(event.target)) return

    const transform = slide.layerTransforms[layerId]
    event.currentTarget.setPointerCapture(event.pointerId)
    dragSequenceRef.current += 1
    layerDragRef.current = {
      layerId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: transform.x,
      startY: transform.y,
      mergeKey: `layer-transform:${slide.id}:${layerId}:drag:${dragSequenceRef.current}`,
      active: false,
      latestPosition: { x: transform.x, y: transform.y },
    }
  }

  const continueLayerDragging = (layerId: LayerId, event: ReactPointerEvent<HTMLElement>) => {
    const drag = layerDragRef.current
    if (!drag || drag.layerId !== layerId || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.startClientX
    const deltaY = event.clientY - drag.startClientY
    if (!drag.active && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return

    const canvas = event.currentTarget.closest<HTMLElement>('.slide-canvas')
    if (!canvas) return
    const position = positionForPointer(event, canvas.getBoundingClientRect(), drag)
    if (!position) return
    drag.active = true
    drag.latestPosition = position
    setLayerDragPosition({ layerId, position })
    event.preventDefault()
  }

  const finishLayerDragging = (layerId: LayerId, event: ReactPointerEvent<HTMLElement>, commit: boolean) => {
    const drag = layerDragRef.current
    if (drag?.layerId !== layerId || drag.pointerId !== event.pointerId) return

    if (commit && drag.active) {
      const canvas = event.currentTarget.closest<HTMLElement>('.slide-canvas')
      const position = (canvas
        ? positionForPointer(event, canvas.getBoundingClientRect(), drag)
        : null) ?? drag.latestPosition
      drag.latestPosition = position
      onLayerTransformChange?.(slide.id, layerId, position, drag.mergeKey)
    }
    layerDragRef.current = null
    setLayerDragPosition(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const layerClassName = (layerId: LayerId, className: string) => {
    const dragging = layerDragPosition?.layerId === layerId
    const selected = slide.layerSettings[layerId].visible && selectedLayerId === layerId
    return `${className} slide-layer${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`
  }

  const layerInteractionProps = (layerId: LayerId) => {
    if (!slide.layerSettings[layerId].visible) return { hidden: true, 'aria-hidden': true }
    if (exportMode) return {}
    return {
      role: 'button' as const,
      tabIndex: 0,
      'aria-label': `Select and position ${slideLayerLabels[layerId].toLowerCase()}`,
      'aria-pressed': selectedLayerId === layerId,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => startLayerDragging(layerId, event),
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => continueLayerDragging(layerId, event),
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finishLayerDragging(layerId, event, true),
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finishLayerDragging(layerId, event, false),
      onLostPointerCapture: () => {
        layerDragRef.current = null
        setLayerDragPosition(null)
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onLayerSelect?.(layerId)
          onSelect?.(slide.id)
        }
      },
    }
  }

  const transformForLayer = (layerId: LayerId) => layerStyle(
    slide.layerTransforms[layerId],
    slide.layerSettings[layerId],
    layerDragPosition?.layerId === layerId ? layerDragPosition.position : null,
  )
  const isDragging = compositionDragPosition !== null || layerDragPosition !== null

  return (
    <div
      className={`slide-canvas slide-canvas--${theme.id} slide-canvas--${layout.id} slide-canvas--device-${deviceFrame.id} slide-canvas--orientation-${profile.orientation} slide-canvas--${profile.deviceClass}${isDragging ? ' is-dragging' : ''}${exportMode ? ' slide-canvas--export' : ''}`}
      dir={locale === 'ar-SA' ? 'rtl' : 'ltr'}
      onPointerDown={startCompositionDragging}
      onPointerMove={continueCompositionDragging}
      onPointerUp={(event) => finishCompositionDragging(event, true)}
      onPointerCancel={(event) => finishCompositionDragging(event, false)}
      onLostPointerCapture={() => {
        compositionDragRef.current = null
        setCompositionDragPosition(null)
      }}
      style={{
        '--theme-from': theme.colors[0],
        '--theme-to': theme.colors[1],
        '--theme-background': theme.background ?? theme.colors[0],
        '--theme-text': theme.text ?? '#ffffff',
        '--theme-accent': theme.accent ?? theme.colors[1],
        '--slide-transform-x': `${compositionDragPosition?.x ?? slide.transform.x}%`,
        '--slide-transform-y': `${compositionDragPosition?.y ?? slide.transform.y}%`,
        '--slide-transform-scale': slide.transform.scale,
        '--slide-transform-scale-x': slide.transform.scale * slide.transform.widthScale,
        '--slide-transform-scale-y': slide.transform.scale * slide.transform.heightScale,
        '--slide-transform-flip-x': slide.transform.flipX ? -1 : 1,
        '--slide-transform-flip-y': slide.transform.flipY ? -1 : 1,
        '--slide-transform-rotation': `${slide.transform.rotation}deg`,
        ...(exportMode
          ? { width: profile.width, height: profile.height }
          : { aspectRatio: `${profile.width} / ${profile.height}` }),
      } as unknown as CSSProperties}
    >
      <div className="canvas-orb canvas-orb--one" />
      <div className="canvas-orb canvas-orb--two" />
      <div className="canvas-noise" />

      <div className="slide-canvas__content">
        <div
          className={layerClassName('background-image', 'canvas-background-image')}
          data-layer-id="background-image"
          style={transformForLayer('background-image')}
          {...layerInteractionProps('background-image')}
        >
          {slide.backgroundImage && !backgroundImageFailed && (
            <img
              src={slide.backgroundImage.dataUrl}
              alt={`Background image for slide ${slideNumber}`}
              draggable={false}
              onError={() => setBackgroundImageFailed(true)}
            />
          )}
        </div>
        <div
          className={layerClassName('accent-shape', `canvas-accent-shape canvas-accent-shape--${slide.accentShapeStyle.type}`)}
          data-layer-id="accent-shape"
          style={{
            ...transformForLayer('accent-shape'),
            backgroundColor: slide.accentShapeStyle.color,
          }}
          {...layerInteractionProps('accent-shape')}
        />
        {slide.appIcon && (
          <div
            className={layerClassName('app-icon', 'canvas-app-icon')}
            data-layer-id="app-icon"
            style={transformForLayer('app-icon')}
            {...layerInteractionProps('app-icon')}
          >
            <img
              src={slide.appIcon.dataUrl}
              alt={`App icon for slide ${slideNumber}`}
              draggable={false}
            />
          </div>
        )}
        <div
          className={layerClassName('kicker', 'canvas-kicker')}
          data-layer-id="kicker"
          style={transformForLayer('kicker')}
          {...layerInteractionProps('kicker')}
        >
          <span className="canvas-kicker__line" />
          <span>Meet your new workflow</span>
        </div>
        <h1
          className={layerClassName('headline', 'canvas-headline')}
          data-layer-id="headline"
          style={transformForLayer('headline')}
          {...layerInteractionProps('headline')}
        >
          {text.title.split('\n').map((line, index) => (
            <span key={`${index}-${line}`}>{line}</span>
          ))}
        </h1>
        {text.subtitle && (
          <p
            className={layerClassName('supporting-text', 'canvas-supporting-text')}
            data-layer-id="supporting-text"
            style={transformForLayer('supporting-text')}
            {...layerInteractionProps('supporting-text')}
          >
            {text.subtitle}
          </p>
        )}

        {(slide.screenshot || layout.id !== 'feature-graphic') && (
          <div
            className={layerClassName('screenshot', 'phone-wrap')}
            data-layer-id="screenshot"
            style={transformForLayer('screenshot')}
            {...layerInteractionProps('screenshot')}
          >
            <div className="phone">
              <div className="phone__speaker" />
              <div className="phone__screen">
                {slide.screenshot ? (
                  <img src={slide.screenshot} alt={`Screenshot for slide ${slideNumber}`} draggable={false} />
                ) : (
                  <Placeholder onImport={onImport} />
                )}
              </div>
            </div>
            <div className="phone-shadow" />
          </div>
        )}
      </div>

      <div
        className={layerClassName('footer', 'canvas-footer')}
        data-layer-id="footer"
        style={transformForLayer('footer')}
        {...layerInteractionProps('footer')}
      >
        <span>kami studio</span>
        <span className="canvas-footer__dot">✦</span>
        <span>Made for the moment</span>
      </div>
    </div>
  )
}

export function SlideCanvas({
  slides,
  selectedSlide,
  selectedIndex,
  selectedId,
  mode,
  onModeChange,
  onSelect,
  onImport,
  onTransformChange,
  selectedLayerId,
  onLayerSelect,
  onLayerTransformChange,
  persistenceStatus,
  persistenceDetail,
  projectValidationNotice,
  exportStatus,
  exportDetail,
  exportCompleted,
  exportTotal,
  profile,
  locale,
}: SlideCanvasProps) {
  const connectedSlideRefs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (mode !== 'connected') return
    connectedSlideRefs.current.get(selectedId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [mode, selectedId, slides.length])

  const selectSlideFromKeyboard = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect(id)
  }

  return (
    <main className="editor-workspace">
      <div className="canvas-toolbar">
        <div className="canvas-toolbar__group">
          <span className="format-dot" />
          <strong>{profile.name}</strong>
          <span>{profile.width} × {profile.height} px</span>
        </div>
        <div className="canvas-toolbar__group canvas-toolbar__group--muted">
          <CanvasModeToggle mode={mode} onChange={onModeChange} className="canvas-mode-toggle--canvas" />
          <span className="toolbar-separator" />
          <span>{mode === 'connected' ? `${slides.length} slides` : `${selectedIndex + 1} / ${String(slides.length).padStart(2, '0')}`}</span>
        </div>
      </div>

      {mode === 'isolated' ? (
        <div className="canvas-stage">
          <SlideRenderer
            slide={selectedSlide}
            slideNumber={selectedIndex + 1}
            onImport={() => onImport(selectedSlide.id)}
            profile={profile}
            locale={locale}
            onSelect={onSelect}
            onTransformChange={onTransformChange}
            selectedLayerId={selectedLayerId}
            onLayerSelect={onLayerSelect}
            onLayerTransformChange={onLayerTransformChange}
          />
        </div>
      ) : (
        <div className="canvas-stage canvas-stage--connected" aria-label="Connected slide canvas">
          <div className="connected-strip" role="list">
            {slides.map((slide, index) => (
              <div
                className={`connected-slide ${selectedId === slide.id ? 'is-selected' : ''}`}
                key={slide.id}
                ref={(element) => {
                  if (element) connectedSlideRefs.current.set(slide.id, element)
                  else connectedSlideRefs.current.delete(slide.id)
                }}
                role="listitem"
                tabIndex={0}
                aria-label={`Select slide ${index + 1}: ${slide.title.split('\n')[0]}`}
                aria-current={selectedId === slide.id}
                onClick={() => onSelect(slide.id)}
                onKeyDown={(event) => selectSlideFromKeyboard(event, slide.id)}
              >
                <div className="connected-slide__caption">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{slide.title.split('\n')[0] || 'Untitled slide'}</strong>
                </div>
                <SlideRenderer
                  slide={slide}
                  slideNumber={index + 1}
                  onImport={() => onImport(slide.id)}
                  profile={profile}
                  locale={locale}
                  onSelect={onSelect}
                  onTransformChange={onTransformChange}
                  selectedLayerId={selectedId === slide.id ? selectedLayerId : undefined}
                  onLayerSelect={onLayerSelect}
                  onLayerTransformChange={onLayerTransformChange}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="canvas-statusbar">
        <span><i className="online-dot" /> All changes live</span>
        <div className="canvas-statusbar__statuses">
          {exportStatus !== 'idle' && (
            <span
              className={`export-summary export-summary--${exportStatus}`}
              role="status"
              aria-live="polite"
              title={exportDetail}
            >
              {exportStatus === 'exporting'
                ? `Exporting ${exportCompleted}/${exportTotal}`
                : exportStatus === 'validation' || exportStatus === 'error'
                  ? exportDetail
                  : exportStatus === 'success'
                    ? 'ZIP ready'
                    : 'Export failed'}
            </span>
          )}
          <span
            className={`persistence-summary persistence-summary--${persistenceStatus}`}
            role="status"
            aria-live="polite"
            title={persistenceDetail}
          >
            {persistenceStatus === 'open-error'
               ? persistenceDetail
               : projectValidationNotice ?? `${persistenceLabel[persistenceStatus]} · Download JSON for Git`}
          </span>
        </div>
      </div>
    </main>
  )
}
