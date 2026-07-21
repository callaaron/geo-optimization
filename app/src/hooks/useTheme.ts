import { useEffect, useState } from "react"

type Theme = "dark" | "light"

const STORAGE_KEY = "geo-theme"

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark"
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === "light" || saved === "dark") return saved
  return "dark"
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "dark") root.classList.add("dark")
  else root.classList.remove("dark")
  localStorage.setItem(STORAGE_KEY, theme)
}

/** 明暗主题切换 hook：默认深色，状态持久化到 localStorage */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"))

  return { theme, toggle }
}
