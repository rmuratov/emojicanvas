import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME, levelOfDetail } from './theme'

describe('levelOfDetail', () => {
  it('draws glyphs at the default base cell size', () => {
    expect(levelOfDetail(DEFAULT_THEME, DEFAULT_THEME.baseCellSize)).toBe(
      'glyph',
    )
  })

  it('draws glyphs exactly at the colour threshold', () => {
    expect(
      levelOfDetail(DEFAULT_THEME, DEFAULT_THEME.colorLodThresholdPx),
    ).toBe('glyph')
  })

  it('falls back to average colour just below the colour threshold', () => {
    expect(
      levelOfDetail(DEFAULT_THEME, DEFAULT_THEME.colorLodThresholdPx - 0.01),
    ).toBe('color')
  })

  it('draws blocks exactly at the block threshold', () => {
    expect(
      levelOfDetail(DEFAULT_THEME, DEFAULT_THEME.blockLodThresholdPx),
    ).toBe('color')
  })

  it('merges cells into blocks below the block threshold', () => {
    expect(
      levelOfDetail(DEFAULT_THEME, DEFAULT_THEME.blockLodThresholdPx - 0.01),
    ).toBe('block')
  })

  it('smooths scaled glyph buffers by default', () => {
    expect(DEFAULT_THEME.antialias).toBe(true)
  })

  it('keeps the block threshold below the colour threshold', () => {
    expect(DEFAULT_THEME.blockLodThresholdPx).toBeLessThan(
      DEFAULT_THEME.colorLodThresholdPx,
    )
  })
})
