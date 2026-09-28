import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { getLayout, getTheme, sanitizeLayerOpacity, slideLayerLabels } from '../data'
import { getBackgroundFillStyle, measureIntrinsicSize, resolveBackgroundFill } from '../lib/backgroundFill'
import { getDeviceFramePreset, getDeviceFrameStyle } from '../lib/devicePresets'
import { describeCanvasGuides, untransformRect, type CanvasSize, type LayerRect } from '../lib/layerGeometry'
import { layerOrderZIndex } from '../lib/layerOrder'
import { nudgeMergeKey, nudgePayload, type TextDirection } from '../lib/layerNudge'
import { getSlideText } from '../lib/localization'
import type { KamiCapturePayload } from '../lib/screenshotDrop'
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
import { DeviceAperture } from './DeviceAperture'
import type { ExportStatus, PersistenceStatus } from './TopToolbar'

const persistenceLabel: Record<PersistenceStatus, string> = {
  loading: 'Loading local draft…',
  saving: 'Saving locally…',
  saved: 'Saved locally',
  error: 'Save failed',
  'open-error': 'Open failed',
}

export interface SlideCanvasProps {
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
  /**
   * Image files dropped on a slide's empty aperture. Optional so the export
   * stage and every other renderer of this canvas can leave it out.
   */
  onDropFilesOnSlide?: (slideId: string, files: File[]) => void
  /** A capture dragged from another slide onto a slide's empty aperture. */
  onDropCaptureOnSlide?: (slideId: string, capture: KamiCapturePayload) => void
  /**
   * Draws the canvas guides over the artwork. Editor-only: the export stage never
   * asks for them, and nothing about them reaches an exported PNG.
   */
  showGuides?: boolean
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
  onDropFiles?: (slideId: string, files: File[]) => void
  onDropCapture?: (slideId: string, capture: KamiCapturePayload) => void
  showGuides?: boolean
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

/**
 * A keyboard event from either a React handler or a window listener.
 *
 * The nudge has to work when a layer has focus and when nothing does, and the
 * two arrive as different event types. This is the intersection both satisfy.
 */
type NudgeSourceEvent = {
  key: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  target: EventTarget | null
  currentTarget: EventTarget | null
}

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

/** The subset of a keyboard event the nudge resolver reads. */
const nudgeEventFrom = (event: NudgeSourceEvent) => ({
  key: event.key,
  shiftKey: event.shiftKey,
  altKey: event.altKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  targetTagName: (event.target as HTMLElement | null)?.tagName ?? null,
})

/** Reading direction of a slide, which mirrors the horizontal nudge keys. */
const localeDirection = (locale: LocaleId): TextDirection => (locale === 'ar-SA' ? 'rtl' : 'ltr')

/**
 * Measures a layer's untransformed box against its own canvas.
 *
 * `element` is the layer, or null when the key arrived with focus elsewhere, in
 * which case the layer is looked up inside the nearest canvas. The canvas falls
 * back to the export profile when there is no live box to measure, which keeps a
 * nudge working before the canvas has been laid out: it simply skips the clamp.
 */
const measureLayerBase = (
  element: HTMLElement | null,
  layerId: LayerId,
  transform: Pick<SlideTransform, 'x' | 'y'>,
  fallback: CanvasSize,
): { canvas: CanvasSize; base: LayerRect | null } => {
  const canvasElement = element?.closest<HTMLElement>('.slide-canvas') ?? null
  const canvasRect = canvasElement?.getBoundingClientRect()
  if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) {
    return { canvas: fallback, base: null }
  }

  const canvas: CanvasSize = { width: canvasRect.width, height: canvasRect.height }
  const layerElement = element
    ?? canvasElement?.querySelector<HTMLElement>(`[data-layer-id="${layerId}"]`)
    ?? null
  const layerRect = layerElement?.getBoundingClientRect()
  if (!layerRect) return { canvas, base: null }

  const measured: LayerRect = {
    left: layerRect.left - canvasRect.left,
    top: layerRect.top - canvasRect.top,
    right: layerRect.right - canvasRect.left,
    bottom: layerRect.bottom - canvasRect.top,
  }
  return { canvas, base: untransformRect(measured, transform, canvas) }
}

/**
 * Commits one keyboard nudge for a layer and reports whether the key was one.
 *
 * The focused layer and the window listener that covers a canvas with nothing
 * focused both call this, so the rules about which keys nudge, which tags own
 * their own arrows, and where the canvas edge stops a layer exist once.
 */
const commitLayerNudge = (
  slide: Slide,
  layerId: LayerId,
  event: NudgeSourceEvent,
  element: HTMLElement | null,
  direction: TextDirection,
  profile: ExportProfile,
  onLayerTransformChange: SlideCanvasProps['onLayerTransformChange'] | undefined,
): boolean => {
  if (!onLayerTransformChange || !slide.layerSettings[layerId]?.visible) return false
  const likeEvent = nudgeEventFrom(event)
  const mergeKey = nudgeMergeKey(slide.id, layerId, likeEvent)
  if (mergeKey === null) return false

  const transform = slide.layerTransforms[layerId]
  const { canvas, base } = measureLayerBase(element, layerId, transform, {
    width: profile.width,
    height: profile.height,
  })
  const payload = nudgePayload({ transform, event: likeEvent, direction, canvas, base })
  if (!payload) return false

  onLayerTransformChange(slide.id, layerId, payload.position, mergeKey)
  return true
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
  onDropFiles,
  onDropCapture,
  showGuides = false,
}: SlideRendererProps) {
  const theme = getTheme(slide.theme)
  const layout = getLayout(slide.layout)
  // The frame geometry comes from the catalog, so the preview, the connected
  // strip, and the export stage all draw the same device from the same numbers.
  const deviceFrame = getDeviceFramePreset(slide.deviceFrameId)
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
  /**
   * The background image's real intrinsic size, read off the image element.
   *
   * The stored size is only a hint, and a hand-edited project can claim any
   * aspect it likes, so the measured value wins as soon as there is one. This is
   * local state on purpose: it corrects how the canvas draws without writing
   * back into the project behind the author's back. The export does not read it
   * — it measures the same element itself, immediately before rasterising, so a
   * PNG never depends on when this state committed.
   */
  const [backgroundIntrinsicSize, setBackgroundIntrinsicSize] = useState<{ width: number; height: number } | null>(null)
  const backgroundImageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    setBackgroundImageFailed(false)
    setBackgroundIntrinsicSize(null)
    /*
     * Read the size off the element as well as listening for the event.
     *
     * A data URL the browser has already decoded never fires `load` again, and a
     * framework does not replay a load event that fired before its handler was
     * attached. So `onLoad` alone is not a reliable way to learn a size: a slide
     * whose backdrop is warm in the memory cache renders at the stored hint's
     * scale forever, which for a deck that stored no hint is a permanently
     * missing panoramic bleed.
     *
     * The element is authoritative and needs no event, so this is the primary
     * read — it covers the warm-cache case the event cannot — and `onLoad` is
     * what covers an image still on its way. Between them there is no window in
     * which the element has a size and this state does not.
     */
    setBackgroundIntrinsicSize(measureIntrinsicSize(backgroundImageRef.current))
  }, [slide.backgroundImage?.dataUrl])

  /**
   * The whole background fill, resolved to CSS custom properties.
   *
   * The renderer never branches on the fill kind. Everything visual is a
   * variable the stylesheet reads, which is the only way the editor preview and
   * the export stage can be guaranteed to draw the same canvas from the same
   * code path.
   */
  const backgroundFill = resolveBackgroundFill(slide.backgroundFill)
  const backgroundFillStyle = getBackgroundFillStyle({
    fill: backgroundFill,
    focalPoint: slide.backgroundFocalPoint,
    themeId: slide.theme,
    intrinsicSize: backgroundIntrinsicSize ?? slide.backgroundImage,
    profileAspectRatio: profile.width / profile.height,
  })

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
          return
        }
        // A nudge only applies to the layer the tray is already editing, so an
        // arrow on some other layer does not silently move the wrong thing.
        if (selectedLayerId !== layerId) return
        if (commitLayerNudge(
          slide,
          layerId,
          event,
          event.currentTarget as HTMLElement,
          localeDirection(locale),
          profile,
          onLayerTransformChange,
        )) event.preventDefault()
      },
    }
  }

  const transformForLayer = (layerId: LayerId) => layerStyle(
    slide.layerTransforms[layerId],
    slide.layerSettings[layerId],
    layerDragPosition?.layerId === layerId ? layerDragPosition.position : null,
  )

  /**
   * A custom stacking order is the only thing that overrides the stylesheet
   * `z-index`, and it overrides it inside the content wrapper's own stacking
   * context. A slide without an order gets no inline value at all, so nothing
   * about the existing appearance depends on this.
   */
  const layerStyleFor = (layerId: LayerId): CSSProperties => {
    const zIndex = layerOrderZIndex(slide.layerOrder, layerId)
    return zIndex === undefined
      ? transformForLayer(layerId)
      : { ...transformForLayer(layerId), zIndex }
  }

  const isDragging = compositionDragPosition !== null || layerDragPosition !== null
  const guides = describeCanvasGuides({ width: profile.width, height: profile.height })
  const guidesVisible = showGuides && !exportMode

  return (
    <div
      data-slide-id={slide.id}
      data-background-fill={backgroundFill.kind}
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
        ...backgroundFillStyle,
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
          style={layerStyleFor('background-image')}
          {...layerInteractionProps('background-image')}
        >
          {slide.backgroundImage && !backgroundImageFailed && (
            <img
              ref={backgroundImageRef}
              src={slide.backgroundImage.dataUrl}
              alt={`Background image for slide ${slideNumber}`}
              draggable={false}
              onError={() => setBackgroundImageFailed(true)}
              onLoad={() => {
                // The value is read off the element either way; what this handler
                // is for is the render. An image decoding does not re-render
                // anything by itself, so without it the measurement below would
                // sit in state until something unrelated caused a commit.
                setBackgroundIntrinsicSize(measureIntrinsicSize(backgroundImageRef.current))
              }}
            />
          )}
        </div>
        <div
          className={layerClassName('accent-shape', `canvas-accent-shape canvas-accent-shape--${slide.accentShapeStyle.type}`)}
          data-layer-id="accent-shape"
          style={{
            ...layerStyleFor('accent-shape'),
            backgroundColor: slide.accentShapeStyle.color,
          }}
          {...layerInteractionProps('accent-shape')}
        />
        {slide.appIcon && (
          <div
            className={layerClassName('app-icon', 'canvas-app-icon')}
            data-layer-id="app-icon"
            style={layerStyleFor('app-icon')}
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
          style={layerStyleFor('kicker')}
          {...layerInteractionProps('kicker')}
        >
          <span className="canvas-kicker__line" />
          <span>Meet your new workflow</span>
        </div>
        <h1
          className={layerClassName('headline', 'canvas-headline')}
          data-layer-id="headline"
          style={layerStyleFor('headline')}
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
            style={layerStyleFor('supporting-text')}
            {...layerInteractionProps('supporting-text')}
          >
            {text.subtitle}
          </p>
        )}

        {(slide.screenshot || layout.id !== 'feature-graphic') && (
          <div
            className={layerClassName('screenshot', 'phone-wrap')}
            data-layer-id="screenshot"
            data-device-frameless={deviceFrame.family === 'frameless' ? 'true' : 'false'}
            style={{ ...layerStyleFor('screenshot'), ...getDeviceFrameStyle(deviceFrame.id) }}
            {...layerInteractionProps('screenshot')}
          >
            <div className="phone">
              <DeviceAperture
                slide={slide}
                slideId={slide.id}
                screenshot={slide.screenshot}
                slideNumber={slideNumber}
                onImport={onImport}
                /*
                 * The export stage renders every slide, placeholder included, so
                 * the drop handlers are withheld there: an exported PNG is the
                 * artwork alone, and nothing on it accepts a file.
                 */
                onDropFiles={exportMode ? undefined : onDropFiles}
                onDropCapture={exportMode ? undefined : onDropCapture}
              />
            </div>
            <div className="phone-shadow" />
          </div>
        )}
      </div>

      <div
        className={layerClassName('footer', 'canvas-footer')}
        data-layer-id="footer"
        style={layerStyleFor('footer')}
        {...layerInteractionProps('footer')}
      >
        <span>kami studio</span>
        <span className="canvas-footer__dot">✦</span>
        <span>Made for the moment</span>
      </div>

      {/*
        Authoring guides. They sit above the artwork, take no pointer, and are
        skipped entirely in the export stage, so an exported PNG is the artwork
        alone. The inline `pointer-events` is the part that has to hold even if a
        stylesheet fails to load.
      */}
      {guidesVisible && (
        <div
          className="canvas-guides"
          data-canvas-guides=""
          style={{ pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <div
            className="canvas-guide-safe-area"
            style={{
              top: `${guides.safeAreaInset.top}%`,
              right: `${guides.safeAreaInset.right}%`,
              bottom: `${guides.safeAreaInset.bottom}%`,
              left: `${guides.safeAreaInset.left}%`,
            }}
          />
          {guides.lines.map((line) => (
            <div
              key={line.id}
              className={`canvas-guide canvas-guide--${line.orientation} canvas-guide--${line.kind}`}
              data-guide={line.id}
              style={line.orientation === 'vertical' ? { left: `${line.positionPercent}%` } : { top: `${line.positionPercent}%` }}
            />
          ))}
        </div>
      )}
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
  onDropFilesOnSlide,
  onDropCaptureOnSlide,
  showGuides = false,
}: SlideCanvasProps) {
  const connectedSlideRefs = useRef(new Map<string, HTMLDivElement>())
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode !== 'connected') return
    connectedSlideRefs.current.get(selectedId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [mode, selectedId, slides.length])

  /**
   * Nudges the selected layer from anywhere on the page.
   *
   * A layer that has focus handles its own arrows, and it prevents the default
   * when it does, so the `defaultPrevented` guard keeps the two paths from
   * nudging twice. This listener exists for the far more common case: the author
   * has just dragged with the mouse and the focus is still on the canvas.
   */
  useEffect(() => {
    const handleNudgeKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return
      const element = stageRef.current
        ?.querySelector<HTMLElement>(`.slide-canvas[data-slide-id="${selectedId}"] [data-layer-id="${selectedLayerId}"]`)
        ?? null
      if (commitLayerNudge(
        selectedSlide,
        selectedLayerId,
        event,
        element,
        localeDirection(locale),
        profile,
        onLayerTransformChange,
      )) event.preventDefault()
    }

    window.addEventListener('keydown', handleNudgeKey)
    return () => window.removeEventListener('keydown', handleNudgeKey)
  }, [locale, onLayerTransformChange, profile, selectedId, selectedLayerId, selectedSlide])

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
        <div className="canvas-stage" ref={stageRef}>
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
            onDropFiles={onDropFilesOnSlide}
            onDropCapture={onDropCaptureOnSlide}
            showGuides={showGuides}
          />
        </div>
      ) : (
        <div className="canvas-stage canvas-stage--connected" aria-label="Connected slide canvas" ref={stageRef}>
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
                  onDropFiles={onDropFilesOnSlide}
                  onDropCapture={onDropCaptureOnSlide}
                  showGuides={showGuides}
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
