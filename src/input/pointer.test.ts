import { describe, expect, it, vi } from 'vitest'

import { attachPointerInput } from './pointer'

function harness() {
  const el = document.createElement('div')
  el.style.width = '200px'
  el.style.height = '200px'
  document.body.append(el)

  // A synthetic pointerId was never really down, so the real capture calls
  // would throw NotFoundError.
  el.setPointerCapture = vi.fn()
  el.releasePointerCapture = vi.fn()
  el.hasPointerCapture = vi.fn(() => false)

  const handlers = {
    onDrawCancel: vi.fn(),
    onDrawEnd: vi.fn(),
    onDrawMove: vi.fn(),
    onDrawStart: vi.fn(),
    onPan: vi.fn(),
    onZoom: vi.fn(),
  }

  const detach = attachPointerInput(el, handlers)

  return { detach, el, handlers }
}

function pointer(type: string, init: PointerEventInit) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerType: 'touch',
    ...init,
  })
}

function wheel(init: WheelEventInit) {
  return new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
}

describe('attachPointerInput', () => {
  it('starts a stroke on pointerdown, so a single tap draws', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 10, clientY: 20, pointerId: 1 }),
    )

    expect(handlers.onDrawStart).toHaveBeenCalledTimes(1)
  })

  it('reports coordinates relative to the element', () => {
    const { el, handlers } = harness()
    const box = el.getBoundingClientRect()

    el.dispatchEvent(
      pointer('pointerdown', {
        clientX: box.left + 10,
        clientY: box.top + 20,
        pointerId: 1,
      }),
    )

    expect(handlers.onDrawStart).toHaveBeenCalledWith(10, 20)
  })

  it('captures the pointer so a stroke survives leaving the element', () => {
    const { el } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 1, clientY: 1, pointerId: 7 }),
    )

    expect(el.setPointerCapture).toHaveBeenCalledWith(7)
  })

  it('reports movement while a stroke is in progress', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointermove', { clientX: 5, clientY: 5, pointerId: 1 }),
    )

    expect(handlers.onDrawMove).toHaveBeenCalledTimes(1)
  })

  it('ignores movement with no stroke in progress', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointermove', { clientX: 5, clientY: 5, pointerId: 1 }),
    )

    expect(handlers.onDrawMove).not.toHaveBeenCalled()
    expect(handlers.onPan).not.toHaveBeenCalled()
  })

  it('ends the stroke on pointerup', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointerup', { clientX: 0, clientY: 0, pointerId: 1 }),
    )

    expect(handlers.onDrawEnd).toHaveBeenCalledTimes(1)
  })

  it('ends the stroke when the pointer is cancelled by the system', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointercancel', { clientX: 0, clientY: 0, pointerId: 1 }),
    )

    expect(handlers.onDrawEnd).toHaveBeenCalledTimes(1)
  })

  it('does not keep drawing after the stroke ended', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointerup', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointermove', { clientX: 9, clientY: 9, pointerId: 1 }),
    )

    expect(handlers.onDrawMove).not.toHaveBeenCalled()
  })

  it('sets touch-action so the browser does not steal the gesture', () => {
    const { el } = harness()

    expect(el.style.touchAction).toBe('none')
  })

  it('removes its listeners on detach', () => {
    const { detach, el, handlers } = harness()

    detach()
    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )

    expect(handlers.onDrawStart).not.toHaveBeenCalled()
  })
})

describe('attachPointerInput gestures', () => {
  it('cancels a stroke in progress when a second pointer arrives', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointerdown', {
        clientX: 50,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )

    expect(handlers.onDrawCancel).toHaveBeenCalledTimes(1)
    expect(handlers.onDrawEnd).not.toHaveBeenCalled()
  })

  it('zooms in when two pointers move apart', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointerdown', {
        clientX: 100,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )
    el.dispatchEvent(
      pointer('pointermove', {
        clientX: 200,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )

    expect(handlers.onZoom).toHaveBeenCalledTimes(1)
    expect(handlers.onZoom.mock.calls[0][0]).toBeGreaterThan(1)
  })

  it('zooms out when two pointers move together', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointerdown', {
        clientX: 200,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )
    el.dispatchEvent(
      pointer('pointermove', {
        clientX: 100,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )

    expect(handlers.onZoom.mock.calls[0][0]).toBeLessThan(1)
  })

  it('pans by the displacement of the midpoint between two pointers', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointerdown', {
        clientX: 100,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )
    // Both fingers slide 10px right: distance unchanged, midpoint moves 10.
    el.dispatchEvent(
      pointer('pointermove', { clientX: 10, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointermove', {
        clientX: 110,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )

    const panX = handlers.onPan.mock.calls.reduce((sum, [dx]) => sum + dx, 0)

    expect(panX).toBeCloseTo(10, 0)
  })

  it('does not draw while two pointers are down', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    handlers.onDrawMove.mockClear()

    el.dispatchEvent(
      pointer('pointerdown', {
        clientX: 100,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )
    el.dispatchEvent(
      pointer('pointermove', { clientX: 40, clientY: 40, pointerId: 1 }),
    )

    expect(handlers.onDrawMove).not.toHaveBeenCalled()
  })

  it('does not resume drawing when one finger of a pinch lifts', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointerdown', {
        clientX: 100,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )
    el.dispatchEvent(
      pointer('pointerup', {
        clientX: 100,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )
    handlers.onDrawStart.mockClear()
    handlers.onDrawMove.mockClear()

    el.dispatchEvent(
      pointer('pointermove', { clientX: 60, clientY: 60, pointerId: 1 }),
    )

    expect(handlers.onDrawMove).not.toHaveBeenCalled()
    expect(handlers.onDrawStart).not.toHaveBeenCalled()
  })

  it('draws again once every pointer has lifted', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointerdown', {
        clientX: 100,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )
    el.dispatchEvent(
      pointer('pointerup', {
        clientX: 100,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )
    el.dispatchEvent(
      pointer('pointerup', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    handlers.onDrawStart.mockClear()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 5, clientY: 5, pointerId: 3 }),
    )

    expect(handlers.onDrawStart).toHaveBeenCalledTimes(1)
  })

  it('pans on a plain wheel event', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(wheel({ deltaX: 0, deltaY: 30 }))

    expect(handlers.onPan).toHaveBeenCalledTimes(1)
    expect(handlers.onZoom).not.toHaveBeenCalled()
  })

  it('zooms on a wheel event with ctrl held, as a trackpad pinch sends', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(wheel({ ctrlKey: true, deltaY: -30 }))

    expect(handlers.onZoom).toHaveBeenCalledTimes(1)
    expect(handlers.onZoom.mock.calls[0][0]).toBeGreaterThan(1)
    expect(handlers.onPan).not.toHaveBeenCalled()
  })

  it('zooms on a wheel event with the meta key, for macOS', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(wheel({ deltaY: -30, metaKey: true }))

    expect(handlers.onZoom).toHaveBeenCalledTimes(1)
  })

  it('pans with the middle mouse button instead of drawing', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', {
        button: 1,
        clientX: 0,
        clientY: 0,
        pointerId: 1,
        pointerType: 'mouse',
      }),
    )
    el.dispatchEvent(
      pointer('pointermove', {
        clientX: 15,
        clientY: 0,
        pointerId: 1,
        pointerType: 'mouse',
      }),
    )

    expect(handlers.onDrawStart).not.toHaveBeenCalled()
    expect(handlers.onPan).toHaveBeenCalledWith(15, 0)
  })

  it('removes the wheel listener on detach', () => {
    const { detach, el, handlers } = harness()

    detach()
    el.dispatchEvent(wheel({ deltaY: 30 }))

    expect(handlers.onPan).not.toHaveBeenCalled()
  })
})
