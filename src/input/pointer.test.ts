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

  it('abandons the stroke when the pointer is cancelled by the system', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
    )
    el.dispatchEvent(
      pointer('pointercancel', { clientX: 0, clientY: 0, pointerId: 1 }),
    )

    expect(handlers.onDrawCancel).toHaveBeenCalledTimes(1)
    expect(handlers.onDrawEnd).not.toHaveBeenCalled()
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

describe('pointer edge cases', () => {
  it('ignores secondary clicks and repeated presses from an active pointer', () => {
    const { el, handlers } = harness()
    const send = (type: string, pointerId: number, button = 0) =>
      el.dispatchEvent(pointer(type, { button, pointerId }))

    send('pointerdown', 1, 2)
    expect(handlers.onDrawStart).not.toHaveBeenCalled()

    send('pointerdown', 1)
    send('pointerdown', 1)
    expect(handlers.onDrawStart).toHaveBeenCalledTimes(1)

    send('pointerdown', 2)
    send('pointerup', 2)
    send('pointerdown', 1)
    expect(handlers.onDrawStart).toHaveBeenCalledTimes(1)
  })

  it('releases the middle-button pan and drops hover outside its capture', () => {
    const el = document.createElement('div')
    const box = new DOMRect(20, 30, 100, 100)
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(box)
    el.setPointerCapture = vi.fn()
    el.releasePointerCapture = vi.fn()
    el.hasPointerCapture = vi.fn(() => true)
    const onPan = vi.fn()
    const onHover = vi.fn()
    const onDrawStart = vi.fn()
    const detach = attachPointerInput(el, {
      onDrawCancel: vi.fn(),
      onDrawEnd: vi.fn(),
      onDrawMove: vi.fn(),
      onDrawStart,
      onHover,
      onPan,
      onZoom: vi.fn(),
    })

    const send = (type: string, x: number, button = 0) =>
      el.dispatchEvent(
        pointer(type, {
          button,
          clientX: x,
          clientY: 50,
          pointerId: 1,
          pointerType: 'mouse',
        }),
      )

    send('pointermove', 40)
    expect(onHover).toHaveBeenLastCalledWith({ px: 20, py: 20 })
    send('pointerdown', 40, 1)
    send('pointermove', 70)
    expect(onPan).toHaveBeenCalledWith(30, 0)
    send('pointerup', 140, 1)
    expect(el.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(onHover).toHaveBeenLastCalledWith(null)
    send('pointerdown', 40)
    expect(onDrawStart).toHaveBeenCalledTimes(1)
    detach()
  })

  it('keeps a three-pointer gesture active after one contact is lifted', () => {
    const { el, handlers } = harness()
    const send = (
      type: string,
      pointerId: number,
      clientX: number,
      clientY = 10,
    ) => el.dispatchEvent(pointer(type, { clientX, clientY, pointerId }))

    send('pointerdown', 1, 10)
    send('pointerdown', 2, 50)
    send('pointerdown', 3, 90)
    send('pointerup', 3, 90)
    send('pointermove', 2, 50)
    expect(handlers.onPan).not.toHaveBeenCalled()
    expect(handlers.onZoom).not.toHaveBeenCalled()
    send('pointermove', 2, 50, 30)
    expect(handlers.onPan).toHaveBeenCalledWith(0, 10)
    expect(handlers.onZoom).toHaveBeenCalledTimes(1)
    expect(handlers.onDrawMove).not.toHaveBeenCalled()
  })
})
