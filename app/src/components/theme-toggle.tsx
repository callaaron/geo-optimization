import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun, Monitor, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const OPTIONS = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
] as const

/** 明暗主题切换：浅色 / 深色 / 跟随系统 三态 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // 避免首屏 hydration 前图标闪烁
  useEffect(() => setMounted(true), [])

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[1]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="切换主题"
          aria-label="切换主题"
        >
          {mounted ? (
            current.value === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : current.value === "light" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {OPTIONS.map((o) => {
          const Icon = o.icon
          const active = mounted && theme === o.value
          return (
            <DropdownMenuItem
              key={o.value}
              onClick={() => setTheme(o.value)}
              className="flex cursor-pointer items-center gap-2"
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{o.label}</span>
              {active && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
