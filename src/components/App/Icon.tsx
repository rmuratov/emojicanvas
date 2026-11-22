import { icons } from './icons'

export function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height="20"
      shapeRendering="crispEdges"
      viewBox="0 0 16 16"
      width="20"
    >
      <path d={icons[name]} fillRule="evenodd" />
    </svg>
  )
}
