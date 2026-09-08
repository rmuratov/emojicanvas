export type PointerHandlers = {
  /**
   * The stroke in progress was abandoned rather than finished — a second
   * finger turned it into a gesture. The caller rolls the scene back; this
   * layer never touches the scene.
   */
  onDrawCancel(): void
  onDrawEnd(): void
  onDrawMove(px: number, py: number): void
  onDrawStart(px: number, py: number): void
  /**
   * The pointer moved by (dx, dy) screen pixels and the content should
   * follow it. The camera moves the opposite way; that inversion belongs to
   * the caller, not here.
   */
  onPan(dx: number, dy: number): void
  onZoom(factor: number, anchorPx: number, anchorPy: number): void
}


/** How far a wheel notch zooms. Tuned so one notch is a gentle step. */
const WHEEL_ZOOM_SENSITIVITY = 0.002

const MIDDLE_BUTTON = 1

type Point = { px: number; py: number }

/**
 * Turns Pointer Events into drawingand navigation callbacks. One code path
 * serves mouse, finger and stylus; the old engine had separate mouse* and
 * touch* handlers, which is how a single tap came to do nothing on mobile.
 *
 * One pointer draws, two pointers navigate: the distance between them gives
 * zoom, the displacement of their midpoint gives pan. A second finger never
 * lands at the same instant as the first, so by the time a pinch is
 * recognisable a stroke is already under way; that stroke is abandoned
 * through onDrawCancel rather than finished, or every pinch would leave a
 * stray line.
 *
 * Every coordinate handed to a handler is in screen pixels relative to the
 * element's top-left corner. This layer knows nothing about cameras, zoom or
 * cells: the caller owns the camera, so the caller does the conversion.
 *
 * Returns a function that removes everything this one attached.
 */
export function attachPointerInput(
  el: HTMLElement,
  handlers: PointerHandlers,
): () => void {
  const active = new Map<number, Point>()

  let drawingPointerId: null | number = null
  let panningPointerId: null | number = null
  let pinchDistance = 0
  let pinchMidX = 0
  let pinchMidY = 0
  // After a pinch, the finger still down must not resume the stroke: it
  // would draw a line from wherever it happens to be. Drawing waits for a
  // clean slate.
  let suppressUntilAllUp = false

  // Without this the browser treats a drag as a scroll or a page zoom and
  // the stroke never reaches us.
  el.style.touchAction = 'none'

  function localPoint(event: PointerEvent): Point {
    const box = el.getBoundingClientRect()

    return { px: event.clientX - box.left, py: event.clientY - box.top }
  }

  function pinchPoints(): [Point, Point] {
    const [first, second] = active.values()

    return [first, second]
  }

  function onPointerDown(event: PointerEvent): void {
    active.set(event.pointerId, localPoint(event))
    el.setPointerCapture(event.pointerId)

    if (active.size >= 2) {
      // A pinch was born out of a stroke already under way. Abandon it —
      // finishing it would commit a line the user never meant to draw.
      if (drawingPointerId !== null) {
        drawingPointerId = null
        handlers.onDrawCancel()
      }

      suppressUntilAllUp = true
      panningPointerId = null

      const [a, b] = pinchPoints()

      pinchDistance = Math.hypot(a.px - b.px, a.py - b.py)
      pinchMidX = (a.px + b.px) / 2
      pinchMidY = (a.py + b.py) / 2

      return
    }

    if (event.button === MIDDLE_BUTTON) {
      panningPointerId = event.pointerId
      return
    }

    if (suppressUntilAllUp || drawingPointerId !== null) return

    drawingPointerId = event.pointerId

    const { px, py } = localPoint(event)

    handlers.onDrawStart(px, py)
  }

  function onPointerMove(event: PointerEvent): void {
    const previous = active.get(event.pointerId)

    if (!previous) return

    const point = localPoint(event)

    active.set(event.pointerId, point)

    if (active.size >= 2) {
      const [a, b] = pinchPoints()
      const distance = Math.hypot(a.px - b.px, a.py - b.py)
      const midX = (a.px + b.px) / 2
      const midY = (a.py + b.py) / 2

      if (midX !== pinchMidX || midY !== pinchMidY) {
        handlers.onPan(midX - pinchMidX, midY - pinchMidY)
      }

      if (pinchDistance > 0 && distance > 0 && distance !== pinchDistance) {
        handlers.onZoom(distance / pinchDistance, midX, midY)
      }

      pinchDistance = distance
      pinchMidX = midX
      pinchMidY = midY

      return
    }

    if (event.pointerId === panningPointerId) {
      handlers.onPan(point.px - previous.px, point.py - previous.py)
      return
    }

    if (event.pointerId !== drawingPointerId) return

    handlers.onDrawMove(point.px, point.py)
  }

  function onPointerUp(event: PointerEvent): void {
    active.delete(event.pointerId)

    if (el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId)
    }

    if (event.pointerId === panningPointerId) {
      panningPointerId = null
    }

    if (event.pointerId === drawingPointerId) {
      drawingPointerId = null
      handlers.onDrawEnd()
    }

    if (active.size === 0) {
      suppressUntilAllUp = false
    } else if (active.size === 1) {
      // Back to one finger after a pinch. Nothing is re-anchored and nothing
      // is drawn; suppressUntilAllUp keeps it that way.
      pinchDistance = 0
    }
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault()

    const box = el.getBoundingClientRect()

    if (event.ctrlKey || event.metaKey) {
      // A trackpad pinch reaches the browser as a ctrl-wheel event.
      handlers.onZoom(
        Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY),
        event.clientX - box.left,
        event.clientY - box.top,
      )

      return
    }

    handlers.onPan(-event.deltaX, -event.deltaY)
  }

  el.addEventListener('pointercancel', onPointerUp)
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    el.removeEventListener('pointercancel', onPointerUp)
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
    el.removeEventListener('wheel', onWheel)
  }
}
