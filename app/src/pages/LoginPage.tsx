import { useState } from "react"
import { useAuth } from "@/lib/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Radar } from "lucide-react"

export function LoginPage() {
  const { login } = useAuth()
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !password.trim()) {
      setError("请输入用户名和密码")
      return
    }
    setLoading(true)
    setError("")
    const result = await login(name.trim(), password)
    if (!result.ok) {
      setError(result.error || "登录失败")
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border/40">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Radar className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-lg">GEO 优化系统</CardTitle>
          <p className="text-xs text-muted-foreground">AI 搜索引擎可见性管理平台</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Input
                placeholder="用户名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" size="sm" disabled={loading}>
              {loading ? "登录中…" : "登录"}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              默认密码：123456（首次登录后请修改）
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
