import { ButtonHTMLAttributes, PropsWithChildren } from 'react'

export function Tool({
  children,
  className,
  isSelected,
  onClick,
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { isSelected?: boolean }
>) {
  return (
    // border-gray-200 is explicit: Tailwind 4's Preflight defaults borders
    // to currentColor, so a bare `border` would otherwise render in the
    // button's text colour instead of the original light-gray hairline.
    <button
      className={`hover:bg-slate-100 border border-gray-200 rounded p-5 md:p-1 ${className} ${
        isSelected && 'bg-slate-200'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
