import { PropsWithChildren } from 'react'

export function Tools({ children }: PropsWithChildren) {
  return (
    <div className="flex space-x-3 md:flex-col md:space-x-0 md:space-y-3 md:mr-2">
      {children}
    </div>
  )
}
