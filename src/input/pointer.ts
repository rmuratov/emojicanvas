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

/**
 * Turns Pointer Events into drawing and navigation callbacks. One code path
 * serves mouse, finger and stylus; the old engine had separate mouse* and
 * touch* handlers, which is how a single tap came to do nothing on mobile.
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
  let drawingPointerId: null | number = null

  // Without this the browser treats a drag as a scroll or a page zoom and
  // the stroke never reaches us.
  el.style.touchAction = 'none'

  function localX(event: PointerEvent): number {
    return event.clientX - el.getBoundingClientRect().left
  }

  function localY(event: PointerEvent): number {
    return event.clientY - el.getBoundingClientRect().top
  }

  function onPointerDown(event: PointerEvent): void {
    if (drawingPointerId !== null) return

    drawingPointerId = event.pointerId
    el.setPointerCapture(event.pointerId)
    handlers.onDrawStart(localX(event), localY(event))
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== drawingPointerId) return

    handlers.onDrawMove(localX(event), localY(event))
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== drawingPointerId) return

    drawingPointerId = null

    if (el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId)
    }

    handlers.onDrawEnd()
  }

  el.addEventListener('pointercancel', onPointerUp)
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)

  return () => {
    el.removeEventListener('pointercancel', onPointerUp)
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
  }
}
