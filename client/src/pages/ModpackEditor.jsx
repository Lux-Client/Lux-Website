import { useEffect, useMemo, useState } from 'react'
import PageShell from '../components/PageShell'
import { fixPath } from '../hooks/useAuth'

const STORAGE_KEY = 'lux-modpack-draft'
const RECENT_DRAFTS_KEY = 'lux-modpack-recent-drafts'

const emptyPack = {
  name: 'My Modpack',
  version: '1.21.1',
  loader: 'fabric',
  mods: [],
  resourcePacks: [],
  shaders: [],
}

const projectTypeConfig = {
  mod: { key: 'mods', label: 'Mods' },
  resourcepack: { key: 'resourcePacks', label: 'Resource Packs' },
  shader: { key: 'shaders', label: 'Shaders' },
}

export default function ModpackEditor() {
  const [pack, setPack] = useState(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      return saved ? { ...emptyPack, ...JSON.parse(saved) } : emptyPack
    } catch {
      return emptyPack
    }
  })
  const [recentDrafts, setRecentDrafts] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(RECENT_DRAFTS_KEY) || '[]')
    } catch {
      return []
    }
  })
  const [projectType, setProjectType] = useState('mod')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [exportedCode, setExportedCode] = useState('')
  const [importCode, setImportCode] = useState('')
  const [myCodes, setMyCodes] = useState([])
  const [versions, setVersions] = useState([])
  const [message, setMessage] = useState('')

  const currentCollectionKey = projectTypeConfig[projectType].key
  const currentCollection = pack[currentCollectionKey]

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pack))
    const snapshot = { ...pack, savedAt: Date.now() }
    const nextDrafts = [snapshot, ...recentDrafts.filter((item) => item.name !== snapshot.name)].slice(0, 4)
    setRecentDrafts(nextDrafts)
    window.localStorage.setItem(RECENT_DRAFTS_KEY, JSON.stringify(nextDrafts))
  }, [pack])

  useEffect(() => {
    fetch('/api/modrinth/versions')
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setVersions(Array.isArray(data) ? data.slice(0, 30) : []))
      .catch(() => {})

    loadCodes()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setMessage('')
      try {
        const facets = [[`project_type:${projectType}`], [`versions:${pack.version}`]]
        if (pack.loader) facets.push([`categories:${pack.loader}`])

        const params = new URLSearchParams({
          limit: '12',
          facets: JSON.stringify(facets),
        })

        if (search.trim()) params.set('query', search.trim())

        const response = await fetch(`/api/modrinth/search?${params.toString()}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Failed to search Modrinth')
        const data = await response.json()
        setResults(Array.isArray(data.hits) ? data.hits : [])
      } catch (error) {
        if (error.name !== 'AbortError') {
          setResults([])
          setMessage(error.message)
        }
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [search, pack.version, pack.loader, projectType])

  const counts = useMemo(() => ({
    mods: pack.mods.length,
    resourcePacks: pack.resourcePacks.length,
    shaders: pack.shaders.length,
  }), [pack])

  const addProject = (project) => {
    setPack((current) => {
      const list = current[currentCollectionKey]
      if (list.some((item) => item.project_id === project.project_id)) return current
      return { ...current, [currentCollectionKey]: [...list, project] }
    })
  }

  const removeProject = (key, projectId) => {
    setPack((current) => ({
      ...current,
      [key]: current[key].filter((item) => item.project_id !== projectId),
    }))
  }

  const exportPack = async () => {
    setMessage('')
    const response = await fetch('/api/modpack/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: pack.name,
        mods: pack.mods,
        resourcePacks: pack.resourcePacks,
        shaders: pack.shaders,
        instanceVersion: pack.version,
        instanceLoader: pack.loader,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.success) {
      setExportedCode(data.code)
      setMessage('Modpack code created successfully.')
      loadCodes()
    } else {
      setMessage(data.error || 'Failed to export modpack.')
    }
  }

  const importPack = async () => {
    if (!importCode.trim()) return
    const response = await fetch(`/api/modpack/${encodeURIComponent(importCode.trim())}`)
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.success && data.data) {
      const incoming = data.data
      setPack({
        name: incoming.name || emptyPack.name,
        version: incoming.version || emptyPack.version,
        loader: incoming.loader || emptyPack.loader,
        mods: incoming.mods || [],
        resourcePacks: incoming.resourcePacks || [],
        shaders: incoming.shaders || [],
      })
      setMessage(`Imported code ${incoming.code}.`)
      setImportCode('')
    } else {
      setMessage(data.error || 'Unable to import this code.')
    }
  }

  const loadCodes = async () => {
    const response = await fetch('/api/modpack/my-codes')
    const data = await response.json().catch(() => ({}))
    setMyCodes(Array.isArray(data.codes) ? data.codes : [])
  }

  const deleteCode = async (code) => {
    if (!window.confirm(`Delete code ${code}?`)) return
    await fetch(`/api/modpack/delete/${encodeURIComponent(code)}`, { method: 'DELETE' })
    loadCodes()
  }

  const copyCode = async () => {
    if (!exportedCode) return
    try {
      await navigator.clipboard.writeText(exportedCode)
      setMessage('Code copied to clipboard.')
    } catch {
      setMessage('Failed to copy code.')
    }
  }

  const loadDraft = (draft) => {
    setPack({
      name: draft.name || emptyPack.name,
      version: draft.version || emptyPack.version,
      loader: draft.loader || emptyPack.loader,
      mods: draft.mods || [],
      resourcePacks: draft.resourcePacks || [],
      shaders: draft.shaders || [],
    })
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-32 lg:px-12">
        <section className="rounded-[2.5rem] border border-white/5 bg-surface/50 p-8 md:p-10">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Modpack Editor</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight text-white">Build and share curated packs</h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-400">Search Modrinth, collect mods and client-side content, then export everything as a shareable Lux modpack code.</p>
          {message && <p className="mt-5 text-sm font-bold text-primary">{message}</p>}
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-8">
            <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
              <h2 className="text-3xl font-black text-white">Pack settings</h2>
              <div className="mt-6 grid gap-5 md:grid-cols-3">
                <label>
                  <span className="mb-2 block text-sm font-bold text-gray-400">Pack name</span>
                  <input value={pack.name} onChange={(event) => setPack((current) => ({ ...current, name: event.target.value }))} className="input" />
                </label>
                <label>
                  <span className="mb-2 block text-sm font-bold text-gray-400">Minecraft version</span>
                  <select value={pack.version} onChange={(event) => setPack((current) => ({ ...current, version: event.target.value }))} className="input">
                    {versions.map((version) => <option key={version.version || version} value={version.version || version}>{version.version || version}</option>)}
                  </select>
                </label>
                <label>
                  <span className="mb-2 block text-sm font-bold text-gray-400">Loader</span>
                  <select value={pack.loader} onChange={(event) => setPack((current) => ({ ...current, loader: event.target.value }))} className="input">
                    <option value="fabric">Fabric</option>
                    <option value="forge">Forge</option>
                    <option value="neoforge">NeoForge</option>
                    <option value="quilt">Quilt</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-3xl font-black text-white">Search Modrinth</h2>
                  <p className="mt-2 text-gray-400">Browse trending content or search for something specific.</p>
                </div>
                <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
                  {Object.entries(projectTypeConfig).map(([key, config]) => (
                    <button key={key} onClick={() => setProjectType(key)} className={`rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-[0.2em] transition ${projectType === key ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}>{config.label}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${projectTypeConfig[projectType].label.toLowerCase()}...`} className="input" />
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {loading ? (
                  Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-[1.5rem] border border-white/5 bg-black/20" />)
                ) : results.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-8 text-center text-gray-500 md:col-span-2">No results for this query.</div>
                ) : results.map((result) => (
                  <div key={result.project_id} className="rounded-[1.5rem] border border-white/5 bg-black/20 p-5">
                    <div className="flex gap-4">
                      <img src={fixPath(result.icon_url)} alt={result.title} className="h-16 w-16 rounded-2xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-xl font-black text-white">{result.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-gray-400">{result.description}</p>
                        <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
                          <span>{Number(result.downloads || 0).toLocaleString()} downloads</span>
                          <button onClick={() => addProject(result)} className="rounded-xl bg-primary px-4 py-3 text-black transition hover:bg-primary-dark">Add</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-3xl font-black text-white">Your modpack</h2>
                  <p className="mt-2 text-gray-400">{counts.mods} mods · {counts.resourcePacks} resource packs · {counts.shaders} shaders</p>
                </div>
                <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-center">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Current list</div>
                  <div className="mt-1 text-2xl font-black text-primary">{currentCollection.length}</div>
                </div>
              </div>

              <div className="mt-6 space-y-3 max-h-[34rem] overflow-y-auto pr-1">
                {[['mods', 'Mods'], ['resourcePacks', 'Resource Packs'], ['shaders', 'Shaders']].map(([key, label]) => (
                  <div key={key} className="rounded-[1.5rem] border border-white/5 bg-black/20 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">{label}</p>
                    <div className="mt-4 space-y-3">
                      {pack[key].length === 0 ? (
                        <div className="text-sm text-gray-500">No items yet.</div>
                      ) : pack[key].map((item) => (
                        <div key={item.project_id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-background/80 p-3">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-white">{item.title}</p>
                            <p className="truncate text-xs uppercase tracking-[0.2em] text-gray-500">{item.author || item.slug || item.project_id}</p>
                          </div>
                          <button onClick={() => removeProject(key, item.project_id)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-black uppercase tracking-[0.2em] text-red-300 transition hover:bg-red-500/20">Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
              <h2 className="text-3xl font-black text-white">Import / export</h2>
              <div className="mt-6 space-y-5">
                <div className="flex flex-wrap gap-3">
                  <button onClick={exportPack} className="rounded-xl bg-primary px-5 py-3 font-black text-black transition hover:bg-primary-dark">Create share code</button>
                  <button onClick={() => loadDraft(emptyPack)} className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-white transition hover:border-primary/40 hover:text-primary">Reset pack</button>
                </div>
                {exportedCode && (
                  <div className="rounded-[1.5rem] border border-primary/20 bg-primary/10 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Latest code</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <code className="text-3xl font-black text-primary">{exportedCode}</code>
                      <button onClick={copyCode} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:border-primary/40 hover:text-primary">Copy</button>
                    </div>
                  </div>
                )}
                <div className="rounded-[1.5rem] border border-white/5 bg-black/20 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Import by code</p>
                  <div className="mt-4 flex gap-3">
                    <input value={importCode} onChange={(event) => setImportCode(event.target.value)} placeholder="Enter 8-character code" className="input flex-1" />
                    <button onClick={importPack} className="rounded-xl bg-primary px-5 py-3 font-black text-black transition hover:bg-primary-dark">Import</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-3xl font-black text-white">My recent codes</h2>
                  <p className="mt-2 text-gray-400">Codes are tied to your current IP on the website.</p>
                </div>
                <button onClick={loadCodes} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-white transition hover:border-primary/40 hover:text-primary">Refresh</button>
              </div>
              <div className="mt-6 space-y-3">
                {myCodes.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-8 text-center text-gray-500">No exported codes yet.</div>
                ) : myCodes.map((code) => (
                  <div key={code.code} className="rounded-[1.5rem] border border-white/5 bg-black/20 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-2xl font-black text-primary">{code.code}</p>
                        <p className="mt-2 text-sm text-gray-400">{code.name}</p>
                        <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-gray-500">Uses: {code.uses || 0} · Expires: {code.expires ? new Date(code.expires).toLocaleString() : '—'}</p>
                      </div>
                      <button onClick={() => deleteCode(code.code)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/20">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {recentDrafts.length > 0 && (
              <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
                <h2 className="text-3xl font-black text-white">Recent drafts</h2>
                <div className="mt-6 space-y-3">
                  {recentDrafts.map((draft, index) => (
                    <button key={`${draft.name}-${index}`} onClick={() => loadDraft(draft)} className="block w-full rounded-[1.5rem] border border-white/5 bg-black/20 p-4 text-left transition hover:border-primary/20">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-white">{draft.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-500">{draft.version} · {draft.loader}</p>
                        </div>
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-primary">Load</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </PageShell>
  )
}
