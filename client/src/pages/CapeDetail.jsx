import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, ArrowLeft, Calendar, Pause, Play, Shirt, User, Users } from 'lucide-react'
import PageShell from '../components/PageShell'
import MinecraftViewer from '../components/lux/MinecraftViewer'
import useAuth from '../hooks/useAuth'
import { CapePreview, Notice, luxApi as api } from './Capes'

/* Detail page of a marketplace cape: who made it, how often it is worn, and a 3D preview on your own
   Minecraft skin (any Minecraft name works, linked accounts are filled in). */

const NAME_RE = /^[A-Za-z0-9_]{1,16}$/
const inputClass = 'w-full rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20'

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/3 p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/30"><Icon className="h-3.5 w-3.5" /> {label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  )
}

/** Loads a skin through the Lux API; tells whether it uses the slim (Alex) arms. */
function useSkin(name) {
  const [skin, setSkin] = useState({ url: '/api/lux/skin/MHF_Steve', slim: false, error: '' })
  useEffect(() => {
    if (!NAME_RE.test(name)) return undefined
    let url = null
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/lux/skin/${name}`)
        if (!res.ok) throw new Error(res.status === 404 ? `There is no Minecraft player called “${name}”.` : 'Could not load that skin.')
        url = URL.createObjectURL(await res.blob())
        if (!cancelled) setSkin({ url, slim: res.headers.get('X-Skin-Model') === 'slim', error: '' })
      } catch (e) {
        if (!cancelled) setSkin(s => ({ ...s, error: e.message }))
      }
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (url) window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    }
  }, [name])
  return skin
}

export default function CapeDetail() {
  const { id } = useParams()
  const auth = useAuth()
  const [cape, setCape] = useState(null)
  const [error, setError] = useState('')
  const [players, setPlayers] = useState([])
  const [name, setName] = useState('MHF_Steve')
  const [typed, setTyped] = useState(false)
  const [spin, setSpin] = useState(true)
  const [notice, setNotice] = useState(null)
  const skin = useSkin(name)

  useEffect(() => {
    setCape(null); setError('')
    api(`/api/lux/capes/${id}`).then(setCape).catch(e => setError(e.message))
  }, [id])

  // Linked Minecraft accounts: show the cape on your own skin right away
  useEffect(() => {
    if (!auth.loggedIn) return
    api('/api/lux/account').then(acc => {
      const list = acc.players || []
      setPlayers(list)
      if (list[0] && !typed) setName(list[0].name)
    }).catch(() => {})
  }, [auth.loggedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  const wear = async () => {
    setNotice(null)
    try {
      await api(`/api/lux/capes/${cape.id}/use`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      setNotice({ kind: 'ok', text: `You are now wearing “${cape.title}”. The game switches to it within a few seconds – everybody with Lux sees it.` })
      setCape(c => ({ ...c, uses: c.uses + 1, wearing: c.wearing + 1 }))
    } catch (err) {
      setNotice({ kind: 'error', text: err.message })
    }
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-28 lg:px-10">
        <Link to="/capes" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-white/40 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> All capes
        </Link>

        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-red-500/15 bg-red-500/8 p-6 text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{error === 'Not found.' ? 'This cape does not exist (anymore).' : error}</p>
          </div>
        ) : !cape ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="h-[520px] animate-pulse rounded-2xl bg-white/4" />
            <div className="h-[520px] animate-pulse rounded-2xl bg-white/4" />
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            {/* 3D preview */}
            <section className="relative overflow-hidden rounded-2xl border border-white/6 bg-[radial-gradient(circle_at_50%_35%,#2c2c38,#0d0d10_70%)]">
              <div className="h-[460px] md:h-[560px]">
                <MinecraftViewer skin={skin.url} slim={skin.slim} cape={cape.image} autoRotate={spin} />
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
                <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] font-semibold text-white/50 backdrop-blur">Drag to turn · scroll to zoom</span>
                <button
                  onClick={() => setSpin(v => !v)}
                  className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white/60 backdrop-blur transition hover:text-white"
                  title={spin ? 'Stop turning' : 'Turn'}
                >
                  {spin ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
              </div>
              <div className="border-t border-white/6 bg-black/30 p-4">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-white/30">Try it on your skin</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={name === 'MHF_Steve' ? '' : name}
                    onChange={e => { setTyped(true); setName(e.target.value.trim() || 'MHF_Steve') }}
                    placeholder="Minecraft name (default: Steve)"
                    maxLength={16}
                    className={inputClass}
                  />
                  {players.length > 0 && (
                    <div className="flex gap-1.5">
                      {players.map(p => (
                        <button
                          key={p.uuid}
                          onClick={() => { setTyped(true); setName(p.name) }}
                          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${name === p.name ? 'border-primary bg-primary/15 text-primary' : 'border-white/8 bg-white/4 text-white/60 hover:text-white'}`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {name !== 'MHF_Steve' && !NAME_RE.test(name) && <p className="mt-1.5 text-xs text-red-300/80">Minecraft names only use letters, numbers and _ (up to 16).</p>}
                {skin.error && <p className="mt-1.5 text-xs text-red-300/80">{skin.error}</p>}
              </div>
            </section>

            {/* Details */}
            <section className="flex flex-col gap-5">
              <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-6">
                <div className="section-label mb-3">Lux Cape</div>
                <h1 className="break-words text-3xl font-black tracking-tight text-white md:text-4xl">{cape.title}</h1>
                <Link to={`/u/${encodeURIComponent(cape.author)}`} className="mt-4 flex items-center gap-3 rounded-xl border border-white/6 bg-white/3 p-3 transition hover:border-white/12">
                  {cape.authorAvatar
                    ? <img src={cape.authorAvatar} alt="" className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                    : <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary"><User className="h-5 w-5" /></span>}
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-white/30">Created by</p>
                    <p className="truncate font-bold text-white">{cape.author}</p>
                    <p className="text-xs text-white/35">{cape.authorCapes} cape{cape.authorCapes === 1 ? '' : 's'} · worn {cape.authorUses}× in total</p>
                  </div>
                </Link>
                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  <Stat icon={Shirt} label="Worn" value={`${cape.uses}×`} />
                  <Stat icon={Users} label="Wearing now" value={cape.wearing} />
                  <Stat icon={Calendar} label="Uploaded" value={cape.created ? new Date(cape.created).toLocaleDateString() : '–'} />
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {auth.loggedIn ? (
                    <button
                      onClick={wear}
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-black shadow-glow-sm transition hover:brightness-110"
                    >
                      Wear this cape
                    </button>
                  ) : (
                    <p className="text-sm text-white/40">Sign in on the <Link to="/capes" className="text-primary hover:underline">Capes page</Link> to wear it.</p>
                  )}
                  <a href={cape.image} target="_blank" rel="noreferrer" className="text-sm font-semibold text-white/40 transition hover:text-white">Open picture</a>
                </div>
                {notice && <div className="mt-4"><Notice notice={notice} /></div>}
                <p className="mt-5 text-xs leading-relaxed text-white/30">
                  Every Lux player sees this cape on you in game, on any server. The Lux team checked the picture before it went public.
                </p>
              </div>

              {cape.more?.length > 0 && (
                <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-6">
                  <p className="mb-3 font-bold text-white">More from {cape.author}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {cape.more.map(m => (
                      <Link key={m.id} to={`/capes/${m.id}`} className="group flex flex-col items-center gap-2 rounded-xl bg-white/3 p-3 transition hover:bg-white/6">
                        <CapePreview src={m.image} className="!h-20 !w-[50px]" />
                        <span className="w-full truncate text-center text-xs font-semibold text-white/60 group-hover:text-white">{m.title}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </motion.div>
        )}
      </main>
    </PageShell>
  )
}
