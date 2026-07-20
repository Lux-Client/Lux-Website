import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Download, Puzzle, Palette, AlertCircle } from 'lucide-react'
import PageShell from '../components/PageShell'
import { fixPath } from '../hooks/useAuth'

const TABS = [
  { id: 'extension', label: 'Extensions', icon: Puzzle },
  { id: 'theme',     label: 'Themes',     icon: Palette },
]

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/6 bg-[#0f0f0f]">
      <div className="aspect-[16/9] animate-pulse bg-white/4" />
      <div className="flex flex-col gap-3 p-5">
        <div className="h-2 w-16 animate-pulse rounded-full bg-white/8" />
        <div className="h-3 w-40 animate-pulse rounded-full bg-white/12" />
        <div className="h-2 w-full animate-pulse rounded-full bg-white/6" />
        <div className="h-2 w-3/4 animate-pulse rounded-full bg-white/6" />
      </div>
    </div>
  )
}

function ExtCard({ item }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/6 bg-[#0f0f0f] transition-all duration-300 hover:-translate-y-1 hover:border-white/10 hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
    >
      {/* Banner */}
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/8 via-[#111] to-[#111]">
        {item.banner_path ? (
          <img
            src={fixPath(item.banner_path)}
            alt={item.name}
            className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-105"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <img src="/resources/lux_icon.png?v=3" alt="" className="h-12 w-12 opacity-10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f]/80 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/60 backdrop-blur-sm">
          {item.type || 'extension'}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        {item.developer ? (
          <Link
            to={`/u/${item.developer}`}
            onClick={e => e.stopPropagation()}
            className="mb-1 w-fit text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30 transition-colors hover:text-primary"
          >
            by {item.developer}
          </Link>
        ) : (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">by Unknown</p>
        )}
        <h2 className="mb-2 text-base font-bold text-white">{item.name}</h2>
        <p className="flex-1 text-sm leading-relaxed text-white/40 line-clamp-2">
          {item.summary || item.description || 'No description available.'}
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
          <div className="flex items-center gap-1.5 text-xs text-white/25">
            <Download className="h-3 w-3" />
            {Number(item.downloads || 0).toLocaleString()}
          </div>
          <Link
            to={`/extensions/${item.identifier || item.id}`}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/15 px-3.5 py-2 text-xs font-bold text-primary transition-all hover:bg-primary hover:text-black hover:border-primary"
          >
            View details
          </Link>
        </div>
      </div>
    </motion.div>
  )
}

const selectClass = 'rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20 appearance-none cursor-pointer'
const capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

export default function Extensions() {
  const [items,      setItems]      = useState([])
  const [search,      setSearch]      = useState('')
  const [tab,          setTab]          = useState('extension')
  const [category,     setCategory]     = useState('')
  const [mcVersion,    setMcVersion]    = useState('')
  const [sort,          setSort]          = useState('downloads')
  const [filterOptions, setFilterOptions] = useState({ categories: [], mcVersions: [] })
  const [loading,      setLoading]      = useState(true)
  const [error,         setError]         = useState('')

  useEffect(() => {
    fetch('/api/meta/filters')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFilterOptions(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set('search', search.trim())
        if (category) params.set('category', category)
        if (mcVersion) params.set('mcVersion', mcVersion)
        if (sort) params.set('sort', sort)
        const q   = params.toString() ? `?${params.toString()}` : ''
        const res = await fetch(`/api/extensions${q}`, { signal: controller.signal })
        if (!res.ok) throw new Error(`Server returned ${res.status}`)
        const data = await res.json()
        setItems(Array.isArray(data) ? data : [])
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [search, category, mcVersion, sort])

  const filtered = useMemo(
    () => items.filter(i => (i.type || 'extension') === tab),
    [items, tab],
  )

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-28 lg:px-10">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative mb-10 overflow-hidden rounded-2xl border border-white/6 bg-[#0f0f0f] p-8 md:p-10"
        >
          <div className="absolute inset-0 bg-gradient-radial from-primary/6 via-transparent to-transparent" style={{ backgroundPosition: '0% 0%', backgroundSize: '60% 60%' }} />
          <div className="relative z-10">
            <div className="section-label mb-4">Marketplace</div>
            <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
              Extensions &amp; Themes
            </h1>
            <p className="mt-3 max-w-2xl text-base text-white/40">
              Browse community-built extensions and themes for Lux Client. Install them directly from the launcher.
            </p>

            {/* Controls */}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex rounded-xl border border-white/8 bg-white/4 p-1">
                {TABS.map(t => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                        tab === t.id ? 'bg-primary text-black shadow-glow-sm' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t.label}
                    </button>
                  )
                })}
              </div>

              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`Search ${tab}s…`}
                  className="w-full rounded-xl border border-white/8 bg-white/4 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="mt-3 flex flex-wrap gap-2.5">
              <select value={category} onChange={e => setCategory(e.target.value)} className={selectClass}>
                <option value="">All categories</option>
                {filterOptions.categories.map(c => <option key={c} value={c}>{capitalize(c)}</option>)}
              </select>
              <select value={mcVersion} onChange={e => setMcVersion(e.target.value)} className={selectClass}>
                <option value="">All MC versions</option>
                {filterOptions.mcVersions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={sort} onChange={e => setSort(e.target.value)} className={selectClass}>
                <option value="downloads">Most downloaded</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* Grid */}
        {loading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-red-500/15 bg-red-500/8 p-6 text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">Failed to load: {error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/8 py-24 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/4">
              {tab === 'theme' ? <Palette className="h-6 w-6 text-white/20" /> : <Puzzle className="h-6 w-6 text-white/20" />}
            </div>
            <div>
              <p className="text-base font-bold text-white/40">No {tab}s found</p>
              <p className="mt-1 text-sm text-white/20">
                {search ? 'Try a different search term.' : 'Be the first to publish one!'}
              </p>
            </div>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item, i) => (
                <ExtCard key={item.id || item.identifier || i} item={item} />
              ))}
            </div>
          </AnimatePresence>
        )}
      </main>
    </PageShell>
  )
}
