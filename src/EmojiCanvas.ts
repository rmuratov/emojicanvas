export class EmojiCanvas {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private matrix: string[][]
  private isDrawing = false
  private brush = '❤️'
  private columnsCount = 12
  private rowsCount = 12
  private cellWidth = 30 // px
  private cellHeight = 30 // px
  private borderWidth = 1 // px
  private gridBackgroundColor = 'white'
  private borderColor = 'darkgrey'
  private emojiOffsetInsideCellX = 0
  private emojiOffsetInsideCellY = 2.5
  private filler = '〰️'
  private readonly onErasingStatusChange?: (isErasing: boolean) => void

  constructor(
    containerElement: HTMLElement,
    brush?: string,
    onErasingStatusChange?: (isErasing: boolean) => void,
  ) {
    if (containerElement.hasChildNodes()) {
      throw new Error('Container element is not empty.')
    }

    const { canvas, ctx } = this.initCanvas(containerElement)

    this.canvas = canvas
    this.ctx = ctx

    this.matrix = this.initMatrix()

    this.drawGrid()

    if (brush) {
      this.setBrush(brush)
    }

    this.onErasingStatusChange = onErasingStatusChange

    canvas.addEventListener('mousedown', this.handleMouseDown)
    canvas.addEventListener('mouseup', this.handleMouseUp)
    canvas.addEventListener('mousemove', this.handleMouseMoveDrawEmoji)
    canvas.addEventListener('mouseleave', this.handleMouseLeave)

    canvas.addEventListener('touchstart', this.handleMouseDown)
    canvas.addEventListener('touchmove', this.handleTouchMoveDrawEmoji)
    canvas.addEventListener('touchend', this.handleMouseLeave)
  }

  private handleMouseMoveDrawEmoji = (event: MouseEvent) => {
    if (this.isDrawing) {
      const position = this.getBrushEventPosition(event)
      if (position) {
        this.drawEmoji(position)
      }
    }
  }

  private handleMouseDown = () => {
    if (!this.isDrawing) {
      this.isDrawing = true
    }
  }

  private handleMouseUp = (event: MouseEvent) => {
    if (this.isDrawing) {
      const position = this.getBrushEventPosition(event)
      if (position) {
        this.drawEmoji(position)
      }
      this.isDrawing = false
    }
  }

  private handleMouseLeave = () => {
    if (this.isDrawing) {
      this.isDrawing = false
    }
  }

  private handleTouchMoveDrawEmoji = (event: TouchEvent) => {
    if (this.isDrawing) {
      for (const evt of event.touches) {
        const position = this.getBrushEventPosition(evt)
        if (position) {
          this.drawEmoji(position)
        }
      }
    }
  }

  private initMatrix(): string[][] {
    return Array.from({ length: this.columnsCount }, () =>
      Array(this.rowsCount).fill(this.filler),
    )
  }

  private drawEmoji(position: BrushEventPosition) {
    const { canvasX, canvasY, gridX, gridY } = position

    this.clearCell(canvasX, canvasY)
    this.fillMatrixCell(gridX, gridY, this.brush)

    if (!this.isErasing()) {
      this.ctx.fillText(
        this.brush,
        canvasX + this.cellWidth / 2 + this.emojiOffsetInsideCellX,
        canvasY + this.cellHeight / 2 + this.emojiOffsetInsideCellY,
      )
    }
  }

  private fillMatrixCell(gridX: number, gridY: number, value: string) {
    if (!this.matrix[gridX]?.[gridY] || this.matrix[gridX][gridY] === value) {
      return
    }

    this.matrix[gridX][gridY] = value
  }

  private clearCell(x: number, y: number) {
    this.ctx.fillRect(x, y, this.cellWidth, this.cellHeight)
  }

  private drawGrid() {
    this.ctx.lineWidth = 1
    this.ctx.strokeStyle = this.borderColor

    const canvasWidth = this.calculateInitialCanvasWidthInPx()
    const canvasHeight = this.calculateInitialCanvasHeightInPx()
    const { cellWidth, cellHeight, borderWidth } = this

    this.ctx.fillStyle = this.gridBackgroundColor
    this.ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    this.ctx.save()
    this.ctx.translate(0.5, 0.5)

    // Vertical lines
    for (let x = 0; x <= canvasWidth; x += cellWidth + borderWidth) {
      this.ctx.beginPath()
      this.ctx.moveTo(x, 0)
      this.ctx.lineTo(x, canvasHeight)
      this.ctx.stroke()
    }

    // Horizontal lines
    for (let y = 0; y <= canvasHeight; y += cellHeight + borderWidth) {
      this.ctx.beginPath()
      this.ctx.moveTo(0, y)
      this.ctx.lineTo(canvasWidth, y)
      this.ctx.stroke()
    }
    this.ctx.restore()

    this.ctx.font = `${cellHeight}px "Twemoji Mozilla", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", sans-serif`

    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
  }

  private calculateInitialCanvasWidthInPx() {
    return (
      this.columnsCount * this.cellWidth +
      (this.columnsCount + 1) * this.borderWidth
    )
  }

  private calculateInitialCanvasHeightInPx() {
    return (
      this.rowsCount * this.cellHeight + (this.rowsCount + 1) * this.borderWidth
    )
  }

  private initCanvas(containerElement: HTMLElement) {
    const initialCanvasWidthPx = this.calculateInitialCanvasWidthInPx()
    const initialCanvasHeightPx = this.calculateInitialCanvasHeightInPx()

    const canvas = document.createElement('canvas')

    canvas.id = 'canvas'
    canvas.width = initialCanvasWidthPx
    canvas.height = initialCanvasHeightPx

    containerElement.appendChild(canvas)

    this.canvas = canvas

    const ctx = canvas.getContext('2d', { alpha: false })

    if (!ctx) {
      throw new Error(
        'Context identifier is not supported, or the canvas has already been set to a different context mode.',
      )
    }

    const dpr = window.devicePixelRatio
    const canvasBoundingClientRect = canvas.getBoundingClientRect()

    canvas.width = canvasBoundingClientRect.width * dpr
    canvas.height = canvasBoundingClientRect.height * dpr

    canvas.style.width = `${canvasBoundingClientRect.width}px`
    canvas.style.height = `${canvasBoundingClientRect.height}px`

    ctx.scale(dpr, dpr)

    return { canvas, ctx }
  }

  private getBrushEventPosition(
    evt: MouseEvent | Touch,
  ): BrushEventPosition | null {
    if (!(evt.target instanceof Element)) return null

    const canvasBoundingClientRect = this.canvas.getBoundingClientRect()
    const x = evt.clientX - canvasBoundingClientRect.left
    const y = evt.clientY - canvasBoundingClientRect.top

    if (x < 0 || y < 0) return null

    const { cellWidth, cellHeight, borderWidth } = this

    const gridX = Math.ceil(x / (cellWidth + borderWidth)) - 1
    const gridY = Math.ceil(y / (cellHeight + borderWidth)) - 1

    const canvasX = cellWidth * gridX + borderWidth * (gridX + 1)
    const canvasY = cellHeight * gridY + borderWidth * (gridY + 1)

    return { canvasX, canvasY, gridX, gridY }
  }

  getDrawingAsString() {
    let res = ''
    for (let i = 0; i < this.rowsCount; i++) {
      for (let j = 0; j < this.columnsCount; j++) {
        res += this.matrix[j][i]
      }

      if (i != this.rowsCount - 1) {
        res += '\n'
      }
    }

    return res
  }

  setBrush = (brush: string) => {
    this.brush = brush
    this.onErasingStatusChange?.(brush === this.filler)
  }

  clear = () => {
    this.matrix = this.initMatrix()
    this.drawGrid()
  }

  setErasingMode = () => {
    this.setBrush(this.filler)
  }

  isErasing = () => {
    return this.brush === this.filler
  }
}

type BrushEventPosition = {
  canvasX: number
  canvasY: number
  gridX: number
  gridY: number
}
