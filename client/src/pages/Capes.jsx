import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertCircle, CheckCircle2, Clock, Gamepad2, Link2, Search, Shirt, Trash2, Upload, Users, XCircle,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import useAuth from '../hooks/useAuth'

/* Cape marketplace for the Lux Client mod. Capes are PNG pictures; every upload is
   checked by the Lux team before anyone else can see it. Wearing one needs the
   Minecraft account linked — that link is opened from the game (Lux Account module). */

const inputClass = 'w-full rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20'

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...options })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

/** Front of the cape: Minecraft cape textures (64x32, 22x17) are cut out, any other picture is cropped to 10:16. */
export function CapePreview({ src, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !src) return
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      let sx, sy, sw, sh
      if (w === h * 2 && w >= 64) {
        const k = w / 64
        ;[sx, sy, sw, sh] = [k, k, 10 * k, 16 * k]
      } else if (w * 17 === h * 22) {
        const k = w / 22
        ;[sx, sy, sw, sh] = [k, k, 10 * k, 16 * k]
      } else {
        const scale = Math.max(10 / w, 16 / h)
        sw = 10 / scale
        sh = 16 / scale
        sx = (w - sw) / 2
        sy = (h - sh) / 2
      }
      canvas.width = Math.max(10, Math.round(sw))
      canvas.height = Math.max(16, Math.round(sh))
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = sw > 40
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    }
    img.src = src
  }, [src])
  return (
    <canvas
      ref={ref}
      className={`h-36 w-[90px] rounded-[3px] shadow-[0_10px_24px_rgba(0,0,0,0.5)] ${className}`}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

function StatusBadge({ status }) {
  const map = {
    pending:  { icon: Clock,        label: 'Waiting for review', cls: 'border-amber-400/20 bg-amber-400/10 text-amber-300' },
    approved: { icon: CheckCircle2, label: 'Approved',           cls: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' },
    rejected: { icon: XCircle,      label: 'Rejected',           cls: 'border-red-400/20 bg-red-400/10 text-red-300' },
  }
  const s = map[status] || map.pending
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>
      <Icon className="h-3 w-3" /> {s.label}
    </span>
  )
}

function CapeCard({ item, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col overflow-hidden rounded-2xl border border-white/6 bg-[#0f0f0f] transition-colors hover:border-white/10"
    >
      <div className="grid h-48 place-items-center bg-[radial-gradient(circle_at_50%_40%,#2b2b35,#121216)]">
        <CapePreview src={item.image} />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="truncate font-bold text-white">{item.title}</p>
        <p className="text-xs text-white/35">by {item.author}{item.uses ? ` · worn ${item.uses}×` : ''}</p>
        {children}
      </div>
    </motion.div>
  )
}

function Notice({ notice }) {
  if (!notice) return null
  const ok = notice.kind === 'ok'
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${ok ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-200' : 'border-red-500/20 bg-red-500/8 text-red-300'}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{notice.text}</span>
    </div>
  )
}

export default function Capes() {
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const linkCode = params.get('link')

  const [items, setItems] = useState([])
  const [more, setMore] = useState(false)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('new')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [players, setPlayers] = useState([])
  const [mine, setMine] = useState([])
  const [notice, setNotice] = useState(null)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef(null)
  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview) }, [filePreview])

  // Marketplace
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const p = new URLSearchParams({ sort, page: String(page) })
        if (q.trim()) p.set('q', q.trim())
        const data = await api(`/api/lux/capes?${p}`, { signal: controller.signal })
        setItems(data.items || [])
        setMore(!!data.more)
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [q, sort, page])

  const loadAccount = useCallback(async () => {
    if (!auth.loggedIn) return
    const [acc, own] = await Promise.all([
      api('/api/lux/account').catch(() => ({ players: [] })),
      api('/api/lux/capes/mine').catch(() => ({ items: [] })),
    ])
    setPlayers(acc.players || [])
    setMine(own.items || [])
  }, [auth.loggedIn])

  useEffect(() => { loadAccount() }, [loadAccount])

  // Link opened from the game: /capes?link=CODE
  useEffect(() => {
    if (!linkCode || !auth.loggedIn) return
    api('/api/lux/account/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: linkCode }),
    })
      .then(data => setNotice({ kind: 'ok', text: `Minecraft account ${data.player?.name || ''} is now linked to your Lux account.` }))
      .catch(e => setNotice({ kind: 'error', text: e.message }))
      .finally(() => {
        params.delete('link')
        setParams(params, { replace: true })
        loadAccount()
      })
  }, [linkCode, auth.loggedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async e => {
    e.preventDefault()
    if (!file) return
    setBusy(true); setNotice(null)
    try {
      await api(`/api/lux/capes?title=${encodeURIComponent(title)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: file,
      })
      setNotice({ kind: 'ok', text: 'Uploaded! Your cape is now checked by the Lux team and shows up in the marketplace once it is approved.' })
      setTitle(''); setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      loadAccount()
    } catch (err) {
      setNotice({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const wear = async item => {
    setNotice(null)
    try {
      await api(`/api/lux/capes/${item.id}/use`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      setNotice({ kind: 'ok', text: `You are now wearing “${item.title}”. In the game, choose the cape style “From the marketplace (website)”.` })
      loadAccount()
    } catch (err) {
      setNotice({ kind: 'error', text: err.message })
    }
  }

  const remove = async item => {
    if (!window.confirm(`Delete “${item.title}”?`)) return
    try {
      await api(`/api/lux/capes/${item.id}`, { method: 'DELETE' })
      loadAccount()
    } catch (err) {
      setNotice({ kind: 'error', text: err.message })
    }
  }

  const unlink = async player => {
    if (!window.confirm(`Unlink ${player.name}?`)) return
    await api(`/api/lux/account/players/${player.uuid}`, { method: 'DELETE' }).catch(() => {})
    loadAccount()
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-28 lg:px-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative mb-8 overflow-hidden rounded-2xl border border-white/6 bg-[#0f0f0f] p-8 md:p-10"
        >
          <div className="relative z-10">
            <div className="section-label mb-4">Lux Client Mod</div>
            <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">Capes</h1>
            <p className="mt-3 max-w-2xl text-base text-white/40">
              Upload your own capes, browse the community&apos;s and put one on with a click. Every Lux player
              sees it in game — on any server. All uploads are checked by the Lux team before they go public.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                <input
                  value={q}
                  onChange={e => { setQ(e.target.value); setPage(0) }}
                  placeholder="Search capes or creators…"
                  className={`${inputClass} pl-10`}
                />
              </div>
              <div className="flex rounded-xl border border-white/8 bg-white/4 p-1">
                {[['new', 'Newest'], ['top', 'Most worn']].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => { setSort(id); setPage(0) }}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${sort === id ? 'bg-primary text-black shadow-glow-sm' : 'text-white/40 hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mb-8"><Notice notice={notice} /></div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          {/* Marketplace grid */}
          <section>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-white/4" />)}
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 rounded-2xl border border-red-500/15 bg-red-500/8 p-6 text-red-400">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">Failed to load: {error}</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/8 py-24 text-center">
                <Shirt className="h-8 w-8 text-white/15" />
                <p className="font-bold text-white/40">No capes found</p>
                <p className="text-sm text-white/20">{q ? 'Try a different search term.' : 'Be the first to upload one!'}</p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map(item => (
                    <CapeCard key={item.id} item={item}>
                      <div className="mt-auto flex gap-2 pt-3">
                        {auth.loggedIn ? (
                          <button
                            onClick={() => wear(item)}
                            className="rounded-lg border border-primary/15 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary transition-all hover:border-primary hover:bg-primary hover:text-black"
                          >
                            Wear this cape
                          </button>
                        ) : (
                          <a href={auth.loginUrl} className="rounded-lg border border-white/8 px-3.5 py-2 text-xs font-bold text-white/50 hover:text-white">
                            Sign in to wear
                          </a>
                        )}
                      </div>
                    </CapeCard>
                  ))}
                </div>
                <div className="mt-6 flex justify-center gap-2">
                  {page > 0 && <button onClick={() => setPage(p => p - 1)} className="rounded-lg border border-white/8 px-4 py-2 text-sm text-white/60 hover:text-white">Previous</button>}
                  {more && <button onClick={() => setPage(p => p + 1)} className="rounded-lg border border-white/8 px-4 py-2 text-sm text-white/60 hover:text-white">Next</button>}
                </div>
              </>
            )}
          </section>

          {/* Sidebar: account + upload + own capes */}
          <aside className="flex flex-col gap-5">
            {!auth.loggedIn ? (
              <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
                <p className="font-bold text-white">Sign in</p>
                <p className="mt-1 text-sm text-white/40">
                  {linkCode
                    ? 'Sign in to link your Minecraft account to your Lux account.'
                    : 'Sign in with your Lux account to upload and wear capes.'}
                </p>
                <a href={auth.loginUrl} className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-bold text-black hover:bg-primary-light">
                  Sign in with Google
                </a>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
                  <p className="flex items-center gap-2 font-bold text-white"><Gamepad2 className="h-4 w-4 text-primary" /> Minecraft accounts</p>
                  {players.length === 0 ? (
                    <p className="mt-2 text-sm text-white/40">
                      None linked yet. In the game open the <b className="text-white/60">Lux Account</b> module and click
                      <b className="text-white/60"> “Link website account”</b> — this page opens and links it.
                    </p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                      {players.map(p => (
                        <li key={p.uuid} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                          <span className="grid h-8 w-8 place-items-center rounded-md bg-white/5 text-white/40"><Gamepad2 className="h-4 w-4" /></span>
                          <span className="flex-1 truncate text-sm font-semibold text-white">{p.name}</span>
                          <button onClick={() => unlink(p)} title="Unlink" className="text-white/25 hover:text-red-400"><Link2 className="h-4 w-4" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <form onSubmit={upload} className="flex flex-col gap-3 rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
                  <p className="flex items-center gap-2 font-bold text-white"><Upload className="h-4 w-4 text-primary" /> Upload a cape</p>
                  <input value={title} onChange={e => setTitle(e.target.value)} maxLength={40} required minLength={2} placeholder="Name of the cape" className={inputClass} />
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png"
                    required
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="text-sm text-white/50 file:mr-3 file:rounded-lg file:border-0 file:bg-white/8 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                  />
                  {filePreview && <div className="grid place-items-center rounded-xl bg-black/30 py-3"><CapePreview src={filePreview} /></div>}
                  <p className="text-xs leading-relaxed text-white/30">
                    PNG, at most 1 MB. A Minecraft cape texture (64×32) or any picture — it is cropped to the cape.
                    No sexual, violent, hateful or copyrighted content: the Lux team checks every upload.
                  </p>
                  <button disabled={busy || !file} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-black transition hover:bg-primary-light disabled:opacity-50">
                    {busy ? 'Uploading…' : 'Submit for review'}
                  </button>
                </form>

                {mine.length > 0 && (
                  <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
                    <p className="flex items-center gap-2 font-bold text-white"><Users className="h-4 w-4 text-primary" /> My uploads</p>
                    <ul className="mt-3 flex flex-col gap-2.5">
                      {mine.map(item => (
                        <li key={item.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                          <CapePreview src={item.image} className="!h-12 !w-[30px] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                            <StatusBadge status={item.status} />
                            {item.status === 'rejected' && item.reason && <p className="mt-1 text-xs text-red-300/70">{item.reason}</p>}
                          </div>
                          <button onClick={() => remove(item)} title="Delete" className="text-white/25 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      </main>
    </PageShell>
  )
}
