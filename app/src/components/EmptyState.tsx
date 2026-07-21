import type { ReactNode } from "react"

interface Props {
  icon?: ReactNode
  title: string
  desc?: string
  hint?: string
  children?: ReactNode
}

/** 通用空状态引导：内联 SVG 插画 + 操作提示，降低首次使用门槛 */
export function EmptyState({ icon, title, desc, hint, children }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-sky-500/10 text-emerald-400">
        {icon ?? (
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 13a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z" strokeLinecap="round" />
            <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 13h1M16 13h1" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {desc && <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{desc}</p>}
      {children}
      {hint && <p className="mt-3 text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  )
}
