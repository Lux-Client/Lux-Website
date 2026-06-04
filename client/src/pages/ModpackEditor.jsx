import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Plus, Trash2, Copy, Check, RefreshCw, Package, ImageOff } from 'lucide-react'
import PageShell from '../components/PageShell'

const STORAGE_KEY      = 'lux-modpack-draft'
const RECENT_DRAFTS_KEY = 'lux-modpack-recent-drafts'

const emptyPack = { name: 'My Modpack', version: '1.21.1', loader: 'fabric', mods: [], resourcePacks: [], shaders: [] }

const TYPE_CONFIG = {
  mod:         { key: 'mods',         label: 'Mods' },
  resourcepack:{ key: 'resourcePacks', label: 'Resource Packs' },
  shader:      { key: 'shaders',      label: 'Shaders' },
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-white/40">{label}</span>
      {children}
    </label>
  )
}

function selectClass() {
  return 'w-full rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20 appearance-none'
}

export default function ModpackEditor() {
  const [pack, setPack] = useState(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); return s ? { ...emptyPack, ...JSON.parse(s) } : emptyPack } catch { return emptyPack }
  })
  const [recentDrafts, setRecentDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_DRAFTS_KEY) || '[]') } catch { return [] }
  })
  const [projectType, setProjectType] = useState('mod')
  const [search,      setSearch]      = useState('')
  const [results,     setResults]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [exportedCode,setExportedCode]= useState('')
  const [importCode,  setImportCode]  = useState('')
  const [myCodes,     setMyCodes]     = useState([])
  const [versions,    setVersions]    = useState([])
  const [message,     setMessage]     = useState({ text: '', type: 'info' })
  const [copied,      setCopied]      = useState(false)

  const currentKey        = TYPE_CONFIG[projectType].key
  const currentCollection = pack[currentKey]
  const counts = useMemo(() => ({ mods: pack.mods.length, resourcePacks: pack.resourcePacks.length, shaders: pack.shaders.length }), [pack])
  const totalCount = counts.mods + counts.resourcePacks + counts.shaders

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pack))
    const snap = { ...pack, savedAt: Date.now() }
    const next = [snap, ...recentDrafts.filter(d => d.name !== snap.name)].slice(0, 4)
    setRecentDrafts(next)
    localStorage.setItem(RECENT_DRAFTS_KEY, JSON.stringify(next))
  }, [pack])

  useEffect(() => {
    fetch('/api/modrinth/versions')
      .then(r => r.ok ? r.json() : [])
      .then(data => setVersions(Array.isArray(data) ? data.slice(0, 30) : []))
      .catch(() => {})
    loadCodes()
  }, [])

  useEffect(() => {
    const ctrl  = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const facets = [[`project_type:${projectType}`], [`versions:${pack.version}`]]
        if (pack.loader) facets.push([`categories:${pack.loader}`])
        const params = new URLSearchParams({ limit: '12', facets: JSON.stringify(facets) })
        if (search.trim()) params.set('query', search.trim())
        const res  = await fetch(`/api/modrinth/search?${params}`, { signal: ctrl.signal })
        if (!res.ok) throw new Error('Search failed')
        const data = await res.json()
        setResults(Array.isArray(data.hits) ? data.hits : [])
      } catch (e) {
        if (e.name !== 'AbortError') setResults([])
      } finally { setLoading(false) }
    }, 250)
    return () => { ctrl.abort(); window.clearTimeout(timer) }
  }, [search, pack.version, pack.loader, projectType])

  const addProject    = p => setPack(c => c[currentKey].some(i => i.project_id === p.project_id) ? c : { ...c, [currentKey]: [...c[currentKey], p] })
  const removeProject = (key, id) => setPack(c => ({ ...c, [key]: c[key].filter(i => i.project_id !== id) }))

  const notify = (text, type = 'info') => { setMessage({ text, type }); setTimeout(() => setMessage({ text: '', type: 'info' }), 4000) }

  const exportPack = async () => {
    const res  = await fetch('/api/modpack/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pack.name, mods: pack.mods, resourcePacks: pack.resourcePacks, shaders: pack.shaders, instanceVersion: pack.version, instanceLoader: pack.loader }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) { setExportedCode(data.code); notify('Code created!', 'success'); loadCodes() }
    else notify(data.error || 'Export failed', 'error')
  }

  const importPack = async () => {
    if (!importCode.trim()) return
    const res  = await fetch(`/api/modpack/${encodeURIComponent(importCode.trim())}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success && data.data) {
      const d = data.data
      setPack({ name: d.name || emptyPack.name, version: d.version || emptyPack.version, loader: d.loader || emptyPack.loader, mods: d.mods || [], resourcePacks: d.resourcePacks || [], shaders: d.shaders || [] })
      notify(`Imported: ${d.name}`, 'success'); setImportCode('')
    } else notify(data.error || 'Import failed', 'error')
  }

  const loadCodes = async () => {
    const res  = await fetch('/api/modpack/my-codes')
    const data = await res.json().catch(() => ({}))
    setMyCodes(Array.isArray(data.codes) ? data.codes : [])
  }

  const deleteCode = async code => {
    if (!window.confirm(`Delete code ${code}?`)) return
    await fetch(`/api/modpack/delete/${encodeURIComponent(code)}`, { method: 'DELETE' })
    loadCodes()
  }

  const copyCode = async () => {
    if (!exportedCode) return
    try { await navigator.clipboard.writeText(exportedCode); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-28 lg:px-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative mb-8 overflow-hidden rounded-2xl border border-white/6 bg-[#0f0f0f] p-7"
        >
          <div className="absolute inset-0 bg-gradient-radial from-primary/5 via-transparent to-transparent" style={{ backgroundPosition: '0% 0%', backgroundSize: '50% 50%' }} />
          <div className="relative z-10">
            <div className="section-label mb-3">Modpack Editor</div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">Build &amp; Share Modpacks</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/40">Search Modrinth, curate your content, export as a shareable code — import directly in Lux Client.</p>
            {message.text && (
              <div className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                message.type === 'error' ? 'bg-red-500/10 text-red-400' : message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-primary/10 text-primary'
              }`}>
                {message.text}
              </div>
            )}
          </div>
        </motion.div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">

          {/* Left — settings + search */}
          <div className="flex flex-col gap-5">

            {/* Pack settings */}
            <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-6">
              <h2 className="mb-4 text-sm font-bold text-white/60 uppercase tracking-widest">Pack Settings</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Name">
                  <input
                    value={pack.name}
                    onChange={e => setPack(c => ({ ...c, name: e.target.value }))}
                    className="rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  />
                </Field>
                <Field label="Minecraft Version">
                  <select
                    value={pack.version}
                    onChange={e => setPack(c => ({ ...c, version: e.target.value }))}
                    className={selectClass()}
                  >
                    {versions.map(v => <option key={v.version || v} value={v.version || v}>{v.version || v}</option>)}
                  </select>
                </Field>
                <Field label="Mod Loader">
                  <select
                    value={pack.loader}
                    onChange={e => setPack(c => ({ ...c, loader: e.target.value }))}
                    className={selectClass()}
                  >
                    <option value="fabric">Fabric</option>
                    <option value="forge">Forge</option>
                    <option value="neoforge">NeoForge</option>
                    <option value="quilt">Quilt</option>
                  </select>
                </Field>
              </div>
            </div>

            {/* Modrinth search */}
            <div className="flex flex-col gap-4 rounded-2xl border border-white/6 bg-[#0f0f0f] p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-base font-bold text-white">Search Modrinth</h2>
                <div className="flex rounded-xl border border-white/8 bg-white/4 p-1">
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => setProjectType(key)}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${projectType === key ? 'bg-primary text-black' : 'text-white/40 hover:text-white'}`}
                    >{cfg.label}</button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`Search ${TYPE_CONFIG[projectType].label.toLowerCase()}…`}
                  className="w-full rounded-xl border border-white/8 bg-white/4 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-xl border border-white/5 bg-white/3" />
                  ))
                ) : results.length === 0 ? (
                  <div className="col-span-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/8 py-12 text-center">
                    <Package className="h-6 w-6 text-white/15" />
                    <p className="text-sm text-white/25">No results</p>
                  </div>
                ) : results.map(r => (
                  <div key={r.project_id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-colors hover:border-white/10">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/6">
                      {r.icon_url ? (
                        <img src={r.icon_url} alt={r.title} className="h-full w-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} />
                      ) : (
                        <div className="flex h-full items-center justify-center"><ImageOff className="h-4 w-4 text-white/15" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{r.title}</p>
                      <p className="text-[11px] text-white/25">{Number(r.downloads || 0).toLocaleString()} dl</p>
                    </div>
                    <button
                      onClick={() => addProject(r)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-black"
                    ><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — pack contents + export */}
          <div className="flex flex-col gap-5 xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-3.5rem)] xl:overflow-y-auto xl:pr-0.5">

            {/* Pack contents */}
            <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">{pack.name}</h2>
                  <p className="text-xs text-white/30">{totalCount} item{totalCount !== 1 ? 's' : ''} · {pack.version} · {pack.loader}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-lg font-black text-primary">
                  {totalCount}
                </div>
              </div>

              <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-0.5">
                {Object.entries(TYPE_CONFIG).map(([typeKey, cfg]) => (
                  <div key={typeKey}>
                    {pack[cfg.key].length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/20">{cfg.label}</p>
                        <div className="flex flex-col gap-1.5">
                          {pack[cfg.key].map(item => (
                            <div key={item.project_id} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-white">{item.title}</p>
                              </div>
                              <button
                                onClick={() => removeProject(cfg.key, item.project_id)}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/20 transition-colors hover:text-red-400"
                              ><Trash2 className="h-3 w-3" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {totalCount === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Package className="h-6 w-6 text-white/10" />
                    <p className="text-xs text-white/20">Add items from search</p>
                  </div>
                )}
              </div>
            </div>

            {/* Export / Import */}
            <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
              <h2 className="mb-4 text-sm font-bold text-white">Export / Import</h2>
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <button onClick={exportPack} className="btn-primary flex-1">Create code</button>
                  <button onClick={() => { setPack(emptyPack); notify('Pack reset') }} className="btn-ghost">Reset</button>
                </div>

                {exportedCode && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/15 bg-primary/8 px-4 py-3">
                    <code className="text-xl font-black text-primary tracking-widest">{exportedCode}</code>
                    <button onClick={copyCode} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-black">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    value={importCode}
                    onChange={e => setImportCode(e.target.value)}
                    placeholder="Enter 8-char code…"
                    className="flex-1 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-primary/50"
                  />
                  <button onClick={importPack} className="btn-primary shrink-0">Import</button>
                </div>
              </div>
            </div>

            {/* My codes */}
            {myCodes.length > 0 && (
              <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white">My Codes</h2>
                  <button onClick={loadCodes} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 hover:bg-white/6 hover:text-white">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {myCodes.map(code => (
                    <div key={code.code} className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-3">
                      <div>
                        <p className="text-sm font-black text-primary tracking-widest">{code.code}</p>
                        <p className="text-xs text-white/30">{code.name} · {code.uses || 0} uses</p>
                      </div>
                      <button onClick={() => deleteCode(code.code)} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/20 hover:bg-red-500/10 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent drafts */}
            {recentDrafts.length > 0 && (
              <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
                <h2 className="mb-3 text-sm font-bold text-white">Recent Drafts</h2>
                <div className="flex flex-col gap-1.5">
                  {recentDrafts.map((draft, i) => (
                    <button
                      key={`${draft.name}-${i}`}
                      onClick={() => setPack({ name: draft.name || emptyPack.name, version: draft.version || emptyPack.version, loader: draft.loader || emptyPack.loader, mods: draft.mods || [], resourcePacks: draft.resourcePacks || [], shaders: draft.shaders || [] })}
                      className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5 text-left transition-colors hover:border-white/10"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{draft.name}</p>
                        <p className="text-xs text-white/25">{draft.version} · {draft.loader}</p>
                      </div>
                      <span className="text-xs font-semibold text-primary/60">Load →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </PageShell>
  )
}
