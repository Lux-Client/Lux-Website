import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { fixPath } from '../hooks/useAuth'

const tabs = [
  { id: 'extension', label: 'Extensions' },
  { id: 'theme', label: 'Themes' },
]

export default function Extensions() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('extension')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
        const response = await fetch(`/api/extensions${query}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`Server returned ${response.status}`)
        const data = await response.json()
        setItems(Array.isArray(data) ? data : [])
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') setError(fetchError.message)
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [search])

  const filteredItems = useMemo(
    () => items.filter((item) => (item.type || 'extension') === tab),
    [items, tab],
  )

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-32 lg:px-12">
        <section className="mb-12 rounded-[2.5rem] border border-white/5 bg-[radial-gradient(circle_at_top,rgba(226,118,2,0.12),transparent_55%)] p-8 md:p-12">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Marketplace</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight text-white">Explore Lux extensions</h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-400">Browse approved community projects, discover polished themes, and jump straight into the addon ecosystem.</p>

          <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex w-full rounded-2xl border border-white/10 bg-white/5 p-1 lg:w-auto">
              {tabs.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setTab(option.id)}
                  className={`rounded-2xl px-5 py-3 text-sm font-black uppercase tracking-[0.2em] transition ${tab === option.id ? 'bg-primary text-black shadow-primary-glow' : 'text-gray-400 hover:text-white'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:max-w-md">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search approved addons..."
                className="w-full rounded-2xl border border-white/10 bg-surface/80 px-5 py-4 pr-12 text-white outline-none transition focus:border-primary"
              />
              <svg className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-[26rem] animate-pulse rounded-[2rem] border border-white/5 bg-surface/50" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[2rem] border border-red-500/20 bg-red-500/10 p-10 text-center text-red-300">
            Failed to load extensions: {error}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-white/10 bg-surface/40 p-16 text-center">
            <h2 className="text-2xl font-black text-white">Nothing matched this view</h2>
            <p className="mt-3 text-gray-400">Try another search term or switch between extensions and themes.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item, index) => (
              <div key={item.id || item.identifier || index} className="group flex flex-col overflow-hidden rounded-[2rem] border border-white/8 bg-surface/50 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-primary-glow">
                <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/10 via-surface to-surface">
                  {item.banner_path ? (
                    <img
                      src={fixPath(item.banner_path)}
                      alt={item.name}
                      className="h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-105"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <img src="/resources/lux_icon.png?v=3" alt="" className="h-16 w-16 opacity-20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-surface/90 via-transparent to-transparent" />
                  <span className="absolute left-4 top-4 rounded-full border border-primary/20 bg-black/60 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary backdrop-blur-sm">
                    {item.type || 'extension'}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">By {item.developer || 'Unknown'}</p>
                      <h2 className="mt-1 text-xl font-black text-white">{item.name}</h2>
                    </div>
                    <div className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">DL</div>
                      <div className="mt-0.5 text-base font-black text-primary">{Number(item.downloads || 0).toLocaleString()}</div>
                    </div>
                  </div>

                  <p className="flex-1 text-sm leading-7 text-gray-400">{item.summary || item.description || 'No description available.'}</p>

                  <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                    <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                      {item.identifier}
                    </span>
                    <Link to={`/extensions/${item.identifier || item.id}`} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-black transition hover:bg-primary-dark">
                      View Details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </PageShell>
  )
}
