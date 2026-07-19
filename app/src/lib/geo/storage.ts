// 监控看板本地存储（localStorage）
import type { AnalysisRecord, CitationEntry, DimensionKey } from "@/types/geo"

const ANALYSIS_KEY = "geo.analyses.v1"
const CITATION_KEY = "geo.citations.v1"

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function write<T>(key: string, val: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* 忽略写入失败 */
  }
}

export function listAnalyses(): AnalysisRecord[] {
  return read<AnalysisRecord>(ANALYSIS_KEY).sort((a, b) => b.createdAt - a.createdAt)
}

export function saveAnalysis(rec: AnalysisRecord) {
  const all = read<AnalysisRecord>(ANALYSIS_KEY)
  const idx = all.findIndex((r) => r.id === rec.id)
  if (idx >= 0) all[idx] = rec
  else all.push(rec)
  write(ANALYSIS_KEY, all)
}

export function deleteAnalysis(id: string) {
  write(
    ANALYSIS_KEY,
    read<AnalysisRecord>(ANALYSIS_KEY).filter((r) => r.id !== id),
  )
}

export function listCitations(): CitationEntry[] {
  return read<CitationEntry>(CITATION_KEY).sort((a, b) => b.createdAt - a.createdAt)
}

export function saveCitation(rec: CitationEntry) {
  const all = read<CitationEntry>(CITATION_KEY)
  const idx = all.findIndex((r) => r.id === rec.id)
  if (idx >= 0) all[idx] = rec
  else all.push(rec)
  write(CITATION_KEY, all)
}

export function deleteCitation(id: string) {
  write(
    CITATION_KEY,
    read<CitationEntry>(CITATION_KEY).filter((r) => r.id !== id),
  )
}

export function exportRecord(rec: AnalysisRecord): string {
  return JSON.stringify(rec, null, 2)
}

export type { DimensionKey }
