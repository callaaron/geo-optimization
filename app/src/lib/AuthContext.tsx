// JWT 认证上下文：登录状态、token 管理、权限判断
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"

interface AuthUser {
  id: string
  name: string
  title: string
  role: "管理员" | "编辑" | "只读"
  brand: string
  active: boolean
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login: (name: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  refresh: () => Promise<boolean>
  isAdmin: boolean
  isEditor: boolean
}

const AuthContext = createContext<AuthState | null>(null)

const TOKEN_KEY = "geo-auth-token"
const REFRESH_KEY = "geo-auth-refresh"

function loadToken(): { token: string | null; refresh: string | null } {
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY),
      refresh: localStorage.getItem(REFRESH_KEY),
    }
  } catch { return { token: null, refresh: null } }
}

function saveToken(token: string, refreshToken?: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
  } catch { /* ignore */ }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 初始化：尝试用已有 token 获取用户信息
  useEffect(() => {
    const { token: savedToken } = loadToken()
    if (savedToken) {
      setToken(savedToken)
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${savedToken}` } })
        .then(r => r.json())
        .then(j => {
          if (j.ok) { setUser(j.data) }
          else { clearToken(); setToken(null) }
        })
        .catch(() => { clearToken(); setToken(null) })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (name: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      })
      const j = await r.json()
      if (j.ok) {
        setUser(j.data.user)
        setToken(j.data.token)
        saveToken(j.data.token, j.data.refreshToken)
        return { ok: true }
      }
      return { ok: false, error: j.error || "登录失败" }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    clearToken()
  }, [])

  const refresh = useCallback(async (): Promise<boolean> => {
    const { refresh: rt } = loadToken()
    if (!rt) return false
    try {
      const r = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      })
      const j = await r.json()
      if (j.ok) {
        setToken(j.data.token)
        saveToken(j.data.token, rt)
        return true
      }
    } catch { /* ignore */ }
    logout()
    return false
  }, [logout])

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      login, logout, refresh,
      isAdmin: user?.role === "管理员",
      isEditor: user?.role === "编辑" || user?.role === "管理员",
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
