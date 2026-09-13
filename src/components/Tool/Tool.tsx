import { ButtonHTMLAttributes, PropsWithChildren } from 'react'

export function Tool({
  children,
  className,
  isSelected,
  onClick,
  ...rest
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { isSelected?: boolean }
>) {
  // Built as a list rather than interpolated: `${isSelected && '...'}` put
  // the literal string "false" into className whenever isSelected was false.
  //
  // border-gray-200 is explicit: Tailwind 4's Preflight defaults borders to
  // currentColor, so a bare `border` would otherwise render in the button's
  // text colour instead of the original light-gray hairline.
  const classes = [
    'hover:bg-slate-100 border border-gray-200 rounded p-5 md:p-1',
    'disabled:opacity-40',
    className,
    isSelected ? 'bg-slate-200' : '',
  ]

  return (
    <button
      className={classes.filter(Boolean).join(' ')}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  )
}
