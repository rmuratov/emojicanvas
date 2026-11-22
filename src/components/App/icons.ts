export const icons = {
  brush:
    'M12 2h2v2h-1v1h-1v1h-1v1h-1v1H9v2H7V8h1V7h1V6h1V5h1V3h1zM5 9h2v1h1v2H7v1H5v1H2v-1h1v-2h1v-1h1z',
  clear: 'M6 2h4v1h3v2H3V3h3zM4 6h8v7h-1v1H5v-1H4zm2 1v5h1V7zm3 0v5h1V7z',
  copy: 'M2 2h9v2H4v7H2zm3 3h9v9H5zm2 2v5h5V7z',
  ellipse:
    'M5 3h6v1h2v1h1v6h-1v1h-2v1H5v-1H3v-1H2V5h1V4h2zm0 2v1H4v4h1v1h6v-1h1V6h-1V5z',
  eraser:
    'M8 2h3v1h1v1h1v1h1v3h-1v1h-1v1h-1v1h-1v1h4v2H6v-1H5v-1H4v-1H3v-1H2V8h1V7h1V6h1V5h1V4h1V3h1zm-3 6H4v2h1v1h1v1h2v-1h1v-1H8V9H7V8H6V7H5z',
  fill: 'M7 2h2v2h1v1h1v1h1v1h1v2h-1v1h-1v1h-1v1H9v1H6v-1H5v-1H4v-1H3V9H2V7h1V6h1V5h1V4h1v3h2V6H7zm-3 6v1h1v1h1v1h3v-1h1V9h1V8zM13 10h1v2h1v2h-3v-2h1z',
  fit: 'M2 2h5v2H5v1h1v1h1v1H6V6H5V5H4v2H2zm7 0h5v5h-2V5h-1v1h-1v1H9V6h1V5h1V4H9zM2 9h2v2h1v-1h1V9h1v1H6v1H5v1h2v2H2zm7 0h1v1h1v1h1V9h2v5H9v-2h2v-1h-1v-1H9z',
  line: 'M11 2h3v3h-2v1h-1v1h-1v1H9v1H8v1H7v1H6v1H5v2H2v-3h2v-1h1V9h1V8h1V7h1V6h1V5h1V4h1z',
  minus: 'M3 7h10v2H3z',
  pan: 'M5 2h2v4h1V1h2v5h1V3h2v4h1v5h-1v2H6v-1H5v-2H4v-1H3V8h2v1h1V7H5z',
  plus: 'M7 3h2v4h4v2H9v4H7V9H3V7h4z',
  rectangle: 'M2 3h12v10H2zm2 2v6h8V5z',
  redo: 'M10 2h2v1h1v1h1v1h1v2h-1v1h-1v1h-1v1h-2V8h1V7H5v1H4v3h1v1h4v2H5v-1H3v-2H2V8h1V6h2V5h6V4h-1z',
  reset:
    'M2 2h5v2H4v3H2zm7 0h5v5h-2V4H9zM2 9h2v3h3v2H2zm10 0h2v5H9v-2h3zM7 7h2v2H7z',
  undo: 'M6 2H4v1H3v1H2v1H1v2h1v1h1v1h1v1h2V8H5V7h6v1h1v3h-1v1H7v2h4v-1h2v-2h1V8h-1V6h-2V5H5V4h1z',
}

export function toolCursor(name: keyof typeof icons): string {
  const hotSpots: Partial<Record<keyof typeof icons, string>> = {
    brush: '8 23',
    pan: '16 11',
  }
  const position = hotSpots[name] ?? '16 16'
  const fallback = name === 'pan' ? 'grab' : 'default'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="${icons[name]}" transform="translate(4 4) scale(1.5)" fill="#202133" fill-rule="evenodd" stroke="white" stroke-width="2" paint-order="stroke"/></svg>`

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${position}, ${fallback}`
}
