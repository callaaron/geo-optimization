// 多用户/团队管理：增删改查成员（姓名/职位/角色/监测配置），JSON 持久化，无登录
// 参考 gego 的 admin/member 角色模型，简化为管理员·编辑·只读三级
import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Users, Plus, Pencil, Trash2, Loader2, Shield, User, Eye, ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"

const ROLES = ["管理员", "编辑", "只读"] as const
type Role = (typeof ROLES)[number]

const ROLE_ICONS: Record<Role, any> = { 管理员: ShieldCheck, 编辑: Pencil, 只读: Eye }
const ROLE_COLORS: Record<Role, string> = {
  管理员: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  编辑: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  只读: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
}

interface User {
  id: string
  name: string
  title: string
  role: Role
  brand: string
  domain: string
  queries: string[]
  competitors: string[]
  projectId: string
  active: boolean
  createdAt: string
  updatedAt: string
}

const BASE = "/api"

async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${BASE}/users`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || "获取用户列表失败")
  return json.data
}

async function saveUser(user: Partial<User> & { id?: string }): Promise<User> {
  const isNew = !user.id
  const url = isNew ? `${BASE}/users` : `${BASE}/users/${user.id}`
  const method = isNew ? "POST" : "PUT"
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || "保存失败")
  return json.data
}

async function removeUser(id: string): Promise<void> {
  const res = await fetch(`${BASE}/users/${id}`, { method: "DELETE" })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || "删除失败")
}

const EMPTY_USER: Partial<User> = { name: "", title: "", role: "编辑", brand: "", domain: "", queries: [], competitors: [], projectId: "", active: true }

export default function TeamSection() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<Partial<User>>({ ...EMPTY_USER })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await fetchUsers())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => { setForm({ ...EMPTY_USER }); setEditingId(null); setDialogOpen(true) }
  const openEdit = (u: User) => { setForm({ ...u }); setEditingId(u.id); setDialogOpen(true) }

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error("姓名不能为空"); return }
    setSaving(true)
    try {
      await saveUser(editingId ? { ...form, id: editingId } : form)
      toast.success(editingId ? "已更新" : "已创建")
      setDialogOpen(false)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (u: User) => {
    if (!confirm(`确定删除成员「${u.name}」？此操作不可撤销。`)) return
    try {
      await removeUser(u.id)
      toast.success(`已删除「${u.name}」`)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const updateField = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }))

  const activeCount = users.filter((u) => u.active).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">团队管理</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {users.length} 位成员（{activeCount} 人在职）· 配置各自监测品牌与权限
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" />添加成员
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">加载中…</span>
        </div>
      )}

      {error && !loading && (
        <Card className="border-destructive/30">
          <CardContent className="flex items-center justify-between py-6">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-destructive/60" />
              <span className="text-sm text-muted-foreground">{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={load}>重试</Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && users.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Users className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">尚无团队成员，点击「添加成员」开始配置</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && users.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">姓名</TableHead>
                  <TableHead className="w-[100px]">职位</TableHead>
                  <TableHead className="w-[80px]">角色</TableHead>
                  <TableHead>负责品牌</TableHead>
                  <TableHead className="w-[140px]">监测 Query</TableHead>
                  <TableHead className="w-[60px]">状态</TableHead>
                  <TableHead className="w-[90px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const RoleIcon = ROLE_ICONS[u.role] || User
                  return (
                    <TableRow key={u.id} className={u.active ? "" : "opacity-50"}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{u.title || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs h-5 border-0 flex items-center gap-1 ${ROLE_COLORS[u.role] || ""}`}>
                          <RoleIcon className="h-3 w-3" />{u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{u.brand || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.queries?.length ? `共 ${u.queries.length} 条` : "—"}
                      </TableCell>
                      <TableCell>
                        {u.active ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">在职</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">离职</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => handleDelete(u)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── 添加/编辑对话框 ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑成员" : "添加成员"}</DialogTitle>
            <DialogDescription>
              配置该成员的姓名、职位、权限角色及监测范围。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="u-name">姓名 *</Label>
                <Input id="u-name" value={form.name || ""} onChange={(e) => updateField("name", e.target.value)} placeholder="张三" />
              </div>
              <div>
                <Label htmlFor="u-title">职位</Label>
                <Input id="u-title" value={form.title || ""} onChange={(e) => updateField("title", e.target.value)} placeholder="内容总监" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>角色</Label>
                <Select value={form.role} onValueChange={(v) => updateField("role", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <Switch checked={form.active ?? true} onCheckedChange={(v) => updateField("active", v)} id="u-active" />
                  <Label htmlFor="u-active" className="text-xs text-muted-foreground">在职</Label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="u-brand">负责品牌</Label>
                <Input id="u-brand" value={form.brand || ""} onChange={(e) => updateField("brand", e.target.value)} placeholder="锐工精密" />
              </div>
              <div>
                <Label htmlFor="u-domain">域名</Label>
                <Input id="u-domain" value={form.domain || ""} onChange={(e) => updateField("domain", e.target.value)} placeholder="example.com" />
              </div>
            </div>
            <div>
              <Label htmlFor="u-queries">监测 Query（一行一个）</Label>
              <Textarea id="u-queries" rows={3} value={Array.isArray(form.queries) ? form.queries.join("\n") : ""}
                onChange={(e) => updateField("queries", e.target.value.split("\n").filter(Boolean))}
                placeholder="谐波减速机厂家排名&#10;国产RV减速器品牌" />
            </div>
            <div>
              <Label htmlFor="u-comps">竞品（一行一个）</Label>
              <Textarea id="u-comps" rows={2} value={Array.isArray(form.competitors) ? form.competitors.join("\n") : ""}
                onChange={(e) => updateField("competitors", e.target.value.split("\n").filter(Boolean))}
                placeholder="绿的谐波&#10;昊志机电" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editingId ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
