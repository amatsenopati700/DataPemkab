'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTheme } from 'next-themes'
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Database, Building2, Table2, Rows3, ArrowLeft, Download,
  Sun, Moon, Calendar, Tag, FileSpreadsheet, ChevronLeft, ChevronRight,
  ExternalLink, ArrowUp, ArrowDown, ArrowUpDown, X, Filter,
  FileText, HomeIcon, Eye
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

// ============================================================
// Types
// ============================================================

interface Organization {
  id: string
  name: string
  title: string
  imageUrl?: string | null
  packageCount: number
}

interface DataTableInfo {
  id: string
  sheetName: string
  rowCount: number
  colCount: number
  headersJson?: string | null
}

interface Resource {
  format: string
  size?: number | null
  url: string
}

interface Dataset {
  id: string
  name: string
  title: string
  notes?: string | null
  organizationId: string
  isLatest: boolean
  metadataModified: string
  markdownContent?: string | null
  markdownPath?: string | null
  organization?: Organization | null
  dataTables?: DataTableInfo[]
  resources?: Resource[]
  tags?: string[]
  _count?: { dataTables: number; dataRows: number }
}

interface Stats {
  organizations: number
  totalDatasets: number
  latestDatasets: number
  totalTables: number
  totalRows: number
  popularTags: string[]
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface DataRow {
  id?: string
  valuesJson: string
}

// ============================================================
// Utility Functions
// ============================================================

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return new Intl.NumberFormat('id-ID').format(n)
}

function formatFullNumber(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'd MMMM yyyy', { locale: idLocale })
  } catch {
    return dateStr
  }
}

function formatShortDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'd MMM yyyy', { locale: idLocale })
  } catch {
    return dateStr
  }
}

function exportCSV(headers: string[], rows: string[][], filename: string) {
  const csvContent = [
    headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map(row =>
      row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    )
  ].join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '...'
}

// ============================================================
// Animation Variants
// ============================================================

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: 'easeOut' }
}

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } }
}

const staggerItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } }
}

// ============================================================
// Markdown Components (for styling)
// ============================================================

function markdownComponents() {
  return {
    h1: ({ children, ...props }: React.ComponentPropsWithoutRef<'h1'>) => (
      <h1 className="text-2xl font-bold mt-8 mb-4 text-foreground" {...props}>{children}</h1>
    ),
    h2: ({ children, ...props }: React.ComponentPropsWithoutRef<'h2'>) => (
      <h2 className="text-xl font-semibold mt-6 mb-3 text-foreground" {...props}>{children}</h2>
    ),
    h3: ({ children, ...props }: React.ComponentPropsWithoutRef<'h3'>) => (
      <h3 className="text-lg font-semibold mt-5 mb-2 text-foreground" {...props}>{children}</h3>
    ),
    p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => (
      <p className="mb-4 leading-relaxed text-muted-foreground" {...props}>{children}</p>
    ),
    ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
      <ul className="mb-4 ml-6 list-disc space-y-1 text-muted-foreground" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => (
      <ol className="mb-4 ml-6 list-decimal space-y-1 text-muted-foreground" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
      <li className="leading-relaxed" {...props}>{children}</li>
    ),
    strong: ({ children, ...props }: React.ComponentPropsWithoutRef<'strong'>) => (
      <strong className="font-semibold text-foreground" {...props}>{children}</strong>
    ),
    table: ({ children, ...props }: React.ComponentPropsWithoutRef<'table'>) => (
      <div className="mb-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" {...props}>{children}</table>
      </div>
    ),
    th: ({ children, ...props }: React.ComponentPropsWithoutRef<'th'>) => (
      <th className="bg-muted px-4 py-2 text-left font-semibold" {...props}>{children}</th>
    ),
    td: ({ children, ...props }: React.ComponentPropsWithoutRef<'td'>) => (
      <td className="border-t px-4 py-2" {...props}>{children}</td>
    ),
    a: ({ children, href, ...props }: React.ComponentPropsWithoutRef<'a'>) => (
      <a href={href} className="text-amber-600 hover:text-amber-700 underline dark:text-amber-400 dark:hover:text-amber-300" target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ),
    blockquote: ({ children, ...props }: React.ComponentPropsWithoutRef<'blockquote'>) => (
      <blockquote className="mb-4 border-l-4 border-amber-400 pl-4 italic text-muted-foreground" {...props}>{children}</blockquote>
    ),
    code: ({ children, className, ...props }: React.ComponentPropsWithoutRef<'code'>) => {
      if (className) {
        return <code className="block rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4" {...props}>{children}</code>
      }
      return <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono" {...props}>{children}</code>
    },
    hr: (props: React.ComponentPropsWithoutRef<'hr'>) => (
      <hr className="my-6 border-border" {...props} />
    ),
  }
}

// ============================================================
// Main Component
// ============================================================

type View = 'home' | 'list' | 'detail'

export default function Home() {
  // === Navigation State ===
  const [view, setView] = useState<View>('home')
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null)

  // === Home Page Data ===
  const [stats, setStats] = useState<Stats | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [recentDatasets, setRecentDatasets] = useState<Dataset[]>([])
  const [statsLoading, setStatsLoading] = useState(true)

  // === List Page State ===
  const [searchQuery, setSearchQuery] = useState('')
  const [activeOrg, setActiveOrg] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [hasDataFilter, setHasDataFilter] = useState(false)
  const [latestFilter, setLatestFilter] = useState(false)
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [datasetPagination, setDatasetPagination] = useState<PaginationInfo | null>(null)
  const [datasetPage, setDatasetPage] = useState(1)
  const [datasetsLoading, setDatasetsLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')

  // === Detail Page State ===
  const [datasetDetail, setDatasetDetail] = useState<Dataset | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [tableRows, setTableRows] = useState<string[][]>([])
  const [tableHeaders, setTableHeaders] = useState<string[]>([])
  const [tableLoading, setTableLoading] = useState(false)
  const [tablePagination, setTablePagination] = useState<PaginationInfo | null>(null)
  const [tablePage, setTablePage] = useState(1)
  const [sortColumn, setSortColumn] = useState<number | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // === UI State ===
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  // === Refs ===
  const searchInputRef = useRef<HTMLInputElement>(null)

  // === Effects ===

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch stats and organizations for homepage
  useEffect(() => {
    async function loadHomeData() {
      setStatsLoading(true)
      try {
        const [statsRes, orgsRes, recentRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/organizations'),
          fetch('/api/datasets?latest=true&limit=6'),
        ])
        const statsData = await statsRes.json()
        const orgsData = await orgsRes.json()
        const recentData = await recentRes.json()
        setStats(statsData)
        setOrganizations(orgsData)
        setRecentDatasets(recentData.datasets || [])
      } catch (err) {
        console.error('Failed to load home data:', err)
      } finally {
        setStatsLoading(false)
      }
    }
    loadHomeData()
  }, [])

  // Fetch datasets for list view
  useEffect(() => {
    if (view !== 'list') return
    async function loadDatasets() {
      setDatasetsLoading(true)
      try {
        const params = new URLSearchParams({ page: String(datasetPage), limit: '18' })
        if (searchQuery) params.set('q', searchQuery)
        if (activeOrg) params.set('org', activeOrg)
        if (activeTag) params.set('tag', activeTag)
        if (hasDataFilter) params.set('hasData', 'true')
        if (latestFilter) params.set('latest', 'true')
        const res = await fetch(`/api/datasets?${params.toString()}`)
        const data = await res.json()
        setDatasets(data.datasets || [])
        setDatasetPagination(data.pagination || null)
      } catch (err) {
        console.error('Failed to load datasets:', err)
        setDatasets([])
      } finally {
        setDatasetsLoading(false)
      }
    }
    loadDatasets()
  }, [view, searchQuery, activeOrg, activeTag, hasDataFilter, latestFilter, datasetPage])

  // Fetch dataset detail
  useEffect(() => {
    if (view !== 'detail' || !selectedDatasetId) return
    async function loadDetail() {
      setDetailLoading(true)
      try {
        const res = await fetch(`/api/datasets/${selectedDatasetId}`)
        const data = await res.json()
        setDatasetDetail(data)
        // Set first table as active
        if (data.dataTables && data.dataTables.length > 0) {
          const firstTable = data.dataTables[0]
          setActiveTableId(firstTable.id)
          // Parse headers
          try {
            const headers = JSON.parse(firstTable.headersJson || '[]')
            setTableHeaders(headers)
          } catch {
            setTableHeaders([])
          }
          setTablePage(1)
          setSortColumn(null)
          setSortDirection('asc')
        } else {
          setActiveTableId(null)
          setTableHeaders([])
          setTableRows([])
        }
      } catch (err) {
        console.error('Failed to load dataset detail:', err)
      } finally {
        setDetailLoading(false)
      }
    }
    loadDetail()
  }, [view, selectedDatasetId])

  // Fetch table data
  useEffect(() => {
    if (view !== 'detail' || !activeTableId) return
    async function loadTableData() {
      setTableLoading(true)
      try {
        const params = new URLSearchParams({ page: String(tablePage), limit: '100' })
        const res = await fetch(`/api/data/${activeTableId}?${params.toString()}`)
        const data = await res.json()
        const parsedRows = (data.rows || []).map((r: DataRow) => {
          try {
            return JSON.parse(r.valuesJson)
          } catch {
            return []
          }
        })
        setTableRows(parsedRows)
        setTablePagination(data.pagination || null)
      } catch (err) {
        console.error('Failed to load table data:', err)
        setTableRows([])
      } finally {
        setTableLoading(false)
      }
    }
    loadTableData()
  }, [view, activeTableId, tablePage])

  // Reset to page 1 when filters change
  useEffect(() => {
    setDatasetPage(1)
  }, [searchQuery, activeOrg, activeTag, hasDataFilter, latestFilter])

  // === Handlers ===

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setSearchQuery(searchInput.trim())
    setActiveOrg(null)
    setActiveTag(null)
    setView('list')
  }, [searchInput])

  const handleOrgClick = useCallback((orgId: string) => {
    if (view === 'list' && activeOrg === orgId) {
      setActiveOrg(null)
    } else {
      setActiveOrg(orgId)
      setSearchQuery('')
      setSearchInput('')
      setActiveTag(null)
      setView('list')
    }
  }, [view, activeOrg])

  const handleTagClick = useCallback((tag: string) => {
    if (activeTag === tag) {
      setActiveTag(null)
    } else {
      setActiveTag(tag)
      setView('list')
    }
  }, [activeTag])

  const handleDatasetClick = useCallback((datasetId: string) => {
    setSelectedDatasetId(datasetId)
    setView('detail')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleBack = useCallback(() => {
    setView('list')
    setDatasetDetail(null)
    setActiveTableId(null)
    setTableRows([])
    setTableHeaders([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleHome = useCallback(() => {
    setView('home')
    setSearchQuery('')
    setSearchInput('')
    setActiveOrg(null)
    setActiveTag(null)
    setHasDataFilter(false)
    setLatestFilter(false)
    setDatasetDetail(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleTableChange = useCallback((tableId: string) => {
    setActiveTableId(tableId)
    setTablePage(1)
    setSortColumn(null)
    setSortDirection('asc')
    // Parse headers for the selected table
    if (datasetDetail?.dataTables) {
      const table = datasetDetail.dataTables.find(t => t.id === tableId)
      if (table) {
        try {
          const headers = JSON.parse(table.headersJson || '[]')
          setTableHeaders(headers)
        } catch {
          setTableHeaders([])
        }
      }
    }
  }, [datasetDetail])

  const handleSort = useCallback((colIndex: number) => {
    setSortColumn(prev => {
      if (prev === colIndex) {
        setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
        return colIndex
      }
      setSortDirection('asc')
      return colIndex
    })
    setTablePage(1)
  }, [])

  const handleExportCSV = useCallback(() => {
    if (tableHeaders.length === 0 || tableRows.length === 0) return
    exportCSV(tableHeaders, tableRows, `data-${activeTableId || 'export'}`)
  }, [tableHeaders, tableRows, activeTableId])

  // === Sorted rows (client-side sort on current page) ===
  const sortedRows = (() => {
    if (sortColumn === null) return tableRows
    return [...tableRows].sort((a, b) => {
      const aVal = String(a[sortColumn] ?? '')
      const bVal = String(b[sortColumn] ?? '')
      const aNum = Number(aVal)
      const bNum = Number(bVal)
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
      }
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })
  })()

  // Get org name by id
  const getOrgName = useCallback((orgId: string, org?: Organization | null) => {
    if (org?.title) return org.title
    const found = organizations.find(o => o.id === orgId)
    return found?.title || found?.name || 'Organisasi Tidak Diketahui'
  }, [organizations])

  // ============================================================
  // Sub-Components
  // ============================================================

  // --- Theme Toggle ---
  const ThemeToggle = () => {
    if (!mounted) return <div className="size-9" />
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="rounded-full hover:bg-amber-100 dark:hover:bg-amber-950/50"
        aria-label="Ganti tema"
      >
        {theme === 'dark' ? (
          <Sun className="size-[18px] text-amber-400" />
        ) : (
          <Moon className="size-[18px] text-amber-700" />
        )}
      </Button>
    )
  }

  // --- Header ---
  const Header = () => (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <button
          onClick={handleHome}
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-amber-600 text-white">
            <Database className="size-4" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            Data <span className="text-amber-600 dark:text-amber-400">Wonosobo</span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )

  // --- Footer ---
  const Footer = () => (
    <footer className="mt-auto border-t border-border/60 bg-muted/30">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-6 text-center sm:flex-row sm:justify-between sm:text-left sm:px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Database className="size-4 text-amber-500" />
          <span>
            <strong className="font-semibold text-foreground">Data Wonosobo</strong> — Portal Open Data Kabupaten Wonosobo
          </span>
        </div>
        <a
          href="https://data.go.id"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-amber-600 dark:hover:text-amber-400"
        >
          Sumber: data.go.id
          <ExternalLink className="size-3" />
        </a>
      </div>
    </footer>
  )

  // --- Stats Skeleton ---
  const StatsSkeleton = () => (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="gap-3 border-0 bg-muted/30 p-4 shadow-none">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )

  // --- Stats Section ---
  const StatsSection = () => {
    if (statsLoading) return <StatsSkeleton />
    if (!stats) return null
    const statItems = [
      { icon: Database, label: 'Total Dataset', value: stats.totalDatasets, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-950/50' },
      { icon: Building2, label: 'Organisasi', value: stats.organizations, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-950/50' },
      { icon: Table2, label: 'Tabel Data', value: stats.totalTables, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-950/50' },
      { icon: Rows3, label: 'Baris Data', value: stats.totalRows, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-950/50' },
    ]
    return (
      <motion.div
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {statItems.map((item) => (
          <motion.div key={item.label} variants={staggerItem}>
            <Card className="gap-0 border-0 bg-muted/40 p-4 shadow-none hover:shadow-sm transition-shadow sm:p-5">
              <div className="flex items-center gap-3">
                <div className={cn('flex size-10 items-center justify-center rounded-lg shrink-0', item.bg)}>
                  <item.icon className={cn('size-5', item.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground sm:text-sm">{item.label}</p>
                  <p className="text-xl font-bold tracking-tight sm:text-2xl">{formatNumber(item.value)}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    )
  }

  // --- Organization Skeleton ---
  const OrgSkeleton = () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
      {[...Array(8)].map((_, i) => (
        <Card key={i} className="gap-2 p-4 shadow-none">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </Card>
      ))}
    </div>
  )

  // --- Organization Section ---
  const OrgSection = () => {
    if (statsLoading) return <OrgSkeleton />
    return (
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
          {organizations.map((org) => (
            <motion.div key={org.id} variants={staggerItem}>
              <Card
                className={cn(
                  'group cursor-pointer gap-2 p-4 shadow-none transition-all hover:shadow-md hover:-translate-y-0.5',
                  'border border-transparent hover:border-amber-200 dark:hover:border-amber-800',
                  view === 'list' && activeOrg === org.id && 'border-amber-400 bg-amber-50/50 dark:border-amber-600 dark:bg-amber-950/30'
                )}
                onClick={() => handleOrgClick(org.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm leading-snug line-clamp-2 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                      {org.title || org.name}
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      {org.packageCount} dataset
                    </CardDescription>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>
    )
  }

  // --- Tags Section ---
  const TagsSection = () => {
    if (statsLoading || !stats?.popularTags || stats.popularTags.length === 0) return null
    return (
      <motion.div {...fadeIn}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tag Populer
        </h2>
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2">
            {stats.popularTags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className={cn(
                  'cursor-pointer whitespace-nowrap border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 transition-colors dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50',
                  activeTag === tag && 'bg-amber-600 text-white border-amber-600 dark:bg-amber-500 dark:text-white dark:border-amber-500'
                )}
                onClick={() => handleTagClick(tag)}
              >
                <Tag className="size-3" />
                {tag}
              </Badge>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </motion.div>
    )
  }

  // --- Dataset Card ---
  const DatasetCard = ({ dataset, compact = false }: { dataset: Dataset; compact?: boolean }) => {
    const formats = dataset.resources?.map(r => r.format).filter(Boolean) || []
    const tableCount = dataset._count?.dataTables || dataset.dataTables?.length || 0
    const rowCount = dataset._count?.dataRows || dataset.dataTables?.reduce((s, t) => s + t.rowCount, 0) || 0
    const tags = dataset.tags || []

    return (
      <Card
        className={cn(
          'group cursor-pointer gap-3 p-4 shadow-none transition-all hover:shadow-md hover:-translate-y-0.5 sm:p-5',
          compact ? '' : ''
        )}
        onClick={() => handleDatasetClick(dataset.id)}
      >
        <CardHeader className="gap-2 p-0">
          <CardTitle className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors sm:text-base">
            {dataset.title || dataset.name}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[11px] px-1.5 py-0 font-medium">
              <Building2 className="size-2.5 mr-0.5" />
              {truncate(getOrgName(dataset.organizationId, dataset.organization), 30)}
            </Badge>
            {formats.map((f, i) => (
              <Badge key={i} variant="outline" className="text-[11px] px-1.5 py-0 font-medium">
                <FileSpreadsheet className="size-2.5 mr-0.5" />
                {f}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!compact && dataset.notes && (
            <p className="mb-3 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {dataset.notes}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {tableCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Table2 className="size-3" />
                {tableCount} tabel
              </span>
            )}
            {rowCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Rows3 className="size-3" />
                {formatNumber(rowCount)} baris
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" />
              {formatShortDate(dataset.metadataModified)}
            </span>
          </div>
          {tags.length > 0 && !compact && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground self-center">+{tags.length - 3}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // --- Recent Datasets Skeleton ---
  const RecentSkeleton = () => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
      {[...Array(6)].map((_, i) => (
        <Card key={i} className="gap-3 p-4 shadow-none">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </Card>
      ))}
    </div>
  )

  // --- Recent Datasets Section ---
  const RecentSection = () => {
    if (statsLoading) return <RecentSkeleton />
    if (recentDatasets.length === 0) return null
    return (
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Dataset Terbaru</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
            onClick={() => { setView('list'); setLatestFilter(true) }}
          >
            Lihat Semua
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
          {recentDatasets.map((ds) => (
            <motion.div key={ds.id} variants={staggerItem}>
              <DatasetCard dataset={ds} />
            </motion.div>
          ))}
        </div>
      </motion.div>
    )
  }

  // --- Homepage View ---
  const HomePage = () => (
    <motion.div
      key="home"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50/50 to-transparent dark:from-amber-950/30 dark:via-orange-950/20 dark:to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Data{' '}
              <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent dark:from-amber-400 dark:to-orange-400">
                Wonosobo
              </span>
            </h1>
            <p className="mt-3 text-base text-muted-foreground sm:mt-4 sm:text-lg">
              Portal data terbuka Pemerintah Kabupaten Wonosobo. Jelajahi, unduh, dan gunakan dataset publik dari berbagai organisasi pemerintah daerah.
            </p>
            <form onSubmit={handleSearch} className="mt-6 sm:mt-8">
              <div className="relative mx-auto max-w-lg">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Cari dataset..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-11 pl-10 pr-20 rounded-xl border-amber-200 bg-white shadow-sm focus-visible:border-amber-400 focus-visible:ring-amber-400/20 dark:border-amber-800 dark:bg-card"
                />
                <Button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                >
                  Cari
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
        {/* Stats */}
        <section>
          <StatsSection />
        </section>

        {/* Organizations */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="size-5 text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-semibold">Organisasi</h2>
          </div>
          <OrgSection />
        </section>

        {/* Tags */}
        <section>
          <TagsSection />
        </section>

        {/* Recent Datasets */}
        <section>
          <RecentSection />
        </section>
      </div>
    </motion.div>
  )

  // --- Dataset List View ---
  const ListView = () => {
    const activeFilters = [searchQuery, activeOrg, activeTag, hasDataFilter, latestFilter].filter(Boolean).length

    return (
      <motion.div
        key="list"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Search Header */}
        <section className="border-b border-border/40 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-transparent dark:from-amber-950/20 dark:via-orange-950/10 dark:to-transparent">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
            <form onSubmit={handleSearch} className="mx-auto max-w-lg">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Cari dataset..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-11 pl-10 pr-20 rounded-xl border-amber-200 bg-white shadow-sm focus-visible:border-amber-400 focus-visible:ring-amber-400/20 dark:border-amber-800 dark:bg-card"
                />
                <Button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                >
                  Cari
                </Button>
              </div>
            </form>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {/* Filters */}
          <div className="mb-6 space-y-4">
            {/* Filter chips - organizations */}
            <div className="flex items-start gap-3">
              <Filter className="size-4 mt-1 text-muted-foreground shrink-0" />
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-1">
                  <Badge
                    variant={activeOrg === null ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer transition-colors',
                      activeOrg === null
                        ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:border-amber-500 dark:hover:bg-amber-600'
                        : 'border-border hover:border-amber-300 hover:bg-amber-50 dark:hover:border-amber-700 dark:hover:bg-amber-950/30'
                    )}
                    onClick={() => setActiveOrg(null)}
                  >
                    Semua Organisasi
                  </Badge>
                  {organizations.map((org) => (
                    <Badge
                      key={org.id}
                      variant={activeOrg === org.id ? 'default' : 'outline'}
                      className={cn(
                        'cursor-pointer whitespace-nowrap transition-colors',
                        activeOrg === org.id
                          ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:border-amber-500 dark:hover:bg-amber-600'
                          : 'border-border hover:border-amber-300 hover:bg-amber-50 dark:hover:border-amber-700 dark:hover:bg-amber-950/30'
                      )}
                      onClick={() => handleOrgClick(org.id)}
                    >
                      {truncate(org.title || org.name, 25)}
                    </Badge>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>

            {/* Toggle filters */}
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={hasDataFilter}
                  onCheckedChange={setHasDataFilter}
                  className="data-[state=checked]:bg-amber-600 dark:data-[state=checked]:bg-amber-500"
                />
                <span className="text-sm text-muted-foreground">Punya Data</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={latestFilter}
                  onCheckedChange={setLatestFilter}
                  className="data-[state=checked]:bg-amber-600 dark:data-[state=checked]:bg-amber-500"
                />
                <span className="text-sm text-muted-foreground">Hanya Versi Terbaru</span>
              </label>
              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setSearchQuery('')
                    setSearchInput('')
                    setActiveOrg(null)
                    setActiveTag(null)
                    setHasDataFilter(false)
                    setLatestFilter(false)
                  }}
                >
                  <X className="size-3.5" />
                  Hapus Filter
                </Button>
              )}
            </div>

            {/* Active tag */}
            {activeTag && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Filter tag:</span>
                <Badge className="bg-amber-600 text-white dark:bg-amber-500">
                  <Tag className="size-3 mr-1" />
                  {activeTag}
                  <button
                    className="ml-1.5 hover:text-amber-200"
                    onClick={() => setActiveTag(null)}
                    aria-label="Hapus filter tag"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              </div>
            )}
          </div>

          {/* Search query indicator */}
          {searchQuery && (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Hasil pencarian untuk <strong className="text-foreground">&quot;{searchQuery}&quot;</strong>
                {datasetPagination && (
                  <span> — {formatFullNumber(datasetPagination.total)} dataset ditemukan</span>
                )}
              </p>
            </div>
          )}

          {/* Results */}
          {datasetsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
              {[...Array(9)].map((_, i) => (
                <Card key={i} className="gap-3 p-4 shadow-none">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-12" />
                  </div>
                  <Skeleton className="h-3 w-2/3" />
                </Card>
              ))}
            </div>
          ) : datasets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-muted mb-4">
                <Search className="size-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Tidak Ada Dataset</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Coba ubah kata kunci pencarian atau hapus filter untuk menemukan dataset yang Anda cari.
              </p>
              <Button
                variant="outline"
                className="mt-4 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
                onClick={handleHome}
              >
                <HomeIcon className="size-4" />
                Kembali ke Beranda
              </Button>
            </div>
          ) : (
            <motion.div
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {datasets.map((ds) => (
                <motion.div key={ds.id} variants={staggerItem}>
                  <DatasetCard dataset={ds} />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Pagination */}
          {datasetPagination && datasetPagination.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={datasetPagination.page <= 1}
                onClick={() => setDatasetPage(p => p - 1)}
                className="border-border"
              >
                <ChevronLeft className="size-4" />
                Sebelumnya
              </Button>
              <div className="flex items-center gap-1">
                {(() => {
                  const pages: (number | string)[] = []
                  const total = datasetPagination.totalPages
                  const current = datasetPagination.page
                  if (total <= 7) {
                    for (let i = 1; i <= total; i++) pages.push(i)
                  } else {
                    pages.push(1)
                    if (current > 3) pages.push('...')
                    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
                      pages.push(i)
                    }
                    if (current < total - 2) pages.push('...')
                    pages.push(total)
                  }
                  return pages.map((p, i) =>
                    typeof p === 'string' ? (
                      <span key={`dots-${i}`} className="px-2 text-muted-foreground">...</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === current ? 'default' : 'outline'}
                        size="sm"
                        className={cn(
                          'min-w-[36px]',
                          p === current && 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:border-amber-500 dark:hover:bg-amber-600'
                        )}
                        onClick={() => setDatasetPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  )
                })()}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={datasetPagination.page >= datasetPagination.totalPages}
                onClick={() => setDatasetPage(p => p + 1)}
                className="border-border"
              >
                Berikutnya
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  // --- Data Table Viewer ---
  const DataTableViewer = () => {
    if (!datasetDetail?.dataTables || datasetDetail.dataTables.length === 0) {
      return (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <Table2 className="mx-auto mb-2 size-8 opacity-40" />
          <p>Tidak ada tabel data tersedia</p>
        </div>
      )
    }

    return (
      <div>
        <Tabs
          value={activeTableId || undefined}
          onValueChange={handleTableChange}
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
              {datasetDetail.dataTables.map((table) => (
                <TabsTrigger
                  key={table.id}
                  value={table.id}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm data-[state=active]:bg-amber-600 data-[state=active]:text-white data-[state=active]:border-amber-600 data-[state=active]:shadow-sm',
                    'border-border text-muted-foreground hover:border-amber-300 hover:text-amber-700 dark:hover:border-amber-700 dark:hover:text-amber-400',
                    'dark:data-[state=active]:bg-amber-500 dark:data-[state=active]:border-amber-500'
                  )}
                >
                  <Table2 className="size-3.5 mr-1.5" />
                  {table.sheetName || 'Tabel'}
                  <span className="ml-1.5 text-[11px] opacity-70">
                    ({formatNumber(table.rowCount)} baris)
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
              onClick={handleExportCSV}
              disabled={tableRows.length === 0}
            >
              <Download className="size-3.5" />
              Ekspor CSV
            </Button>
          </div>

          {datasetDetail.dataTables.map((table) => (
            <TabsContent key={table.id} value={table.id}>
              {tableLoading ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {[...Array(table.colCount || 5)].slice(0, 6).map((_, i) => (
                      <Skeleton key={i} className="h-8 flex-1 rounded" />
                    ))}
                  </div>
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="flex gap-2">
                      {[...Array(table.colCount || 5)].slice(0, 6).map((_, j) => (
                        <Skeleton key={j} className="h-10 flex-1 rounded" />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border">
                  <ScrollArea className="max-h-[500px] overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          {tableHeaders.map((header, i) => (
                            <TableHead
                              key={i}
                              className="cursor-pointer select-none whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => handleSort(i)}
                            >
                              <span className="inline-flex items-center gap-1">
                                {header || `Kolom ${i + 1}`}
                                {sortColumn === i ? (
                                  sortDirection === 'asc'
                                    ? <ArrowUp className="size-3 text-amber-600 dark:text-amber-400" />
                                    : <ArrowDown className="size-3 text-amber-600 dark:text-amber-400" />
                                ) : (
                                  <ArrowUpDown className="size-3 opacity-30" />
                                )}
                              </span>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedRows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={tableHeaders.length || 1}
                              className="h-24 text-center text-muted-foreground"
                            >
                              Tidak ada data
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortedRows.map((row, ri) => (
                            <TableRow key={ri}>
                              {(tableHeaders.length > 0 ? tableHeaders : row).map((_, ci) => (
                                <TableCell key={ci} className="max-w-[300px] truncate text-sm">
                                  {row[ci] != null ? String(row[ci]) : '-'}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>
              )}

              {/* Table Pagination */}
              {tablePagination && tablePagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Menampilkan {((tablePagination.page - 1) * tablePagination.limit) + 1}–{Math.min(tablePagination.page * tablePagination.limit, tablePagination.total)} dari {formatFullNumber(tablePagination.total)} baris
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={tablePagination.page <= 1}
                      onClick={() => setTablePage(p => p - 1)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {tablePagination.page} / {tablePagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={tablePagination.page >= tablePagination.totalPages}
                      onClick={() => setTablePage(p => p + 1)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    )
  }

  // --- Dataset Detail View ---
  const DetailView = () => {
    if (detailLoading) {
      return (
        <motion.div
          key="detail-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mx-auto max-w-5xl px-4 py-8 sm:px-6"
        >
          <Skeleton className="h-8 w-24 mb-6" />
          <Skeleton className="h-10 w-3/4 mb-4" />
          <Skeleton className="h-5 w-1/2 mb-6" />
          <div className="flex gap-2 mb-6">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </motion.div>
      )
    }

    if (!datasetDetail) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground">Dataset tidak ditemukan</p>
          <Button variant="outline" className="mt-4" onClick={handleBack}>
            <ArrowLeft className="size-4" />
            Kembali
          </Button>
        </div>
      )
    }

    const tags = datasetDetail.tags || []
    const formats = datasetDetail.resources?.map(r => r.format).filter(Boolean) || []
    const xlsxResource = datasetDetail.resources?.find(r =>
      r.format?.toUpperCase() === 'XLSX' || r.url?.endsWith('.xlsx')
    )

    return (
      <motion.div
        key="detail"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
      >
        {/* Back button & actions */}
        <div className="mb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground -ml-2"
            onClick={handleBack}
          >
            <ArrowLeft className="size-4" />
            Kembali ke Daftar
          </Button>
          {xlsxResource && (
            <Button
              asChild
              className="bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              <a href={xlsxResource.url} target="_blank" rel="noopener noreferrer">
                <Download className="size-4" />
                Unduh XLSX
              </a>
            </Button>
          )}
        </div>

        {/* Title & Meta */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl mb-3">
            {datasetDetail.title || datasetDetail.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Building2 className="size-3 mr-1" />
              {getOrgName(datasetDetail.organizationId, datasetDetail.organization)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Calendar className="size-3 mr-1" />
              {formatDate(datasetDetail.metadataModified)}
            </Badge>
            {formats.map((f, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                <FileSpreadsheet className="size-3 mr-1" />
                {f}
              </Badge>
            ))}
            {datasetDetail.isLatest && (
              <Badge className="bg-emerald-600 text-white text-xs dark:bg-emerald-500">Versi Terbaru</Badge>
            )}
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer border-amber-200 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
                onClick={() => handleTagClick(tag)}
              >
                <Tag className="size-3 mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <Separator className="mb-6" />

        {/* Markdown Content */}
        {datasetDetail.markdownContent && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="size-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-lg font-semibold">Deskripsi</h2>
            </div>
            <div className="rounded-lg border bg-card p-4 sm:p-6">
              <div className="markdown-content">
                <ReactMarkdown components={markdownComponents()}>
                  {datasetDetail.markdownContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Data Table Viewer */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Eye className="size-5 text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-semibold">Data Tabel</h2>
            {datasetDetail.dataTables && datasetDetail.dataTables.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {datasetDetail.dataTables.length} tabel
              </Badge>
            )}
          </div>
          <DataTableViewer />
        </div>
      </motion.div>
    )
  }

  // ============================================================
  // Main Render
  // ============================================================

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1" role="main">
        <AnimatePresence mode="wait">
          {view === 'home' && <HomePage key="home" />}
          {view === 'list' && <ListView key="list" />}
          {view === 'detail' && <DetailView key="detail" />}
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  )
}