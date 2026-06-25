'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Search, Database, Building2, Table2, Rows3, Sun, Moon, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

/* ── Types ── */
interface Org { id: string; name: string; title: string; imageUrl: string; datasetCount: number }
interface Dataset { id: string; name: string; title: string; organization?: { name: string; title: string }; dataTables: { rowCount: number }[]; resources: { format: string }[]; metadataModified: string; isLatest: boolean; tags: { tag: { name: string } }[] }
interface Stats { totalDatasets: number; latestDatasets: number; totalTables: number; totalRows: number; organizations: Org[]; popularTags: { name: string; count: number }[] }

function fmt(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}

function fmtDate(d: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── Theme Toggle ── */
function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Sun className="size-4 dark:hidden" /><Moon className="size-4 hidden dark:block" /></Button>
}

/* ── Stat Card ── */
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return <Card className="border-none shadow-sm"><CardContent className="p-4 flex items-center gap-3">
    <div className={`p-2 rounded-lg ${color}`}><Icon className="size-5 text-white" /></div>
    <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
  </CardContent></Card>
}

/* ── Dataset Card ── */
function DatasetCard({ ds, onClick }: { ds: Dataset; onClick: () => void }) {
  const totalRows = ds.dataTables.reduce((s, t) => s + t.rowCount, 0)
  return <Card className="hover:shadow-md transition-shadow cursor-pointer h-full" onClick={onClick}>
    <CardContent className="p-4 flex flex-col gap-2 h-full">
      <h3 className="font-semibold text-sm leading-tight line-clamp-2 flex-1">{ds.title || ds.name}</h3>
      <div className="flex flex-wrap gap-1">
        {ds.organization && <Badge variant="outline" className="text-[10px]">{ds.organization.title}</Badge>}
        {ds.resources[0] && <Badge variant="secondary" className="text-[10px]">{ds.resources[0].format}</Badge>}
        {ds.isLatest && <Badge className="text-[10px] bg-amber-500 text-white hover:bg-amber-600">Terbaru</Badge>}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{ds.dataTables.length > 0 ? `${ds.dataTables.length} tabel · ${fmt(totalRows)} baris` : 'Metadata saja'}</span>
        <span>{fmtDate(ds.metadataModified)}</span>
      </div>
    </CardContent>
  </Card>
}

/* ── Skeletons ── */
function StatsSkeleton() {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Card key={i} className="border-none shadow-sm"><CardContent className="p-4"><Skeleton className="h-10 w-full" /></CardContent></Card>)}</div>
}
function OrgSkeleton() {
  return <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{Array.from({ length: 10 }).map((_, i) => <Card key={i}><CardContent className="p-3"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></CardContent></Card>)}</div>
}
function DatasetSkeleton() {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-full mb-3" /><Skeleton className="h-3 w-2/3" /></CardContent></Card>)}</div>
}

/* ════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════ */
export default function Page() {
  const { resolvedTheme } = useTheme()
  const [stats, setStats] = useState<Stats | null>(null)
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [q, setQ] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'home' | 'list'>('home')
  const [detailId, setDetailId] = useState<string | null>(null)

  // Fetch stats + recent on mount
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(s => { setStats(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Fetch datasets (list view)
  useEffect(() => {
    if (view !== 'list') return
    const params = new URLSearchParams({ page: String(page), limit: '24', latest: 'true', q: searchQ })
    if (selectedOrg) params.set('org', selectedOrg)
    fetch(`/api/datasets?${params}`).then(r => r.json()).then(d => {
      setDatasets(d.datasets || [])
      setTotalPages(d.pagination?.pages || 1)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [view, page, searchQ, selectedOrg])

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setSearchQ(q); setPage(1); setView('list') }

  const isSearching = searchQ || selectedOrg

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('home'); setDetailId(null); setSelectedOrg(null); setSearchQ(''); setQ('') }}>
            <Database className="size-5 text-amber-600" />
            <span className="font-bold text-lg">Data Wonosobo</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero / Search ── */}
        <section className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border-b">
          <div className="max-w-7xl mx-auto px-4 py-10 md:py-16 text-center">
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3">
              Portal <span className="text-amber-600 dark:text-amber-400">Open Data</span> Kabupaten Wonosobo
            </h1>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto text-sm md:text-base">
              Jelajahi 2.289 dataset publik dari 25 organisasi pemerintah Kabupaten Wonosobo. Data dikonversi otomatis dari format XLSX menjadi database terstruktur dan dokumen Markdown.
            </p>
            <form onSubmit={handleSearch} className="max-w-xl mx-auto flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input placeholder="Cari dataset..." value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
              </div>
              <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white">Cari</Button>
            </form>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* ── Home View ── */}
          {!isSearching && view === 'home' && !detailId && (
            <>
              {/* Stats */}
              {loading ? <StatsSkeleton /> : stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                  <StatCard icon={Database} label="Total Dataset" value={fmt(stats.totalDatasets)} color="bg-amber-500" />
                  <StatCard icon={Building2} label="Organisasi" value={String(stats.organizations.length)} color="bg-emerald-500" />
                  <StatCard icon={Table2} label="Tabel Data" value={fmt(stats.totalTables)} color="bg-blue-500" />
                  <StatCard icon={Rows3} label="Baris Data" value={fmt(stats.totalRows)} color="bg-purple-500" />
                </div>
              )}

              {/* Organizations */}
              <h2 className="font-bold text-lg mb-3 flex items-center gap-2"><Building2 className="size-5" /> Organisasi</h2>
              {loading ? <OrgSkeleton /> : stats && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
                  {stats.organizations.map(org => (
                    <Card key={org.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setSelectedOrg(org.id); setView('list'); setPage(1) }}>
                      <CardContent className="p-3">
                        <p className="font-semibold text-sm truncate">{org.title}</p>
                        <p className="text-xs text-muted-foreground">{org.datasetCount} dataset</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Popular Tags */}
              {stats && stats.popularTags.length > 0 && (
                <div className="mb-8">
                  <h2 className="font-bold text-lg mb-3">Tag Populer</h2>
                  <div className="flex flex-wrap gap-2">
                    {stats.popularTags.slice(0, 20).map(t => (
                      <Badge key={t.name} variant="outline" className="cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/30" onClick={() => { setSearchQ(t.name); setQ(t.name); setView('list'); setPage(1) }}>{t.name} ({t.count})</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Datasets */}
              <RecentDatasets onSelect={(id) => { setDetailId(id); setView('detail') }} />
            </>
          )}

          {/* ── List View ── */}
          {isSearching && view === 'list' && !detailId && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {selectedOrg && <Badge variant="secondary" className="cursor-pointer" onClick={() => { setSelectedOrg(null); setPage(1) }}>{stats?.organizations.find(o => o.id === selectedOrg)?.title || selectedOrg} ✕</Badge>}
                  {searchQ && <Badge variant="secondary" className="cursor-pointer" onClick={() => { setSearchQ(''); setQ(''); setPage(1) }}>{searchQ} ✕</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setView('home'); setSelectedOrg(null); setSearchQ(''); setQ('') }}>Kembali</Button>
              </div>
              {loading ? <DatasetSkeleton /> : datasets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground"><FileText className="size-10 mx-auto mb-2" /><p>Tidak ada dataset ditemukan</p></div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {datasets.map(ds => <DatasetCard key={ds.id} ds={ds} onClick={() => { setDetailId(ds.id); setView('detail') }} />)}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-6">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</Button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                        if (p > totalPages) return null
                        return <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => setPage(p)}>{p}</Button>
                      }).filter(Boolean)}
                      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>→</Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Detail View ── */}
          {view === 'detail' && detailId && <DatasetDetail id={detailId} onBack={() => { setView(isSearching ? 'list' : 'home'); setDetailId(null) }} />}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t py-4 mt-auto bg-background">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-muted-foreground">
          Data Wonosobo — Portal Open Data Kabupaten Wonosobo · Sumber: <a href="https://opendata.wonosobokab.go.id/" target="_blank" className="underline hover:text-amber-600">opendata.wonosobokab.go.id</a>
        </div>
      </footer>
    </div>
  )
}

/* ── Recent Datasets ── */
function RecentDatasets({ onSelect }: { onSelect: (id: string) => void }) {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/datasets?latest=true&limit=6').then(r => r.json()).then(d => { setDatasets(d.datasets || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <h2 className="font-bold text-lg mb-3">Dataset Terbaru</h2>
      {loading ? <DatasetSkeleton /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map(ds => <DatasetCard key={ds.id} ds={ds} onClick={() => onSelect(ds.id)} />)}
        </div>
      )}
    </div>
  )
}

/* ── Dataset Detail ── */
function DatasetDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [ds, setDs] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTable, setActiveTable] = useState<string | null>(null)
  const [tableData, setTableData] = useState<any>(null)
  const [tablePage, setTablePage] = useState(1)
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch(`/api/datasets/${id}`)
        const d = await r.json()
        if (!cancelled) {
          setDs(d)
          if (d.dataTables?.length > 0) setActiveTable(d.dataTables[0].id)
          setLoading(false)
        }
      } catch { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!activeTable) return
    fetch(`/api/data/${activeTable}?page=${tablePage}&limit=50`).then(r => r.json()).then(d => setTableData(d)).catch(() => {})
  }, [activeTable, tablePage])

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-64 w-full" /></div>
  if (!ds) return <p className="text-center py-12 text-muted-foreground">Dataset tidak ditemukan</p>

  const headers: string[] = ds.dataTables?.find((t: any) => t.id === activeTable)?.columns?.map((c: any) => c.colName) || []
  const rows = tableData?.rows || []
  const sortedRows = sortCol !== null ? [...rows].sort((a: any, b: any) => {
    const va = a.values?.[sortCol] || '', vb = b.values?.[sortCol] || ''
    const na = Number(va.replace(/[.,%\s]/g, '')), nb = Number(vb.replace(/[.,%\s]/g, ''))
    if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na
    return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
  }) : rows

  const handleSort = (col: number) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const exportCSV = () => {
    if (!tableData) return
    const h = tableData.columns.map((c: any) => c.colName)
    const allRows = sortedRows.map((r: any) => r.values)
    const csv = [h, ...allRows].map(r => r.map((v: string) => `"${(v || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${ds.name || 'data'}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4" onClick={onBack}>← Kembali</Button>

      <h1 className="text-xl md:text-2xl font-bold mb-2">{ds.title || ds.name}</h1>
      <div className="flex flex-wrap gap-2 mb-4">
        {ds.organization && <Badge variant="outline">{ds.organization.title}</Badge>}
        {ds.resources?.[0] && <Badge variant="secondary">{ds.resources[0].format} · {(ds.resources[0].size / 1024).toFixed(0)} KB</Badge>}
        {ds.isLatest && <Badge className="bg-amber-500 text-white">Versi Terbaru</Badge>}
        <span className="text-xs text-muted-foreground self-center">Diperbarui: {fmtDate(ds.metadataModified)}</span>
      </div>

      {ds.tags?.length > 0 && <div className="flex flex-wrap gap-1 mb-4">{ds.tags.map((t: any) => <Badge key={t.tag.id} variant="secondary" className="text-[10px]">{t.tag.name}</Badge>)}</div>}

      {/* Download */}
      {ds.resources?.[0]?.url && (
        <a href={ds.resources[0].url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-amber-600 hover:underline mb-4">
          Unduh XLSX Asli →
        </a>
      )}

      {/* Markdown Content */}
      {ds.markdownContent && (
        <div className="prose prose-sm dark:prose-invert max-w-none mb-6 p-4 bg-muted/30 rounded-lg border overflow-auto max-h-96">
          <div dangerouslySetInnerHTML={{ __html: ds.markdownContent.replace(/^---[\s\S]*?---\n/, '').replace(/^# .*/m, '').replace(/\|.*?\|/g, m => m).replace(/\n{3,}/g, '\n\n') }} />
        </div>
      )}

      {/* Data Tables */}
      {ds.dataTables?.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4 border-b pb-2">
            {ds.dataTables.map((t: any) => (
              <Button key={t.id} variant={activeTable === t.id ? 'default' : 'outline'} size="sm" className={activeTable === t.id ? 'bg-amber-600 hover:bg-amber-700' : ''} onClick={() => { setActiveTable(t.id); setTablePage(1) }}>
                {t.sheetName} ({t.rowCount})
              </Button>
            ))}
          </div>

          {tableData && (
            <>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-muted-foreground">
                  {headers.length} kolom · {tableData.pagination?.total || 0} baris
                  {tableData.pagination && ` (hal ${tableData.pagination.page}/${tableData.pagination.pages})`}
                </span>
                <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
              </div>

              <div className="overflow-auto max-h-96 border rounded-lg">
                <table className="text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>{headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort(i)}>
                        {h} {sortCol === i ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                    ))}</tr>
                  </thead>
                  <tbody>{sortedRows.map((r: any, ri: number) => (
                    <tr key={ri} className="border-t hover:bg-muted/30">
                      {r.values.map((v: string, ci: number) => <td key={ci} className="px-3 py-1.5 whitespace-nowrap">{v || '-'}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>

              {tableData.pagination && tableData.pagination.pages > 1 && (
                <div className="flex justify-center gap-2 mt-3">
                  <Button variant="outline" size="sm" disabled={tablePage <= 1} onClick={() => setTablePage(p => p - 1)}>←</Button>
                  <span className="text-xs self-center">{tablePage} / {tableData.pagination.pages}</span>
                  <Button variant="outline" size="sm" disabled={tablePage >= tableData.pagination.pages} onClick={() => setTablePage(p => p + 1)}>→</Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}