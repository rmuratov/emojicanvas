import { MIN_ZOOM } from '../core/camera'
import { DEFAULT_THEME } from '../render/theme'
import { frameScenario, strokeScenario } from './scenarios'

/**
 * The same scenarios the Vitest benchmarks run, in whatever browser opens
 * this page. Headless Chromium on a laptop cannot stand in for a phone:
 * device pixel ratio, memory bandwidth and thermal throttling are the whole
 * question, and none of them survive emulation.
 */
const FRAME_BUDGET_MS = 16.7
const RUNS = 30

type Result = { budgetMs: number; label: string; medianMs: number }

/**
 * The median rather than the mean: a phone will throttle, or collect
 * garbage, somewhere in thirty runs, and one such frame moves a mean while
 * leaving a median alone.
 */
function measure(run: () => void): number {
  const samples: number[] = []

  for (let i = 0; i < RUNS; i++) {
    const started = performance.now()

    run()
    samples.push(performance.now() - started)
  }

  samples.sort((a, b) => a - b)

  return samples[Math.floor(samples.length / 2)]
}

function report(results: Result[]): void {
  const output = document.querySelector<HTMLElement>('#results')!

  output.textContent = [
    `${window.innerWidth}x${window.innerHeight} CSS px, ` +
      `device pixel ratio ${window.devicePixelRatio}`,
    navigator.userAgent,
    '',
    ...results.map(
      result =>
        `${result.medianMs.toFixed(2)}ms of ${result.budgetMs.toFixed(1)}ms  ` +
        `${result.medianMs <= result.budgetMs ? 'PASS' : 'OVER BUDGET'}  ` +
        result.label,
    ),
  ].join('\n')
}

function run(): Result[] {
  const dpr = window.devicePixelRatio || 1
  const viewport = { height: window.innerHeight, width: window.innerWidth }
  const results: Result[] = []

  const atOneToOne = frameScenario({
    cellSizePx: DEFAULT_THEME.baseCellSize,
    dpr,
    viewport,
  })

  results.push({
    budgetMs: FRAME_BUDGET_MS,
    label: `frame, full screen at 1x zoom, ${atOneToOne.cells} cells`,
    medianMs: measure(atOneToOne.draw),
  })

  const atMinZoom = frameScenario({
    cellSizePx: DEFAULT_THEME.baseCellSize * MIN_ZOOM,
    dpr,
    viewport,
  })

  results.push({
    budgetMs: FRAME_BUDGET_MS,
    label: `frame, full screen at minimum zoom, ${atMinZoom.cells} cells`,
    medianMs: measure(atMinZoom.draw),
  })

  const sparse = frameScenario({
    cellSizePx: DEFAULT_THEME.baseCellSize * MIN_ZOOM,
    dpr,
    drawnCells: 500,
    viewport,
  })

  results.push({
    budgetMs: FRAME_BUDGET_MS,
    label: `frame, a 500-cell drawing at minimum zoom (the ordinary case)`,
    medianMs: measure(sparse.draw),
  })

  const stroke = strokeScenario({ dpr, viewport })

  results.push({
    // One redraw per step, so the budget for the whole stroke is the frame
    // budget multiplied by the number of steps.
    budgetMs: FRAME_BUDGET_MS * stroke.steps,
    label: `stroke across the screen, ${stroke.steps} steps with a redraw each`,
    medianMs: measure(stroke.draw),
  })

  return results
}

document
  .querySelector<HTMLButtonElement>('#run')!
  .addEventListener('click', () => {
    const output = document.querySelector<HTMLElement>('#results')!

    output.textContent = 'measuring...'
    // Two frames before the work starts, so the phone has actually painted
    // that word before the main thread is blocked for several seconds.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        report(run())
      })
    })
  })
