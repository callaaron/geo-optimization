export function scoreColor(score: number): string {
  if (score >= 85) return "#10b981"
  if (score >= 72) return "#22c55e"
  if (score >= 58) return "#eab308"
  if (score >= 42) return "#f97316"
  return "#ef4444"
}

export function ScoreRing({
  score,
  grade,
  size = 140,
  thickness = 10,
}: {
  score: number
  grade: string
  size?: number
  thickness?: number
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100)
  const color = scoreColor(score)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="text-muted" stroke="currentColor" strokeWidth={thickness} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color }}>
          {score}
        </span>
        <span className="text-[11px] text-muted-foreground">等级 {grade}</span>
      </div>
    </div>
  )
}

export function ScoreBar({ score, label, weight }: { score: number; label: string; weight: number }) {
  const color = scoreColor(score)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground/90">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold" style={{ color }}>
            {score}
          </span>
          <span className="ml-1 text-[11px]">·权重{Math.round(weight * 100)}%</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  )
}
