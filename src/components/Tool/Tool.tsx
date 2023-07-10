import { ButtonHTMLAttributes, PropsWithChildren } from 'react'

export function Tool({
  children,
  className,
  onClick,
  isSelected,
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { isSelected?: boolean }
>) {
  return (
    <button
      className={`hover:bg-slate-100 border rounded p-5 md:p-1 ${className} ${
        isSelected && 'bg-slate-200'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
